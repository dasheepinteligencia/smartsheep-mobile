import * as SQLite from 'expo-sqlite';

const DB_NAME = 'app_coleta_v16.db';

const db = SQLite.openDatabaseSync(DB_NAME);

export const getDBConnection = () => db;

export type AppLogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG';

export type AppLogInput = {
  level?: AppLogLevel;
  module: string;
  action: string;
  message: string;
  metadata?: Record<string, any> | any;
};

const generateAppLogId = () => {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const ensureAppLogsTable = async () => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
    CREATE INDEX IF NOT EXISTS idx_app_logs_module ON app_logs(module);
  `);
};

export const addAppLog = async ({
  level = 'INFO',
  module,
  action,
  message,
  metadata = {},
}: AppLogInput) => {
  try {
    await ensureAppLogsTable();

    const createdAt = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO app_logs (
        id,
        created_at,
        level,
        module,
        action,
        message,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generateAppLogId(),
        createdAt,
        String(level || 'INFO').toUpperCase(),
        String(module || 'APP').toUpperCase(),
        String(action || 'EVENT').toUpperCase(),
        String(message || ''),
        safeStringify(metadata || {}, '{}'),
      ]
    );

    // Retenção local: mantém os 500 logs mais recentes para não inflar o SQLite.
    await db.runAsync(`
      DELETE FROM app_logs
      WHERE id NOT IN (
        SELECT id FROM app_logs
        ORDER BY datetime(created_at) DESC
        LIMIT 500
      )
    `);
  } catch (error) {
    console.warn('[DB] Falha ao gravar app_log:', error);
  }
};

export const getRecentAppLogs = async (limit: number = 80) => {
  try {
    await initializeDatabase();
    await ensureAppLogsTable();

    return await db.getAllAsync(
      `SELECT * FROM app_logs
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [Math.max(1, Math.min(Number(limit || 80), 200))]
    );
  } catch (error) {
    console.error('[DB] Erro ao carregar logs do app:', error);
    return [];
  }
};

export const getAppLogSummary = async () => {
  try {
    await initializeDatabase();
    await ensureAppLogsTable();

    const rows: any[] = await db.getAllAsync(`
      SELECT 
        level,
        COUNT(*) as total
      FROM app_logs
      GROUP BY level
    `);

    const lastError: any = await db.getFirstAsync(`
      SELECT *
      FROM app_logs
      WHERE level = 'ERROR'
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `);

    return {
      total: rows.reduce((acc, row) => acc + Number(row.total || 0), 0),
      byLevel: rows.reduce((acc, row) => {
        acc[String(row.level || 'INFO')] = Number(row.total || 0);
        return acc;
      }, {} as Record<string, number>),
      lastError: lastError || null,
    };
  } catch (error) {
    console.error('[DB] Erro ao resumir logs do app:', error);
    return {
      total: 0,
      byLevel: {},
      lastError: null,
    };
  }
};

export const clearAppLogs = async () => {
  try {
    await ensureAppLogsTable();
    await db.runAsync(`DELETE FROM app_logs`);
    await addAppLog({
      level: 'INFO',
      module: 'SUPPORT',
      action: 'CLEAR_APP_LOGS',
      message: 'Histórico de logs do app foi limpo.',
    });
    return true;
  } catch (error) {
    console.error('[DB] Erro ao limpar logs do app:', error);
    return false;
  }
};

const safeStringify = (data: any, fallback: string = '{}') => {
  if (data === null || data === undefined) return fallback;
  if (typeof data === 'string') return data;

  try {
    return JSON.stringify(data);
  } catch {
    return fallback;
  }
};

const safeParseArray = (value: any): any[] => {
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

const getTableColumns = async (tableName: string): Promise<string[]> => {
  const tableInfo: any[] = await db.getAllAsync(`PRAGMA table_info(${tableName});`);
  return tableInfo.map((col) => col.name);
};

const runStatementsSafely = async (sql: string) => {
  const statements = sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.execAsync(`${statement};`);
  }
};

const addColumnIfMissing = async (
  tableName: string,
  columnName: string,
  columnDefinition: string
) => {
  try {
    const columns = await getTableColumns(tableName);

    if (!columns.includes(columnName)) {
      await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
    }
  } catch (error: any) {
    const message = String(error?.message || error || '').toLowerCase();

    // Em algumas instalações antigas, duas inicializações podem tentar a mesma migração.
    // Se a coluna já existe, ignoramos para não quebrar o sync.
    if (message.includes('duplicate column') || message.includes('already exists')) return;

    console.warn(`[DB] Migração ignorada em ${tableName}.${columnName}:`, error?.message || error);
  }
};

const normalizeVisitId = (v: any) => {
  return String(
    v.id ||
    v.visita_id_json ||
    v.visitaIdJson ||
    v.visitaAgendadaId ||
    `${v.loja_id || v.lojaId}_${v.data_programada || v.dataProgramada || Date.now()}`
  );
};

const normalizeStatus = (status: any) => {
  const s = String(status || 'PENDENTE').toUpperCase();

  if (s === 'AGENDADA') return 'PENDENTE';
  if (s === 'COMPLETA' || s === 'CONCLUIDA' || s === 'VISITADA') return 'REALIZADA';

  return s;
};

const hasScorecardShape = (item: any) => {
  if (!item || typeof item !== 'object') return false;

  return (
    item.valor_atingido !== undefined ||
    item.valor_esperado !== undefined ||
    item.valorAtingido !== undefined ||
    item.valorEsperado !== undefined ||
    item.regras !== undefined ||
    item.rules !== undefined ||
    item.dataInicio !== undefined ||
    item.data_inicio !== undefined
  );
};

const splitCampaignsAndScorecards = (thirdList: any[] = [], fourthList: any[] = []) => {
  const third = safeParseArray(thirdList);
  const fourth = safeParseArray(fourthList);

  const thirdLooksLikeScorecard = third.some(hasScorecardShape);
  const fourthLooksLikeScorecard = fourth.some(hasScorecardShape);

  // Compatibilidade:
  // - Assinatura antiga: saveRoteiroCompletoOffline(visits, tasks, scorecards, campanhas, pesquisas)
  // - Assinatura nova usada pelo sync: saveRoteiroCompletoOffline(visits, tasks, campanhas, scorecards, pesquisas)
  if (thirdLooksLikeScorecard && !fourthLooksLikeScorecard) {
    return { scorecards: third, campanhas: fourth };
  }

  if (!thirdLooksLikeScorecard && fourthLooksLikeScorecard) {
    return { scorecards: fourth, campanhas: third };
  }

  return { scorecards: third, campanhas: fourth };
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


const safeParseObject = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeBoolean = (value: any) => {
  if (value === true || value === 1) return true;
  const s = String(value || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'sim';
};

const normalizeAlert = (item: any) => {
  const raw = safeParseObject(item?.raw_json, item || {});

  const id = String(
    item?.id ||
    raw?.id ||
    raw?.messageId ||
    raw?.message_id ||
    raw?.alertaId ||
    raw?.alerta_id ||
    raw?.comunicadoId ||
    raw?.comunicado_id ||
    ''
  ).trim();

  const titulo = String(
    item?.titulo ||
    raw?.titulo ||
    raw?.title ||
    raw?.assunto ||
    'Comunicado'
  ).trim();

  const conteudo = String(
    item?.conteudo ||
    raw?.conteudo ||
    raw?.content ||
    raw?.mensagem ||
    raw?.body ||
    ''
  );

  const remetenteNome = String(
    item?.remetente_nome ||
    raw?.remetente_nome ||
    raw?.remetente?.nome ||
    raw?.autor?.nome ||
    raw?.senderName ||
    raw?.sender_name ||
    'Gestão'
  ).trim();

  const dataEnvio = String(
    item?.data_envio ||
    raw?.data_envio ||
    raw?.dataEnvio ||
    raw?.created_at ||
    raw?.criado_em ||
    raw?.data_publicacao ||
    raw?.published_at ||
    new Date().toISOString()
  );

  const prioridade = String(
    item?.prioridade ||
    raw?.prioridade ||
    raw?.priority ||
    'INFO'
  ).toUpperCase();

  const lida = normalizeBoolean(item?.lida ?? raw?.lida ?? raw?.read);
  const exigeAceite = normalizeBoolean(
    item?.exige_aceite ??
      raw?.exige_aceite ??
      raw?.exigeAceite ??
      raw?.requiresAck ??
      raw?.requires_ack
  );

  if (!id || !titulo) return null;

  return {
    id,
    titulo,
    conteudo,
    remetente_nome: remetenteNome,
    data_envio: dataEnvio,
    prioridade,
    lida,
    lida_em: item?.lida_em || raw?.lida_em || raw?.read_at || raw?.readAt || null,
    exige_aceite: exigeAceite,
    aceita_em:
      item?.aceita_em ||
      raw?.aceita_em ||
      raw?.accepted_at ||
      raw?.ack_at ||
      raw?.ackAt ||
      null,
    raw_json: raw,
  };
};

export const clearLocalDatabase = async () => {
  try {
    await db.execAsync(`
      DELETE FROM visits; 
      DELETE FROM other_tasks; 
      DELETE FROM scorecards;
      DELETE FROM campanhas_gamificacao; 
      DELETE FROM pesquisas; 
      DELETE FROM coletas;
      DELETE FROM justificativas;
      DELETE FROM alerts;
      DELETE FROM sync_queue;
    `);

    await addAppLog({
      level: 'WARNING',
      module: 'DB',
      action: 'CLEAR_LOCAL_DATABASE',
      message: 'Banco local operacional foi limpo. Logs foram preservados.',
    });
  } catch (error) {
    console.error('[DB] Erro ao limpar banco local:', error);
  }
};

let databaseInitialized = false;
let databaseInitializing: Promise<void> | null = null;

const initializeDatabaseInternal = async () => {
  try {
    await runStatementsSafely(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        roteiro_id TEXT,
        visita_id_json TEXT,
        loja_id TEXT, 
        loja_nome TEXT,
        bandeira TEXT, 
        rede TEXT, 
        loja_custom_data_json TEXT,
        endereco TEXT, 
        status TEXT, 
        data_programada TEXT,
        hora_entrada_prevista TEXT, 
        hora_saida_prevista TEXT,
        project_config_json TEXT, 
        pesquisa_json TEXT, 
        produtos_json TEXT,
        store_insights_json TEXT, 
        pesquisa_realizada INTEGER DEFAULT 0,
        checkin_at TEXT, 
        checkout_at TEXT,
        latitude REAL, 
        longitude REAL,
        foto_checkin_url TEXT,
        foto_checkout_url TEXT,
        foto_justificativa_url TEXT,
        justificativa_id TEXT,
        justificativa TEXT,
        detalhe_justificativa TEXT,
        client_operation_id TEXT,
        updated_at TEXT,
        pending_sync INTEGER DEFAULT 0 
      );

      CREATE TABLE IF NOT EXISTS other_tasks ( 
        id TEXT PRIMARY KEY, 
        titulo TEXT, 
        status TEXT DEFAULT 'PENDENTE', 
        frequencia TEXT, 
        data_vencimento TEXT, 
        task_raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pesquisas ( 
        id TEXT PRIMARY KEY, 
        nome TEXT,
        titulo TEXT,
        frequencia TEXT,
        ativo TEXT DEFAULT 'true',
        data_inicio TEXT,
        data_fim TEXT,
        pesquisa_raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS coletas (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        usuario_id TEXT,
        loja_id TEXT,
        visita_id TEXT,
        pesquisa_id TEXT,
        status TEXT DEFAULT 'PENDENTE',
        data_inicio TEXT,
        data_fim TEXT,
        data_programada TEXT,
        respostas_json TEXT,
        raw_json TEXT,
        pending_sync INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        sync_error_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scorecards ( 
        id TEXT PRIMARY KEY, 
        nome TEXT, 
        ativo TEXT DEFAULT 'false', 
        data_inicio TEXT,
        data_fim TEXT,
        valor_atingido REAL DEFAULT 0, 
        valor_esperado REAL DEFAULT 0,
        scorecard_raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS campanhas_gamificacao ( 
        id TEXT PRIMARY KEY, 
        nome TEXT, 
        ativo TEXT DEFAULT 'false', 
        data_inicio TEXT,
        data_fim TEXT,
        perfisAlvo TEXT,
        campanha_raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS justificativas (
        id TEXT PRIMARY KEY,
        descricao TEXT,
        ativo TEXT DEFAULT 'true',
        raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        titulo TEXT,
        conteudo TEXT,
        remetente_nome TEXT,
        data_envio TEXT,
        prioridade TEXT DEFAULT 'INFO',
        lida INTEGER DEFAULT 0,
        lida_em TEXT,
        exige_aceite INTEGER DEFAULT 0,
        aceita_em TEXT,
        raw_json TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT,
        payload TEXT,
        method TEXT,
        created_at TEXT,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS app_logs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        action TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_visits_data ON visits(data_programada);
      CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
      CREATE INDEX IF NOT EXISTS idx_visits_pending_sync ON visits(pending_sync);
      CREATE INDEX IF NOT EXISTS idx_coletas_visita_id ON coletas(visita_id);
      CREATE INDEX IF NOT EXISTS idx_coletas_pesquisa_id ON coletas(pesquisa_id);
      CREATE INDEX IF NOT EXISTS idx_coletas_pending_sync ON coletas(pending_sync);
      CREATE INDEX IF NOT EXISTS idx_coletas_status ON coletas(status);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
      CREATE INDEX IF NOT EXISTS idx_app_logs_created_at ON app_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
      CREATE INDEX IF NOT EXISTS idx_app_logs_module ON app_logs(module);
      CREATE INDEX IF NOT EXISTS idx_justificativas_ativo ON justificativas(ativo);
      CREATE INDEX IF NOT EXISTS idx_alerts_lida ON alerts(lida);
      CREATE INDEX IF NOT EXISTS idx_alerts_aceita_em ON alerts(aceita_em);
      CREATE INDEX IF NOT EXISTS idx_alerts_data_envio ON alerts(data_envio);
    `);

    // =========================================================================
    // Migrações seguras para aparelhos antigos
    // =========================================================================
    await addColumnIfMissing('visits', 'roteiro_id', 'TEXT');
    await addColumnIfMissing('visits', 'visita_id_json', 'TEXT');
    await addColumnIfMissing('visits', 'bandeira', 'TEXT');
    await addColumnIfMissing('visits', 'rede', 'TEXT');
    await addColumnIfMissing('visits', 'loja_custom_data_json', 'TEXT');
    await addColumnIfMissing('visits', 'store_insights_json', 'TEXT');
    await addColumnIfMissing('visits', 'foto_checkin_url', 'TEXT');
    await addColumnIfMissing('visits', 'foto_checkout_url', 'TEXT');
    await addColumnIfMissing('visits', 'foto_justificativa_url', 'TEXT');
    await addColumnIfMissing('visits', 'justificativa_id', 'TEXT');
    await addColumnIfMissing('visits', 'justificativa', 'TEXT');
    await addColumnIfMissing('visits', 'detalhe_justificativa', 'TEXT');
    await addColumnIfMissing('visits', 'client_operation_id', 'TEXT');
    await addColumnIfMissing('visits', 'updated_at', 'TEXT');

    await addColumnIfMissing('other_tasks', 'updated_at', 'TEXT');

    await addColumnIfMissing('pesquisas', 'titulo', 'TEXT');
    await addColumnIfMissing('pesquisas', 'ativo', "TEXT DEFAULT 'true'");
    await addColumnIfMissing('pesquisas', 'data_inicio', 'TEXT');
    await addColumnIfMissing('pesquisas', 'data_fim', 'TEXT');
    await addColumnIfMissing('pesquisas', 'updated_at', 'TEXT');

    await addColumnIfMissing('coletas', 'project_id', 'TEXT');
    await addColumnIfMissing('coletas', 'usuario_id', 'TEXT');
    await addColumnIfMissing('coletas', 'loja_id', 'TEXT');
    await addColumnIfMissing('coletas', 'visita_id', 'TEXT');
    await addColumnIfMissing('coletas', 'pesquisa_id', 'TEXT');
    await addColumnIfMissing('coletas', 'status', "TEXT DEFAULT 'PENDENTE'");
    await addColumnIfMissing('coletas', 'data_inicio', 'TEXT');
    await addColumnIfMissing('coletas', 'data_fim', 'TEXT');
    await addColumnIfMissing('coletas', 'data_programada', 'TEXT');
    await addColumnIfMissing('coletas', 'respostas_json', 'TEXT');
    await addColumnIfMissing('coletas', 'raw_json', 'TEXT');
    await addColumnIfMissing('coletas', 'pending_sync', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('coletas', 'attempts', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('coletas', 'last_error', 'TEXT');
    await addColumnIfMissing('coletas', 'sync_error_json', 'TEXT');
    await addColumnIfMissing('coletas', 'created_at', 'TEXT');
    await addColumnIfMissing('coletas', 'updated_at', 'TEXT');

    await addColumnIfMissing('scorecards', 'data_inicio', 'TEXT');
    await addColumnIfMissing('scorecards', 'data_fim', 'TEXT');
    await addColumnIfMissing('scorecards', 'scorecard_raw_json', 'TEXT');
    await addColumnIfMissing('scorecards', 'updated_at', 'TEXT');

    await addColumnIfMissing('campanhas_gamificacao', 'data_inicio', 'TEXT');
    await addColumnIfMissing('campanhas_gamificacao', 'data_fim', 'TEXT');
    await addColumnIfMissing('campanhas_gamificacao', 'campanha_raw_json', 'TEXT');
    await addColumnIfMissing('campanhas_gamificacao', 'updated_at', 'TEXT');

    await addColumnIfMissing('justificativas', 'ativo', "TEXT DEFAULT 'true'");
    await addColumnIfMissing('justificativas', 'raw_json', 'TEXT');
    await addColumnIfMissing('justificativas', 'updated_at', 'TEXT');

    await addColumnIfMissing('alerts', 'titulo', 'TEXT');
    await addColumnIfMissing('alerts', 'conteudo', 'TEXT');
    await addColumnIfMissing('alerts', 'remetente_nome', 'TEXT');
    await addColumnIfMissing('alerts', 'data_envio', 'TEXT');
    await addColumnIfMissing('alerts', 'prioridade', "TEXT DEFAULT 'INFO'");
    await addColumnIfMissing('alerts', 'lida', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('alerts', 'lida_em', 'TEXT');
    await addColumnIfMissing('alerts', 'exige_aceite', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('alerts', 'aceita_em', 'TEXT');
    await addColumnIfMissing('alerts', 'raw_json', 'TEXT');
    await addColumnIfMissing('alerts', 'updated_at', 'TEXT');

    await addColumnIfMissing('sync_queue', 'attempts', 'INTEGER DEFAULT 0');
    await addColumnIfMissing('sync_queue', 'last_error', 'TEXT');

    await addAppLog({
      level: 'INFO',
      module: 'DB',
      action: 'INITIALIZE_DATABASE',
      message: 'Banco local inicializado e migrações aplicadas.',
      metadata: { dbName: DB_NAME },
    });
  } catch (error) {
    console.error('[DB] Erro ao inicializar banco:', error);
    throw error;
  }
};

export const initializeDatabase = async () => {
  if (databaseInitialized) return;

  if (databaseInitializing) {
    await databaseInitializing;
    return;
  }

  databaseInitializing = initializeDatabaseInternal()
    .then(() => {
      databaseInitialized = true;
    })
    .finally(() => {
      databaseInitializing = null;
    });

  await databaseInitializing;
};


const hasPendingSyncQueueForVisit = async (visitId: string, localData: any) => {
  try {
    const patterns = [
      visitId,
      localData?.visita_id_json,
      localData?.client_operation_id,
    ]
      .filter(Boolean)
      .map((value) => `%${String(value)}%`);

    if (patterns.length === 0) return false;

    const where = patterns.map(() => `payload LIKE ?`).join(' OR ');
    const row: any = await db.getFirstAsync(
      `SELECT COUNT(*) as count FROM sync_queue WHERE ${where}`,
      patterns
    );

    return Number(row?.count || 0) > 0;
  } catch {
    return false;
  }
};

const isOperationalServerStatus = (status: string) => {
  return ['EM_ANDAMENTO', 'INICIADA', 'REALIZADA', 'JUSTIFICADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(
    String(status || '').toUpperCase()
  );
};

const parseTimestampMs = (value: any) => {
  if (!value) return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  const candidates: string[] = [raw];

  // PostgreSQL/Prisma às vezes pode entregar "2026-05-28 17:45:01.307".
  // No React Native/Android, esse formato pode ser interpretado errado ou virar Invalid Date.
  // Quando não houver timezone explícito, tratamos como horário de São Paulo (-03:00),
  // que é o fuso operacional do projeto.
  const hasExplicitTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const looksLikeSqlDateTime = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw);

  if (looksLikeSqlDateTime) {
    const isoLike = raw.replace(' ', 'T');

    candidates.push(isoLike);

    if (!hasExplicitTimezone) {
      candidates.push(`${isoLike}-03:00`);
    }
  }

  // Fallback para datas BR simples: 28/05/2026 17:45:01
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brMatch) {
    const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = brMatch;
    candidates.push(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`);
  }

  for (const candidate of candidates) {
    const time = new Date(candidate).getTime();

    if (!Number.isNaN(time)) return time;
  }

  return 0;
};

const getVisitTimestampMs = (...values: any[]) => {
  for (const value of values) {
    const time = parseTimestampMs(value);

    if (time > 0) return time;
  }

  return 0;
};

const getLocalVisitLastChangeMs = (localData: any) => {
  if (!localData) return 0;

  return getVisitTimestampMs(
    localData.updated_at,
    localData.checkout_at,
    localData.checkin_at
  );
};

const getServerVisitLastChangeMs = (visit: any) => {
  if (!visit) return 0;

  return getVisitTimestampMs(
    visit.updated_at,
    visit.updatedAt,
    visit.atualizado_em,
    visit.atualizadoEm,
    visit.updated,
    visit.checkout_at,
    visit.checkoutAt,
    visit.data_checkout,
    visit.saida_at,
    visit.checkin_at,
    visit.checkinAt,
    visit.data_checkin,
    visit.entrada_at,
    visit.criado_em,
    visit.created_at,
    visit.createdAt
  );
};

const shouldKeepLocalVisitByTimestamp = (localData: any, serverVisit: any) => {
  if (!localData) return false;

  const localTime = getLocalVisitLastChangeMs(localData);
  const serverTime = getServerVisitLastChangeMs(serverVisit);

  // Se não há data confiável local, deixa o servidor vencer.
  if (!localTime) return false;

  // Se não há data confiável do servidor, preserva local para não perder check-in/checkout offline.
  if (!serverTime) return true;

  return localTime > serverTime;
};


const localVisitHasUnsyncedWork = async (visitId: string, localData: any) => {
  if (!localData) return false;

  if (Number(localData.pending_sync || 0) === 1) return true;

  return await hasPendingSyncQueueForVisit(visitId, localData);
};

const deletePendingSyncQueueForVisit = async (visitId: string, localData: any) => {
  try {
    const patterns = [
      visitId,
      localData?.visita_id_json,
      localData?.client_operation_id,
    ]
      .filter(Boolean)
      .map((value) => `%${String(value)}%`);

    if (patterns.length === 0) return;

    const where = patterns.map(() => `payload LIKE ?`).join(' OR ');

    await db.runAsync(`DELETE FROM sync_queue WHERE ${where}`, patterns);
  } catch (error) {
    console.warn('[DB] Falha ao remover fila local superada pelo servidor:', error);
  }
};

const getVisitConflictDecision = async (visitId: string, localData: any, serverVisit: any) => {
  const localTime = getLocalVisitLastChangeMs(localData);
  const serverTime = getServerVisitLastChangeMs(serverVisit);
  const hasUnsyncedWork = await localVisitHasUnsyncedWork(visitId, localData);

  if (!localData) {
    return {
      winner: 'SERVER',
      localTime,
      serverTime,
      hasUnsyncedWork,
      reason: 'no-local-data',
    };
  }

  if (localTime > 0 && serverTime > 0) {
    if (localTime > serverTime) {
      return {
        winner: 'LOCAL',
        localTime,
        serverTime,
        hasUnsyncedWork,
        reason: 'local-newer',
      };
    }

    return {
      winner: 'SERVER',
      localTime,
      serverTime,
      hasUnsyncedWork,
      reason: serverTime > localTime ? 'server-newer' : 'same-time-server-source-of-truth',
    };
  }

  if (hasUnsyncedWork && localTime > 0 && !serverTime) {
    return {
      winner: 'LOCAL',
      localTime,
      serverTime,
      hasUnsyncedWork,
      reason: 'pending-local-no-server-time',
    };
  }

  return {
    winner: 'SERVER',
    localTime,
    serverTime,
    hasUnsyncedWork,
    reason: 'server-source-of-truth-fallback',
  };
};

const isMeaningfulPayloadValue = (value: any) => {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) return value.length > 0;

  if (typeof value === 'object') return Object.keys(value).length > 0;

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed || trimmed === '[]' || trimmed === '{}') return false;

    try {
      const parsed = JSON.parse(trimmed);

      if (Array.isArray(parsed)) return parsed.length > 0;
      if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0;

      return parsed !== null && parsed !== undefined && String(parsed).trim() !== '';
    } catch {
      return true;
    }
  }

  return true;
};

const pickFirstMeaningfulValue = (values: any[], fallback: any) => {
  for (const value of values) {
    if (isMeaningfulPayloadValue(value)) return value;
  }

  return fallback;
};

const getServerProjectConfigJson = (serverVisit: any) => {
  return safeStringify(
    pickFirstMeaningfulValue(
      [
        serverVisit?.project_config_json,
        serverVisit?.projectConfigJson,
        serverVisit?.project_config,
        serverVisit?.projectConfig,
      ],
      {}
    ),
    '{}'
  );
};

const getServerPesquisaJson = (serverVisit: any) => {
  return safeStringify(
    pickFirstMeaningfulValue(
      [
        serverVisit?.pesquisa_json,
        serverVisit?.pesquisaJson,
        serverVisit?.pesquisas,
      ],
      []
    ),
    '[]'
  );
};

const getServerProdutosJson = (serverVisit: any) => {
  return safeStringify(
    pickFirstMeaningfulValue(
      [
        serverVisit?.produtos_json,
        serverVisit?.produtosJson,
        serverVisit?.produtos,
      ],
      []
    ),
    '[]'
  );
};

const getServerStoreInsightsJson = (serverVisit: any) => {
  return safeStringify(
    pickFirstMeaningfulValue(
      [
        serverVisit?.store_insights_json,
        serverVisit?.storeInsightsJson,
        serverVisit?.store_insights,
        serverVisit?.storeInsights,
        serverVisit?.insights,
      ],
      []
    ),
    '[]'
  );
};

const mergeServerReadOnlyFieldsIntoLocalVisit = async (
  visitId: string,
  serverVisit: any,
  now: string
) => {
  try {
    const nextInsightsJson = getServerStoreInsightsJson(serverVisit);

    await db.runAsync(
      `
        UPDATE visits SET
          roteiro_id = ?,
          visita_id_json = ?,
          loja_id = ?,
          loja_nome = ?,
          bandeira = ?,
          rede = ?,
          loja_custom_data_json = ?,
          endereco = ?,
          data_programada = ?,
          hora_entrada_prevista = ?,
          hora_saida_prevista = ?,
          project_config_json = ?,
          pesquisa_json = ?,
          produtos_json = ?,
          store_insights_json = ?,
          pesquisa_realizada = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        String(serverVisit.roteiro_id || serverVisit.roteiroId || ''),
        String(serverVisit.visita_id_json || serverVisit.visitaIdJson || serverVisit.visitaAgendadaId || visitId),
        String(serverVisit.loja_id || serverVisit.lojaId || ''),
        String(serverVisit.loja_nome || serverVisit.lojaNome || serverVisit.nome_loja || ''),
        String(serverVisit.bandeira || ''),
        String(serverVisit.rede || ''),
        safeStringify(serverVisit.loja_custom_data || serverVisit.lojaCustomData, '{}'),
        String(serverVisit.endereco || ''),
        String(serverVisit.data_programada || serverVisit.dataProgramada || ''),
        String(serverVisit.hora_entrada_prevista || serverVisit.horaEntradaPrevista || serverVisit.hora_entrada || ''),
        String(serverVisit.hora_saida_prevista || serverVisit.horaSaidaPrevista || serverVisit.hora_saida || ''),
        getServerProjectConfigJson(serverVisit),
        getServerPesquisaJson(serverVisit),
        getServerProdutosJson(serverVisit),
        nextInsightsJson,
        serverVisit.pesquisa_realizada === 1 ||
        serverVisit.pesquisa_realizada === true ||
        ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(normalizeStatus(serverVisit.status))
          ? 1
          : 0,
        now,
        visitId,
      ]
    );
  } catch (error) {
    console.warn('[DB] Falha ao mesclar campos informativos da visita:', error);
  }
};

let isDbWriting = false;

export const saveRoteiroCompletoOffline = async (
  visits: any[] = [],
  otherTasks: any[] = [],
  thirdList: any[] = [],
  fourthList: any[] = [],
  pesquisas: any[] = []
) => {
  if (isDbWriting) return false;
  isDbWriting = true;

  const now = new Date().toISOString();

  try {
    await initializeDatabase();

    // O sync atual chama:
    // saveRoteiroCompletoOffline(visits, tasks, campanhas, scorecards, pesquisas)
    // Não podemos tentar adivinhar pelo formato, porque campanhas de performance
    // também podem ter "regras" e eram confundidas com scorecards quando
    // Perfect Store vinha vazio.
    const campanhas = safeParseArray(thirdList);
    const scorecards = safeParseArray(fourthList);

    await db.withTransactionAsync(async () => {
      const visitIdsFromServer: string[] = [];

      for (const v of safeParseArray(visits)) {
        const visitId = normalizeVisitId(v);
        visitIdsFromServer.push(visitId);

        const statusServidor = normalizeStatus(v.status);

        // Mirror sync correto:
        // - Se ainda existe item na sync_queue, preserva o estado local até conseguir enviar.
        // - Se NÃO existe fila pendente, o servidor é a fonte da verdade.
        // Isso evita o bug de ficar eternamente "EM_ANDAMENTO" depois que a visita foi resetada no web.
        const localData: any = await db.getFirstAsync(
          `SELECT * FROM visits WHERE id = ?`,
          [visitId]
        );

        const conflictDecision = await getVisitConflictDecision(visitId, localData, v);

        // Regra correta:
        // sempre vence quem fez o último ajuste, seja mobile ou web.
        //
        // Se o mobile fez uma justificativa às 17:45:00 e o web resetou/apagou às 17:45:01,
        // o servidor precisa vencer e a visita volta para PENDENTE.
        //
        // Se o mobile fez uma ação offline depois do último snapshot do servidor,
        // o local vence e preservamos status/check-in/check-out/fotos até sincronizar.
        if (conflictDecision.winner === 'LOCAL') {
          await mergeServerReadOnlyFieldsIntoLocalVisit(visitId, v, now);
          continue;
        }

        // Se o servidor venceu, qualquer operação local pendente daquela visita ficou obsoleta.
        // Removemos da fila para evitar que uma justificativa/check-in antigo seja reenviado
        // depois de o gestor já ter feito um ajuste mais recente no web.
        if (localData && conflictDecision.hasUnsyncedWork) {
          await deletePendingSyncQueueForVisit(visitId, localData);
        }
        const serverCheckinAt = v.checkin_at || v.checkinAt || v.data_checkin || v.entrada_at || null;
        const serverCheckoutAt = v.checkout_at || v.checkoutAt || v.data_checkout || v.saida_at || null;

        // Quando o servidor diz PENDENTE, limpamos horários locais.
        // Quando o servidor diz EM_ANDAMENTO/REALIZADA/JUSTIFICADA, preservamos local só como fallback
        // caso algum endpoint antigo ainda não devolva os horários.
        const serverIsOperational = isOperationalServerStatus(statusServidor);

        const finalCheckinAt = serverIsOperational ? (serverCheckinAt || localData?.checkin_at || null) : null;
        const finalCheckoutAt = serverIsOperational ? (serverCheckoutAt || localData?.checkout_at || null) : null;

        await db.runAsync(`DELETE FROM visits WHERE id = ?`, [visitId]);

        const statusRealizadoServidor =
          v.pesquisa_realizada === 1 ||
          v.pesquisa_realizada === true ||
          ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(statusServidor)
            ? 1
            : 0;

        const nextInsightsJson = getServerStoreInsightsJson(v);

        await db.runAsync(
          `INSERT INTO visits (
            id,
            roteiro_id,
            visita_id_json,
            loja_id,
            loja_nome,
            bandeira,
            rede,
            loja_custom_data_json,
            endereco,
            status,
            data_programada,
            hora_entrada_prevista,
            hora_saida_prevista,
            project_config_json,
            pesquisa_json,
            produtos_json,
            store_insights_json,
            pesquisa_realizada,
            pending_sync,
            checkin_at,
            checkout_at,
            latitude,
            longitude,
            foto_checkin_url,
            foto_checkout_url,
            foto_justificativa_url,
            justificativa_id,
            justificativa,
            detalhe_justificativa,
            client_operation_id,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            visitId,
            String(v.roteiro_id || v.roteiroId || ''),
            String(v.visita_id_json || v.visitaIdJson || v.visitaAgendadaId || visitId),
            String(v.loja_id || v.lojaId || ''),
            String(v.loja_nome || v.lojaNome || v.nome_loja || ''),
            String(v.bandeira || ''),
            String(v.rede || ''),
            safeStringify(v.loja_custom_data || v.lojaCustomData, '{}'),
            String(v.endereco || ''),
            statusServidor,
            String(v.data_programada || v.dataProgramada || ''),
            String(v.hora_entrada_prevista || v.horaEntradaPrevista || v.hora_entrada || ''),
            String(v.hora_saida_prevista || v.horaSaidaPrevista || v.hora_saida || ''),
            getServerProjectConfigJson(v),
            getServerPesquisaJson(v),
            getServerProdutosJson(v),
            nextInsightsJson,
            statusRealizadoServidor,
            finalCheckinAt,
            finalCheckoutAt,
            serverIsOperational ? (v.latitude ?? localData?.latitude ?? null) : (v.latitude ?? null),
            serverIsOperational ? (v.longitude ?? localData?.longitude ?? null) : (v.longitude ?? null),
            serverIsOperational ? (v.foto_checkin_url || v.fotoCheckinUrl || localData?.foto_checkin_url || null) : (v.foto_checkin_url || v.fotoCheckinUrl || null),
            serverIsOperational ? (v.foto_checkout_url || v.fotoCheckoutUrl || localData?.foto_checkout_url || null) : (v.foto_checkout_url || v.fotoCheckoutUrl || null),
            serverIsOperational ? (v.foto_justificativa_url || v.fotoJustificativaUrl || localData?.foto_justificativa_url || null) : (v.foto_justificativa_url || v.fotoJustificativaUrl || null),
            serverIsOperational ? (v.justificativa_id || v.justificativaId || localData?.justificativa_id || null) : (v.justificativa_id || v.justificativaId || null),
            serverIsOperational ? (v.justificativa || v.motivo || localData?.justificativa || null) : (v.justificativa || v.motivo || null),
            serverIsOperational ? (v.detalhe_justificativa || v.observacao || localData?.detalhe_justificativa || null) : (v.detalhe_justificativa || v.observacao || null),
            serverIsOperational ? (v.client_operation_id || v.clientOperationId || localData?.client_operation_id || null) : (v.client_operation_id || v.clientOperationId || null),
            now,
          ]
        );
      }

      for (const task of safeParseArray(otherTasks)) {
        await db.runAsync(
          `INSERT OR REPLACE INTO other_tasks (
            id,
            titulo,
            status,
            frequencia,
            data_vencimento,
            task_raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            String(task.id),
            String(task.titulo || task.nome || ''),
            normalizeStatus(task.status || 'PENDENTE'),
            String(task.frequencia || ''),
            String(task.data_vencimento || task.data_fim || task.deadline || ''),
            safeStringify(task, '{}'),
            now,
          ]
        );
      }

      for (const p of safeParseArray(pesquisas)) {
        await db.runAsync(
          `INSERT OR REPLACE INTO pesquisas (
            id,
            nome,
            titulo,
            frequencia,
            ativo,
            data_inicio,
            data_fim,
            pesquisa_raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(p.id),
            String(p.nome || p.titulo || ''),
            String(p.titulo || p.nome || ''),
            String(p.frequencia || ''),
            String(p.ativo ?? true),
            p.data_inicio || p.dataInicio || null,
            p.data_fim || p.dataFim || null,
            safeStringify(p, '{}'),
            now,
          ]
        );
      }

      // Campanhas e scorecards são snapshot do backend.
      // Primeiro limpa, depois salva exatamente o que veio no sync atual.
      await db.runAsync(`DELETE FROM scorecards`);
      await db.runAsync(`DELETE FROM campanhas_gamificacao`);

      for (const s of safeParseArray(scorecards)) {
        const scorecardId = String(
          s.id ||
            s.id_scorecard ||
            s.scorecardId ||
            s.scorecard_id ||
            s.perfectStoreId ||
            s.perfect_store_id ||
            ''
        ).trim();

        if (!scorecardId) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO scorecards (
            id,
            nome,
            ativo,
            data_inicio,
            data_fim,
            valor_atingido,
            valor_esperado,
            scorecard_raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            scorecardId,
            String(s.nome || s.nome_scorecard || s.name || s.titulo || s.title || ''),
            String(s.ativo ?? s.active ?? s.enabled ?? s.isActive ?? s.is_active ?? false),
            s.data_inicio ||
              s.dataInicio ||
              s.data_inicial ||
              s.dataInicial ||
              s.startDate ||
              s.start_date ||
              s.starts_at ||
              s.startsAt ||
              s.inicio ||
              null,
            s.data_fim ||
              s.dataFim ||
              s.data_final ||
              s.dataFinal ||
              s.endDate ||
              s.end_date ||
              s.ends_at ||
              s.endsAt ||
              s.fim ||
              null,
            Number(s.valor_atingido || s.valorAtingido || 0),
            Number(s.valor_esperado || s.valorEsperado || 0),
            safeStringify(s, '{}'),
            now,
          ]
        );
      }

      for (const c of safeParseArray(campanhas)) {
        const campanhaId = String(
          c.id ||
            c.id_campanha ||
            c.campanhaId ||
            c.campanha_id ||
            c.gamificationCampaignId ||
            c.gamification_campaign_id ||
            ''
        ).trim();

        if (!campanhaId) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO campanhas_gamificacao (
            id,
            nome,
            ativo,
            data_inicio,
            data_fim,
            perfisAlvo,
            campanha_raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            campanhaId,
            String(c.nome || c.nome_campanha || c.name || c.titulo || c.title || ''),
            String(c.ativo ?? c.active ?? c.enabled ?? c.isActive ?? c.is_active ?? false),
            c.data_inicio ||
              c.dataInicio ||
              c.data_inicial ||
              c.dataInicial ||
              c.startDate ||
              c.start_date ||
              c.starts_at ||
              c.startsAt ||
              c.inicio ||
              null,
            c.data_fim ||
              c.dataFim ||
              c.data_final ||
              c.dataFinal ||
              c.endDate ||
              c.end_date ||
              c.ends_at ||
              c.endsAt ||
              c.fim ||
              null,
            safeStringify(c.perfisAlvo || c.perfis_alvo || c.perfis_alvo_json || c.perfis || [], '[]'),
            safeStringify(c, '{}'),
            now,
          ]
        );
      }

      if (visitIdsFromServer.length > 0) {
        const placeholders = visitIdsFromServer.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM visits WHERE id NOT IN (${placeholders}) AND pending_sync = 0`,
          visitIdsFromServer
        );
      } else {
        await db.runAsync(`DELETE FROM visits WHERE pending_sync = 0`);
      }
    });

    await addAppLog({
      level: 'INFO',
      module: 'SYNC',
      action: 'SAVE_ROTEIRO_OFFLINE',
      message: 'Roteiro salvo no banco local.',
      metadata: {
        visits: safeParseArray(visits).length,
        otherTasks: safeParseArray(otherTasks).length,
        pesquisas: safeParseArray(pesquisas).length,
        scorecards: safeParseArray(scorecards).length,
        campanhas: safeParseArray(campanhas).length,
      },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao salvar roteiro offline:', error);

    await addAppLog({
      level: 'ERROR',
      module: 'SYNC',
      action: 'SAVE_ROTEIRO_OFFLINE_ERROR',
      message: 'Erro ao salvar roteiro no banco local.',
      metadata: { error: String((error as any)?.message || error) },
    });

    return false;
  } finally {
    isDbWriting = false;
  }
};

export const saveJustificativasOffline = async (justificativas: any[] = []) => {
  try {
    await initializeDatabase();

    const normalized = safeParseArray(justificativas)
      .map(normalizeJustificativa)
      .filter(Boolean) as any[];

    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      if (normalized.length > 0) {
        await db.runAsync(`DELETE FROM justificativas`);

        for (const item of normalized) {
          await db.runAsync(
            `INSERT OR REPLACE INTO justificativas (id, descricao, ativo, raw_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
            [
              item.id,
              item.descricao,
              String(item.ativo ?? true),
              safeStringify(item.raw_json || item, '{}'),
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
            [item.id, item.descricao, String(item.ativo), safeStringify(item, '{}'), now]
          );
        }
      }
    });

    await addAppLog({
      level: 'INFO',
      module: 'SYNC',
      action: 'SAVE_JUSTIFICATIVAS_OFFLINE',
      message: 'Justificativas salvas no banco local.',
      metadata: { total: normalized.length },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao salvar justificativas offline:', error);

    await addAppLog({
      level: 'ERROR',
      module: 'SYNC',
      action: 'SAVE_JUSTIFICATIVAS_OFFLINE_ERROR',
      message: 'Erro ao salvar justificativas no banco local.',
      metadata: { error: String((error as any)?.message || error) },
    });

    return false;
  }
};

export const getJustificativasOffline = async () => {
  try {
    await initializeDatabase();

    const rows = await db.getAllAsync(
      `SELECT * FROM justificativas WHERE ativo NOT IN ('false', '0', 'FALSE') ORDER BY descricao ASC`
    );

    if (rows && rows.length > 0) return rows;

    await saveJustificativasOffline([]);

    return await db.getAllAsync(
      `SELECT * FROM justificativas WHERE ativo NOT IN ('false', '0', 'FALSE') ORDER BY descricao ASC`
    );
  } catch (error) {
    console.error('[DB] Erro ao carregar justificativas offline:', error);
    return [
      { id: 'loja_fechada', descricao: 'Loja Fechada' },
      { id: 'demandas_extras', descricao: 'Demandas Extras' },
      { id: 'outro', descricao: 'Outro (Justifique)' },
    ];
  }
};


export const saveAlertsOffline = async (alerts: any[] = []) => {
  try {
    await initializeDatabase();

    const normalized = safeParseArray(alerts)
      .map(normalizeAlert)
      .filter(Boolean) as any[];

    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      for (const item of normalized) {
        const current: any = await db.getFirstAsync(
          `SELECT lida, lida_em, aceita_em FROM alerts WHERE id = ?`,
          [item.id]
        );

        const finalLida = current?.lida === 1 || item.lida ? 1 : 0;
        const finalLidaEm = current?.lida_em || item.lida_em || null;
        const finalAceitaEm = current?.aceita_em || item.aceita_em || null;

        await db.runAsync(
          `INSERT OR REPLACE INTO alerts (
            id,
            titulo,
            conteudo,
            remetente_nome,
            data_envio,
            prioridade,
            lida,
            lida_em,
            exige_aceite,
            aceita_em,
            raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.titulo,
            item.conteudo,
            item.remetente_nome,
            item.data_envio,
            item.prioridade,
            finalLida,
            finalLidaEm,
            item.exige_aceite ? 1 : 0,
            finalAceitaEm,
            safeStringify(item.raw_json || item, '{}'),
            now,
          ]
        );
      }

      // Remove somente alertas que vieram do servidor e não estão mais disponíveis,
      // preservando confirmações locais pendentes na sync_queue.
      if (normalized.length > 0) {
        const ids = normalized.map((item) => item.id);
        const placeholders = ids.map(() => '?').join(',');

        await db.runAsync(
          `DELETE FROM alerts 
           WHERE id NOT IN (${placeholders})
           AND id NOT IN (
             SELECT alerts.id
             FROM alerts
             INNER JOIN sync_queue ON sync_queue.payload LIKE '%' || alerts.id || '%'
           )`,
          ids
        );
      }
    });

    await addAppLog({
      level: 'INFO',
      module: 'SYNC',
      action: 'SAVE_ALERTS_OFFLINE',
      message: 'Alertas/comunicados salvos no banco local.',
      metadata: { total: normalized.length },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao salvar alertas offline:', error);

    await addAppLog({
      level: 'ERROR',
      module: 'SYNC',
      action: 'SAVE_ALERTS_OFFLINE_ERROR',
      message: 'Erro ao salvar alertas/comunicados no banco local.',
      metadata: { error: String((error as any)?.message || error) },
    });

    return false;
  }
};

export const getAlertsOffline = async () => {
  try {
    await initializeDatabase();

    return await db.getAllAsync(
      `
        SELECT * FROM alerts
        ORDER BY 
          CASE WHEN lida = 0 THEN 0 ELSE 1 END,
          datetime(data_envio) DESC
      `
    );
  } catch (error) {
    console.error('[DB] Erro ao carregar alertas offline:', error);
    return [];
  }
};

export const markAlertReadOffline = async (alertId: string, readAt: string = new Date().toISOString()) => {
  try {
    await initializeDatabase();

    await db.runAsync(
      `UPDATE alerts 
       SET lida = 1, lida_em = COALESCE(lida_em, ?), updated_at = ? 
       WHERE id = ?`,
      [readAt, readAt, alertId]
    );

    await addAppLog({
      level: 'INFO',
      module: 'ALERTS',
      action: 'MARK_ALERT_READ',
      message: 'Comunicado marcado como lido.',
      metadata: { alertId, readAt },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao marcar alerta como lido:', error);
    return false;
  }
};

export const markAlertAcknowledgedOffline = async (
  alertId: string,
  acknowledgedAt: string = new Date().toISOString()
) => {
  try {
    await initializeDatabase();

    await db.runAsync(
      `UPDATE alerts 
       SET lida = 1, 
           lida_em = COALESCE(lida_em, ?), 
           aceita_em = COALESCE(aceita_em, ?), 
           updated_at = ? 
       WHERE id = ?`,
      [acknowledgedAt, acknowledgedAt, acknowledgedAt, alertId]
    );

    await addAppLog({
      level: 'INFO',
      module: 'ALERTS',
      action: 'MARK_ALERT_ACKNOWLEDGED',
      message: 'Comunicado confirmado pelo usuário.',
      metadata: { alertId, acknowledgedAt },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao confirmar alerta:', error);
    return false;
  }
};

export const markVisitPendingSync = async (
  visitId: string,
  updates: Record<string, any> = {}
) => {
  try {
    await initializeDatabase();

    const fields: string[] = ['pending_sync = 1', 'updated_at = ?'];
    const values: any[] = [new Date().toISOString()];

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = ?`);
      values.push(value);
    });

    values.push(visitId);

    await db.runAsync(
      `UPDATE visits SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    await addAppLog({
      level: 'INFO',
      module: 'VISIT',
      action: 'MARK_VISIT_PENDING_SYNC',
      message: 'Visita marcada como pendente de sincronização.',
      metadata: { visitId, updates },
    });

    return true;
  } catch (error) {
    console.error('[DB] Erro ao marcar visita pendente:', error);

    await addAppLog({
      level: 'ERROR',
      module: 'VISIT',
      action: 'MARK_VISIT_PENDING_SYNC_ERROR',
      message: 'Erro ao marcar visita como pendente de sincronização.',
      metadata: { visitId, error: String((error as any)?.message || error) },
    });

    return false;
  }
};
