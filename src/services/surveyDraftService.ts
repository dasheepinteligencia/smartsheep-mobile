import {
  getDBConnection,
  withSerializedDbTransaction,
  addAppLog,
} from '../database/db';

import {
  enqueueSyncOperationInDb,
} from './syncService';

import { api } from './api';

/*
 * ============================================================
 * MOBILE_SURVEY_DRAFT_V1
 *
 * Rascunho persistente e sincronizável de formulário.
 *
 * IMPORTANTE:
 * - draft NÃO é coleta final;
 * - respostas ficam editáveis;
 * - cada alteração é salva primeiro no SQLite;
 * - rede nunca é requisito para salvar;
 * - servidor recebe atualizações incrementais;
 * - client_updated_at impede regressão por sync fora de ordem.
 * ============================================================
 */

export type SurveyDraftStatus =
  | 'EM_ANDAMENTO'
  | 'FINALIZADO';

export type SurveyDraftContext = {
  projectId: string;
  usuarioId: string;

  lojaId?: string | null;

  visitaId?: string | null;

  registroVisitaId?: string | null;

  pesquisaId: string;

  pesquisaVersao?: number | null;
};

export type SurveyDraftRow = {
  id: string;

  project_id: string;

  usuario_id: string;

  loja_id?: string | null;

  visita_id?: string | null;

  registro_visita_id?: string | null;

  pesquisa_id: string;

  pesquisa_versao?: number | null;

  status: SurveyDraftStatus | string;

  started_at: string;

  finalized_at?: string | null;

  client_updated_at: string;

  server_updated_at?: string | null;

  created_at: string;

  updated_at: string;
};

export type SurveyDraftAnswerRow = {
  id: string;

  draft_id: string;

  answer_key: string;

  pergunta_id: string;

  produto_id?: string | null;

  valor?: string | null;

  is_deleted: number;

  client_updated_at: string;

  server_updated_at?: string | null;

  created_at: string;

  updated_at: string;
};

export type SaveSurveyDraftAnswerInput = {
  draftId: string;

  answerKey: string;

  perguntaId: string;

  produtoId?: string | null;

  valor?: any;

  isDeleted?: boolean;
};

const normalizeText = (
  value: any
): string =>
  String(
    value ??
    ''
  ).trim();

const normalizeOptionalText = (
  value: any
): string | null => {
  const normalized =
    normalizeText(
      value
    );

  return normalized ||
    null;
};

const normalizeVersionForLocal = (
  value: any
): number | null => {
  const parsed =
    Number(
      value
    );

  return Number.isInteger(
    parsed
  ) &&
    parsed > 0
      ? parsed
      : null;
};


const generateDraftId = () =>
  `draft_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;

const generateAnswerId = () =>
  `draft_answer_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 12)}`;

const serializeAnswerValue = (
  value: any
): string | null => {

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value ===
    'string'
  ) {
    return value;
  }

  return JSON.stringify(
    value
  );
};

export const deserializeSurveyDraftValue = (
  value: any
): any => {

  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !==
    'string'
  ) {
    return value;
  }

  const trimmed =
    value.trim();

  if (!trimmed) {
    return '';
  }

  if (
    !trimmed.startsWith('{') &&
    !trimmed.startsWith('[')
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return value;
  }
};

const validateContext = (
  context: SurveyDraftContext
) => {

  const projectId =
    normalizeText(
      context?.projectId
    );

  const usuarioId =
    normalizeText(
      context?.usuarioId
    );

  const pesquisaId =
    normalizeText(
      context?.pesquisaId
    );

  if (
    !projectId ||
    !usuarioId ||
    !pesquisaId
  ) {
    throw new Error(
      'SURVEY_DRAFT_CONTEXT_INVALID'
    );
  }

  return {
    projectId,
    usuarioId,
    pesquisaId,

    lojaId:
      normalizeOptionalText(
        context?.lojaId
      ),

    visitaId:
      normalizeOptionalText(
        context?.visitaId
      ),

    registroVisitaId:
      normalizeOptionalText(
        context?.registroVisitaId
      ),

    pesquisaVersao:
      Number.isInteger(
        Number(
          context?.pesquisaVersao
        )
      ) &&
      Number(
        context?.pesquisaVersao
      ) > 0
        ? Number(
            context?.pesquisaVersao
          )
        : null,
  };
};

/*
 * ============================================================
 * Encontrar execução em andamento para este contexto.
 * ============================================================
 */
export const getCurrentSurveyDraft =
  async (
    context: SurveyDraftContext
  ): Promise<SurveyDraftRow | null> => {

    const normalized =
      validateContext(
        context
      );

    const db =
      await getDBConnection();

    const row =
      await db.getFirstAsync(
        `
          SELECT *
          FROM survey_drafts

          WHERE
            project_id = ?
            AND usuario_id = ?
            AND pesquisa_id = ?

            AND COALESCE(
              visita_id,
              ''
            ) =
            COALESCE(
              ?,
              ''
            )

            AND status =
              'EM_ANDAMENTO'

          ORDER BY
            client_updated_at DESC

          LIMIT 1
        `,
        [
          normalized.projectId,
          normalized.usuarioId,
          normalized.pesquisaId,
          normalized.visitaId,
        ]
      );

    return (
      row as SurveyDraftRow
    ) ||
      null;
  };



/*
 * ============================================================
 * MOBILE_SURVEY_DRAFT_REMOTE_RECOVERY_V1
 *
 * Se o SQLite local não possuir mais o draft:
 *
 * 1. consulta o servidor;
 * 2. reaproveita EXATAMENTE o mesmo draft_id;
 * 3. restaura draft + respostas no SQLite;
 * 4. NÃO enfileira novamente essas respostas na Outbox.
 *
 * Falha de rede não impede operação offline:
 * getOrCreateSurveyDraft poderá criar um draft local.
 * ============================================================
 */
const restoreCurrentSurveyDraftFromServer =
  async (
    context: SurveyDraftContext
  ): Promise<SurveyDraftRow | null> => {

    const normalized =
      validateContext(
        context
      );

    const params = [
      `projectId=${encodeURIComponent(
        normalized.projectId
      )}`,

      `pesquisaId=${encodeURIComponent(
        normalized.pesquisaId
      )}`,

      `usuarioId=${encodeURIComponent(
        normalized.usuarioId
      )}`,

      `visitaId=${encodeURIComponent(
        normalized.visitaId || ''
      )}`,

      `t=${Date.now()}`,
    ].join('&');

    let response: Response;

    try {
      response =
        await api(
          `/survey-drafts/current?${params}`,
          {
            method:
              'GET'
          }
        );
    } catch (
      error: any
    ) {
      console.log(
        '[SURVEY_DRAFT] Remote recovery indisponível:',
        error?.message ||
        String(error)
      );

      return null;
    }

    const body: any =
      await response
        .json()
        .catch(
          () => ({})
        );

    if (!response.ok) {
      console.log(
        '[SURVEY_DRAFT] Remote recovery HTTP:',
        response.status,
        body?.code ||
        body?.message ||
        ''
      );

      return null;
    }

    const remoteDraft =
      body?.draft;

    const remoteAnswers =
      Array.isArray(
        body?.answers
      )
        ? body.answers
        : [];

    if (
      !remoteDraft?.id ||
      String(
        remoteDraft?.status ||
        ''
      )
        .trim()
        .toUpperCase() !==
        'EM_ANDAMENTO'
    ) {
      return null;
    }

    /*
     * Defesa adicional:
     * nunca restaurar um draft de outro contexto,
     * mesmo que o servidor retorne algo inesperado.
     */
    if (
      normalizeText(
        remoteDraft?.project_id
      ) !== normalized.projectId ||
      normalizeText(
        remoteDraft?.usuario_id
      ) !== normalized.usuarioId ||
      normalizeText(
        remoteDraft?.pesquisa_id
      ) !== normalized.pesquisaId ||
      normalizeOptionalText(
        remoteDraft?.visita_id
      ) !== normalized.visitaId
    ) {
      console.log(
        '[SURVEY_DRAFT] Remote recovery ignorado por contexto divergente.'
      );

      return null;
    }

    const db =
      await getDBConnection();

    const now =
      new Date()
        .toISOString();

    const remoteDraftId =
      normalizeText(
        remoteDraft.id
      );

    const startedAt =
      normalizeOptionalText(
        remoteDraft?.started_at
      ) ||
      now;

    const clientUpdatedAt =
      normalizeOptionalText(
        remoteDraft?.client_updated_at
      ) ||
      startedAt;

    const serverUpdatedAt =
      normalizeOptionalText(
        remoteDraft?.server_updated_at
      ) ||
      now;

    const createdAt =
      normalizeOptionalText(
        remoteDraft?.created_at
      ) ||
      startedAt;

    const updatedAt =
      normalizeOptionalText(
        remoteDraft?.updated_at
      ) ||
      serverUpdatedAt;

    await withSerializedDbTransaction(
      async () => {

        /*
         * Um evento React pode ter criado um draft
         * enquanto o GET estava em andamento.
         *
         * Nesse caso preservamos o local já aberto.
         */
        const concurrent: any =
          await db.getFirstAsync(
            `
              SELECT *
              FROM survey_drafts

              WHERE
                project_id = ?
                AND usuario_id = ?
                AND pesquisa_id = ?

                AND COALESCE(
                  visita_id,
                  ''
                ) =
                COALESCE(
                  ?,
                  ''
                )

                AND status =
                  'EM_ANDAMENTO'

              ORDER BY
                client_updated_at DESC

              LIMIT 1
            `,
            [
              normalized.projectId,
              normalized.usuarioId,
              normalized.pesquisaId,
              normalized.visitaId,
            ]
          );

        if (
          concurrent?.id
        ) {
          return;
        }

        await db.runAsync(
          `
            INSERT INTO survey_drafts (
              id,
              project_id,
              usuario_id,
              loja_id,
              visita_id,
              registro_visita_id,
              pesquisa_id,
              pesquisa_versao,
              status,
              started_at,
              finalized_at,
              client_updated_at,
              server_updated_at,
              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?,
              'EM_ANDAMENTO',
              ?,
              NULL,
              ?,
              ?,
              ?,
              ?
            )

            ON CONFLICT (id)
            DO UPDATE SET
              project_id =
                excluded.project_id,

              usuario_id =
                excluded.usuario_id,

              loja_id =
                excluded.loja_id,

              visita_id =
                excluded.visita_id,

              registro_visita_id =
                excluded.registro_visita_id,

              pesquisa_id =
                excluded.pesquisa_id,

              pesquisa_versao =
                COALESCE(
                  survey_drafts.pesquisa_versao,
                  excluded.pesquisa_versao
                ),

              client_updated_at =
                CASE
                  WHEN
                    excluded.client_updated_at >
                    survey_drafts.client_updated_at
                  THEN
                    excluded.client_updated_at
                  ELSE
                    survey_drafts.client_updated_at
                END,

              server_updated_at =
                excluded.server_updated_at,

              updated_at =
                excluded.updated_at

            WHERE
              survey_drafts.status =
                'EM_ANDAMENTO'
          `,
          [
            remoteDraftId,

            normalized.projectId,

            normalized.usuarioId,

            normalizeOptionalText(
              remoteDraft?.loja_id
            ) ||
            normalized.lojaId,

            normalized.visitaId,

            normalizeOptionalText(
              remoteDraft
                ?.registro_visita_id
            ) ||
            normalized.registroVisitaId,

            normalized.pesquisaId,

            normalizeVersionForLocal(
              remoteDraft
                ?.pesquisa_versao
            ) ||
            normalized.pesquisaVersao,

            startedAt,

            clientUpdatedAt,

            serverUpdatedAt,

            createdAt,

            updatedAt,
          ]
        );

        for (
          const remoteAnswer
          of remoteAnswers
        ) {
          const answerKey =
            normalizeText(
              remoteAnswer
                ?.answer_key
            );

          const perguntaId =
            normalizeText(
              remoteAnswer
                ?.pergunta_id
            );

          if (
            !answerKey ||
            !perguntaId
          ) {
            continue;
          }

          const answerId =
            normalizeText(
              remoteAnswer?.id
            ) ||
            generateAnswerId();

          const answerClientUpdatedAt =
            normalizeOptionalText(
              remoteAnswer
                ?.client_updated_at
            ) ||
            clientUpdatedAt;

          const answerServerUpdatedAt =
            normalizeOptionalText(
              remoteAnswer
                ?.server_updated_at
            ) ||
            serverUpdatedAt;

          const answerCreatedAt =
            normalizeOptionalText(
              remoteAnswer
                ?.created_at
            ) ||
            createdAt;

          const answerUpdatedAt =
            normalizeOptionalText(
              remoteAnswer
                ?.updated_at
            ) ||
            answerServerUpdatedAt;

          const remoteValue =
            remoteAnswer?.valor;

          const serializedValue =
            remoteValue ===
              undefined ||
            remoteValue ===
              null
              ? null
              : typeof remoteValue ===
                  'string'
                ? remoteValue
                : JSON.stringify(
                    remoteValue
                  );

          const isDeleted =
            remoteAnswer
              ?.is_deleted === true ||
            Number(
              remoteAnswer
                ?.is_deleted ||
              0
            ) === 1
              ? 1
              : 0;

          await db.runAsync(
            `
              INSERT INTO survey_draft_answers (
                id,
                draft_id,
                answer_key,
                pergunta_id,
                produto_id,
                valor,
                is_deleted,
                client_updated_at,
                server_updated_at,
                created_at,
                updated_at
              )
              VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?
              )

              ON CONFLICT (
                draft_id,
                answer_key
              )
              DO UPDATE SET
                pergunta_id =
                  excluded.pergunta_id,

                produto_id =
                  excluded.produto_id,

                valor =
                  excluded.valor,

                is_deleted =
                  excluded.is_deleted,

                client_updated_at =
                  excluded.client_updated_at,

                server_updated_at =
                  excluded.server_updated_at,

                updated_at =
                  excluded.updated_at

              WHERE
                survey_draft_answers
                  .client_updated_at
                  <=
                excluded.client_updated_at
            `,
            [
              answerId,

              remoteDraftId,

              answerKey,

              perguntaId,

              normalizeOptionalText(
                remoteAnswer
                  ?.produto_id
              ),

              serializedValue,

              isDeleted,

              answerClientUpdatedAt,

              answerServerUpdatedAt,

              answerCreatedAt,

              answerUpdatedAt,
            ]
          );
        }
      }
    );

    const restored =
      await getCurrentSurveyDraft(
        context
      );

    if (
      restored?.id ===
      remoteDraftId
    ) {
      await addAppLog({
        level:
          'INFO',

        module:
          'SURVEY_DRAFT',

        action:
          'DRAFT_REMOTE_RESTORED',

        message:
          'Execução parcial restaurada do servidor.',

        metadata: {
          draftId:
            restored.id,

          pesquisaId:
            normalized.pesquisaId,

          visitaId:
            normalized.visitaId,

          answers:
            remoteAnswers.length,
        },
      }).catch(
        () => {}
      );
    }

    return restored;
  };


/*
 * ============================================================
 * Abrir ou recuperar uma execução.
 * ============================================================
 */
export const getOrCreateSurveyDraft =
  async (
    context: SurveyDraftContext
  ): Promise<SurveyDraftRow> => {

    const normalized =
      validateContext(
        context
      );

    const existing =
      await getCurrentSurveyDraft(
        context
      );

    if (existing) {
      return existing;
    }

    /*
     * SQLite vazio não significa necessariamente
     * que esta execução nunca existiu.
     *
     * Exemplos:
     * - reinstalação;
     * - limpeza do Expo Go;
     * - troca de aparelho;
     * - perda do armazenamento local.
     *
     * Antes de gerar outro draft_id,
     * tentamos recuperar o draft aberto no servidor.
     */
    const restored =
      await restoreCurrentSurveyDraftFromServer(
        context
      );

    if (restored) {
      return restored;
    }

    const db =
      await getDBConnection();

    const now =
      new Date()
        .toISOString();

    const draftId =
      generateDraftId();

    await withSerializedDbTransaction(
      async () => {

        /*
         * Pode existir corrida entre dois eventos React quase simultâneos.
         * Rechecamos dentro da transação.
         */
        const concurrent: any =
          await db.getFirstAsync(
            `
              SELECT *
              FROM survey_drafts

              WHERE
                project_id = ?
                AND usuario_id = ?
                AND pesquisa_id = ?

                AND COALESCE(
                  visita_id,
                  ''
                ) =
                COALESCE(
                  ?,
                  ''
                )

                AND status =
                  'EM_ANDAMENTO'

              ORDER BY
                client_updated_at DESC

              LIMIT 1
            `,
            [
              normalized.projectId,
              normalized.usuarioId,
              normalized.pesquisaId,
              normalized.visitaId,
            ]
          );

        if (
          concurrent?.id
        ) {
          return;
        }

        await db.runAsync(
          `
            INSERT INTO survey_drafts (
              id,
              project_id,
              usuario_id,
              loja_id,
              visita_id,
              registro_visita_id,
              pesquisa_id,
              pesquisa_versao,
              status,
              started_at,
              finalized_at,
              client_updated_at,
              server_updated_at,
              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?,
              'EM_ANDAMENTO',
              ?,
              NULL,
              ?,
              NULL,
              ?,
              ?
            )
          `,
          [
            draftId,

            normalized.projectId,

            normalized.usuarioId,

            normalized.lojaId,

            normalized.visitaId,

            normalized.registroVisitaId,

            normalized.pesquisaId,

            normalized.pesquisaVersao,

            now,
            now,
            now,
            now,
          ]
        );
      }
    );

    const created =
      await getCurrentSurveyDraft(
        context
      );

    if (!created) {
      throw new Error(
        'SURVEY_DRAFT_CREATE_FAILED'
      );
    }

    await addAppLog({
      level:
        'INFO',

      module:
        'SURVEY_DRAFT',

      action:
        'DRAFT_OPENED',

      message:
        'Execução parcial de formulário aberta localmente.',

      metadata: {
        draftId:
          created.id,

        pesquisaId:
          normalized.pesquisaId,

        visitaId:
          normalized.visitaId,
      },
    }).catch(
      () => {}
    );

    return created;
  };

/*
 * ============================================================
 * Carregar respostas já persistidas localmente.
 * ============================================================
 */
export const getSurveyDraftAnswers =
  async (
    draftId: string
  ): Promise<SurveyDraftAnswerRow[]> => {

    const id =
      normalizeText(
        draftId
      );

    if (!id) {
      return [];
    }

    const db =
      await getDBConnection();

    const rows =
      await db.getAllAsync(
        `
          SELECT *
          FROM survey_draft_answers

          WHERE
            draft_id = ?
            AND COALESCE(
              is_deleted,
              0
            ) = 0

          ORDER BY
            created_at ASC
        `,
        [
          id
        ]
      );

    return (
      rows ||
      []
    ) as SurveyDraftAnswerRow[];
  };

/*
 * ============================================================
 * Salvar uma resposta.
 *
 * O SQLite é confirmado antes da Outbox.
 * Ambos entram na mesma transação para nunca existir:
 *
 * resposta salva sem intenção de sync
 * OU
 * intenção de sync sem resposta local.
 * ============================================================
 */
export const saveSurveyDraftAnswer =
  async (
    input: SaveSurveyDraftAnswerInput
  ) => {

    const draftId =
      normalizeText(
        input?.draftId
      );

    const answerKey =
      normalizeText(
        input?.answerKey
      );

    const perguntaId =
      normalizeText(
        input?.perguntaId
      );

    if (
      !draftId ||
      !answerKey ||
      !perguntaId
    ) {
      throw new Error(
        'SURVEY_DRAFT_ANSWER_INVALID'
      );
    }

    const db =
      await getDBConnection();

    const now =
      new Date()
        .toISOString();

    const valor =
      serializeAnswerValue(
        input?.valor
      );

    const isDeleted =
      input?.isDeleted ===
      true;

    let queuedResult: any =
      null;

    await withSerializedDbTransaction(
      async () => {

        const draft: any =
          await db.getFirstAsync(
            `
              SELECT *
              FROM survey_drafts
              WHERE id = ?
              LIMIT 1
            `,
            [
              draftId
            ]
          );

        if (!draft?.id) {
          throw new Error(
            'SURVEY_DRAFT_NOT_FOUND_LOCAL'
          );
        }

        if (
          normalizeText(
            draft.status
          )
            .toUpperCase() !==
          'EM_ANDAMENTO'
        ) {
          throw new Error(
            'SURVEY_DRAFT_NOT_EDITABLE'
          );
        }

        await db.runAsync(
          `
            INSERT INTO survey_draft_answers (
              id,
              draft_id,
              answer_key,
              pergunta_id,
              produto_id,
              valor,
              is_deleted,
              client_updated_at,
              server_updated_at,
              created_at,
              updated_at
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?
            )

            ON CONFLICT(
              draft_id,
              answer_key
            )
            DO UPDATE SET
              pergunta_id =
                excluded.pergunta_id,

              produto_id =
                excluded.produto_id,

              valor =
                excluded.valor,

              is_deleted =
                excluded.is_deleted,

              client_updated_at =
                excluded.client_updated_at,

              server_updated_at =
                NULL,

              updated_at =
                excluded.updated_at
          `,
          [
            generateAnswerId(),

            draftId,

            answerKey,

            perguntaId,

            normalizeOptionalText(
              input?.produtoId
            ),

            valor,

            isDeleted
              ? 1
              : 0,

            now,

            now,

            now,
          ]
        );

        await db.runAsync(
          `
            UPDATE survey_drafts

            SET
              client_updated_at = ?,
              updated_at = ?

            WHERE id = ?
          `,
          [
            now,
            now,
            draftId,
          ]
        );

        /*
         * Cada alteração recebe client_updated_at próprio.
         *
         * O backend aplica somente payload igual/mais novo,
         * portanto retries fora de ordem não regressam resposta.
         */
        queuedResult =
          await enqueueSyncOperationInDb(
            db,

            '/survey-drafts/upsert',

            {
              id:
                draft.id,

              draft_id:
                draft.id,

              project_id:
                draft.project_id,

              projectId:
                draft.project_id,

              usuario_id:
                draft.usuario_id,

              usuarioId:
                draft.usuario_id,

              loja_id:
                draft.loja_id,

              lojaId:
                draft.loja_id,

              visita_id:
                draft.visita_id,

              visitaId:
                draft.visita_id,

              registro_visita_id:
                draft.registro_visita_id,

              registroVisitaId:
                draft.registro_visita_id,

              pesquisa_id:
                draft.pesquisa_id,

              pesquisaId:
                draft.pesquisa_id,

              pesquisa_versao:
                draft.pesquisa_versao,

              pesquisaVersao:
                draft.pesquisa_versao,

              started_at:
                draft.started_at,

              client_updated_at:
                now,

              answers: [
                {
                  answer_key:
                    answerKey,

                  pergunta_id:
                    perguntaId,

                  produto_id:
                    normalizeOptionalText(
                      input?.produtoId
                    ),

                  valor,

                  is_deleted:
                    isDeleted,

                  client_updated_at:
                    now,
                }
              ],

              client_operation_id:
                `draft_${draftId}_${answerKey}_${Date.now()}`,
            },

            'POST'
          );
      }
    );

    /*
     * Nunca aguardamos rede para considerar a resposta salva.
     *
     * FastSync é best-effort:
     * se offline, a Outbox permanece.
     */
    /*
     * MOBILE_SURVEY_DRAFT_LOCAL_FIRST_V2
     *
     * SQLite + Outbox já foram persistidos.
     *
     * A tentativa de rede é controlada pela tela
     * com debounce, e não por cada resposta.
     */




    return {
      ok:
        true,

      draftId,

      answerKey,

      clientUpdatedAt:
        now,

      queued:
        queuedResult,
    };
  };

/*
 * ============================================================
 * Remover logicamente uma resposta.
 *
 * Necessário porque apagar no celular também precisa chegar
 * ao servidor.
 * ============================================================
 */
export const deleteSurveyDraftAnswer =
  async (
    input: Omit<
      SaveSurveyDraftAnswerInput,
      'valor' | 'isDeleted'
    >
  ) => {

    return saveSurveyDraftAnswer({
      ...input,

      valor:
        null,

      isDeleted:
        true,
    });
  };

/*
 * ============================================================
 * Reconstruir answers{} usado pela tela.
 * ============================================================
 */
export const buildSurveyDraftAnswerMap =
  (
    rows:
      SurveyDraftAnswerRow[]
  ): Record<string, any> => {

    const result:
      Record<string, any> =
      {};

    for (
      const row
      of rows || []
    ) {
      if (
        Number(
          row?.is_deleted ||
          0
        ) === 1
      ) {
        continue;
      }

      const key =
        normalizeText(
          row?.answer_key
        );

      if (!key) {
        continue;
      }

      result[key] =
        deserializeSurveyDraftValue(
          row?.valor
        );
    }

    return result;
  };

/*
 * ============================================================
 * Auditoria simples para testes no emulador.
 * ============================================================
 */
