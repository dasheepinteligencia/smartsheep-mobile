import { api } from './api';
import { saveRoteiroCompletoOffline, getDBConnection, saveAlertsOffline, addAppLog } from '../database/db';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import * as Network from 'expo-network';
import { collectAndSendTelemetry } from './telemetryService';
import { isLocalFileUri, uploadLocalVisitPhotoToAws } from './mobileAwsUploadService';

// MOBILE_FIELD_PORTFOLIO_V1
import { syncFieldPortfolioOffline } from './fieldPortfolioService';

let syncInProgress = false;
let globalSyncPauseDepth = 0;

/*
 * MOBILE_MULTIUSER_SYNC_SWITCH_BARRIER_V1
 *
 * A troca de usuário possui duas garantias complementares:
 * - espera o sync anterior terminar;
 * - bloqueia qualquer novo globalSync durante o swap do workspace/sessão.
 *
 * Isso impede que um BackgroundFetch/foreground/reconnect acorde exatamente
 * entre o snapshot do usuário A e a ativação do usuário B.
 */
export const pauseGlobalSyncForWorkspaceSwitch = () => {
  globalSyncPauseDepth += 1;
};

export const resumeGlobalSyncAfterWorkspaceSwitch = () => {
  globalSyncPauseDepth = Math.max(0, globalSyncPauseDepth - 1);
};

/*
 * MOBILE_MULTIUSER_SYNC_IDLE_GUARD_V1
 *
 * Troca de workspace não pode ocorrer enquanto um sync da sessão anterior
 * ainda está escrevendo no SQLite. O login aguarda este gate antes do swap.
 */
export const waitForGlobalSyncIdle = async (timeoutMs = 60000) => {
  const startedAt = Date.now();

  while (syncInProgress) {
    if (Date.now() - startedAt >= timeoutMs) return false;
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  return true;
};

// MOBILE_FIELD_PORTFOLIO_V1

const DEBUG_MEDIA_SYNC = false;

const logMediaSync = (step: string, data?: any) => {
  if (!DEBUG_MEDIA_SYNC) return;
  console.log(`[MEDIA SYNC][${step}]`, data || {});
};


const getLocalDateKey = (value?: any) => {
  if (!value) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return String(value).substring(0, 10);
};

const safeJsonParse = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const safeArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const readResponseBodySafely = async (res: Response | null) => {
  if (!res) return '';

  try {
    const cloned = res.clone();
    const text = await cloned.text();
    return text || '';
  } catch {
    return '';
  }
};

const isAlreadyProcessedResponse = async (res: Response | null) => {
  if (!res) return false;

  const text = (await readResponseBodySafely(res)).toLowerCase();

  const hasAlreadyProcessedMarker =
    text.includes('já existe') ||
    text.includes('ja existe') ||
    text.includes('duplic') ||
    text.includes('already exists') ||
    text.includes('already processed') ||
    text.includes('already applied') ||
    text.includes('operation_already_processed') ||
    text.includes('registro existente');

  // 409 pode ser conflito real ou operação já processada.
  // Só removemos da fila quando o backend deixa claro que a operação já foi aplicada.
  if (res.status === 409) return hasAlreadyProcessedMarker;

  return hasAlreadyProcessedMarker;
};

const parseResponseBodySafely = (body: string) => {
  if (!body) return {};

  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const extractApiErrorMessage = (body: string, fallback = '') => {
  const parsed = parseResponseBodySafely(body);

  return String(
    parsed?.message ||
      parsed?.error ||
      parsed?.details ||
      fallback ||
      body ||
      ''
  ).trim();
};

/*
 * MOBILE_DIAMOND_CONFLICT_CLASSIFIER_V1
 */
const TERMINAL_SYNC_CONFLICT_CODES =
  new Set([
    'STATE_CONFLICT_SERVER_NEWER',
    'STATE_CONFLICT_SERVER_TOMBSTONED',
    'STATE_CONFLICT_SERVER_MISSING',
    'IDEMPOTENCY_OUTCOME_UNKNOWN',
    'IDEMPOTENCY_KEY_REUSE_MISMATCH',
  ]);

const TRANSIENT_IDEMPOTENCY_CODES =
  new Set([
    'IDEMPOTENCY_OPERATION_IN_PROGRESS',
    'IDEMPOTENCY_RACE_RETRY',
    'IDEMPOTENCY_STORAGE_UNAVAILABLE',
  ]);

const getApiResponseCode = (
  body: string
) => {

  const parsed =
    parseResponseBodySafely(
      body
    );

  return String(
    parsed?.code ||
    ''
  )
    .trim()
    .toUpperCase();
};

const isTerminalSyncConflictResponse = (
  res: Response | null,
  body: string
) => {

  if (!res) return false;

  return TERMINAL_SYNC_CONFLICT_CODES
    .has(
      getApiResponseCode(
        body
      )
    );
};

const isTransientIdempotencyResponse = (
  body: string
) => {

  return TRANSIENT_IDEMPOTENCY_CODES
    .has(
      getApiResponseCode(
        body
      )
    );
};

const getCollectionIdFromPayload = (
  payload: any,
  item: any
) => {

  return String(
    payload?.client_operation_id ||
    payload?.coleta_id ||
    payload?.coletaId ||
    payload?.id ||
    item?.operation_key ||
    ''
  ).trim();
};

const markOutboxConflict = async (
  db: any,
  item: any,
  preparedPayload: any,
  res: Response | null,
  body: string
) => {

  const parsed =
    parseResponseBodySafely(
      body
    );

  const conflictCode =
    String(
      parsed?.code ||
      'SYNC_CONFLICT'
    )
      .trim()
      .toUpperCase();

  const conflictMessage =
    extractApiErrorMessage(
      body,
      'Conflito de sincronização.'
    );

  const now =
    new Date()
      .toISOString();

  const httpStatus =
    Number(
      res?.status ||
      0
    ) || null;

  const payloadString =
    JSON.stringify(
      preparedPayload ||
      safeJsonParse(
        item?.payload,
        {}
      )
    );

  const responseJson =
    JSON.stringify(
      parsed &&
      typeof parsed === 'object'
        ? parsed
        : {
            raw:
              body ||
              null
          }
    );

  /*
   * Não removemos a fila.
   * CONFLICT não participa do SELECT automático.
   */
  await db.runAsync(
    `
      UPDATE sync_queue
      SET
        status = 'CONFLICT',
        next_retry_at = NULL,
        last_error = ?,
        conflict_code = ?,
        conflict_json = ?,
        conflict_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      conflictMessage.substring(
        0,
        500
      ),
      conflictCode,
      responseJson,
      now,
      now,
      item.id
    ]
  );

  const conflictId =
    `sync_conflict_${String(
      item.id
    )}`;

  await db.runAsync(
    `
      INSERT INTO sync_conflicts (
        id,
        queue_id,
        operation_key,
        endpoint,
        method,
        payload,
        http_status,
        conflict_code,
        conflict_message,
        response_json,
        created_at,
        updated_at,
        resolved_at,
        resolution
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL
      )
      ON CONFLICT(queue_id)
      DO UPDATE SET
        operation_key = excluded.operation_key,
        endpoint = excluded.endpoint,
        method = excluded.method,
        payload = excluded.payload,
        http_status = excluded.http_status,
        conflict_code = excluded.conflict_code,
        conflict_message = excluded.conflict_message,
        response_json = excluded.response_json,
        updated_at = excluded.updated_at
    `,
    [
      conflictId,
      Number(
        item.id
      ),
      item?.operation_key ||
        preparedPayload
          ?.client_operation_id ||
        null,
      String(
        item?.endpoint ||
        ''
      ),
      String(
        item?.method ||
        'POST'
      ).toUpperCase(),
      payloadString,
      httpStatus,
      conflictCode,
      conflictMessage,
      responseJson,
      now,
      now
    ]
  );

  /*
   * Coleta conflitante permanece pendente.
   */
  if (
    String(
      item?.endpoint ||
      ''
    )
      .toLowerCase()
      .includes(
        '/coletas'
      )
  ) {

    const coletaId =
      getCollectionIdFromPayload(
        preparedPayload,
        item
      );

    if (coletaId) {

      await db
        .runAsync(
          `
            UPDATE coletas
            SET
              status = 'CONFLITO_SYNC',
              pending_sync = 1,
              updated_at = ?
            WHERE id = ?
          `,
          [
            now,
            coletaId
          ]
        )
        .catch(
          () => {}
        );
    }
  }

  /*
   * Visitas permanecem pending_sync.
   * Nenhum update para zero aqui.
   */

  await addAppLog({
    level:
      'WARNING',

    module:
      'SYNC',

    action:
      'DIAMOND_SYNC_CONFLICT',

    message:
      'Operação retirada do retry automático por conflito de sincronização.',

    metadata: {
      queueId:
        item?.id,

      operationKey:
        item?.operation_key ||
        preparedPayload
          ?.client_operation_id ||
        null,

      endpoint:
        item?.endpoint,

      method:
        item?.method ||
        'POST',

      httpStatus,

      conflictCode,

      conflictMessage,

      serverChangedAt:
        parsed
          ?.server_changed_at ||
        null,

      requiresReconciliation:
        parsed
          ?.requires_reconciliation ??
        true
    }
  }).catch(
    () => {}
  );

  console.warn(
    '[DIAMOND SYNC] Operação movida para CONFLICT.',
    {
      queueId:
        item?.id,

      endpoint:
        item?.endpoint,

      conflictCode,

      httpStatus
    }
  );
};

/*
 * MOBILE_DIAMOND_CONFLICT_HELPER_END_V1
 */

const isStockInsufficientResponse = (res: Response | null, body: string) => {
  const parsed = parseResponseBodySafely(body);
  const code = String(parsed?.code || '').toUpperCase();
  const message = extractApiErrorMessage(body).toLowerCase();

  return (
    code === 'STOCK_INSUFFICIENT' ||
    message.includes('saldo insuficiente') ||
    message.includes('insufficient stock')
  );
};

const isRepeatableSurveyLimitResponse = (res: Response | null, body: string) => {
  if (!res || res.status !== 409) return false;

  const parsed = parseResponseBodySafely(body);
  const code = String(parsed?.code || '').toUpperCase();
  const message = extractApiErrorMessage(body).toLowerCase();

  return (
    code === 'REPEATABLE_SURVEY_LIMIT_REACHED' ||
    message.includes('limite de respostas da pesquisa recorrente') ||
    message.includes('limite atingido') ||
    message.includes('quantidade máxima')
  );
};

// MOBILE_REQUIRED_CHECKOUT_422_RECONCILIATION_V1
// 422 VISIT_REQUIRED_SURVEYS_PENDING não é um conflito causal e não deve
// virar retry infinito. O servidor confirmou que a visita existe, permanece
// aberta e só rejeitou a tentativa de checkout por precondição funcional.
const isRequiredVisitSurveyPendingResponse = (res: Response | null, body: string) => {
  if (!res || res.status !== 422) return false;
  return getApiResponseCode(body) === 'VISIT_REQUIRED_SURVEYS_PENDING';
};

const getCheckoutVisitIdentityFromPayload = (payload: any) => ({
  localId: String(
    payload?.offline_id ||
    payload?.visita_id ||
    payload?.visitaId ||
    ''
  ).trim(),
  registroVisitaId: String(
    payload?.registroVisitaId ||
    payload?.registro_visita_id ||
    ''
  ).trim(),
  visitaAgendadaId: String(
    payload?.visitaIdJson ||
    payload?.visita_id_json ||
    payload?.visitaAgendadaId ||
    payload?.visita_agendada_id ||
    ''
  ).trim(),
});

const recoverCheckoutRejectedByRequiredSurvey = async (
  db: any,
  item: any,
  payload: any,
  body: string
) => {
  const endpoint = String(item?.endpoint || '').toLowerCase();
  if (!endpoint.includes('/visitas/checkout')) return false;

  const parsed = parseResponseBodySafely(body);
  const identity = getCheckoutVisitIdentityFromPayload(payload);
  const lookupValues = [
    identity.localId,
    identity.registroVisitaId,
    identity.visitaAgendadaId,
  ].filter(Boolean);

  if (lookupValues.length === 0) return false;

  let localVisit: any = null;
  for (const value of lookupValues) {
    localVisit = await db.getFirstAsync(
      `
        SELECT id, pesquisa_json
        FROM visits
        WHERE id = ?
           OR registro_visita_id = ?
           OR visita_id_json = ?
        LIMIT 1
      `,
      [value, value, value]
    ).catch(() => null);

    if (localVisit?.id) break;
  }

  if (!localVisit?.id) return false;

  const pendingSurveys = safeArray(parsed?.pending_surveys);
  const localSurveyIds = new Set(
    safeArray(safeJsonParse(localVisit?.pesquisa_json, []))
      .map((survey: any) =>
        String(
          survey?.id ||
          survey?.pesquisa_id ||
          survey?.pesquisaId ||
          survey?.survey_id ||
          survey?.surveyId ||
          ''
        ).trim()
      )
      .filter(Boolean)
  );

  // Se o servidor passou a exigir uma pesquisa que nem existe no manifesto
  // local, isso pode ser mudança de configuração durante período offline.
  // Nesse caso não escondemos o desvio como simples validação: deixamos o
  // fluxo normal de conflito/retry cuidar da divergência causal.
  const pendingKnownLocally =
    pendingSurveys.length === 0 ||
    pendingSurveys.every((survey: any) =>
      localSurveyIds.has(
        String(survey?.id || survey?.pesquisa_id || survey?.pesquisaId || '').trim()
      )
    );

  if (!pendingKnownLocally) return false;

  const now = new Date().toISOString();
  const operationKey = String(item?.operation_key || payload?.client_operation_id || '').trim();
  const visitId = String(localVisit.id);

  await db.withTransactionAsync(async () => {
    // A tentativa é inequivocamente inválida no estado atual. Ela não pode
    // continuar em RETRY nem finalizar automaticamente depois que o formulário
    // for respondido; o usuário deverá efetuar um novo checkout consciente.
    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);

    await db.runAsync(
      `
        UPDATE visits
        SET status = 'EM_ANDAMENTO',
            checkout_at = NULL,
            pending_sync = 0,
            client_operation_id = NULL,
            updated_at = ?
        WHERE id = ?
      `,
      [now, visitId]
    );

    // Mantém a trilha de auditoria, mas tira da saúde os conflitos derivados
    // desta mesma tentativa rejeitada. Nada é apagado silenciosamente.
    await db.runAsync(
      `
        UPDATE sync_conflicts
        SET resolved_at = ?,
            resolution = 'REQUIRED_SURVEY_CHECKOUT_REJECTED_REOPENED',
            updated_at = ?
        WHERE resolved_at IS NULL
          AND (queue_id = ? OR (? <> '' AND operation_key = ?))
      `,
      [now, now, item.id, operationKey, operationKey]
    ).catch(() => {});

    for (const value of lookupValues) {
      await db.runAsync(
        `
          UPDATE sync_conflicts
          SET resolved_at = ?,
              resolution = 'REQUIRED_SURVEY_CHECKOUT_REJECTED_REOPENED',
              updated_at = ?
          WHERE resolved_at IS NULL
            AND LOWER(COALESCE(endpoint, '')) LIKE '%checkout%'
            AND payload LIKE ?
        `,
        [now, now, `%${value}%`]
      ).catch(() => {});
    }
  });

  await addAppLog({
    level: 'WARNING',
    module: 'SYNC',
    action: 'REQUIRED_SURVEY_CHECKOUT_REJECTED_REOPENED',
    message: 'Checkout rejeitado por pesquisa obrigatória pendente; visita local reaberta para correção.',
    metadata: {
      queueId: item?.id,
      visitId,
      operationKey: operationKey || null,
      pendingSurveys,
      serverCode: parsed?.code || null,
    },
  }).catch(() => {});

  console.warn('[SYNC] Checkout rejeitado por pesquisa obrigatória. A visita voltou para EM_ANDAMENTO e a tentativa inválida foi encerrada.', {
    queueId: item?.id,
    visitId,
    pendingSurveys,
  });

  return true;
};

/*
 * MOBILE_CONFLICT_HYGIENE_TOMBSTONE_V1
 *
 * Tombstone de lifecycle da visita pode ser consequência normal de uma visita
 * removida/reaberta no servidor. Quando NÃO existe evidência humana pendente
 * (coleta/outbox de coleta), o evento continua no ledger técnico, mas deixa de
 * ser uma pendência operacional do usuário.
 *
 * Coletas nunca são auto-descartadas por este fluxo. Se houver evidência humana,
 * o conflito permanece preservado para suporte/reconciliação.
 */
const getVisitIdentityValuesFromPayloadV1 = (payload: any) =>
  Array.from(
    new Set(
      [
        payload?.offline_id,
        payload?.visita_id,
        payload?.visitaId,
        payload?.registro_visita_id,
        payload?.registroVisitaId,
        payload?.visita_id_json,
        payload?.visitaIdJson,
        payload?.visita_agendada_id,
        payload?.visitaAgendadaId,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

const isVisitLifecycleEndpointV1 = (endpoint: any) => {
  const normalized = String(endpoint || '').toLowerCase();
  return (
    normalized.includes('/visitas/checkin') ||
    normalized.includes('/visitas/checkout') ||
    normalized.includes('/visitas/justificar')
  );
};

const hasPendingHumanEvidenceForVisitV1 = async (db: any, identities: string[]) => {
  if (identities.length === 0) return false;

  const placeholders = identities.map(() => '?').join(',');
  const collectionRow: any = await db.getFirstAsync(
    `SELECT id
       FROM coletas
      WHERE visita_id IN (${placeholders})
        AND (
          COALESCE(pending_sync, 0) = 1
          OR UPPER(COALESCE(status, '')) = 'CONFLITO_SYNC'
        )
      LIMIT 1`,
    identities
  ).catch(() => null);

  if (collectionRow?.id) return true;

  const queueClauses: string[] = [];
  const queueParams: any[] = [];

  for (const value of identities) {
    queueClauses.push('payload LIKE ?');
    queueParams.push(`%${value}%`);
  }

  if (queueClauses.length === 0) return false;

  const queueRow: any = await db.getFirstAsync(
    `SELECT id
       FROM sync_queue
      WHERE LOWER(COALESCE(endpoint, '')) LIKE '%/coletas%'
        AND COALESCE(status, 'PENDING') IN ('PENDING', 'RETRY', 'CONFLICT')
        AND (${queueClauses.join(' OR ')})
      LIMIT 1`,
    queueParams
  ).catch(() => null);

  return Boolean(queueRow?.id);
};

const resolveObsoleteServerTombstoneQueueItemV1 = async (
  db: any,
  item: any,
  preparedPayload: any,
  res: Response | null,
  body: string
) => {
  if (getApiResponseCode(body) !== 'STATE_CONFLICT_SERVER_TOMBSTONED') return false;
  if (!isVisitLifecycleEndpointV1(item?.endpoint)) return false;

  const payload = preparedPayload || safeJsonParse(item?.payload, {});
  const identities = getVisitIdentityValuesFromPayloadV1(payload);
  if (identities.length === 0) return false;

  if (await hasPendingHumanEvidenceForVisitV1(db, identities)) {
    return false;
  }

  const parsed = parseResponseBodySafely(body);
  const now = new Date().toISOString();
  const queueId = Number(item?.id || item?.queue_id || 0);
  if (!queueId) return false;

  const operationKey = String(
    item?.operation_key || payload?.client_operation_id || ''
  ).trim();

  const conflictId = String(item?.conflict_id || `sync_conflict_${queueId}`);
  const payloadString = JSON.stringify(payload || {});
  const responseJson = JSON.stringify(
    parsed && typeof parsed === 'object' ? parsed : { raw: body || null }
  );
  const httpStatus = Number(res?.status || item?.http_status || 0) || null;
  const conflictMessage = extractApiErrorMessage(
    body,
    String(item?.conflict_message || 'Entidade removida no servidor.')
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sync_conflicts (
         id, queue_id, operation_key, endpoint, method, payload,
         http_status, conflict_code, conflict_message, response_json,
         created_at, updated_at, resolved_at, resolution
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'STATE_CONFLICT_SERVER_TOMBSTONED', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(queue_id) DO UPDATE SET
         operation_key = excluded.operation_key,
         endpoint = excluded.endpoint,
         method = excluded.method,
         payload = excluded.payload,
         http_status = excluded.http_status,
         conflict_code = excluded.conflict_code,
         conflict_message = excluded.conflict_message,
         response_json = excluded.response_json,
         updated_at = excluded.updated_at,
         resolved_at = excluded.resolved_at,
         resolution = excluded.resolution`,
      [
        conflictId,
        queueId,
        operationKey || null,
        String(item?.endpoint || ''),
        String(item?.method || 'POST').toUpperCase(),
        payloadString,
        httpStatus,
        conflictMessage.substring(0, 500),
        responseJson,
        String(item?.created_at || item?.createdAt || now),
        now,
        now,
        'SERVER_TOMBSTONE_OBSOLETE_AUTO_RESOLVED',
      ]
    );

    await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [queueId]);

    for (const value of identities) {
      await db.runAsync(
        `DELETE FROM visits
          WHERE id = ?
             OR registro_visita_id = ?
             OR visita_id_json = ?`,
        [value, value, value]
      ).catch(() => {});
    }
  });

  await addAppLog({
    level: 'INFO',
    module: 'SYNC',
    action: 'SERVER_TOMBSTONE_OBSOLETE_AUTO_RESOLVED',
    message: 'Operação de visita obsoleta reconciliada após remoção confirmada no servidor.',
    metadata: {
      queueId,
      endpoint: item?.endpoint || null,
      operationKey: operationKey || null,
      identities,
    },
  }).catch(() => {});

  return true;
};

const reconcileObsoleteServerTombstoneConflictsV1 = async (db: any) => {
  const rows: any[] = await db.getAllAsync(
    `SELECT
       c.id AS conflict_id, c.queue_id, c.operation_key, c.endpoint, c.method,
       c.payload AS conflict_payload, c.http_status, c.conflict_message,
       c.response_json, c.created_at AS conflict_created_at,
       q.id, q.payload, q.created_at
     FROM sync_conflicts c
     LEFT JOIN sync_queue q ON q.id = c.queue_id
     WHERE c.resolved_at IS NULL
       AND UPPER(COALESCE(c.conflict_code, '')) = 'STATE_CONFLICT_SERVER_TOMBSTONED'
     ORDER BY c.created_at ASC`
  ).catch(() => []);

  let resolved = 0;

  for (const row of rows) {
    if (!isVisitLifecycleEndpointV1(row?.endpoint)) continue;

    const payload = safeJsonParse(row?.payload || row?.conflict_payload, {});
    const body = String(row?.response_json || JSON.stringify({
      code: 'STATE_CONFLICT_SERVER_TOMBSTONED',
      message: row?.conflict_message || 'Entidade removida no servidor.',
    }));

    const reconciled = await resolveObsoleteServerTombstoneQueueItemV1(
      db,
      {
        ...row,
        id: Number(row?.id || row?.queue_id || 0),
        created_at: row?.created_at || row?.conflict_created_at,
      },
      payload,
      null,
      body
    ).catch(() => false);

    if (reconciled) resolved += 1;
  }

  return resolved;
};

const discardCollectionRejectedByRepeatableLimit = async (db: any, item: any, payload: any, body: string) => {
  const parsed = parseResponseBodySafely(body);
  const coletaId = payload?.client_operation_id || item?.id || null;
  const visitId = getVisitIdFromCollectionPayload(payload);
  const now = new Date().toISOString();

  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]).catch(() => {});

  if (coletaId) {
    await db
      .runAsync(`DELETE FROM coletas WHERE id = ?`, [String(coletaId)])
      .catch(() => {});
  }

  if (visitId) {
    await db
      .runAsync(
        `UPDATE visits SET pending_sync = 0, updated_at = ? WHERE id = ?`,
        [now, String(visitId)]
      )
      .catch(() => {});
  }

  await addAppLog({
    level: 'WARNING',
    module: 'SYNC',
    action: 'REPEATABLE_SURVEY_LIMIT_REACHED',
    message: parsed?.message || 'Coleta descartada porque o limite da pesquisa recorrente já foi atingido no servidor.',
    metadata: {
      queueId: item?.id,
      coletaId,
      visitId,
      pesquisaId: payload?.pesquisa_id || payload?.pesquisaId || payload?.surveyId,
      currentCount: parsed?.currentCount,
      max: parsed?.max,
    },
  }).catch(() => {});

  console.warn('[SYNC] Coleta recorrente excedente descartada da fila/local.', {
    queueId: item?.id,
    coletaId,
    visitId,
    message: parsed?.message || extractApiErrorMessage(body),
  });
};

const getFriendlyStockErrorMessage = (body: string) => {
  const raw = extractApiErrorMessage(body, 'Saldo insuficiente para realizar a movimentação de estoque.');

  const match = raw.match(/Saldo insuficiente para o item [\"“]?(.+?)[\"”]?\.\s*Saldo atual:\s*([0-9.,-]+)\.\s*Movimento solicitado:\s*([0-9.,-]+)/i);

  if (match) {
    const item = match[1];
    const current = match[2];
    const requested = match[3];

    return `Não foi possível movimentar ${requested} de "${item}", pois o saldo atual é ${current}. Corrija a resposta e envie novamente.`;
  }

  return raw || 'Saldo insuficiente para realizar a movimentação de estoque. Corrija a resposta e envie novamente.';
};

const getVisitIdFromCollectionPayload = (payload: any) => {
  return String(
    payload?.registroVisitaId ||
      payload?.registro_visita_id ||
      payload?.visitaIdJson ||
      payload?.visita_id_json ||
      payload?.visitaAgendadaId ||
      payload?.visita_agendada_id ||
      payload?.visitaId ||
      payload?.visita_id ||
      payload?.offline_id ||
      ''
  ).trim();
};

const markCollectionAsSyncError = async (db: any, item: any, payload: any, message: string) => {
  const visitId = getVisitIdFromCollectionPayload(payload);
  const now = new Date().toISOString();

  // Este erro é definitivo para o payload atual. Mantê-lo na fila geraria
  // tentativas infinitas. A coleta local volta para "não concluída", para o
  // promotor poder corrigir a resposta e gerar uma nova fila.
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);

  if (visitId) {
    await db
      .runAsync(
        `
          UPDATE visits
          SET pesquisa_realizada = 0,
              pending_sync = 0,
              updated_at = ?
          WHERE id = ?
        `,
        [now, visitId]
      )
      .catch(() => {});
  }

  try {
    const hasColetas = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name='coletas'`);

    if (hasColetas?.length > 0) {
      const coletaId = payload?.client_operation_id || item?.id || null;

      if (coletaId) {
        await db
          .runAsync(
            `
              UPDATE coletas
              SET status = ?,
                  pending_sync = 0,
                  raw_json = ?
              WHERE id = ?
            `,
            [
              'ERRO_SYNC',
              JSON.stringify({
                ...(payload || {}),
                sync_error: {
                  code: 'STOCK_INSUFFICIENT',
                  message,
                  updated_at: now,
                },
              }),
              String(coletaId),
            ]
          )
          .catch(() => {});
      }
    }
  } catch {}

  console.warn('[SYNC][ESTOQUE] Coleta removida da fila por saldo insuficiente. O formulário foi liberado para correção.', {
    queueId: item.id,
    visitId,
    message,
  });
};

const shouldRemoveFromQueue = async (res: Response | null) => {
  if (!res) return false;

  if (res.ok) return true;

  // 422, nesse fluxo, pode significar "exige aceite antes de apagar".
  // Não removemos da fila automaticamente para evitar falso sucesso.
  if (res.status === 422) return false;

  /*
   * MOBILE_DIAMOND_RESPONSE_ORDER_GUARD_V1
   *
   * Defesa em profundidade:
   * códigos semânticos Diamond nunca podem cair no
   * heurístico textual amplo de "já processado".
   */
  const body =
    await readResponseBodySafely(
      res
    );

  if (
    isTerminalSyncConflictResponse(
      res,
      body
    )
  ) {
    return false;
  }

  if (
    isTransientIdempotencyResponse(
      body
    )
  ) {
    return false;
  }

  if (
    await isAlreadyProcessedResponse(
      res
    )
  ) {
    return true;
  }

  // 401/403 não devem apagar fila: pode ser sessão/perm.
  // 400/404/422 também não devem apagar automaticamente.
  return false;
};

const getMainProjectId = (user: any) => {
  return (
    user?.allowed_project_ids?.[0] ||
    user?.projectId ||
    user?.projeto_id ||
    user?.project_id ||
    null
  );
};

const buildNoCacheFetchOptions = () => ({
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },
});

const ensureJustificativasTable = async (db: any) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS justificativas (
      id TEXT PRIMARY KEY,
      descricao TEXT,
      ativo TEXT DEFAULT 'true',
      raw_json TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_justificativas_ativo ON justificativas(ativo);
  `);
};

/*
 * ============================================================
 * MOBILE_SYNC_CHANGEFEED_CLIENT_V2
 * ============================================================
 */
const ensureMobileSyncStateTables = async (db: any) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_server_changes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      visita_agendada_id TEXT,
      registro_visita_id TEXT,
      action TEXT NOT NULL,
      server_changed_at TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      local_evidence_json TEXT,
      orphan_evidence INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sync_server_changes_project
      ON sync_server_changes(project_id, server_changed_at);

    CREATE INDEX IF NOT EXISTS idx_sync_server_changes_orphan
      ON sync_server_changes(orphan_evidence);
  `);
};

const buildSyncStateKey = (
  projectId: string,
  userId: string,
  suffix: string
) => `mobile_sync:${String(projectId)}:${String(userId)}:${suffix}`;

const setSyncStateValue = async (
  db: any,
  projectId: string,
  userId: string,
  suffix: string,
  value: string | null
) => {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key)
     DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [buildSyncStateKey(projectId, userId, suffix), value, now]
  );
};

const getSyncStateValue = async (
  db: any,
  projectId: string,
  userId: string,
  suffix: string
) => {
  const row: any = await db.getFirstAsync(
    `SELECT value FROM sync_state WHERE key = ? LIMIT 1`,
    [buildSyncStateKey(projectId, userId, suffix)]
  );
  return row?.value ?? null;
};

const normalizeChangeIdentity = (value: any) => {
  const normalized = String(value ?? '').trim();
  return normalized && normalized !== 'null' && normalized !== 'undefined'
    ? normalized
    : '';
};

const getVisitIdentitySet = (visit: any) => new Set(
  [
    visit?.id,
    visit?.registro_visita_id,
    visit?.registroVisitaId,
    visit?.visita_id_json,
    visit?.visitaIdJson,
    visit?.visitaAgendadaId,
    visit?.visita_agendada_id,
  ]
    .map(normalizeChangeIdentity)
    .filter(Boolean)
);

const getChangeIdentitySet = (change: any) => new Set(
  [
    change?.entityId,
    change?.registroVisitaId,
    change?.visitaAgendadaId,
  ]
    .map(normalizeChangeIdentity)
    .filter(Boolean)
);

const visitMatchesServerChange = (visit: any, change: any) => {
  const visitIds = getVisitIdentitySet(visit);
  const changeIds = getChangeIdentitySet(change);

  for (const id of changeIds) {
    if (visitIds.has(id)) return true;
  }

  if (
    changeIds.size === 0 &&
    change?.loja_id &&
    change?.data_programada
  ) {
    return (
      String(visit?.loja_id || '') === String(change.loja_id) &&
      String(visit?.data_programada || '').substring(0, 10) ===
        String(change.data_programada || '').substring(0, 10)
    );
  }

  return false;
};

const hasQueueForVisitEvidence = async (db: any, visit: any) => {
  const ids = Array.from(getVisitIdentitySet(visit));
  const operationKey = normalizeChangeIdentity(visit?.client_operation_id);
  const clauses: string[] = [];
  const params: any[] = [];

  if (operationKey) {
    clauses.push('operation_key = ?');
    params.push(operationKey);
  }

  for (const id of ids) {
    clauses.push('payload LIKE ?');
    params.push(`%${id}%`);
  }

  if (clauses.length === 0) return false;

  const row: any = await db.getFirstAsync(
    `SELECT id FROM sync_queue WHERE (${clauses.join(' OR ')}) LIMIT 1`,
    params
  );

  return Boolean(row?.id);
};

const hasPendingCollectionForVisit = async (db: any, visit: any) => {
  const ids = Array.from(getVisitIdentitySet(visit));
  if (ids.length === 0) return false;

  const placeholders = ids.map(() => '?').join(',');
  const row: any = await db.getFirstAsync(
    `SELECT id
       FROM coletas
      WHERE visita_id IN (${placeholders})
        AND pending_sync = 1
      LIMIT 1`,
    ids
  );

  return Boolean(row?.id);
};

const applyMobileSyncServerChange = async (
  db: any,
  projectId: string,
  userId: string,
  change: any
) => {
  const changeId = normalizeChangeIdentity(change?.id);
  if (!changeId) throw new Error('Changefeed sem id de alteração.');

  const already: any = await db.getFirstAsync(
    `SELECT id FROM sync_server_changes WHERE id = ? LIMIT 1`,
    [changeId]
  );
  if (already?.id) return;

  const action = String(change?.action || '').trim().toUpperCase();
  const terminalAction = ['DELETE', 'REOPEN', 'CANCEL_ROUTE_REASSIGNMENT'].includes(action);
  const visits: any[] = await db.getAllAsync(`SELECT * FROM visits`);
  const matchingVisits = visits.filter((visit) => visitMatchesServerChange(visit, change));
  const appliedAt = new Date().toISOString();

  let orphanEvidence = 0;
  const evidence: any[] = [];

  for (const visit of matchingVisits) {
    const hasQueue = await hasQueueForVisitEvidence(db, visit);
    const hasPendingCollection = await hasPendingCollectionForVisit(db, visit);
    const visitPending = Number(visit?.pending_sync || 0) === 1;
    const hasPendingEvidence = visitPending || hasPendingCollection;

    if (hasPendingEvidence && !hasQueue) {
      orphanEvidence = 1;
    }

    evidence.push({
      visit,
      hasQueue,
      hasPendingCollection,
      visitPending,
    });

    if (terminalAction) {
      const ids = Array.from(getVisitIdentitySet(visit));

      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM coletas
            WHERE visita_id IN (${placeholders})
              AND COALESCE(pending_sync, 0) = 0`,
          ids
        );
      }

      /*
       * A entidade operacional deixa de existir localmente imediatamente.
       * Outbox/coletas pendentes não são apagadas: permanecem como evidência.
       */
      await db.runAsync(`DELETE FROM visits WHERE id = ?`, [visit.id]);
    }
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_server_changes (
       id, project_id, user_id, entity_type, entity_id,
       visita_agendada_id, registro_visita_id, action,
       server_changed_at, applied_at, local_evidence_json, orphan_evidence
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      changeId,
      String(projectId),
      String(userId),
      change?.entityType || null,
      change?.entityId || null,
      change?.visitaAgendadaId || null,
      change?.registroVisitaId || null,
      action || 'UNKNOWN',
      change?.server_changed_at || appliedAt,
      appliedAt,
      JSON.stringify(evidence),
      orphanEvidence,
    ]
  );
};

const pullAndApplyMobileSyncChanges = async (
  db: any,
  projectId: string,
  userId: string,
  fetchOptions: any
) => {
  await ensureMobileSyncStateTables(db);

  let cursor = await getSyncStateValue(db, projectId, userId, 'server_cursor');
  let hasMore = true;
  let pages = 0;
  let applied = 0;

  while (hasMore) {
    pages += 1;
    if (pages > 100) {
      throw new Error('Changefeed excedeu o limite de segurança de paginação.');
    }

    const query =
      `/mobile-sync/changes?projectId=${encodeURIComponent(projectId)}` +
      `&limit=200` +
      (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');

    const response = await api(query, fetchOptions);
    if (!response.ok) {
      const body = await readResponseBodySafely(response);
      throw new Error(
        `Changefeed HTTP ${response.status}: ${extractApiErrorMessage(body, 'falha no pull de mudanças')}`
      );
    }

    const payload = await response.json();
    const changes = safeArray(payload?.changes);
    const nextCursor = payload?.nextCursor ? String(payload.nextCursor) : cursor;

    await db.withTransactionAsync(async () => {
      for (const change of changes) {
        await applyMobileSyncServerChange(db, projectId, userId, change);
        applied += 1;
      }

      if (nextCursor) {
        await setSyncStateValue(db, projectId, userId, 'server_cursor', nextCursor);
      }

      await setSyncStateValue(
        db,
        projectId,
        userId,
        'last_server_pull_at',
        payload?.serverTime || new Date().toISOString()
      );
      await setSyncStateValue(db, projectId, userId, 'last_server_pull_error', null);
    });

    cursor = nextCursor;
    hasMore = Boolean(payload?.hasMore);

    if (hasMore && changes.length === 0) {
      throw new Error('Changefeed marcou hasMore sem retornar mudanças.');
    }
  }

  return { applied, cursor };
};

const normalizeJustificativa = (item: any) => {
  const id = String(
    item?.id ||
    item?.codigo ||
    item?.value ||
    item?.descricao ||
    item?.description ||
    item?.nome ||
    item?.name ||
    ''
  ).trim();

  const descricao = String(
    item?.descricao ||
    item?.description ||
    item?.nome ||
    item?.name ||
    item?.label ||
    item?.title ||
    ''
  ).trim();

  const ativo = item?.ativo ?? item?.active ?? true;

  if (!id || !descricao) return null;

  return {
    id,
    descricao,
    ativo,
    raw_json: item,
  };
};

const getJsonIfOk = async (res: Response | null) => {
  if (!res || !res.ok) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
};

const fetchJustificativas = async (projectId: string, urlTS: number, fetchOptions: any) => {
  const endpoints = [
    `/justificativas/${projectId}?t=${urlTS}`,
    `/justificativas?projectId=${projectId}&t=${urlTS}`,
    `/absence-justifications/${projectId}?t=${urlTS}`,
    `/absence-justifications?projectId=${projectId}&t=${urlTS}`,
    `/admin/justificativas/${projectId}?t=${urlTS}`,
    `/admin/justificativas?projectId=${projectId}&t=${urlTS}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await api(endpoint, fetchOptions).catch(() => null);
      const data = await getJsonIfOk(res);

      if (!data) continue;

      const list =
        Array.isArray(data)
          ? data
          : data.justificativas ||
            data.absenceJustifications ||
            data.items ||
            data.data ||
            data.rows ||
            [];

      const normalized = safeArray(list)
        .map(normalizeJustificativa)
        .filter(Boolean);

      if (normalized.length > 0) return normalized as any[];
    } catch {}
  }

  return [];
};

const saveJustificativasOffline = async (db: any, justificativas: any[]) => {
  await ensureJustificativasTable(db);

  const normalized = safeArray(justificativas)
    .map(normalizeJustificativa)
    .filter(Boolean) as any[];

  const now = new Date().toISOString();

  if (normalized.length > 0) {
    await db.runAsync(`DELETE FROM justificativas`);

    for (const item of normalized) {
      await db.runAsync(
        `INSERT OR REPLACE INTO justificativas (id, descricao, ativo, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [
          item.id,
          item.descricao,
          String(item.ativo ?? true),
          JSON.stringify(item.raw_json || item),
          now,
        ]
      );
    }

    return;
  }

  const existing: any = await db.getFirstAsync(`SELECT COUNT(*) as count FROM justificativas`);

  if (!existing || Number(existing.count || 0) === 0) {
    const fallback = [
      { id: 'loja_fechada', descricao: 'Loja Fechada', ativo: true },
      { id: 'demandas_extras', descricao: 'Demandas Extras', ativo: true },
      { id: 'outro', descricao: 'Outro (Justifique)', ativo: true },
    ];

    for (const item of fallback) {
      await db.runAsync(
        `INSERT OR REPLACE INTO justificativas (id, descricao, ativo, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [item.id, item.descricao, String(item.ativo), JSON.stringify(item), now]
      );
    }
  }
};


// ============================================================================
// 🔔 ALERTAS / MENSAGENS OPERACIONAIS
// ============================================================================
const normalizeAlert = (item: any, userId?: string) => {
  if (!item || typeof item !== 'object') return null;

  const raw = safeJsonParse(item.raw_json, item);

  const id = String(
    item.id ||
      item.alertaId ||
      item.alert_id ||
      item.messageId ||
      item.message_id ||
      raw.id ||
      ''
  ).trim();

  if (!id) return null;

  const leitura =
    item.leitura ||
    item.recipient ||
    item.destinatario ||
    item.destinatarios?.find?.((d: any) =>
      String(d.usuario_id || d.usuarioId || d.userId || d.id) === String(userId || '')
    ) ||
    {};

  const lida = item.lida ?? item.read ?? leitura.lida ?? leitura.read ?? false;
  const lidaEm =
    item.lida_em ||
    item.lidaEm ||
    item.data_leitura ||
    item.read_at ||
    leitura.lida_em ||
    leitura.data_leitura ||
    leitura.read_at ||
    null;

  const exigeAceite =
    item.exige_aceite ??
    item.exigeAceite ??
    item.requiresAck ??
    item.requer_confirmacao ??
    item.requerConfirmacao ??
    false;

  const aceitaEm =
    item.aceita_em ||
    item.aceitaEm ||
    item.ack_at ||
    item.acknowledged_at ||
    leitura.aceita_em ||
    leitura.ack_at ||
    null;

  return {
    id,
    titulo: String(item.titulo || item.title || item.assunto || item.subject || 'Comunicado'),
    conteudo: String(item.conteudo || item.content || item.mensagem || item.message || ''),
    remetente_nome: String(
      item.remetente_nome ||
        item.remetente?.nome ||
        item.autor?.nome ||
        item.senderName ||
        item.sender?.name ||
        'Gestão'
    ),
    data_envio: String(
      item.data_envio ||
        item.dataEnvio ||
        item.created_at ||
        item.criado_em ||
        item.data_publicacao ||
        item.published_at ||
        new Date().toISOString()
    ),
    prioridade: String(item.prioridade || item.priority || 'INFO').toUpperCase(),
    lida,
    lida_em: lidaEm,
    exige_aceite: exigeAceite,
    aceita_em: aceitaEm,
    raw_json: item,
  };
};

const fetchAlertas = async (
  projectId: string,
  promotorId: string,
  urlTS: number,
  fetchOptions: any
) => {
  const endpoints = [
    // Rota que já existe na sua team.ts atual
    `/messages/${promotorId}?projectId=${projectId}&t=${urlTS}`,

    // Novas rotas de compatibilidade enterprise
    `/mobile-alertas?projectId=${projectId}&userId=${promotorId}&t=${urlTS}`,
    `/mobile-alertas/${projectId}/${promotorId}?t=${urlTS}`,
    `/alertas/mobile?projectId=${projectId}&userId=${promotorId}&t=${urlTS}`,

    // Fallbacks para nomes alternativos
    `/alertas?projectId=${projectId}&userId=${promotorId}&mobile=true&t=${urlTS}`,
    `/mensagens?projectId=${projectId}&userId=${promotorId}&mobile=true&t=${urlTS}`,
    `/messages?projectId=${projectId}&userId=${promotorId}&mobile=true&t=${urlTS}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await api(endpoint, fetchOptions).catch(() => null);
      const data = await getJsonIfOk(res);

      if (!data) continue;

      const list =
        Array.isArray(data)
          ? data
          : data.alertas ||
            data.alerts ||
            data.mensagens ||
            data.messages ||
            data.items ||
            data.data ||
            data.rows ||
            [];

      const normalized = safeArray(list)
        .map((item) => normalizeAlert(item, promotorId))
        .filter(Boolean);

      if (normalized.length > 0) {
        return normalized as any[];
      }
    } catch {}
  }

  return [];
};



// ============================================================================
// 🎯 CAMPANHAS / SCORECARDS — FONTE DA VERDADE DO WEB
// ============================================================================
const parseArrayPayload = (value: any): any[] | null => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;

    try {
      const parsed = JSON.parse(trimmed);
      return parseArrayPayload(parsed);
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    const candidateKeys = [
      'gamificationConfig',
      'perfectStoreRules',
      'campanhas',
      'campanhas_gamificacao',
      'campanhasGamificacao',
      'campaigns',
      'scorecards',
      'rules',
      'items',
      'data',
      'rows',
    ];

    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const parsed = parseArrayPayload(value[key]);
        if (parsed) return parsed;
      }
    }
  }

  return null;
};

const pickFirstFilled = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'null' && String(value).trim() !== 'undefined') {
      return value;
    }
  }

  return null;
};

const normalizeRemoteBoolean = (value: any): boolean | null => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (['1', 'TRUE', 'SIM', 'YES', 'ATIVO', 'ATIVA', 'ACTIVE', 'ENABLED', 'PUBLICADO', 'PUBLICADA', 'EM_ANDAMENTO', 'RUNNING'].includes(normalized)) {
    return true;
  }

  if (['0', 'FALSE', 'NAO', 'NÃO', 'NO', 'INATIVO', 'INATIVA', 'INACTIVE', 'DISABLED', 'CANCELADO', 'CANCELADA', 'ENCERRADO', 'ENCERRADA', 'FINALIZADO', 'FINALIZADA', 'PAUSADO', 'PAUSADA', 'ARQUIVADO', 'ARQUIVADA'].includes(normalized)) {
    return false;
  }

  return null;
};

const normalizeRemoteDate = (...values: any[]) => {
  const value = pickFirstFilled(...values);
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw || raw === 'null' || raw === 'undefined') return null;

  // Mantém YYYY-MM-DD quando a API já entrega a data curta.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const time = new Date(raw).getTime();
  if (!Number.isNaN(time)) return new Date(time).toISOString().substring(0, 10);

  return raw.substring(0, 10);
};

const normalizeGamificationCampaign = (item: any) => {
  if (!item || typeof item !== 'object') return null;

  const raw = safeJsonParse(item.raw_json || item.campanha_raw_json, item);

  const id = String(
    pickFirstFilled(
      item.id,
      item.id_campanha,
      item.campanhaId,
      item.campanha_id,
      raw.id,
      raw.id_campanha,
      raw.campanhaId,
      raw.campanha_id
    ) || ''
  ).trim();

  if (!id) return null;

  const ativo = normalizeRemoteBoolean(
    pickFirstFilled(
      raw.enabled,
      raw.ativo,
      raw.active,
      raw.isActive,
      raw.is_active,
      item.enabled,
      item.ativo,
      item.active,
      item.isActive,
      item.is_active
    )
  );

  return {
    ...raw,
    ...item,
    id,
    nome: String(pickFirstFilled(item.nome, item.nome_campanha, item.name, item.titulo, raw.nome, raw.nome_campanha, raw.name, raw.titulo) || 'Campanha de Performance'),
    ativo: ativo === true,
    enabled: ativo === true,
    data_inicio: normalizeRemoteDate(item.data_inicio, item.dataInicio, item.startDate, item.start_date, item.inicio, raw.data_inicio, raw.dataInicio, raw.startDate, raw.start_date, raw.inicio),
    data_fim: normalizeRemoteDate(item.data_fim, item.dataFim, item.endDate, item.end_date, item.fim, raw.data_fim, raw.dataFim, raw.endDate, raw.end_date, raw.fim),
    dataInicio: normalizeRemoteDate(item.dataInicio, item.data_inicio, item.startDate, item.start_date, item.inicio, raw.dataInicio, raw.data_inicio, raw.startDate, raw.start_date, raw.inicio),
    dataFim: normalizeRemoteDate(item.dataFim, item.data_fim, item.endDate, item.end_date, item.fim, raw.dataFim, raw.data_fim, raw.endDate, raw.end_date, raw.fim),
  };
};

const normalizePerfectStoreScorecard = (item: any) => {
  if (!item || typeof item !== 'object') return null;

  const raw = safeJsonParse(item.raw_json || item.scorecard_raw_json, item);

  const id = String(
    pickFirstFilled(
      item.id,
      item.id_scorecard,
      item.scorecardId,
      item.scorecard_id,
      raw.id,
      raw.id_scorecard,
      raw.scorecardId,
      raw.scorecard_id
    ) || ''
  ).trim();

  if (!id) return null;

  const ativo = normalizeRemoteBoolean(
    pickFirstFilled(
      raw.enabled,
      raw.ativo,
      raw.active,
      raw.isActive,
      raw.is_active,
      item.enabled,
      item.ativo,
      item.active,
      item.isActive,
      item.is_active
    )
  );

  return {
    ...raw,
    ...item,
    id,
    nome: String(pickFirstFilled(item.nome, item.nome_scorecard, item.name, item.titulo, raw.nome, raw.nome_scorecard, raw.name, raw.titulo) || 'Perfect Store'),
    ativo: ativo === true,
    enabled: ativo === true,
    data_inicio: normalizeRemoteDate(item.data_inicio, item.dataInicio, item.startDate, item.start_date, item.inicio, raw.data_inicio, raw.dataInicio, raw.startDate, raw.start_date, raw.inicio),
    data_fim: normalizeRemoteDate(item.data_fim, item.dataFim, item.endDate, item.end_date, item.fim, raw.data_fim, raw.dataFim, raw.endDate, raw.end_date, raw.fim),
    dataInicio: normalizeRemoteDate(item.dataInicio, item.data_inicio, item.startDate, item.start_date, item.inicio, raw.dataInicio, raw.data_inicio, raw.startDate, raw.start_date, raw.inicio),
    dataFim: normalizeRemoteDate(item.dataFim, item.data_fim, item.endDate, item.end_date, item.fim, raw.dataFim, raw.data_fim, raw.endDate, raw.end_date, raw.fim),
  };
};

const fetchGamificationCampaigns = async (projectId: string, urlTS: number, fetchOptions: any): Promise<any[] | null> => {
  const endpoints = [
    `/gamification/rules/${projectId}?t=${urlTS}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await api(endpoint, fetchOptions).catch(() => null);
      const data = await getJsonIfOk(res);

      if (!data) continue;

      const list = parseArrayPayload(data);
      if (!list) continue;

      return safeArray(list)
        .map(normalizeGamificationCampaign)
        .filter(Boolean) as any[];
    } catch {}
  }

  return null;
};

const fetchPerfectStoreScorecards = async (projectId: string, urlTS: number, fetchOptions: any): Promise<any[] | null> => {
  const endpoints = [
    `/perfect-store/rules/${projectId}?t=${urlTS}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await api(endpoint, fetchOptions).catch(() => null);
      const data = await getJsonIfOk(res);

      if (!data) continue;

      const list = parseArrayPayload(data);
      if (!list) continue;

      return safeArray(list)
        .map(normalizePerfectStoreScorecard)
        .filter(Boolean) as any[];
    } catch {}
  }

  return null;
};

const buildCampaignDebugSnapshot = (list: any[]) =>
  safeArray(list).map((item) => ({
    id: item?.id,
    nome: item?.nome || item?.name || item?.titulo,
    ativo: item?.ativo ?? item?.enabled ?? item?.active,
    data_inicio: item?.data_inicio || item?.dataInicio || item?.startDate || null,
    data_fim: item?.data_fim || item?.dataFim || item?.endDate || null,
  }));

const updateVisitAfterSyncedQueueItem = async (db: any, item: any) => {
  try {
    const payload = safeJsonParse(item.payload, {});
    const endpoint = String(item?.endpoint || '').toLowerCase();
    const isCollectionSync = endpoint.includes('/coletas');

    if (isCollectionSync) {
      const collectionId =
        payload?.client_operation_id ||
        payload?.coleta_id ||
        payload?.coletaId ||
        payload?.id ||
        null;

      if (collectionId) {
        await db
          .runAsync(
            `UPDATE coletas SET pending_sync = 0, status = ?, updated_at = ? WHERE id = ?`,
            ['SINCRONIZADA', new Date().toISOString(), String(collectionId)]
          )
          .catch(() => {});
      }

      // Sincronizar formulário não deve alterar pending_sync da visita.
      return;
    }

    const visitId = payload.offline_id || payload.visita_id || payload.visitaId || payload.visitaIdJson;

    if (!visitId) return;

    await db.runAsync(
      `UPDATE visits SET pending_sync = 0 WHERE id = ?`,
      [String(visitId)]
    );
  } catch {}
};

const PHOTO_PAYLOAD_FIELDS = ['foto_checkin_url', 'foto_checkout_url', 'foto_justificativa_url'];

const getVisitIdFromPayload = (payload: any) => {
  return String(
    payload?.offline_id ||
      payload?.visita_id ||
      payload?.visitaId ||
      payload?.visita_id_json ||
      payload?.visitaIdJson ||
      ''
  ).trim();
};

const isJustificationEndpoint = (endpoint: string) => {
  return String(endpoint || '').toLowerCase().includes('/visitas/justificar');
};

const hasJustificationPhoto = (payload: any) => {
  return Boolean(
    payload?.foto_justificativa_url ||
      payload?.fotoJustificativaUrl ||
      payload?.foto_justificativa ||
      payload?.justificativa_foto_url
  );
};

const resetInvalidJustificationWithoutPhoto = async (db: any, item: any, payload: any, responseBody: string) => {
  const visitId = getVisitIdFromPayload(payload);

  if (!visitId) return false;
  if (!isJustificationEndpoint(item?.endpoint)) return false;
  if (hasJustificationPhoto(payload)) return false;

  const message = String(responseBody || '').toLowerCase();

  // Como a configuração do web passou a exigir foto na justificativa,
  // filas antigas sem foto passam a receber 400. Elas nunca vão sincronizar,
  // porque a foto não existe no aparelho. Então removemos a fila inválida e
  // devolvemos a visita para PENDENTE para o usuário justificar novamente,
  // agora com foto obrigatória.
  const looksLikePhotoRequired =
    !message ||
    message.includes('foto') ||
    message.includes('photo') ||
    message.includes('imagem') ||
    message.includes('obrig') ||
    message.includes('required') ||
    message.includes('justific');

  if (!looksLikePhotoRequired) return false;

  const now = new Date().toISOString();

  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);

  await db.runAsync(
    `
      UPDATE visits
      SET status = 'PENDENTE',
          pending_sync = 0,
          client_operation_id = NULL,
          justificativa_id = NULL,
          justificativa = NULL,
          detalhe_justificativa = NULL,
          foto_justificativa_url = NULL,
          updated_at = ?
      WHERE id = ?
    `,
    [now, visitId]
  );

  console.warn('[SYNC] Justificativa antiga sem foto foi removida da fila. A visita voltou para PENDENTE para justificar novamente com foto.', {
    queueId: item.id,
    visitId,
    status: 400,
  });

  return true;
};

const getActionFromEndpointOrPayload = (endpoint: string, payload: any) => {
  const acao = String(payload?.acao || '').toUpperCase();

  if (acao === 'CHECKIN' || acao === 'CHECKOUT' || acao === 'JUSTIFICAR') return acao;

  const ep = String(endpoint || '').toLowerCase();

  if (ep.includes('checkout')) return 'CHECKOUT';
  if (ep.includes('justificar')) return 'JUSTIFICAR';

  return 'CHECKIN';
};

const uploadLocalPhotosInPayload = async (db: any, payload: any, endpoint: string) => {
  let nextPayload = { ...(payload || {}) };
  let changed = false;

  const visitId = getVisitIdFromPayload(nextPayload);
  const projectId = nextPayload.projectId || nextPayload.project_id || null;
  const lojaId = nextPayload.lojaId || nextPayload.loja_id || null;
  const action = getActionFromEndpointOrPayload(endpoint, nextPayload);

  for (const field of PHOTO_PAYLOAD_FIELDS) {
    const currentValue = nextPayload[field];

    if (!isLocalFileUri(currentValue)) continue;

    logMediaSync('local-photo-found', {
      field,
      endpoint,
      visitId,
      projectId,
      lojaId,
      action,
      localUri: currentValue,
    });

    const publicUrl = await uploadLocalVisitPhotoToAws({
      localUri: String(currentValue),
      projectId,
      visitId,
      lojaId,
      action,
    });

    logMediaSync('photo-uploaded-to-aws', {
      field,
      publicUrl,
      visitId,
      endpoint,
    });

    nextPayload[field] = publicUrl;
    changed = true;

    if (visitId) {
      await db
        .runAsync(`UPDATE visits SET ${field} = ?, updated_at = ? WHERE id = ?`, [
          publicUrl,
          new Date().toISOString(),
          visitId,
        ])
        .catch(() => {});
    }
  }

  // Aliases genéricos não devem ir para o backend com file://.
  if (isLocalFileUri(nextPayload.foto_uri)) {
    delete nextPayload.foto_uri;
    changed = true;
  }

  if (isLocalFileUri(nextPayload.photo_uri)) {
    delete nextPayload.photo_uri;
    changed = true;
  }

  if (changed) {
    logMediaSync('payload-photo-fields-updated', {
      endpoint,
      visitId,
      changed,
      foto_checkin_url: nextPayload.foto_checkin_url,
      foto_checkout_url: nextPayload.foto_checkout_url,
      foto_justificativa_url: nextPayload.foto_justificativa_url,
    });
  }

  return {
    payload: nextPayload,
    changed,
  };
};

const prepareQueueItemPayloadForUpload = async (db: any, item: any) => {
  const payload = safeJsonParse(item.payload, {});
  const result = await uploadLocalPhotosInPayload(db, payload, item.endpoint);

  if (result.changed) {
    // MOBILE_OUTBOX_MEDIA_UPDATED_AT_V2
    await db.runAsync(
      `
        UPDATE sync_queue
        SET
          payload = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        JSON.stringify(
          result.payload
        ),
        new Date()
          .toISOString(),
        item.id
      ]
    );

    logMediaSync('sync-queue-payload-updated', {
      queueId: item.id,
      endpoint: item.endpoint,
    });
  }

  return result.payload;
};

/*
 * MOBILE_ENTERPRISE_OUTBOX_RETRY_V2
 *
 * Retry exponencial persistente com jitter.
 */
const OUTBOX_RETRY_BASE_MS =
  5000;

const OUTBOX_RETRY_MAX_MS =
  30 * 60 * 1000;

const calculateOutboxRetryDelayMs = (
  attempts: number
) => {

  const safeAttempts =
    Math.max(
      1,
      Number(
        attempts ||
        1
      )
    );

  const exponential =
    OUTBOX_RETRY_BASE_MS *
    Math.pow(
      2,
      Math.min(
        safeAttempts,
        8
      )
    );

  const jitter =
    Math.floor(
      Math.random() *
      2000
    );

  return Math.min(
    OUTBOX_RETRY_MAX_MS,
    exponential +
      jitter
  );
};

const scheduleOutboxRetry = async (
  db: any,
  item: any,
  errorMessage: any
) => {

  const attempts =
    Number(
      item?.attempts ||
      0
    ) + 1;

  const now =
    new Date();

  const nextRetryAt =
    new Date(
      now.getTime() +
      calculateOutboxRetryDelayMs(
        attempts
      )
    )
      .toISOString();

  const safeError =
    String(
      errorMessage ||
      'Erro de sincronização'
    )
      .substring(
        0,
        1000
      );

  await db.runAsync(
    `
      UPDATE sync_queue
      SET
        attempts = ?,
        last_error = ?,
        status = 'RETRY',
        next_retry_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      attempts,
      safeError,
      nextRetryAt,
      now.toISOString(),
      item.id
    ]
  );

  console.warn(
    '[SYNC OUTBOX] retry agendado',
    {
      queueId:
        item?.id,

      endpoint:
        item?.endpoint,

      attempts,

      nextRetryAt
    }
  );
};

const uploadSyncQueue = async (db: any) => {
  // MOBILE_ENTERPRISE_OUTBOX_READY_V2
  const nowIso =
    new Date()
      .toISOString();

  const filaDeSincronizacao: any[] =
    await db.getAllAsync(
      `
        SELECT *
        FROM sync_queue
        WHERE
          (
            next_retry_at IS NULL
            OR next_retry_at = ''
            OR next_retry_at <= ?
          )
          AND COALESCE(
            status,
            'PENDING'
          ) IN (
            'PENDING',
            'RETRY'
          )
        ORDER BY created_at ASC
      `,
      [
        nowIso
      ]
    );

  if (filaDeSincronizacao.length === 0) return;

  for (const item of filaDeSincronizacao) {
    try {
      const methodToUse = item.method ? String(item.method).toUpperCase() : 'POST';
      const preparedPayload = await prepareQueueItemPayloadForUpload(db, item);

      logMediaSync('sending-queue-item', {
        queueId: item.id,
        endpoint: item.endpoint,
        method: methodToUse,
        hasCheckinPhoto: Boolean(preparedPayload?.foto_checkin_url),
        hasCheckoutPhoto: Boolean(preparedPayload?.foto_checkout_url),
        fotoCheckinIsLocal: isLocalFileUri(preparedPayload?.foto_checkin_url),
        fotoCheckoutIsLocal: isLocalFileUri(preparedPayload?.foto_checkout_url),
      });

      const res = await api(item.endpoint, {
        method: methodToUse,
        body: JSON.stringify(preparedPayload),
      });

      logMediaSync('queue-item-response', {
        queueId: item.id,
        endpoint: item.endpoint,
        ok: res?.ok,
        status: res?.status,
      });

      /*
       * MOBILE_DIAMOND_RESPONSE_ORDER_MAIN_V1
       *
       * Ordem obrigatória:
       * 1. interpretar resposta;
       * 2. conflito terminal;
       * 3. idempotência transitória;
       * 4. somente depois avaliar sucesso/duplicate legítimo.
       */
      const body =
        await readResponseBodySafely(
          res
        );

      /*
       * MOBILE_DIAMOND_CONFLICT_HTTP_V1
       */
      if (
        isTerminalSyncConflictResponse(
          res,
          body
        )
      ) {

        if (
          await resolveObsoleteServerTombstoneQueueItemV1(
            db,
            item,
            preparedPayload,
            res,
            body
          )
        ) {
          continue;
        }

        await markOutboxConflict(
          db,
          item,
          preparedPayload,
          res,
          body
        );

        continue;
      }

      /*
       * MOBILE_DIAMOND_TRANSIENT_IDEMPOTENCY_V1
       */
      if (
        isTransientIdempotencyResponse(
          body
        )
      ) {

        logMediaSync(
          'idempotency-transient-retry',
          {
            queueId:
              item.id,

            endpoint:
              item.endpoint,

            code:
              getApiResponseCode(
                body
              )
          }
        );

        await scheduleOutboxRetry(
          db,
          item,
          `HTTP ${res?.status || 'unknown'} ${extractApiErrorMessage(
            body,
            'Idempotency transient response'
          )}`
        ).catch(
          retryError => {
            console.warn(
              '[SYNC OUTBOX] Falha ao registrar retry de idempotência transitória:',
              retryError
            );
          }
        );

        continue;
      }

      if (
        isRequiredVisitSurveyPendingResponse(
          res,
          body
        )
      ) {
        const recovered =
          await recoverCheckoutRejectedByRequiredSurvey(
            db,
            item,
            preparedPayload,
            body
          );

        if (recovered) {
          continue;
        }
      }

      if (
        await shouldRemoveFromQueue(
          res
        )
      ) {

        await updateVisitAfterSyncedQueueItem(
          db,
          item
        );

        await db.runAsync(
          `DELETE FROM sync_queue WHERE id = ?`,
          [
            item.id
          ]
        );

      } else {

        if (
          String(item.endpoint || '').toLowerCase().includes('/coletas') &&
          isRepeatableSurveyLimitResponse(res, body)
        ) {
          await discardCollectionRejectedByRepeatableLimit(db, item, preparedPayload, body);
          continue;
        }

        if (res?.status === 400) {
          const resetDone = await resetInvalidJustificationWithoutPhoto(db, item, preparedPayload, body);

          if (resetDone) {
            continue;
          }

          if (
            String(item.endpoint || '').toLowerCase().includes('/coletas') &&
            isStockInsufficientResponse(res, body)
          ) {
            const friendlyMessage = getFriendlyStockErrorMessage(body);
            await markCollectionAsSyncError(db, item, preparedPayload, friendlyMessage);
            continue;
          }
        }

        const errorMessage = extractApiErrorMessage(body, `HTTP ${res?.status || 'unknown'}`);

        // MOBILE_ENTERPRISE_OUTBOX_HTTP_RETRY_V2
        await scheduleOutboxRetry(
          db,
          item,
          `HTTP ${res?.status || 'unknown'} ${errorMessage}`
        ).catch(
          retryError => {
            console.warn(
              '[SYNC OUTBOX] Falha ao registrar retry HTTP:',
              retryError
            );
          }
        );
      }
    } catch (err: any) {
      logMediaSync('queue-item-error', {
        queueId: item.id,
        endpoint: item.endpoint,
        error: String(err?.message || err || 'Erro desconhecido'),
      });

      const errorMessage = String(
        err?.data?.message ||
          err?.data?.error ||
          err?.message ||
          err ||
          'Erro desconhecido'
      );

      // MOBILE_ENTERPRISE_OUTBOX_EXCEPTION_RETRY_V2
      await scheduleOutboxRetry(
        db,
        item,
        errorMessage
      ).catch(
        retryError => {
          console.warn(
            '[SYNC OUTBOX] Falha ao registrar retry de exceção:',
            retryError
          );
        }
      );
    }
  }
};

const uploadLegacyPendingVisits = async (db: any, rawProjectId: string, user: any) => {
  // Compatibilidade com check-ins antigos que foram salvos apenas na tabela visits,
  // antes de existir sync_queue explícita.
  const pendentes: any[] = await db.getAllAsync(
    `
      SELECT * FROM visits 
      WHERE pending_sync = 1 
      AND (client_operation_id IS NULL OR client_operation_id = '')
      ORDER BY checkin_at ASC
    `
  );

  if (pendentes.length === 0) return;

  for (const item of pendentes) {
    try {
      const status = String(item.status || '').toUpperCase();

      let endpoint = '/visitas/checkin';
      let dataHora = item.checkin_at;

      if (['REALIZADA', 'COMPLETA', 'CONCLUIDA'].includes(status) && item.checkout_at) {
        endpoint = '/visitas/checkout';
        dataHora = item.checkout_at;
      } else if (status === 'JUSTIFICADA') {
        endpoint = '/visitas/justificar';
        dataHora = item.updated_at || item.checkin_at || new Date().toISOString();
      }

      const isFreePortfolioVisit =
        String(item.field_visit_mode || '')
          .trim()
          .toUpperCase() === 'CARTEIRA_LIVRE' ||
        String(item.origem || '')
          .trim()
          .toUpperCase() === 'CARTEIRA_LIVRE';

      const payload = {
        projectId: rawProjectId,

        ...(isFreePortfolioVisit
          ? {
              registroVisitaId:
                item.registro_visita_id || item.id,
              registro_visita_id:
                item.registro_visita_id || item.id,
              fieldVisitMode: 'CARTEIRA_LIVRE',
              field_visit_mode: 'CARTEIRA_LIVRE',
              carteiraLivre: true,
              carteira_livre: true,
              origem: 'CARTEIRA_LIVRE',
            }
          : {
              roteiroId: item.roteiro_id,
              roteiro_id: item.roteiro_id,
              visitaIdJson: item.visita_id_json,
              visita_id_json: item.visita_id_json,
              origem: 'MOBILE_OFFLINE',
            }),

        visitaId: item.id,
        visita_id: item.id,
        promotorId: user.id,
        usuario_id: user.id,
        promotor_id: user.id,
        lojaId: item.loja_id,
        loja_id: item.loja_id,
        dataProgramada: item.data_programada,
        data_programada: item.data_programada,
        latitude: item.latitude,
        longitude: item.longitude,
        data_hora: dataHora,
        checkin_at: item.checkin_at,
        checkout_at: item.checkout_at,
        client_operation_id: `${endpoint.replace(/\W/g, '')}_${item.id}`,
        offline_id: item.id,
        foto_checkin_url: item.foto_checkin_url || null,
        foto_checkout_url: item.foto_checkout_url || null,
        foto_justificativa_url: item.foto_justificativa_url || null,
        status,
      };

      const preparedPayload = (await uploadLocalPhotosInPayload(db, payload, endpoint)).payload;

      if (isJustificationEndpoint(endpoint) && !hasJustificationPhoto(preparedPayload)) {
        await db.runAsync(
          `
            UPDATE visits
            SET status = 'PENDENTE',
                pending_sync = 0,
                client_operation_id = NULL,
                justificativa_id = NULL,
                justificativa = NULL,
                detalhe_justificativa = NULL,
                foto_justificativa_url = NULL,
                updated_at = ?
            WHERE id = ?
          `,
          [new Date().toISOString(), item.id]
        );

        continue;
      }

      const res = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(preparedPayload),
      });

      /*
       * MOBILE_DIAMOND_LEGACY_RESPONSE_GUARD_V1
       *
       * Registros legados não possuem sync_queue própria.
       * Mesmo assim, um conflito semântico jamais pode
       * limpar pending_sync silenciosamente.
       */
      const legacyBody =
        await readResponseBodySafely(
          res
        );

      if (
        isTerminalSyncConflictResponse(
          res,
          legacyBody
        )
      ) {

        await addAppLog({
          level:
            'WARN',

          module:
            'SYNC',

          action:
            'LEGACY_VISIT_TERMINAL_CONFLICT',

          message:
            'Visita legada preservada com pending_sync após conflito terminal.',

          metadata: {
            visitId:
              item.id,

            endpoint,

            code:
              getApiResponseCode(
                legacyBody
              )
          }
        }).catch(
          () => {}
        );

        continue;
      }

      if (
        isTransientIdempotencyResponse(
          legacyBody
        )
      ) {

        await addAppLog({
          level:
            'INFO',

          module:
            'SYNC',

          action:
            'LEGACY_VISIT_TRANSIENT_RETRY',

          message:
            'Visita legada permanecerá pendente para nova tentativa.',

          metadata: {
            visitId:
              item.id,

            endpoint,

            code:
              getApiResponseCode(
                legacyBody
              )
          }
        }).catch(
          () => {}
        );

        continue;
      }

      if (
        res.ok ||
        await isAlreadyProcessedResponse(
          res
        )
      ) {

        await db.runAsync(
          `UPDATE visits
              SET pending_sync = 0
            WHERE id = ?`,
          [
            item.id
          ]
        );
      }
    } catch {
      // Mantém como pendente.
    }
  }
};

const cleanExpiredLocalTasks = async (_db: any) => {
  // MOBILE_SYNC_NO_PRE_PULL_TASK_DELETION_V3
  // O snapshot remoto confirmado é a fonte da verdade.
  // Offline mantém a última visão válida.
  // DELAYED / ATRASADA continuam visíveis.
  return;
};

const buildSqlPlaceholders = (items: any[]) => items.map(() => '?').join(', ');

const normalizeServerVisitId = (item: any) => {
  return String(
    item?.id ||
      item?.visita_id ||
      item?.visitaId ||
      item?.visita_id_json ||
      item?.visitaIdJson ||
      item?.visitaAgendadaId ||
      ''
  ).trim();
};

const normalizeServerTaskId = (item: any) => {
  return String(
    item?.id ||
      item?.taskId ||
      item?.task_id ||
      item?.tarefaId ||
      item?.tarefa_id ||
      ''
  ).trim();
};

/**
 * O roteiro mobile é um espelho do backend.
 *
 * O saveRoteiroCompletoOffline faz INSERT/REPLACE do que chegou, mas não sabe
 * remover registros que deixaram de existir no servidor. Por isso Dashboard e
 * Roteiro continuavam exibindo visitas/tarefas antigas até o próximo login,
 * porque o login limpa o banco local inteiro.
 *
 * Aqui removemos somente o que não veio mais no snapshot atual do backend.
 * Visitas com pending_sync = 1 são preservadas para não perder operação offline.
 */

/*
 * MOBILE_DIAMOND_TASK_EVIDENCE_V2
 *
 * other_tasks é snapshot do servidor somente quando não existe evidência local
 * pendente. Coleta/Outbox/conflito continuam sendo a prova durável do trabalho
 * feito offline.
 */
const getLocalTaskPendingEvidenceV2 = async (
  db: any,
  localTask: any
) => {
  const raw = safeJsonParse(
    localTask?.task_raw_json,
    localTask || {}
  );

  const taskId = String(
    localTask?.id ||
      raw?.id ||
      raw?.task_id ||
      ''
  ).trim();

  const sourceVisitId = String(
    raw?.source_visit_id ||
      raw?.sourceVisitId ||
      ''
  ).trim();

  const pesquisaId = String(
    raw?.pesquisa_id ||
      raw?.pesquisaId ||
      ''
  ).trim();

  const lojaId = String(
    raw?.loja_id ||
      raw?.lojaId ||
      ''
  ).trim();

  const cycleStart = String(
    raw?.cycle_start ||
      raw?.data_inicio ||
      raw?.dataProgramada ||
      raw?.data_programada ||
      ''
  ).substring(0, 10);

  const cycleEnd = String(
    raw?.cycle_end ||
      raw?.data_vencimento ||
      raw?.data_fim ||
      cycleStart ||
      ''
  ).substring(0, 10);

  /*
   * MOBILE_LOJA_CICLO_TASK_EVIDENCE_SCOPE_V3
   *
   * A identidade da VISITA não pode, sozinha, transformar um conflito de
   * lifecycle (check-in/checkout/tombstone) em evidência da tarefa LOJA_CICLO.
   * Evidência da tarefa continua sendo: visita local ainda pendente, coleta da
   * pesquisa/loja/ciclo, Outbox da própria tarefa ou conflito da própria tarefa.
   *
   * Isso impede que uma visita apagada no servidor deixe uma obrigação fantasma
   * apenas porque um checkout antigo ficou registrado no Conflict Ledger.
   */
  const identityValues = Array.from(
    new Set(
      [
        taskId,
        raw?.client_operation_id,
        raw?.clientOperationId,
        raw?.omni_repeatable_close_operation_id,
        raw?.general_repeatable_close_operation_id,
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  let pendingVisit = false;
  if (sourceVisitId) {
    const row: any = await db.getFirstAsync(
      `SELECT id
         FROM visits
        WHERE id = ?
          AND COALESCE(pending_sync, 0) = 1
        LIMIT 1`,
      [sourceVisitId]
    );
    pendingVisit = Boolean(row?.id);
  }

  let pendingCollection = false;
  if (sourceVisitId) {
    const row: any = await db.getFirstAsync(
      `SELECT id
         FROM coletas
        WHERE visita_id = ?
          AND COALESCE(pending_sync, 0) = 1
        LIMIT 1`,
      [sourceVisitId]
    );
    pendingCollection = Boolean(row?.id);
  }

  if (!pendingCollection && pesquisaId && lojaId) {
    const params: any[] = [pesquisaId, lojaId];
    let dateClause = '';

    if (cycleStart && cycleEnd) {
      dateClause = `
        AND substr(
          COALESCE(
            NULLIF(data_programada, ''),
            NULLIF(data_inicio, ''),
            NULLIF(created_at, ''),
            ''
          ),
          1,
          10
        ) BETWEEN ? AND ?`;
      params.push(cycleStart, cycleEnd);
    }

    const row: any = await db.getFirstAsync(
      `SELECT id
         FROM coletas
        WHERE pesquisa_id = ?
          AND loja_id = ?
          AND COALESCE(pending_sync, 0) = 1
          ${dateClause}
        LIMIT 1`,
      params
    );

    pendingCollection = Boolean(row?.id);
  }

  let pendingOutbox = false;
  let unresolvedConflict = false;

  if (identityValues.length > 0) {
    const queueClauses: string[] = [];
    const queueParams: any[] = [];

    for (const value of identityValues) {
      queueClauses.push('operation_key = ?');
      queueParams.push(value);
      queueClauses.push('payload LIKE ?');
      queueParams.push(`%${value}%`);
    }

    const queueRow: any = await db.getFirstAsync(
      `SELECT id
         FROM sync_queue
        WHERE (${queueClauses.join(' OR ')})
        LIMIT 1`,
      queueParams
    );

    pendingOutbox = Boolean(queueRow?.id);

    const conflictClauses: string[] = [];
    const conflictParams: any[] = [];

    for (const value of identityValues) {
      conflictClauses.push('operation_key = ?');
      conflictParams.push(value);
      conflictClauses.push('payload LIKE ?');
      conflictParams.push(`%${value}%`);
    }

    const conflictRow: any = await db.getFirstAsync(
      `SELECT id
         FROM sync_conflicts
        WHERE resolved_at IS NULL
          AND (${conflictClauses.join(' OR ')})
        LIMIT 1`,
      conflictParams
    );

    unresolvedConflict = Boolean(conflictRow?.id);
  }

  const reasons = [
    pendingVisit ? 'PENDING_VISIT' : null,
    pendingCollection ? 'PENDING_COLLECTION' : null,
    pendingOutbox ? 'PENDING_OUTBOX' : null,
    unresolvedConflict ? 'UNRESOLVED_CONFLICT' : null,
  ].filter(Boolean) as string[];

  return {
    preserve: reasons.length > 0,
    reasons,
    taskId,
    sourceVisitId,
    pesquisaId,
    lojaId,
    cycleStart: cycleStart || null,
    cycleEnd: cycleEnd || null,
    manifestRevision: String(
      raw?.manifest_revision ||
        raw?.manifestRevision ||
        ''
    ).trim() || null,
  };
};

/*
 * MOBILE_DIAMOND_TASK_SERVER_OVERWRITE_GUARD_V2
 *
 * Snapshot remoto com o mesmo ID não sobrescreve estado local enquanto houver
 * evidência durável. Depois do receipt/conflito resolvido, o servidor volta a
 * ser autoridade automaticamente na próxima sincronização.
 */
const protectServerTaskSnapshotAgainstLocalEvidenceV2 = async (
  db: any,
  serverTasks: any[],
  currentManifestRevision?: string | null
) => {
  const protectedTasks: any[] = [];
  let deferredCount = 0;

  for (const serverTask of safeArray(serverTasks)) {
    const taskId = normalizeServerTaskId(serverTask);

    if (!taskId) {
      protectedTasks.push(serverTask);
      continue;
    }

    const localTask: any = await db.getFirstAsync(
      `SELECT * FROM other_tasks WHERE id = ? LIMIT 1`,
      [taskId]
    );

    if (!localTask?.id) {
      protectedTasks.push(serverTask);
      continue;
    }

    const evidence = await getLocalTaskPendingEvidenceV2(db, localTask);

    if (!evidence.preserve) {
      protectedTasks.push(serverTask);
      continue;
    }

    deferredCount += 1;

    const remoteRevision = String(
      currentManifestRevision || ''
    ).trim();

    await addAppLog({
      level: 'WARNING',
      module: 'SYNC',
      action: 'SERVER_TASK_OVERWRITE_DEFERRED',
      message: 'Snapshot remoto de tarefa adiado por evidência local pendente.',
      metadata: {
        taskId,
        reasons: evidence.reasons,
        sourceVisitId: evidence.sourceVisitId || null,
        localManifestRevision: evidence.manifestRevision,
        remoteManifestRevision: remoteRevision || null,
        manifestChanged: Boolean(
          evidence.manifestRevision &&
          remoteRevision &&
          evidence.manifestRevision !== remoteRevision
        ),
      },
    }).catch(() => {});
  }

  return {
    tasks: protectedTasks,
    deferredCount,
  };
};

const mirrorServerRouteSnapshot = async (
  db: any,
  serverVisits: any[],
  serverTasks: any[],
  projectId: string,
  userId: string
) => {
  const visitIds = safeArray(serverVisits)
    .map(normalizeServerVisitId)
    .filter(Boolean);

  const taskIds = safeArray(serverTasks)
    .map(normalizeServerTaskId)
    .filter(Boolean);

  let preservedTaskEvidence = 0;
  const preservedLogs: any[] = [];

  /*
   * MOBILE_DIAMOND_TASK_MIRROR_RECONCILIATION_V2
   *
   * Visitas mantêm a lógica já validada pelo changefeed.
   * Tarefas deixam de usar DELETE cego: ausência no servidor só apaga quando
   * não existe Outbox/coleta/conflito/visita pendente relacionada.
   */
  await db.withTransactionAsync(async () => {
    if (visitIds.length > 0) {
      await db.runAsync(
        `
          DELETE FROM visits
          WHERE COALESCE(pending_sync, 0) = 0
          AND id NOT IN (${buildSqlPlaceholders(visitIds)})
          AND NOT (
            registro_visita_id IS NOT NULL
            AND UPPER(COALESCE(field_visit_mode, '')) = 'CARTEIRA_LIVRE'
          )
        `,
        visitIds
      );
    } else {
      await db.runAsync(`
        DELETE FROM visits
        WHERE COALESCE(pending_sync, 0) = 0
        AND NOT (
          registro_visita_id IS NOT NULL
          AND UPPER(COALESCE(field_visit_mode, '')) = 'CARTEIRA_LIVRE'
        )
      `);
    }

    const serverTaskIdSet = new Set(taskIds);
    const localTasks: any[] = await db.getAllAsync(
      `SELECT * FROM other_tasks`
    );

    for (const localTask of localTasks) {
      const localTaskId = String(localTask?.id || '').trim();

      if (!localTaskId || serverTaskIdSet.has(localTaskId)) {
        continue;
      }

      const evidence = await getLocalTaskPendingEvidenceV2(
        db,
        localTask
      );

      if (evidence.preserve) {
        preservedTaskEvidence += 1;
        preservedLogs.push({
          taskId: localTaskId,
          reasons: evidence.reasons,
          sourceVisitId: evidence.sourceVisitId || null,
          manifestRevision: evidence.manifestRevision,
        });
        continue;
      }

      await db.runAsync(
        `DELETE FROM other_tasks WHERE id = ?`,
        [localTaskId]
      );
    }
  });

  await setSyncStateValue(
    db,
    projectId,
    userId,
    'task_reconciliation_pending_count',
    String(preservedTaskEvidence)
  );

  await setSyncStateValue(
    db,
    projectId,
    userId,
    'task_reconciliation_checked_at',
    new Date().toISOString()
  );

  for (const metadata of preservedLogs) {
    await addAppLog({
      level: 'WARNING',
      module: 'SYNC',
      action: 'LOCAL_TASK_EVIDENCE_PRESERVED',
      message: 'Tarefa local ausente do snapshot remoto foi preservada por evidência pendente.',
      metadata,
    }).catch(() => {});
  }

  return {
    preservedTaskEvidence,
  };
};

const buildHistory7dFromSnapshot = (visits: any[], tasks: any[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today);
  start.setDate(start.getDate() - 6);

  const isInWindow = (value: any) => {
    const dateKey = getLocalDateKey(value);
    if (!dateKey) return false;

    const date = new Date(`${dateKey}T12:00:00`);
    return date >= start && date <= today;
  };

  const isDone = (status: any) => {
    const normalized = String(status || '').toUpperCase();
    return ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'CONCLUÍDA', 'VISITADA', 'DONE'].includes(normalized);
  };

  const visits7d = safeArray(visits).filter((visit) =>
    isInWindow(visit?.data_programada || visit?.dataProgramada || visit?.data)
  );

  const tasks7d = safeArray(tasks).filter((task) =>
    isInWindow(
      task?.data_vencimento ||
        task?.data_fim ||
        task?.deadline ||
        task?.data_programada ||
        task?.created_at ||
        task?.criado_em
    )
  );

  return {
    visitsTotal: visits7d.length,
    visitsDone: visits7d.filter((visit) => isDone(visit?.status)).length,
    tasksTotal: tasks7d.length,
    tasksDone: tasks7d.filter((task) => isDone(task?.status)).length,
  };
};




/*
 * ============================================================
 * MOBILE_DIAMOND_IDEMPOTENCY_RECONCILIATION_V1
 *
 * Reconcilia apenas conflitos de resultado incerto.
 *
 * NUNCA reexecuta a mutação.
 * Consulta somente o receipt read-only do servidor.
 * ============================================================
 */
const reconcileDiamondIdempotencyConflicts =
  async (
    db: any,
    rawProjectId: any,
    user: any
  ) => {

    const projectId =
      String(
        rawProjectId ||
        getMainProjectId(
          user
        ) ||
        ''
      )
        .trim();

    const userId =
      String(
        user?.id ||
        user?.usuario_id ||
        user?.userId ||
        ''
      )
        .trim();

    if (
      !projectId ||
      !userId
    ) {
      return;
    }

    let conflicts: any[] =
      [];

    try {

      conflicts =
        await db.getAllAsync(
          `
            SELECT
              c.id AS conflict_id,
              c.queue_id,
              c.operation_key,
              c.endpoint,
              c.method,
              c.payload,
              c.conflict_code,
              c.response_json,
              c.created_at,
              q.status AS queue_status,
              q.operation_key AS queue_operation_key,
              q.payload AS queue_payload
            FROM sync_conflicts c
            INNER JOIN sync_queue q
              ON q.id = c.queue_id
            WHERE
              c.resolved_at IS NULL
              AND UPPER(
                COALESCE(
                  c.conflict_code,
                  ''
                )
              ) = 'IDEMPOTENCY_OUTCOME_UNKNOWN'
              AND UPPER(
                COALESCE(
                  q.status,
                  ''
                )
              ) = 'CONFLICT'
            ORDER BY
              c.created_at ASC
            LIMIT 50
          `
        );

    } catch (error: any) {

      console.warn(
        '[DIAMOND RECONCILIATION] ledger indisponível:',
        String(
          error?.message ||
          error ||
          ''
        )
      );

      return;
    }

    if (
      !Array.isArray(
        conflicts
      ) ||
      conflicts.length === 0
    ) {
      return;
    }

    for (
      const conflict
      of conflicts
    ) {

      const operationKey =
        String(
          conflict?.operation_key ||
          conflict?.queue_operation_key ||
          ''
        )
          .trim();

      if (
        !operationKey
      ) {

        await addAppLog({
          level:
            'WARN',

          module:
            'SYNC',

          action:
            'DIAMOND_RECONCILIATION_MISSING_OPERATION_KEY',

          message:
            'Conflito sem client_operation_id não pode ser reconciliado automaticamente.',

          metadata: {
            conflictId:
              conflict?.conflict_id ||
              null,

            queueId:
              conflict?.queue_id ||
              null
          }
        }).catch(
          () => {}
        );

        continue;
      }

      try {

        const endpoint =
          `/mobile-sync/operations/${encodeURIComponent(
            operationKey
          )}?projectId=${encodeURIComponent(
            projectId
          )}`;

        const response =
          await api(
            endpoint,
            {
              method:
                'GET'
            }
          );

        /*
         * 404 não autoriza replay.
         * Preservamos o conflito.
         */
        if (
          response?.status ===
          404
        ) {

          await addAppLog({
            level:
              'INFO',

            module:
              'SYNC',

            action:
              'DIAMOND_RECONCILIATION_NOT_FOUND',

            message:
              'Receipt ainda não encontrado no servidor.',

            metadata: {
              conflictId:
                conflict?.conflict_id ||
                null,

              queueId:
                conflict?.queue_id ||
                null,

              clientOperationId:
                operationKey
            }
          }).catch(
            () => {}
          );

          continue;
        }

        if (
          !response ||
          !response.ok
        ) {
          continue;
        }

        const responseText =
          await readResponseBodySafely(
            response
          );

        const parsed =
          parseResponseBodySafely(
            responseText
          );

        const operation =
          parsed?.operation ||
          {};

        const receiptStatus =
          String(
            operation?.status ||
            ''
          )
            .trim()
            .toUpperCase();

        const receiptHttpStatus =
          Number(
            operation?.http_status ||
            0
          );

        const receiptBody =
          operation?.response_body ??
          null;


        /*
         * ====================================================
         * COMPLETED
         * ====================================================
         */
        if (
          receiptStatus ===
          'COMPLETED'
        ) {

          const queueItem =
            await db.getFirstAsync(
              `
                SELECT *
                FROM sync_queue
                WHERE id = ?
                LIMIT 1
              `,
              [
                conflict.queue_id
              ]
            );

          if (
            queueItem
          ) {

            await updateVisitAfterSyncedQueueItem(
              db,
              queueItem
            );

            await db.runAsync(
              `
                DELETE FROM sync_queue
                WHERE id = ?
              `,
              [
                conflict.queue_id
              ]
            );
          }

          const now =
            new Date()
              .toISOString();

          await db.runAsync(
            `
              UPDATE sync_conflicts
              SET
                resolved_at = ?,
                resolution = ?,
                response_json = ?,
                updated_at = ?
              WHERE id = ?
            `,
            [
              now,
              'SERVER_RECEIPT_COMPLETED',
              JSON.stringify({
                status:
                  receiptStatus,

                http_status:
                  receiptHttpStatus,

                response_body:
                  receiptBody
              }),
              now,
              conflict.conflict_id
            ]
          );

          await addAppLog({
            level:
              'INFO',

            module:
              'SYNC',

            action:
              'DIAMOND_RECONCILIATION_COMPLETED',

            message:
              'Operação reconciliada como concluída pelo servidor.',

            metadata: {
              conflictId:
                conflict.conflict_id,

              queueId:
                conflict.queue_id,

              clientOperationId:
                operationKey,

              httpStatus:
                receiptHttpStatus
            }
          }).catch(
            () => {}
          );

          continue;
        }


        /*
         * ====================================================
         * REJECTED
         * ====================================================
         *
         * Resultado conhecido como rejeitado.
         *
         * Mantemos a sync_queue em CONFLICT:
         * evidência + intenção original permanecem preservadas.
         * ====================================================
         */
        if (
          receiptStatus ===
          'REJECTED'
        ) {

          const now =
            new Date()
              .toISOString();

          await db.runAsync(
            `
              UPDATE sync_conflicts
              SET
                resolved_at = ?,
                resolution = ?,
                response_json = ?,
                updated_at = ?
              WHERE id = ?
            `,
            [
              now,
              'SERVER_RECEIPT_REJECTED',
              JSON.stringify({
                status:
                  receiptStatus,

                http_status:
                  receiptHttpStatus,

                response_body:
                  receiptBody
              }),
              now,
              conflict.conflict_id
            ]
          );

          await addAppLog({
            level:
              'WARN',

            module:
              'SYNC',

            action:
              'DIAMOND_RECONCILIATION_REJECTED',

            message:
              'Servidor confirmou que a operação foi rejeitada.',

            metadata: {
              conflictId:
                conflict.conflict_id,

              queueId:
                conflict.queue_id,

              clientOperationId:
                operationKey,

              httpStatus:
                receiptHttpStatus
            }
          }).catch(
            () => {}
          );

          continue;
        }


        /*
         * ====================================================
         * PROCESSING
         * ====================================================
         */
        if (
          receiptStatus ===
          'PROCESSING'
        ) {

          await addAppLog({
            level:
              'INFO',

            module:
              'SYNC',

            action:
              'DIAMOND_RECONCILIATION_PROCESSING',

            message:
              'Operação ainda está em processamento no servidor.',

            metadata: {
              conflictId:
                conflict.conflict_id,

              queueId:
                conflict.queue_id,

              clientOperationId:
                operationKey
            }
          }).catch(
            () => {}
          );

          continue;
        }


        /*
         * ====================================================
         * OUTCOME_UNKNOWN
         * ====================================================
         *
         * Estado conservador.
         * Não remove, não reenvia, não sobrescreve.
         * ====================================================
         */
        if (
          receiptStatus ===
          'OUTCOME_UNKNOWN'
        ) {
          continue;
        }

      } catch (error: any) {

        console.warn(
          '[DIAMOND RECONCILIATION] erro:',
          String(
            error?.message ||
            error ||
            ''
          )
        );

        await addAppLog({
          level:
            'WARN',

          module:
            'SYNC',

          action:
            'DIAMOND_RECONCILIATION_ERROR',

          message:
            'Falha ao consultar receipt de idempotência.',

          metadata: {
            conflictId:
              conflict?.conflict_id ||
              null,

            queueId:
              conflict?.queue_id ||
              null,

            clientOperationId:
              operationKey,

            error:
              String(
                error?.message ||
                error ||
                ''
              )
          }
        }).catch(
          () => {}
        );
      }
    }
  };


/*
 * ============================================================
 * MOBILE_DIAMOND_SYNC_OBSERVABILITY_V1
 *
 * Diagnóstico read-only do motor offline.
 *
 * Nenhuma função abaixo:
 * - reenvia operação;
 * - apaga fila;
 * - resolve conflito;
 * - altera evidência.
 * ============================================================
 */

export type DiamondSyncHealth = {
  pending: number;
  retry: number;
  conflict: number;
  unresolvedConflicts: number;
  resolvedConflicts: number;
  collectionsPending: number;
  collectionsConflict: number;
  visitsPending: number;
  orphanVisitsPending: number;
  orphanServerEvidence: number;
  configurationPending: number;
  manifestReady: boolean;
  manifestReason: string | null;
  manifestRevision: string | null;
  manifestPersistedRevision: string | null;
  manifestPortfolioRevision: string | null;
  manifestRevisionShort: string | null;
  manifestReceivedAt: string | null;
  manifestPersistedAt: string | null;
  taskReconciliationPending: number;
  diagnosticsOk: boolean;
  diagnosticError: string | null;
  lastServerPullAt: string | null;
  lastServerPullError: string | null;
  lastGlobalSyncStatus: string | null;
  lastGlobalSyncError: string | null;
  oldestPendingAt: string | null;
  oldestConflictAt: string | null;
};

export type DiamondSyncConflictItem = {
  id: string;
  queueId: number;
  operationKey: string | null;
  endpoint: string | null;
  method: string | null;
  conflictCode: string | null;
  conflictMessage: string | null;
  httpStatus: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  queueStatus: string | null;
  queueAttempts: number;
  lastError: string | null;
};

export type DiamondPendingOperationItem = {
  queueId: number;
  operationKey: string | null;
  endpoint: string;
  method: string;
  status: string;
  attempts: number;
  createdAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  kind: 'COLLECTION' | 'VISIT_CHECKIN' | 'VISIT_CHECKOUT' | 'VISIT_JUSTIFICATION' | 'ALERT' | 'OTHER';
  collectionId: string | null;
  surveyId: string | null;
  surveyName: string | null;
  visitId: string | null;
  storeId: string | null;
  storeName: string | null;
};


/*
 * Snapshot resumido da saúde da sincronização.
 */
export const getDiamondSyncHealth =
  async (): Promise<DiamondSyncHealth> => {

    const db =
      await getDBConnection();

    const empty: DiamondSyncHealth = {
      pending:
        0,

      retry:
        0,

      conflict:
        0,

      unresolvedConflicts:
        0,

      resolvedConflicts:
        0,

      collectionsPending:
        0,

      collectionsConflict:
        0,

      visitsPending:
        0,

      orphanVisitsPending:
        0,

      orphanServerEvidence:
        0,

      configurationPending:
        0,

      manifestReady:
        false,

      manifestReason:
        'MANIFEST_NOT_CONFIRMED',

      manifestRevision:
        null,

      manifestPersistedRevision:
        null,

      manifestPortfolioRevision:
        null,

      manifestRevisionShort:
        null,

      manifestReceivedAt:
        null,

      manifestPersistedAt:
        null,

      taskReconciliationPending:
        0,

      diagnosticsOk:
        true,

      diagnosticError:
        null,

      lastServerPullAt:
        null,

      lastServerPullError:
        null,

      lastGlobalSyncStatus:
        null,

      lastGlobalSyncError:
        null,

      oldestPendingAt:
        null,

      oldestConflictAt:
        null
    };

    try {

      const queueRows: any[] =
        await db.getAllAsync(
          `
            SELECT
              UPPER(
                COALESCE(
                  status,
                  'PENDING'
                )
              ) AS status,
              COUNT(*) AS total,
              MIN(created_at) AS oldest_at
            FROM sync_queue
            GROUP BY
              UPPER(
                COALESCE(
                  status,
                  'PENDING'
                )
              )
          `
        );

      for (
        const row
        of queueRows
      ) {

        const status =
          String(
            row?.status ||
            ''
          )
            .trim()
            .toUpperCase();

        const total =
          Number(
            row?.total ||
            0
          );

        if (
          status ===
          'PENDING'
        ) {

          empty.pending =
            total;

          empty.oldestPendingAt =
            row?.oldest_at ||
            null;
        }

        if (
          status ===
          'RETRY'
        ) {

          empty.retry =
            total;

          if (row?.oldest_at) {
            const current = empty.oldestPendingAt
              ? Date.parse(empty.oldestPendingAt)
              : Number.POSITIVE_INFINITY;
            const candidate = Date.parse(String(row.oldest_at));

            if (!Number.isNaN(candidate) && candidate < current) {
              empty.oldestPendingAt = row.oldest_at;
            }
          }
        }

        if (
          status ===
          'CONFLICT'
        ) {

          empty.conflict =
            total;
        }
      }


      const ledgerRow: any =
        await db.getFirstAsync(
          `
            SELECT
              SUM(
                CASE
                  WHEN resolved_at IS NULL
                    THEN 1
                  ELSE 0
                END
              ) AS unresolved_total,

              SUM(
                CASE
                  WHEN resolved_at IS NOT NULL
                    THEN 1
                  ELSE 0
                END
              ) AS resolved_total,

              MIN(
                CASE
                  WHEN resolved_at IS NULL
                    THEN created_at
                  ELSE NULL
                END
              ) AS oldest_unresolved_at

            FROM sync_conflicts
          `
        );

      empty.unresolvedConflicts =
        Number(
          ledgerRow
            ?.unresolved_total ||
          0
        );

      empty.resolvedConflicts =
        Number(
          ledgerRow
            ?.resolved_total ||
          0
        );

      empty.oldestConflictAt =
        ledgerRow
          ?.oldest_unresolved_at ||
        null;


      const collectionRows: any[] =
        await db.getAllAsync(
          `
            SELECT
              UPPER(
                COALESCE(
                  status,
                  ''
                )
              ) AS status,
              COUNT(*) AS total
            FROM coletas
            WHERE
              pending_sync = 1
              OR UPPER(
                COALESCE(
                  status,
                  ''
                )
              ) = 'CONFLITO_SYNC'
            GROUP BY
              UPPER(
                COALESCE(
                  status,
                  ''
                )
              )
          `
        );

      for (
        const row
        of collectionRows
      ) {

        const status =
          String(
            row?.status ||
            ''
          )
            .trim()
            .toUpperCase();

        const total =
          Number(
            row?.total ||
            0
          );

        if (
          status ===
          'CONFLITO_SYNC'
        ) {

          empty.collectionsConflict +=
            total;

        } else {

          empty.collectionsPending +=
            total;
        }
      }

      const visitPendingRow: any = await db.getFirstAsync(`
        SELECT COUNT(*) AS total
        FROM visits
        WHERE COALESCE(pending_sync, 0) = 1
      `);

      empty.visitsPending = Number(visitPendingRow?.total || 0);

      const orphanVisitRows: any[] = await db.getAllAsync(`
        SELECT id, client_operation_id, visita_id_json, registro_visita_id
        FROM visits
        WHERE COALESCE(pending_sync, 0) = 1
      `);

      let orphanVisits = 0;
      for (const visit of orphanVisitRows) {
        if (!(await hasQueueForVisitEvidence(db, visit))) {
          orphanVisits += 1;
        }
      }
      empty.orphanVisitsPending = orphanVisits;

      const orphanServerRow: any = await db.getFirstAsync(`
        SELECT COUNT(*) AS total
        FROM sync_server_changes
        WHERE COALESCE(orphan_evidence, 0) = 1
      `);
      empty.orphanServerEvidence = Number(orphanServerRow?.total || 0);

      /*
       * MOBILE_DIAMOND_HEALTH_SCOPE_AND_MANIFEST_V2
       *
       * Health é escopado ao usuário/projeto atual. Também prova que o mesmo
       * Execution Manifest recebido foi realmente persistido junto da Carteira.
       */
      const healthUser = useAuthStore.getState().user;
      const healthProjectId = getMainProjectId(healthUser);
      const healthUserId = String(healthUser?.id || '').trim();

      if (!healthProjectId || !healthUserId) {
        empty.diagnosticsOk = false;
        empty.diagnosticError = 'Contexto de usuário/projeto indisponível para validar a sincronização.';
        empty.manifestReason = 'NO_USER_PROJECT_CONTEXT';
        return empty;
      }

      const scopedProjectId = String(healthProjectId);

      empty.lastServerPullAt = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'last_server_pull_at'
      );

      empty.lastServerPullError = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'last_server_pull_error'
      );

      empty.lastGlobalSyncStatus = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'last_global_sync_status'
      );

      empty.lastGlobalSyncError = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'last_global_sync_error'
      );

      const manifestContract = String(
        (await getSyncStateValue(
          db,
          scopedProjectId,
          healthUserId,
          'execution_manifest_contract'
        )) || ''
      ).trim().toUpperCase();

      const receivedRevision = String(
        (await getSyncStateValue(
          db,
          scopedProjectId,
          healthUserId,
          'execution_manifest_revision'
        )) || ''
      ).trim();

      const persistedRevision = String(
        (await getSyncStateValue(
          db,
          scopedProjectId,
          healthUserId,
          'execution_manifest_persisted_revision'
        )) || ''
      ).trim();

      const manifestReceivedAt = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'execution_manifest_received_at'
      );

      const manifestPersistedAt = await getSyncStateValue(
        db,
        scopedProjectId,
        healthUserId,
        'execution_manifest_persisted_at'
      );

      const reconciliationCount = Number(
        (await getSyncStateValue(
          db,
          scopedProjectId,
          healthUserId,
          'task_reconciliation_pending_count'
        )) || 0
      );

      const portfolioState: any = await db.getFirstAsync(
        `SELECT project_config_json
           FROM field_portfolio_state
          WHERE project_id = ?
            AND user_id = ?
          LIMIT 1`,
        [scopedProjectId, healthUserId]
      );

      const portfolioConfig = safeJsonParse(
        portfolioState?.project_config_json,
        {}
      );

      const portfolioManifest =
        portfolioConfig?.executionManifest ||
        portfolioConfig?.execution_manifest ||
        null;

      const portfolioRevision = String(
        portfolioManifest?.manifest_revision ||
          portfolioManifest?.manifestRevision ||
          portfolioConfig?.executionManifestRevision ||
          portfolioConfig?.execution_manifest_revision ||
          ''
      ).trim();

      const revisionsMatch = Boolean(
        receivedRevision &&
          persistedRevision &&
          portfolioRevision &&
          receivedRevision === persistedRevision &&
          persistedRevision === portfolioRevision
      );

      empty.manifestReady =
        manifestContract === 'MOBILE_EXECUTION_MANIFEST_V1' &&
        revisionsMatch;

      empty.manifestRevision = receivedRevision || null;
      empty.manifestPersistedRevision = persistedRevision || null;
      empty.manifestPortfolioRevision = portfolioRevision || null;
      empty.manifestRevisionShort = (
        persistedRevision ||
        receivedRevision ||
        portfolioRevision ||
        ''
      )
        .replace(/^sha256:/i, '')
        .substring(0, 12) || null;
      empty.manifestReceivedAt = manifestReceivedAt || null;
      empty.manifestPersistedAt = manifestPersistedAt || null;
      empty.taskReconciliationPending = Number.isFinite(reconciliationCount)
        ? Math.max(0, reconciliationCount)
        : 0;

      if (manifestContract !== 'MOBILE_EXECUTION_MANIFEST_V1') {
        empty.manifestReason = 'MANIFEST_CONTRACT_NOT_CONFIRMED';
      } else if (!receivedRevision) {
        empty.manifestReason = 'MANIFEST_NOT_RECEIVED';
      } else if (!persistedRevision) {
        empty.manifestReason = 'MANIFEST_NOT_PERSISTED';
      } else if (!portfolioRevision) {
        empty.manifestReason = 'PORTFOLIO_MANIFEST_MISSING';
      } else if (!revisionsMatch) {
        empty.manifestReason = 'MANIFEST_REVISION_MISMATCH';
      } else if (empty.taskReconciliationPending > 0) {
        empty.manifestReason = 'LOCAL_TASK_RECONCILIATION_PENDING';
      } else {
        empty.manifestReason = null;
      }

      empty.configurationPending =
        (!empty.manifestReady ? 1 : 0) +
        (empty.taskReconciliationPending > 0 ? 1 : 0);

      return empty;

    } catch (error: any) {

      console.warn(
        '[DIAMOND OBSERVABILITY] health indisponível:',
        String(
          error?.message ||
          error ||
          ''
        )
      );

      empty.diagnosticsOk = false;
      empty.diagnosticError = String(error?.message || error || 'Diagnóstico indisponível');
      return empty;
    }
  };


/*
 * Lista conflitos do ledger.
 *
 * unresolvedOnly=true por padrão para a tela operacional.
 */
export const getDiamondSyncConflicts =
  async (
    options?: {
      unresolvedOnly?: boolean;
      limit?: number;
    }
  ): Promise<DiamondSyncConflictItem[]> => {

    const db =
      await getDBConnection();

    const unresolvedOnly =
      options
        ?.unresolvedOnly !==
      false;

    const requestedLimit =
      Number(
        options
          ?.limit ||
        100
      );

    const safeLimit =
      Math.max(
        1,
        Math.min(
          500,
          Number.isFinite(
            requestedLimit
          )
            ? Math.trunc(
                requestedLimit
              )
            : 100
        )
      );

    try {

      const rows: any[] =
        await db.getAllAsync(
          `
            SELECT
              c.id,
              c.queue_id,
              c.operation_key,
              c.endpoint,
              c.method,
              c.http_status,
              c.conflict_code,
              c.conflict_message AS conflict_message,
              c.created_at,
              c.updated_at,
              c.resolved_at,
              c.resolution,

              q.status AS queue_status,
              q.attempts AS queue_attempts,
              q.last_error

            FROM sync_conflicts c

            LEFT JOIN sync_queue q
              ON q.id = c.queue_id

            WHERE
              (
                ? = 0
                OR c.resolved_at IS NULL
              )

            ORDER BY
              CASE
                WHEN c.resolved_at IS NULL
                  THEN 0
                ELSE 1
              END ASC,
              c.created_at DESC

            LIMIT ?
          `,
          [
            unresolvedOnly
              ? 1
              : 0,

            safeLimit
          ]
        );

      return rows.map(
        row => ({
          id:
            String(
              row?.id ||
              ''
            ),

          queueId:
            Number(
              row?.queue_id ||
              0
            ),

          operationKey:
            row?.operation_key ??
            null,

          endpoint:
            row?.endpoint ??
            null,

          method:
            row?.method ??
            null,

          conflictCode:
            row?.conflict_code ??
            null,

          conflictMessage:
            row?.conflict_message ??
            null,

          httpStatus:
            row?.http_status ===
            null ||
            row?.http_status ===
            undefined
              ? null
              : Number(
                  row.http_status
                ),

          createdAt:
            row?.created_at ??
            null,

          updatedAt:
            row?.updated_at ??
            null,

          resolvedAt:
            row?.resolved_at ??
            null,

          resolution:
            row?.resolution ??
            null,

          queueStatus:
            row?.queue_status ??
            null,

          queueAttempts:
            Number(
              row?.queue_attempts ||
              0
            ),

          lastError:
            row?.last_error ??
            null
        })
      );

    } catch (error: any) {

      console.warn(
        '[DIAMOND OBSERVABILITY] conflitos indisponíveis:',
        String(
          error?.message ||
          error ||
          ''
        )
      );

      return [];
    }
  };


/*
 * MOBILE_DIAMOND_PENDING_DETAIL_V1
 *
 * A Central de Sincronização precisa explicar O QUE está pendente, não apenas
 * exibir um contador. A leitura abaixo é somente diagnóstica e nunca altera a fila.
 */
export const getDiamondPendingOperations = async (limit = 100): Promise<DiamondPendingOperationItem[]> => {
  const db = await getDBConnection();
  const safeLimit = Math.max(1, Math.min(300, Math.trunc(Number(limit || 100))));

  try {
    const [queueRows, collectionRows, visitRows, surveyRows]: any[] = await Promise.all([
      db.getAllAsync(
        `SELECT *
         FROM sync_queue
         WHERE COALESCE(status, 'PENDING') IN ('PENDING', 'RETRY')
         ORDER BY datetime(created_at) ASC
         LIMIT ?`,
        [safeLimit]
      ),
      db.getAllAsync(`SELECT id, pesquisa_id, visita_id, loja_id, status FROM coletas`),
      db.getAllAsync(`SELECT id, visita_id_json, registro_visita_id, loja_id, loja_nome FROM visits`),
      db.getAllAsync(`SELECT id, nome, titulo FROM pesquisas`),
    ]);

    const collections = new Map(collectionRows.map((row: any) => [String(row.id), row]));
    const surveys = new Map(surveyRows.map((row: any) => [String(row.id), row]));
    const visits = new Map<string, any>();

    for (const row of visitRows) {
      for (const key of [row?.id, row?.visita_id_json, row?.registro_visita_id]) {
        const normalized = String(key || '').trim();
        if (normalized) visits.set(normalized, row);
      }
    }

    return queueRows.map((row: any) => {
      const payload = safeJsonParse(row?.payload, {});
      const endpoint = String(row?.endpoint || '');
      const endpointLower = endpoint.toLowerCase();

      const collectionId = String(
        payload?.coleta_id || payload?.coletaId || payload?.id || payload?.client_operation_id || ''
      ).trim() || null;
      const collection = collectionId ? collections.get(collectionId) : null;

      const visitId = String(
        payload?.visita_id || payload?.visitaId || payload?.registro_visita_id ||
        payload?.registroVisitaId || payload?.visita_id_json || payload?.visitaIdJson ||
        collection?.visita_id || ''
      ).trim() || null;
      const visit = visitId ? visits.get(visitId) : null;

      const surveyId = String(
        payload?.pesquisa_id || payload?.pesquisaId || collection?.pesquisa_id || ''
      ).trim() || null;
      const survey = surveyId ? surveys.get(surveyId) : null;

      let kind: DiamondPendingOperationItem['kind'] = 'OTHER';
      if (endpointLower.includes('/coletas')) kind = 'COLLECTION';
      else if (endpointLower.includes('/visitas/checkin')) kind = 'VISIT_CHECKIN';
      else if (endpointLower.includes('/visitas/checkout')) kind = 'VISIT_CHECKOUT';
      else if (endpointLower.includes('/visitas/justificar')) kind = 'VISIT_JUSTIFICATION';
      else if (endpointLower.includes('/alert')) kind = 'ALERT';

      return {
        queueId: Number(row?.id || 0),
        operationKey: row?.operation_key ?? null,
        endpoint,
        method: String(row?.method || 'POST').toUpperCase(),
        status: String(row?.status || 'PENDING').toUpperCase(),
        attempts: Number(row?.attempts || 0),
        createdAt: row?.created_at ?? null,
        nextRetryAt: row?.next_retry_at ?? null,
        lastError: row?.last_error ?? null,
        kind,
        collectionId,
        surveyId,
        surveyName: String(
          payload?.pesquisa_nome || payload?.pesquisaNome || payload?.surveyName ||
          survey?.titulo || survey?.nome || ''
        ).trim() || null,
        visitId,
        storeId: String(payload?.loja_id || payload?.lojaId || collection?.loja_id || visit?.loja_id || '').trim() || null,
        storeName: String(payload?.loja_nome || payload?.lojaNome || payload?.storeName || visit?.loja_nome || '').trim() || null,
      };
    });
  } catch (error: any) {
    console.warn('[DIAMOND OBSERVABILITY] pendências detalhadas indisponíveis:', String(error?.message || error || ''));
    return [];
  }
};

/*
 * Snapshot completo para suporte/diagnóstico.
 */
export const getDiamondSyncDiagnostics =
  async () => {

    /*
     * MOBILE_USER_SYNC_CENTER_ACTIONABLE_ONLY_V1
     *
     * A Central operacional do usuário não carrega o Conflict Ledger técnico.
     * Ela recebe apenas saúde agregada + operações que podem ser enviadas/retry.
     * O histórico integral permanece disponível em Suporte/Diagnóstico.
     */
    const [health, pendingOperations] =
      await Promise.all([
        getDiamondSyncHealth(),
        getDiamondPendingOperations(100)
      ]);

    return {
      generatedAt:
        new Date()
          .toISOString(),

      health,

      unresolvedConflicts: [],
      recentConflicts: [],

      pendingOperations
    };
  };

export const globalSync = async () => {
  const { user, token, login } = useAuthStore.getState();
  const { setSyncing, setLastSync } = useSyncStore.getState();

  if (!user || !token) {
    return { ok: false, status: 'SKIPPED_NO_SESSION' as const };
  }

  if (globalSyncPauseDepth > 0) {
    return { ok: false, status: 'SKIPPED_WORKSPACE_SWITCH' as const };
  }

  if (syncInProgress) {
    return { ok: false, status: 'SKIPPED_ALREADY_RUNNING' as const };
  }

  syncInProgress = true;
  setSyncing(true);

  try {
    const network = await Network.getNetworkStateAsync();

    if (!network.isConnected || network.isInternetReachable === false) {
      return { ok: false, status: 'OFFLINE' as const };
    }

    const db = await getDBConnection();

    const rawProjectId = getMainProjectId(user);

    if (!rawProjectId) {
      console.warn('[Sync] Usuário sem projeto vinculado. Sync cancelado.');
      return { ok: false, status: 'SKIPPED_NO_PROJECT' as const };
    }

    await ensureJustificativasTable(db);
    await ensureMobileSyncStateTables(db);

    // Higiene retroativa: conflitos tombstone antigos de lifecycle sem
    // evidência humana deixam de bloquear a saúde, mas permanecem no ledger.
    await reconcileObsoleteServerTombstoneConflictsV1(db);

    const projectId = encodeURIComponent(String(rawProjectId).trim());
    const promotorId = encodeURIComponent(String(user.id).trim());
    const urlTS = new Date().getTime();
    const fetchOptions = buildNoCacheFetchOptions();

    // 0. Manutenção local leve
    await cleanExpiredLocalTasks(db);

    // 1. Primeiro envia pendências locais, antes de espelhar dados do servidor.
    await uploadSyncQueue(db);

    /*
     * MOBILE_DIAMOND_IDEMPOTENCY_RECONCILIATION_CALL_V1
     *
     * Primeiro tentamos Outbox normal.
     * Depois reconciliamos receipts incertos.
     */
    await reconcileDiamondIdempotencyConflicts(
      db,
      rawProjectId,
      user
    );

    await uploadLegacyPendingVisits(db, String(rawProjectId), user);

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'last_server_push_at',
      new Date().toISOString()
    );

    /*
     * MOBILE_SYNC_CHANGEFEED_CLIENT_V2
     *
     * Alterações administrativas explícitas chegam antes do snapshot.
     * Assim DELETE/REOPEN/CANCEL removem a entidade operacional local sem
     * apagar Outbox/coletas pendentes. O snapshot seguinte restaura apenas
     * aquilo que realmente continua válido no servidor.
     */
    try {
      await pullAndApplyMobileSyncChanges(
        db,
        String(rawProjectId),
        String(user.id),
        fetchOptions
      );
    } catch (changefeedError: any) {
      await setSyncStateValue(
        db,
        String(rawProjectId),
        String(user.id),
        'last_server_pull_error',
        String(changefeedError?.message || changefeedError)
      ).catch(() => {});
      throw changefeedError;
    }

    // 2. Download do roteiro consolidado
    const resRoteiro = await api(
      `/meu-roteiro?promotorId=${promotorId}&projectId=${projectId}&t=${urlTS}`,
      fetchOptions
    );

    if (!resRoteiro.ok) {
      const body = await readResponseBodySafely(resRoteiro);
      throw new Error(
        `Falha ao baixar meu-roteiro HTTP ${resRoteiro.status}: ${extractApiErrorMessage(body, 'snapshot indisponível')}`
      );
    }

    const data = await resRoteiro.json();

    /*
     * MOBILE_EXECUTION_MANIFEST_CLIENT_V1
     *
     * O servidor envia DEFINIÇÕES capazes de materializar
     * obrigações futuras durante operação offline.
     *
     * Manifesto NÃO é tarefa.
     * Manifesto NÃO cria pendência.
     *
     * Sem um manifesto confirmado não consideramos o pull
     * completo, porque o aparelho não teria conhecimento
     * suficiente para uma Carteira Livre offline segura.
     */
    const executionManifest =
      data?.executionManifest ||
      data?.execution_manifest ||
      null;

    const executionManifestContract =
      String(
        executionManifest?.contract ||
        ''
      )
        .trim()
        .toUpperCase();


    /*
     * MOBILE_EXECUTION_MANIFEST_REVISION_V1
     *
     * generated_at = quando o snapshot foi produzido.
     * manifest_revision = qual configuração operacional.
     *
     * A revisão deve ser determinística no backend.
     */
    const executionManifestRevision =
      String(
        executionManifest?.manifest_revision ||
        executionManifest?.manifestRevision ||
        ''
      )
        .trim();

    if (
      executionManifestContract !==
      'MOBILE_EXECUTION_MANIFEST_V1'
    ) {
      throw new Error(
        'MOBILE_EXECUTION_MANIFEST_MISSING: o servidor não confirmou o manifesto offline de execução.'
      );
    }

    if (
      !executionManifestRevision
    ) {
      throw new Error(
        'MOBILE_EXECUTION_MANIFEST_REVISION_MISSING: o servidor não confirmou a revisão determinística do manifesto offline.'
      );
    }


    const executionManifestReceivedAt =
      new Date().toISOString();


    /*
     * MOBILE_EXECUTION_MANIFEST_SYNC_STATE_V1
     *
     * Evidência persistente do manifesto recebido.
     * A evidência de persistência será gravada somente
     * depois do read-after-write.
     */
    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'execution_manifest_contract',
      executionManifestContract
    );

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'execution_manifest_revision',
      executionManifestRevision
    );

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'execution_manifest_version',
      String(
        executionManifest?.manifest_version ??
        executionManifest?.manifestVersion ??
        ''
      )
    );

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'execution_manifest_generated_at',
      String(
        executionManifest?.generated_at ??
        executionManifest?.generatedAt ??
        ''
      )
    );

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'execution_manifest_received_at',
      executionManifestReceivedAt
    );

    await addAppLog({
      level: 'INFO',
      module: 'SYNC',
      action: 'EXECUTION_MANIFEST_RECEIVED',
      message: 'Manifesto offline de execução recebido.',
      metadata: {
        contract:
          executionManifestContract,

        manifestVersion:
          executionManifest?.manifest_version ??
          executionManifest?.manifestVersion ??
          null,

        generatedAt:
          executionManifest?.generated_at ??
          executionManifest?.generatedAt ??
          null,

        receivedAt:
          executionManifestReceivedAt,

        surveys:
          Array.isArray(
            executionManifest?.surveys
          )
            ? executionManifest.surveys.length
            : 0,
      },
    }).catch(() => {});

    let v_list = Array.isArray(data) ? data : (data.visits || data.visitas || []);
    let t_list = data.otherTasks || data.tarefas || [];
    // MOBILE_SYNC_TASK_SNAPSHOT_OBSERVABILITY_V3
    await addAppLog({
      level: 'INFO',
      module: 'SYNC',
      action: 'SERVER_TASK_SNAPSHOT',
      message: 'Snapshot de tarefas recebido do servidor.',
      metadata: {
        total: Array.isArray(t_list) ? t_list.length : 0,
        tasks: (Array.isArray(t_list) ? t_list : []).slice(0, 100).map((task: any) => ({
          id: task?.id ?? null,
          titulo: task?.titulo ?? task?.nome ?? null,
          status: task?.status ?? null,
          frequencia: task?.frequencia ?? null,
          pesquisa_id: task?.pesquisa_id ?? task?.pesquisaId ?? null,
          escopo_execucao: task?.escopo_execucao ?? task?.escopoExecucao ?? null,
          data_programada: task?.data_programada ?? task?.dataProgramada ?? null,
          data_inicio: task?.data_inicio ?? task?.dataInicio ?? null,
          data_vencimento: task?.data_vencimento ?? task?.dataVencimento ?? null,
          cycle_start: task?.cycle_start ?? null,
          cycle_end: task?.cycle_end ?? null
        }))
      }
    }).catch(() => {});
    let c_list = data.campanhas || data.campanhas_gamificacao || [];
    let s_list = data.scorecards || [];
    let p_list = data.pesquisas || [];
    let j_list = data.justificativas || data.absenceJustifications || [];
    let a_list = data.alertas || data.alerts || data.mensagens || data.messages || [];

    // 3. Busca complementar: pesquisas, lojas, categorias e justificativas
    let resPesquisas = await api(`/pesquisas/${projectId}?t=${urlTS}`, fetchOptions).catch(() => null);

    if (!resPesquisas || !resPesquisas.ok) {
      resPesquisas = await api(`/pesquisas?projectId=${projectId}&t=${urlTS}`, fetchOptions).catch(() => null);
    }

    const [
      resLojas,
      resCategorias,
      resProdutos,
      fetchedJustificativas,
      fetchedAlertas,
      fetchedGamificationCampaigns,
      fetchedPerfectStoreScorecards,
    ] = await Promise.all([
      api(`/lojas/${projectId}?t=${urlTS}`, fetchOptions).catch(() => null),
      api(`/categorias?projectId=${projectId}&t=${urlTS}`, fetchOptions).catch(() => null),

      // MOBILE_DYNAMIC_CATALOG_SYNC_V3
      api(`/produtos/${projectId}?t=${urlTS}`, fetchOptions).catch(() => null),

      fetchJustificativas(projectId, urlTS, fetchOptions).catch(() => []),
      fetchAlertas(projectId, promotorId, urlTS, fetchOptions).catch(() => []),
      fetchGamificationCampaigns(projectId, urlTS, fetchOptions).catch(() => null),
      fetchPerfectStoreScorecards(projectId, urlTS, fetchOptions).catch(() => null),
    ]);

    if (resPesquisas && resPesquisas.ok) {
      const fetchPesquisas = await resPesquisas.json();
      p_list = Array.isArray(fetchPesquisas)
        ? fetchPesquisas
        : (fetchPesquisas.data || fetchPesquisas.pesquisas || []);
    }

    if (safeArray(fetchedJustificativas).length > 0) {
      j_list = fetchedJustificativas;
    }

    if (safeArray(fetchedAlertas).length > 0) {
      a_list = fetchedAlertas;
    }

    // Campanhas e scorecards vêm das rotas relacionais do web.
    // Se a rota respondeu, ela é a fonte da verdade, inclusive quando vier vazia.
    if (fetchedGamificationCampaigns !== null) {
      c_list = fetchedGamificationCampaigns;
    }

    if (fetchedPerfectStoreScorecards !== null) {
      s_list = fetchedPerfectStoreScorecards;
    }

    await saveJustificativasOffline(db, j_list);

    if (safeArray(a_list).length > 0) {
      try {
        await saveAlertsOffline(a_list);
      } catch (alertError) {
        console.warn('[Sync] Não foi possível salvar alertas offline:', alertError);
      }
    }

    let lojas: any[] = [];
    let categorias: any[] = [];
    let produtosCatalogo: any[] = [];

    if (resLojas && resLojas.ok) {
      const lojasData = await resLojas.json();
      lojas = Array.isArray(lojasData) ? lojasData : (lojasData.data || lojasData.lojas || []);
    }

    if (resCategorias && resCategorias.ok) {
      const categoriasData = await resCategorias.json();

      categorias =
        Array.isArray(categoriasData)
          ? categoriasData
          : (
              categoriasData.data ||
              categoriasData.categorias ||
              []
            );
    }

    if (resProdutos && resProdutos.ok) {
      const produtosData =
        await resProdutos.json();

      produtosCatalogo =
        Array.isArray(produtosData)
          ? produtosData
          : (
              produtosData.data ||
              produtosData.produtos ||
              produtosData.products ||
              []
            );
    }


    /*
     * MOBILE_DYNAMIC_CATALOG_SYNC_V3
     *
     * Normaliza produto com os nomes reais da categoria
     * e subcategoria. Assim o catálogo permanece útil
     * mesmo se a rota de produtos devolver somente IDs.
     */
    const categoriasPorId =
      new Map<string, any>();

    const subcategoriasPorId =
      new Map<string, any>();

    safeArray(categorias).forEach(
      (categoria: any) => {

        const categoriaId =
          String(
            categoria?.id ||
            ''
          ).trim();

        if (categoriaId) {
          categoriasPorId.set(
            categoriaId,
            categoria
          );
        }

        safeArray(
          categoria?.subcategorias ||
          categoria?.subcategories
        ).forEach(
          (subcategoria: any) => {

            const subcategoriaId =
              String(
                subcategoria?.id ||
                ''
              ).trim();

            if (subcategoriaId) {
              subcategoriasPorId.set(
                subcategoriaId,
                {
                  ...subcategoria,
                  categoria:
                    categoria
                }
              );
            }
          }
        );
      }
    );


    produtosCatalogo =
      safeArray(produtosCatalogo).map(
        (produto: any) => {

          const categoriaId =
            String(
              produto?.categoriaId ||
              produto?.categoria_id ||
              produto?.categoria?.id ||
              ''
            ).trim();

          const subcategoriaId =
            String(
              produto?.subcategoriaId ||
              produto?.subcategoria_id ||
              produto?.subcategoria?.id ||
              ''
            ).trim();

          const categoria =
            categoriasPorId.get(
              categoriaId
            );

          const subcategoria =
            subcategoriasPorId.get(
              subcategoriaId
            );

          return {
            ...produto,

            categoria_nome:
              produto?.categoria_nome ||
              produto?.categoriaNome ||
              produto?.categoria?.nome ||
              categoria?.nome ||
              (
                typeof produto?.categoria ===
                  'string'
                  ? produto.categoria
                  : ''
              ),

            subcategoria_nome:
              produto?.subcategoria_nome ||
              produto?.subcategoriaNome ||
              produto?.subcategoria?.nome ||
              subcategoria?.nome ||
              (
                typeof produto?.subcategoria ===
                  'string'
                  ? produto.subcategoria
                  : ''
              ),

            marca_nome:
              produto?.marca_nome ||
              produto?.marcaNome ||
              (
                typeof produto?.marca ===
                  'string'
                  ? produto.marca
                  : produto?.marca?.nome ||
                    produto?.brand?.name ||
                    ''
              )
          };
        }
      );


    const mobileCatalog = {
      categorias:
        safeArray(categorias),

      produtos:
        safeArray(produtosCatalogo)
    };

    // =========================================================
    // MOBILE_FIELD_PORTFOLIO_V1
    //
    // A carteira é independente do roteiro. Ela é baixada para
    // SQLite para continuar disponível sem internet.
    // =========================================================
    try {
      const authCustom =
        safeJsonParse(
          user?.custom_data ||
          user?.customData,
          {}
        );

      const syncedProjectConfig = {
        ...(
          data?.project_config ||
          data?.projectConfig ||
          {}
        ),

        ...(
          authCustom?.perfil_mobile
            ?.project ||
          authCustom?.perfilMobile
            ?.project ||
          authCustom?.project ||
          {}
        ),

        projectId:
          String(rawProjectId),

        /*
         * MOBILE_EXECUTION_MANIFEST_CLIENT_V1
         *
         * A Carteira e seu manifesto são persistidos como
         * o mesmo snapshot offline confirmado.
         */
        executionManifest:
          executionManifest,

        execution_manifest:
          executionManifest,

        executionManifestReceivedAt:
          executionManifestReceivedAt,

        execution_manifest_received_at:
          executionManifestReceivedAt,

        executionManifestRevision:
          executionManifestRevision,

        execution_manifest_revision:
          executionManifestRevision,
      };

      const fieldPortfolioSyncResult =
        await syncFieldPortfolioOffline(
          String(rawProjectId),
          String(user.id),
          lojas,
          mobileCatalog,
          syncedProjectConfig,
          urlTS,
          fetchOptions
        );

      /*
       * MOBILE_DIAMOND_FIELD_PORTFOLIO_REQUIRED_V2
       *
       * syncFieldPortfolioOffline devolve null em HTTP/rede. Isso agora é
       * bloqueante: sync completo não pode manter carteira potencialmente antiga.
       */
      if (!fieldPortfolioSyncResult) {
        throw new Error(
          'FIELD_PORTFOLIO_SNAPSHOT_NOT_CONFIRMED: a carteira offline não pôde ser atualizada.'
        );
      }

      /*
       * MOBILE_EXECUTION_MANIFEST_READ_AFTER_WRITE_V1
       *
       * O pull somente continua depois de provar que
       * Carteira + Manifesto foram realmente persistidos
       * com a MESMA revisão recebida.
       */
      const persistedPortfolioState:
        any =
        await db.getFirstAsync(
          `
            SELECT
              project_config_json,
              updated_at
            FROM field_portfolio_state
            WHERE project_id = ?
              AND user_id = ?
            LIMIT 1
          `,
          [
            String(
              rawProjectId
            ),
            String(
              user.id
            ),
          ]
        );


      const persistedPortfolioConfig =
        safeJsonParse(
          persistedPortfolioState
            ?.project_config_json,
          {}
        );


      const persistedManifest =
        persistedPortfolioConfig
          ?.executionManifest ||
        persistedPortfolioConfig
          ?.execution_manifest ||
        null;


      const persistedContract =
        String(
          persistedManifest?.contract ||
          ''
        )
          .trim()
          .toUpperCase();


      const persistedRevision =
        String(
          persistedManifest?.manifest_revision ||
          persistedManifest?.manifestRevision ||
          persistedPortfolioConfig
            ?.executionManifestRevision ||
          persistedPortfolioConfig
            ?.execution_manifest_revision ||
          ''
        )
          .trim();


      if (
        persistedContract !==
          'MOBILE_EXECUTION_MANIFEST_V1' ||
        persistedRevision !==
          executionManifestRevision
      ) {
        throw new Error(
          'MOBILE_EXECUTION_MANIFEST_PERSISTENCE_MISMATCH: a Carteira offline não confirmou a mesma revisão recebida do servidor.'
        );
      }


      await setSyncStateValue(
        db,
        String(rawProjectId),
        String(user.id),
        'execution_manifest_persisted_revision',
        persistedRevision
      );


      await setSyncStateValue(
        db,
        String(rawProjectId),
        String(user.id),
        'execution_manifest_persisted_at',
        String(
          persistedPortfolioState?.updated_at ||
          executionManifestReceivedAt
        )
      );


      await addAppLog({
        level:
          'INFO',

        module:
          'SYNC',

        action:
          'EXECUTION_MANIFEST_PERSISTENCE_CONFIRMED',

        message:
          'Carteira Livre e manifesto offline confirmados no SQLite.',

        metadata: {
          contract:
            persistedContract,

          manifestRevision:
            persistedRevision,

          receivedAt:
            executionManifestReceivedAt,

          persistedAt:
            persistedPortfolioState?.updated_at ||
            null,
        },
      }).catch(
        () => {}
      );

    } catch (portfolioError: any) {
      /*
       * MOBILE_EXECUTION_MANIFEST_REQUIRED_PERSISTENCE_V1
       *
       * Carteira + Manifesto são parte obrigatória
       * do snapshot offline.
       *
       * Se esta persistência falhar, globalSync falha.
       * Nunca informar "Tudo sincronizado" com o aparelho
       * sem conhecimento suficiente para operar offline.
       */
      await addAppLog({
        level:
          'ERROR',

        module:
          'SYNC',

        action:
          'FIELD_PORTFOLIO_MANIFEST_PERSISTENCE_FAILED',

        message:
          'Falha ao persistir Carteira Livre e manifesto offline.',

        metadata: {
          projectId:
            String(
              rawProjectId
            ),

          userId:
            String(
              user.id
            ),

          manifestRevision:
            executionManifestRevision,

          error:
            portfolioError?.message ||
            String(
              portfolioError
            ),
        },
      }).catch(
        () => {}
      );

      throw portfolioError;
    }

    if (lojas.length > 0) {
      v_list = safeArray(v_list).map((v: any) => {
        const lojaInfo = lojas.find((l: any) => String(l.id) === String(v.loja_id || v.lojaId)) || {};
        const lojaCustomData = safeJsonParse(lojaInfo.custom_data || v.loja_custom_data, lojaInfo.custom_data || v.loja_custom_data || {});

        return {
          ...v,
          loja_id: v.loja_id || v.lojaId,
          roteiro_id: v.roteiroId || v.roteiro_id,
          visita_id_json: v.visitaIdJson || v.visitaAgendadaId || v.visita_id_json || v.id,
          endereco: String(v.endereco || lojaInfo.endereco || lojaInfo.logradouro || ''),
          hora_entrada_prevista: String(v.hora_entrada_prevista || v.horaEntradaPrevista || v.hora_entrada || ''),
          hora_saida_prevista: String(v.hora_saida_prevista || v.horaSaidaPrevista || v.hora_saida || ''),
          bandeira: lojaInfo.bandeira || v.bandeira || '',
          rede: lojaInfo.rede || v.rede || '',
          loja_custom_data: lojaCustomData,
          categorias: categorias,
          store_insights: v.store_insights || [],
          project_config: {
            ...(v.project_config || {}),
            projectId: rawProjectId,
            loja_lat: lojaInfo.latitude || v.loja_lat || null,
            loja_lng: lojaInfo.longitude || v.loja_lng || null,
            gpsRadius: lojaInfo.raio || lojaInfo.gpsRadius || v.gpsRadius || null,
          },
        };
      });
    } else {
      v_list = safeArray(v_list);
    }

    /*
     * Persiste catálogo no project_config da visita.
     * saveRoteiroCompletoOffline já grava project_config_json.
     */
    v_list =
      safeArray(v_list).map(
        (visit: any) => ({
          ...visit,

          produtos:
            safeArray(produtosCatalogo),

          categorias:
            safeArray(categorias),

          project_config: {
            ...(
              visit?.project_config ||
              visit?.projectConfig ||
              {}
            ),

            mobile_catalog:
              mobileCatalog
          }
        })
      );


    t_list = safeArray(t_list).map((task: any) => ({
      ...task,

      titulo:
        String(
          task.titulo ||
          task.nome ||
          ''
        ),

      frequencia:
        String(
          task.frequencia ||
          ''
        ),

      data_vencimento:
        String(
          task.data_vencimento ||
          task.data_fim ||
          task.deadline ||
          ''
        ),

      produtos:
        safeArray(produtosCatalogo),

      categorias:
        safeArray(categorias),

      mobile_catalog:
        mobileCatalog
    }));

    c_list = safeArray(c_list).map(normalizeGamificationCampaign).filter(Boolean);
    s_list = safeArray(s_list).map(normalizePerfectStoreScorecard).filter(Boolean);
    p_list = safeArray(p_list);

    console.log('[Sync][Campanhas]', {
      performance: buildCampaignDebugSnapshot(c_list),
      perfectStore: buildCampaignDebugSnapshot(s_list),
    });

    // 4. Salva pesquisas para uso offline
    try {
      await db.runAsync(`DELETE FROM pesquisas`);

      for (const p of p_list) {
        await db.runAsync(
          `INSERT OR REPLACE INTO pesquisas (id, nome, titulo, frequencia, ativo, data_inicio, data_fim, pesquisa_raw_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.nome || p.titulo || '',
            p.titulo || p.nome || '',
            p.frequencia || '',
            String(p.ativo ?? true),
            p.data_inicio || p.dataInicio || null,
            p.data_fim || p.dataFim || null,
            JSON.stringify(p),
            new Date().toISOString(),
          ]
        ).catch(() => {});
      }
    } catch {}

    // 5. Atualiza indicadores do usuário mobile
    let custom: any = safeJsonParse(user.custom_data, {});
    custom.history_7d = buildHistory7dFromSnapshot(v_list, t_list);

    let novoSaldoPoints = user.pontos_gamificacao || 0;

    try {
      const [resPS, resGami, resHist, resRanking] = await Promise.all([
        api(`/perfect-store/extrato-geral/${projectId}/${promotorId}?t=${urlTS}`, fetchOptions).catch(() => null),
        api(`/gamification/resumo-periodo/${projectId}/${promotorId}?t=${urlTS}`, fetchOptions).catch(() => null),
        api(`/resumo-mobile-7d/${projectId}/${promotorId}?t=${urlTS}`, fetchOptions).catch(() => null),
        api(`/perfect-store/ranking/${projectId}?scorecard=ALL&t=${urlTS}`, fetchOptions).catch(() => null),
      ]);

      if (resGami && resGami.ok) {
        const gamiData = await resGami.json();
        novoSaldoPoints = gamiData.totalGeral || 0;
      }

      if (resHist && resHist.ok) {
        const histData = await resHist.json();

        custom.history_7d = {
          visitsTotal: histData.visitsTotal || 0,
          visitsDone: histData.visitsDone || 0,
          tasksTotal: histData.tasksTotal || 0,
          tasksDone: histData.tasksDone || 0,
        };
      }

      if (resRanking && resRanking.ok) {
        const rankingData = await resRanking.json();
        const ranking = rankingData.ranking || rankingData || [];
        const todayStr = getLocalDateKey(new Date());
        const lojasDoDia = new Set<string>();

        v_list.forEach((v: any) => {
          const d = v.data_programada ? getLocalDateKey(v.data_programada) : '';
          if (d === todayStr && v.loja_id) lojasDoDia.add(String(v.loja_id));
        });

        if (lojasDoDia.size > 0) {
          let totalScorePS = 0;

          lojasDoDia.forEach((lojaId) => {
            const rankLoja = ranking.find((r: any) =>
              String(r.id || r.lojaId || r.loja_id) === lojaId
            );

            if (rankLoja) {
              totalScorePS += Number(rankLoja.score || 0);
            }
          });

          custom.perfect_store_score = Math.round(totalScorePS / lojasDoDia.size);
        } else if (resPS && resPS.ok) {
          const psData = await resPS.json();
          custom.perfect_store_score = psData.scoreAtual || 0;
        }
      } else if (resPS && resPS.ok) {
        const psData = await resPS.json();
        custom.perfect_store_score = psData.scoreAtual || 0;
      }
    } catch {}

    const updatedUser = {
      ...user,
      custom_data: custom,
      customData: custom,
      pontos_gamificacao: novoSaldoPoints,
    };

    // 6. Mirror sync offline
    // Primeiro protege evidência local ainda não reconciliada.
    // Depois remove somente tarefas realmente ausentes sem evidência.
    // Por fim salva/atualiza o snapshot atual.
    const protectedTaskSnapshot =
      await protectServerTaskSnapshotAgainstLocalEvidenceV2(
        db,
        t_list,
        executionManifestRevision
      );

    t_list = protectedTaskSnapshot.tasks;

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'task_server_overwrite_deferred_count',
      String(protectedTaskSnapshot.deferredCount)
    );

    await mirrorServerRouteSnapshot(
      db,
      v_list,
      t_list,
      String(rawProjectId),
      String(user.id)
    );

    const success = await saveRoteiroCompletoOffline(v_list, t_list, c_list, s_list, p_list);

    if (!success) {
      throw new Error('Falha ao persistir o snapshot local do roteiro.');
    }

    setLastSync(new Date());

    useAuthStore.setState({ user: updatedUser, token });

    if (login) {
      await login(token, updatedUser);
    }

    try {
      await collectAndSendTelemetry(user.id);
    } catch {}

    const health = await getDiamondSyncHealth();
    const hasBlockingState =
      !health.diagnosticsOk ||
      health.pending > 0 ||
      health.retry > 0 ||
      health.unresolvedConflicts > 0 ||
      health.collectionsPending > 0 ||
      health.collectionsConflict > 0 ||
      health.visitsPending > 0 ||
      health.orphanVisitsPending > 0 ||
      health.orphanServerEvidence > 0 ||
      health.configurationPending > 0;

    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'last_global_sync_at',
      new Date().toISOString()
    );
    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'last_global_sync_status',
      hasBlockingState ? 'PARTIAL' : 'SUCCESS'
    );
    await setSyncStateValue(
      db,
      String(rawProjectId),
      String(user.id),
      'last_global_sync_error',
      null
    );

    return {
      ok: !hasBlockingState,
      status: hasBlockingState ? 'PARTIAL' as const : 'SUCCESS' as const,
      health,
    };

  } catch (error: any) {
    console.error('🔥 Erro Crítico no GlobalSync:', error);

    try {
      const db = await getDBConnection();
      const rawProjectId = getMainProjectId(user);
      if (rawProjectId) {
        await ensureMobileSyncStateTables(db);
        await setSyncStateValue(
          db,
          String(rawProjectId),
          String(user.id),
          'last_global_sync_status',
          'FAILED'
        );
        await setSyncStateValue(
          db,
          String(rawProjectId),
          String(user.id),
          'last_global_sync_error',
          String(error?.message || error)
        );
      }
    } catch {}

    return {
      ok: false,
      status: 'FAILED' as const,
      error: String(error?.message || error),
    };
  } finally {
    syncInProgress = false;
    setSyncing(false);
  }
};

export const enqueueSyncOperationInDb = async (
  db: any,
  endpoint: string,
  payload: any,
  method: string = 'POST'
) => {
  const payloadWithMetadata = {
    ...payload,
    client_operation_id:
      payload?.client_operation_id ||
      payload?.clientOperationId ||
      `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    created_offline_at:
      payload?.created_offline_at ||
      payload?.createdOfflineAt ||
      new Date().toISOString(),
    origem: payload?.origem || 'MOBILE_OFFLINE',
  };

  const payloadString = JSON.stringify(payloadWithMetadata);
  const dataCriacao = new Date().toISOString();
  const methodToUse = String(method || 'POST').toUpperCase();
  const clientOperationId = String(
    payloadWithMetadata.client_operation_id || ''
  ).trim();
  const operationKey = clientOperationId || null;

  if (clientOperationId) {
    const existing: any = await db.getFirstAsync(
      `SELECT id
         FROM sync_queue
        WHERE endpoint = ?
          AND (operation_key = ? OR payload LIKE ?)
        LIMIT 1`,
      [
        endpoint,
        clientOperationId,
        `%\"client_operation_id\":\"${clientOperationId}\"%`,
      ]
    );

    if (existing?.id) {
      return {
        success: true,
        offline: true,
        skippedDuplicate: true,
        existingQueueId: existing.id,
        payload: payloadWithMetadata,
      };
    }
  }

  const result: any = await db.runAsync(
    `INSERT INTO sync_queue (
       endpoint, payload, method, created_at, operation_key,
       status, next_retry_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, ?)`,
    [
      endpoint,
      payloadString,
      methodToUse,
      dataCriacao,
      operationKey,
      dataCriacao,
    ]
  );

  return {
    success: true,
    offline: true,
    queueId: result?.lastInsertRowId ?? null,
    payload: payloadWithMetadata,
  };
};

export const addToSyncQueue = async (
  endpoint: string,
  payload: any,
  method: string = 'POST',
  token?: string
) => {
  try {
    const db = await getDBConnection();
    const result = await enqueueSyncOperationInDb(
      db,
      endpoint,
      payload,
      method
    );

    if (result?.skippedDuplicate) {
      await addAppLog({
        level: 'INFO',
        module: 'SYNC',
        action: 'SKIP_DUPLICATE_QUEUE_ITEM',
        message: 'Item duplicado não foi inserido novamente na fila offline.',
        metadata: {
          endpoint,
          method: String(method || 'POST').toUpperCase(),
          clientOperationId:
            result?.payload?.client_operation_id || null,
          existingQueueId: result?.existingQueueId || null,
        },
      });
    }

    return result;
  } catch (error: any) {
    console.error('🔥 Falha na fila offline:', error);
    throw error;
  }
};
