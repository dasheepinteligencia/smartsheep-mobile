import { api } from './api';
import { saveRoteiroCompletoOffline, getDBConnection, saveAlertsOffline, addAppLog } from '../database/db';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import * as Network from 'expo-network';
import { collectAndSendTelemetry } from './telemetryService';
import { isLocalFileUri, uploadLocalVisitPhotoToAws } from './mobileAwsUploadService';

let syncInProgress = false;

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

  if (await isAlreadyProcessedResponse(res)) return true;

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
    await db.runAsync(`UPDATE sync_queue SET payload = ? WHERE id = ?`, [
      JSON.stringify(result.payload),
      item.id,
    ]);

    logMediaSync('sync-queue-payload-updated', {
      queueId: item.id,
      endpoint: item.endpoint,
    });
  }

  return result.payload;
};

const uploadSyncQueue = async (db: any) => {
  const filaDeSincronizacao: any[] = await db.getAllAsync(
    `SELECT * FROM sync_queue ORDER BY created_at ASC`
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

      if (await shouldRemoveFromQueue(res)) {
        await updateVisitAfterSyncedQueueItem(db, item);
        await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [item.id]);
      } else {
        const body = await readResponseBodySafely(res);

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

        await db.runAsync(
          `UPDATE sync_queue SET attempts = COALESCE(attempts, 0) + 1, last_error = ? WHERE id = ?`,
          [`HTTP ${res?.status || 'unknown'} ${errorMessage}`.substring(0, 500), item.id]
        ).catch(() => {});
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

      await db.runAsync(
        `UPDATE sync_queue SET attempts = COALESCE(attempts, 0) + 1, last_error = ? WHERE id = ?`,
        [errorMessage.substring(0, 500), item.id]
      ).catch(() => {});
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

      const payload = {
        projectId: rawProjectId,
        roteiroId: item.roteiro_id,
        roteiro_id: item.roteiro_id,
        visitaIdJson: item.visita_id_json,
        visita_id_json: item.visita_id_json,
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
        origem: 'MOBILE_OFFLINE',
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

      if (res.ok || await isAlreadyProcessedResponse(res)) {
        await db.runAsync(`UPDATE visits SET pending_sync = 0 WHERE id = ?`, [item.id]);
      }
    } catch {
      // Mantém como pendente.
    }
  }
};

const cleanExpiredLocalTasks = async (db: any) => {
  try {
    await db.runAsync(`
      DELETE FROM other_tasks 
      WHERE upper(status) IN (
        'NOT_VISITED',
        'DELAYED',
        'CANCELADA',
        'EXPIRADA',
        'NAO_REALIZADA',
        'NAO REALIZADA',
        'NÃO REALIZADA',
        'ATRASADA'
      )
    `);
  } catch {}
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
const mirrorServerRouteSnapshot = async (db: any, serverVisits: any[], serverTasks: any[]) => {
  const visitIds = safeArray(serverVisits)
    .map(normalizeServerVisitId)
    .filter(Boolean);

  const taskIds = safeArray(serverTasks)
    .map(normalizeServerTaskId)
    .filter(Boolean);

  try {
    await db.withTransactionAsync(async () => {
      if (visitIds.length > 0) {
        await db.runAsync(
          `
            DELETE FROM visits
            WHERE COALESCE(pending_sync, 0) = 0
            AND id NOT IN (${buildSqlPlaceholders(visitIds)})
          `,
          visitIds
        );
      } else {
        await db.runAsync(`
          DELETE FROM visits
          WHERE COALESCE(pending_sync, 0) = 0
        `);
      }

      if (taskIds.length > 0) {
        await db.runAsync(
          `
            DELETE FROM other_tasks
            WHERE id NOT IN (${buildSqlPlaceholders(taskIds)})
          `,
          taskIds
        );
      } else {
        await db.runAsync(`DELETE FROM other_tasks`);
      }
    });

  } catch (error) {
    console.warn('[Sync] Falha ao limpar snapshot local do roteiro:', error);
  }
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



export const globalSync = async () => {
  const { user, token, login } = useAuthStore.getState();
  const { setSyncing, setLastSync } = useSyncStore.getState();

  if (!user || !token || syncInProgress) return;

  syncInProgress = true;
  setSyncing(true);

  try {
    const network = await Network.getNetworkStateAsync();

    if (!network.isConnected || network.isInternetReachable === false) {
      return;
    }

    const db = await getDBConnection();

    const rawProjectId = getMainProjectId(user);

    if (!rawProjectId) {
      console.warn('[Sync] Usuário sem projeto vinculado. Sync cancelado.');
      return;
    }

    await ensureJustificativasTable(db);

    const projectId = encodeURIComponent(String(rawProjectId).trim());
    const promotorId = encodeURIComponent(String(user.id).trim());
    const urlTS = new Date().getTime();
    const fetchOptions = buildNoCacheFetchOptions();

    // 0. Manutenção local leve
    await cleanExpiredLocalTasks(db);

    // 1. Primeiro envia pendências locais, antes de espelhar dados do servidor.
    await uploadSyncQueue(db);
    await uploadLegacyPendingVisits(db, String(rawProjectId), user);

    // 2. Download do roteiro consolidado
    const resRoteiro = await api(
      `/meu-roteiro?promotorId=${promotorId}&projectId=${projectId}&t=${urlTS}`,
      fetchOptions
    );

    if (!resRoteiro.ok) {
      console.warn('[Sync] Falha ao baixar meu-roteiro:', resRoteiro.status);
      return;
    }

    const data = await resRoteiro.json();

    let v_list = Array.isArray(data) ? data : (data.visits || data.visitas || []);
    let t_list = data.otherTasks || data.tarefas || [];
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
      fetchedJustificativas,
      fetchedAlertas,
      fetchedGamificationCampaigns,
      fetchedPerfectStoreScorecards,
    ] = await Promise.all([
      api(`/lojas/${projectId}?t=${urlTS}`, fetchOptions).catch(() => null),
      api(`/categorias?projectId=${projectId}&t=${urlTS}`, fetchOptions).catch(() => null),
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

    if (resLojas && resLojas.ok) {
      const lojasData = await resLojas.json();
      lojas = Array.isArray(lojasData) ? lojasData : (lojasData.data || lojasData.lojas || []);
    }

    if (resCategorias && resCategorias.ok) {
      const categoriasData = await resCategorias.json();
      categorias = Array.isArray(categoriasData) ? categoriasData : (categoriasData.data || categoriasData.categorias || []);
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

    t_list = safeArray(t_list).map((task: any) => ({
      ...task,
      titulo: String(task.titulo || task.nome || ''),
      frequencia: String(task.frequencia || ''),
      data_vencimento: String(task.data_vencimento || task.data_fim || task.deadline || ''),
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
    // Primeiro remove do SQLite o que não existe mais no backend.
    // Depois salva/atualiza o snapshot atual.
    await mirrorServerRouteSnapshot(db, v_list, t_list);

    const success = await saveRoteiroCompletoOffline(v_list, t_list, c_list, s_list, p_list);

    if (success) {
      setLastSync(new Date());

      useAuthStore.setState({ user: updatedUser, token });

      if (login) {
        await login(token, updatedUser);
      }
    }

    try {
      await collectAndSendTelemetry(user.id);
    } catch {}

  } catch (error: any) {
    console.error('🔥 Erro Crítico no GlobalSync:', error);
  } finally {
    syncInProgress = false;
    setSyncing(false);
  }
};

export const addToSyncQueue = async (
  endpoint: string,
  payload: any,
  method: string = 'POST',
  token?: string
) => {
  try {
    const db = await getDBConnection();

    const payloadWithMetadata = {
      ...payload,
      client_operation_id:
        payload?.client_operation_id ||
        payload?.clientOperationId ||
        `op_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      created_offline_at: payload?.created_offline_at || new Date().toISOString(),
      origem: payload?.origem || 'MOBILE_OFFLINE',
    };

    const payloadString = JSON.stringify(payloadWithMetadata);
    const dataCriacao = new Date().toISOString();
    const methodToUse = String(method || 'POST').toUpperCase();
    const clientOperationId = String(payloadWithMetadata.client_operation_id || '').trim();

    if (clientOperationId) {
      const existing: any = await db.getFirstAsync(
        `SELECT id FROM sync_queue
         WHERE endpoint = ?
           AND payload LIKE ?
         LIMIT 1`,
        [endpoint, `%"client_operation_id":"${clientOperationId}"%`]
      );

      if (existing?.id) {
        await addAppLog({
          level: 'INFO',
          module: 'SYNC',
          action: 'SKIP_DUPLICATE_QUEUE_ITEM',
          message: 'Item duplicado não foi inserido novamente na fila offline.',
          metadata: {
            endpoint,
            method: methodToUse,
            clientOperationId,
            existingQueueId: existing.id,
          },
        });

        return { success: true, offline: true, skippedDuplicate: true };
      }
    }

    await db.runAsync(
      `INSERT INTO sync_queue (endpoint, payload, method, created_at) VALUES (?, ?, ?, ?)`,
      [endpoint, payloadString, methodToUse, dataCriacao]
    );

    return { success: true, offline: true };
  } catch (error: any) {
    console.error('🔥 Falha na fila offline:', error);
    throw error;
  }
};
