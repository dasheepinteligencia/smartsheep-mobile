import { api } from './api';
import {
  getDBConnection,
  initializeDatabase,
  addAppLog,
} from '../database/db';

// ============================================================================
// MOBILE_FIELD_PORTFOLIO_V1
//
// Fonte mobile da Carteira de Atendimento.
//
// Responsabilidades:
// - persistir a carteira recebida do web;
// - funcionar offline;
// - filtrar lojas pelo dia permitido;
// - gerar visita livre local com UUID estável;
// - reutilizar o motor existente de visita.
// ============================================================================

export type FieldVisitMode =
  | 'ROTEIRIZADO'
  | 'CARTEIRA_LIVRE'
  | 'HIBRIDO';

export type LocalFieldPortfolioStore = {
  project_id: string;
  user_id: string;
  loja_id: string;
  assignment_id?: string | null;
  loja_nome: string;
  endereco?: string;
  bandeira?: string;
  rede?: string;
  latitude?: number | null;
  longitude?: number | null;
  priority?: number;
  target_visits?: number | null;
  target_period_days?: number | null;
  allowed_weekdays?: string[];
  time_window_start?: string | null;
  time_window_end?: string | null;
  assigned?: boolean;
  active?: boolean;
  loja_raw?: any;
  assignment_raw?: any;
};

export type LocalFieldPortfolio = {
  projectId: string;
  userId: string;
  hasPortfolio: boolean;
  mode: FieldVisitMode;
  allowOutsidePortfolio: boolean;
  stores: LocalFieldPortfolioStore[];
  raw?: any;
};

const safeParse = (value: any, fallback: any = {}) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const safeArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {}
  }

  return [];
};

const normalizeBoolean = (value: any) => {
  if (value === true || value === 1) return true;

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return [
    'true',
    '1',
    'yes',
    'sim',
    'active',
    'ativo',
    'ativa',
  ].includes(normalized);
};

const normalizeMode = (value: any): FieldVisitMode => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === 'CARTEIRA_LIVRE') {
    return 'CARTEIRA_LIVRE';
  }

  if (normalized === 'HIBRIDO') {
    return 'HIBRIDO';
  }

  return 'ROTEIRIZADO';
};

const getStoreId = (value: any) =>
  String(
    value?.lojaId ||
      value?.loja_id ||
      value?.storeId ||
      value?.store_id ||
      value?.loja?.id ||
      value?.store?.id ||
      value?.id ||
      ''
  ).trim();

const getStoreName = (value: any) =>
  String(
    value?.lojaNome ||
      value?.loja_nome ||
      value?.storeName ||
      value?.store_name ||
      value?.loja?.nome ||
      value?.loja?.name ||
      value?.store?.nome ||
      value?.store?.name ||
      value?.nome ||
      value?.name ||
      ''
  ).trim();

const getMainProjectId = (user: any) =>
  user?.allowed_project_ids?.[0] ||
  user?.allowedProjectIds?.[0] ||
  user?.projectId ||
  user?.project_id ||
  user?.projeto_id ||
  null;

export const getFieldPortfolioProjectId =
  getMainProjectId;

const getTodayKey = () => {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(
    now.getMonth() + 1
  ).padStart(2, '0');
  const dd = String(
    now.getDate()
  ).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
};

const getWeekdayKey = (
  value: Date = new Date()
) =>
  [
    'SUN',
    'MON',
    'TUE',
    'WED',
    'THU',
    'FRI',
    'SAT',
  ][value.getDay()];

const normalizeWeekdays = (
  value: any
): string[] =>
  safeArray(value)
    .map((item) =>
      String(item || '')
        .trim()
        .toUpperCase()
    )
    .filter(Boolean);

const isActiveStore = (store: any) => {
  if (
    store?.ativa === false ||
    store?.ativo === false ||
    store?.active === false
  ) {
    return false;
  }

  const status = String(
    store?.status || ''
  )
    .trim()
    .toUpperCase();

  return ![
    'INATIVO',
    'INATIVA',
    'INACTIVE',
    'DISABLED',
    'EXCLUIDO',
    'EXCLUÍDO',
    'DELETED',
  ].includes(status);
};

const ensureStorage = async () => {
  await initializeDatabase();

  const db = await getDBConnection();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS field_portfolio_state (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      has_portfolio INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'ROTEIRIZADO',
      allow_outside_portfolio INTEGER DEFAULT 0,
      raw_json TEXT,
      catalog_json TEXT,
      project_config_json TEXT,
      updated_at TEXT,
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS field_portfolio_stores (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      loja_id TEXT NOT NULL,
      assignment_id TEXT,
      loja_nome TEXT,
      endereco TEXT,
      bandeira TEXT,
      rede TEXT,
      latitude REAL,
      longitude REAL,
      priority INTEGER DEFAULT 50,
      target_visits INTEGER,
      target_period_days INTEGER,
      allowed_weekdays_json TEXT,
      time_window_start TEXT,
      time_window_end TEXT,
      assigned INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      loja_raw_json TEXT,
      assignment_raw_json TEXT,
      updated_at TEXT,
      PRIMARY KEY (project_id, user_id, loja_id)
    );

    CREATE INDEX IF NOT EXISTS idx_field_portfolio_state_user
      ON field_portfolio_state(user_id, project_id);

    CREATE INDEX IF NOT EXISTS idx_field_portfolio_store_user
      ON field_portfolio_stores(user_id, project_id);

    CREATE INDEX IF NOT EXISTS idx_field_portfolio_store_active
      ON field_portfolio_stores(active);
  `);

  return db;
};

const getAllPortfolioAssignments = (
  payload: any
) =>
  safeArray(
    payload?.stores ||
      payload?.portfolio?.stores ||
      payload?.assignments ||
      payload?.portfolioStores ||
      payload?.portfolio_stores
  );

const normalizeAssignment = (
  assignment: any,
  allStores: any[]
): LocalFieldPortfolioStore | null => {
  const nestedStore =
    assignment?.loja ||
    assignment?.store ||
    assignment?.lojaData ||
    assignment?.storeData ||
    {};

  const lojaId =
    getStoreId(assignment) ||
    getStoreId(nestedStore);

  if (!lojaId) return null;

  const catalogStore =
    allStores.find(
      (item: any) =>
        getStoreId(item) === lojaId
    ) || {};

  const loja = {
    ...catalogStore,
    ...nestedStore,
  };

  const allowedWeekdays =
    normalizeWeekdays(
      assignment?.allowedWeekdays ||
        assignment?.allowed_weekdays ||
        assignment?.diasPermitidos ||
        assignment?.dias_permitidos
    );

  const active =
    assignment?.active === false ||
    assignment?.ativo === false
      ? false
      : isActiveStore(loja);

  return {
    project_id: '',
    user_id: '',
    loja_id: lojaId,

    assignment_id:
      assignment?.id ||
      assignment?.assignmentId ||
      assignment?.assignment_id ||
      null,

    loja_nome:
      getStoreName(loja) ||
      getStoreName(assignment) ||
      'Loja',

    endereco: String(
      loja?.endereco ||
        loja?.address ||
        loja?.logradouro ||
        assignment?.endereco ||
        ''
    ),

    bandeira: String(
      loja?.bandeira ||
        assignment?.bandeira ||
        ''
    ),

    rede: String(
      loja?.rede ||
        assignment?.rede ||
        ''
    ),

    latitude:
      loja?.latitude ??
      loja?.lat ??
      assignment?.latitude ??
      null,

    longitude:
      loja?.longitude ??
      loja?.lng ??
      loja?.lon ??
      assignment?.longitude ??
      null,

    priority:
      Number(
        assignment?.priority ??
          assignment?.prioridade ??
          50
      ) || 50,

    target_visits:
      assignment?.targetVisits ??
      assignment?.target_visits ??
      null,

    target_period_days:
      assignment?.targetPeriodDays ??
      assignment?.target_period_days ??
      null,

    allowed_weekdays:
      allowedWeekdays,

    time_window_start:
      assignment?.timeWindowStart ??
      assignment?.time_window_start ??
      null,

    time_window_end:
      assignment?.timeWindowEnd ??
      assignment?.time_window_end ??
      null,

    assigned: true,
    active,

    loja_raw: loja,
    assignment_raw: assignment,
  };
};

const normalizeOutsideStore = (
  store: any
): LocalFieldPortfolioStore | null => {
  const lojaId = getStoreId(store);

  if (
    !lojaId ||
    !isActiveStore(store)
  ) {
    return null;
  }

  return {
    project_id: '',
    user_id: '',
    loja_id: lojaId,
    assignment_id: null,
    loja_nome:
      getStoreName(store) ||
      'Loja',
    endereco: String(
      store?.endereco ||
        store?.address ||
        store?.logradouro ||
        ''
    ),
    bandeira: String(
      store?.bandeira || ''
    ),
    rede: String(
      store?.rede || ''
    ),
    latitude:
      store?.latitude ??
      store?.lat ??
      null,
    longitude:
      store?.longitude ??
      store?.lng ??
      store?.lon ??
      null,
    priority: 50,
    target_visits: null,
    target_period_days: null,
    allowed_weekdays: [],
    time_window_start: null,
    time_window_end: null,
    assigned: false,
    active: true,
    loja_raw: store,
    assignment_raw: null,
  };
};

export const saveFieldPortfolioOffline =
  async (
    payload: any,
    allStores: any[],
    projectId: string,
    userId: string,
    mobileCatalog: any = {},
    projectConfig: any = {}
  ) => {
    const db =
      await ensureStorage();

    const mode =
      normalizeMode(
        payload?.mode ||
          payload?.portfolio?.mode
      );

    const hasPortfolio =
      payload?.hasPortfolio === true ||
      Boolean(
        payload?.portfolio?.id ||
          payload?.id
      );

    const allowOutsidePortfolio =
      normalizeBoolean(
        payload?.allowOutsidePortfolio ??
          payload?.portfolio
            ?.allowOutsidePortfolio
      );

    const assigned =
      getAllPortfolioAssignments(
        payload
      )
        .map((item) =>
          normalizeAssignment(
            item,
            allStores
          )
        )
        .filter(Boolean) as LocalFieldPortfolioStore[];

    const assignedIds =
      new Set(
        assigned.map(
          (item) =>
            String(item.loja_id)
        )
      );

    const outside =
      allowOutsidePortfolio
        ? safeArray(allStores)
            .map(
              normalizeOutsideStore
            )
            .filter(Boolean)
            .filter(
              (item: any) =>
                !assignedIds.has(
                  String(
                    item.loja_id
                  )
                )
            )
        : [];

    const stores = [
      ...assigned,
      ...outside,
    ];

    const now =
      new Date().toISOString();

    await db.withTransactionAsync(
      async () => {
        await db.runAsync(
          `
            INSERT OR REPLACE INTO field_portfolio_state (
              project_id,
              user_id,
              has_portfolio,
              mode,
              allow_outside_portfolio,
              raw_json,
              catalog_json,
              project_config_json,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            String(projectId),
            String(userId),
            hasPortfolio ? 1 : 0,
            mode,
            allowOutsidePortfolio
              ? 1
              : 0,
            JSON.stringify(
              payload || {}
            ),
            JSON.stringify(
              mobileCatalog || {}
            ),
            JSON.stringify(
              projectConfig || {}
            ),
            now,
          ]
        );

        await db.runAsync(
          `
            DELETE FROM field_portfolio_stores
            WHERE project_id = ?
              AND user_id = ?
          `,
          [
            String(projectId),
            String(userId),
          ]
        );

        if (
          mode ===
            'ROTEIRIZADO' ||
          !hasPortfolio
        ) {
          return;
        }

        for (
          const item of stores
        ) {
          await db.runAsync(
            `
              INSERT OR REPLACE INTO field_portfolio_stores (
                project_id,
                user_id,
                loja_id,
                assignment_id,
                loja_nome,
                endereco,
                bandeira,
                rede,
                latitude,
                longitude,
                priority,
                target_visits,
                target_period_days,
                allowed_weekdays_json,
                time_window_start,
                time_window_end,
                assigned,
                active,
                loja_raw_json,
                assignment_raw_json,
                updated_at
              ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `,
            [
              String(projectId),
              String(userId),
              String(item.loja_id),
              item.assignment_id
                ? String(
                    item.assignment_id
                  )
                : null,
              item.loja_nome,
              item.endereco || '',
              item.bandeira || '',
              item.rede || '',
              item.latitude ?? null,
              item.longitude ?? null,
              Number(
                item.priority ?? 50
              ),
              item.target_visits ??
                null,
              item.target_period_days ??
                null,
              JSON.stringify(
                item.allowed_weekdays ||
                  []
              ),
              item.time_window_start ??
                null,
              item.time_window_end ??
                null,
              item.assigned === false
                ? 0
                : 1,
              item.active === false
                ? 0
                : 1,
              JSON.stringify(
                item.loja_raw || {}
              ),
              JSON.stringify(
                item.assignment_raw ||
                  {}
              ),
              now,
            ]
          );
        }
      }
    );

    await addAppLog({
      level: 'INFO',
      module:
        'FIELD_PORTFOLIO',
      action:
        'SAVE_PORTFOLIO_OFFLINE',
      message:
        'Carteira de atendimento salva offline.',
      metadata: {
        projectId,
        userId,
        mode,
        allowOutsidePortfolio,
        stores: stores.length,
        assigned:
          assigned.length,
      },
    }).catch(() => {});

    return {
      mode,
      hasPortfolio,
      allowOutsidePortfolio,
      stores,
    };
  };

export const syncFieldPortfolioOffline =
  async (
    projectId: string,
    userId: string,
    allStores: any[],
    mobileCatalog: any = {},
    projectConfig: any = {},
    urlTS: number = Date.now(),
    fetchOptions: any = {}
  ) => {
    try {
      const response =
        await api(
          `/field-portfolio/me/${encodeURIComponent(
            String(projectId)
          )}?t=${urlTS}`,
          fetchOptions
        );

      if (!response.ok) {
        await addAppLog({
          level: 'WARNING',
          module:
            'FIELD_PORTFOLIO',
          action:
            'SYNC_PORTFOLIO_HTTP_ERROR',
          message:
            'Não foi possível atualizar a carteira de atendimento.',
          metadata: {
            projectId,
            userId,
            status:
              response.status,
          },
        }).catch(() => {});

        return null;
      }

      const payload =
        await response.json();

      return await saveFieldPortfolioOffline(
        payload,
        allStores,
        projectId,
        userId,
        mobileCatalog,
        projectConfig
      );
    } catch (error: any) {
      await addAppLog({
        level: 'WARNING',
        module:
          'FIELD_PORTFOLIO',
        action:
          'SYNC_PORTFOLIO_ERROR',
        message:
          'Falha de rede ao atualizar a carteira de atendimento.',
        metadata: {
          projectId,
          userId,
          error:
            String(
              error?.message ||
                error
            ),
        },
      }).catch(() => {});

      return null;
    }
  };

export const getFieldPortfolioOffline =
  async (
    projectId: string,
    userId: string
  ): Promise<LocalFieldPortfolio> => {
    const db =
      await ensureStorage();

    const state: any =
      await db.getFirstAsync(
        `
          SELECT *
          FROM field_portfolio_state
          WHERE project_id = ?
            AND user_id = ?
          LIMIT 1
        `,
        [
          String(projectId),
          String(userId),
        ]
      );

    if (!state) {
      return {
        projectId:
          String(projectId),
        userId:
          String(userId),
        hasPortfolio: false,
        mode: 'ROTEIRIZADO',
        allowOutsidePortfolio:
          false,
        stores: [],
      };
    }

    const rows: any[] =
      await db.getAllAsync(
        `
          SELECT *
          FROM field_portfolio_stores
          WHERE project_id = ?
            AND user_id = ?
            AND COALESCE(active, 1) = 1
          ORDER BY
            COALESCE(assigned, 1) DESC,
            COALESCE(priority, 50) DESC,
            loja_nome ASC
        `,
        [
          String(projectId),
          String(userId),
        ]
      );

    return {
      projectId:
        String(projectId),
      userId:
        String(userId),
      hasPortfolio:
        Number(
          state.has_portfolio ||
            0
        ) === 1,
      mode:
        normalizeMode(
          state.mode
        ),
      allowOutsidePortfolio:
        Number(
          state.allow_outside_portfolio ||
            0
        ) === 1,
      raw:
        safeParse(
          state.raw_json,
          {}
        ),
      stores:
        rows.map(
          (row: any) => ({
            ...row,
            priority:
              Number(
                row.priority ??
                  50
              ),
            target_visits:
              row.target_visits ==
              null
                ? null
                : Number(
                    row.target_visits
                  ),
            target_period_days:
              row.target_period_days ==
              null
                ? null
                : Number(
                    row.target_period_days
                  ),
            allowed_weekdays:
              normalizeWeekdays(
                row.allowed_weekdays_json
              ),
            assigned:
              Number(
                row.assigned ??
                  1
              ) === 1,
            active:
              Number(
                row.active ??
                  1
              ) === 1,
            loja_raw:
              safeParse(
                row.loja_raw_json,
                {}
              ),
            assignment_raw:
              safeParse(
                row.assignment_raw_json,
                {}
              ),
          })
        ),
    };
  };

export const getEligiblePortfolioStores =
  (
    portfolio:
      LocalFieldPortfolio,
    date:
      Date = new Date()
  ) => {
    if (
      ![
        'CARTEIRA_LIVRE',
        'HIBRIDO',
      ].includes(
        portfolio.mode
      )
    ) {
      return [];
    }

    const weekday =
      getWeekdayKey(date);

    return (
      portfolio.stores || []
    ).filter((store) => {
      if (
        store.active === false
      ) {
        return false;
      }

      /*
       * Loja fora da carteira pode ser
       * usada quando o projeto permite.
       * Como não possui assignment,
       * não há restrição de weekday.
       */
      if (
        store.assigned === false
      ) {
        return (
          portfolio
            .allowOutsidePortfolio ===
          true
        );
      }

      const allowed =
        normalizeWeekdays(
          store.allowed_weekdays
        );

      return (
        allowed.length === 0 ||
        allowed.includes(
          weekday
        )
      );
    });
  };

const generateUuidV4 = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(
      /[xy]/g,
      (char) => {
        const random =
          Math.floor(
            Math.random() * 16
          );

        const value =
          char === 'x'
            ? random
            : (
                random & 0x3
              ) | 0x8;

        return value.toString(16);
      }
    );
};

const isSurveyActiveToday = (
  row: any,
  raw: any,
  today: string
) => {
  const active =
    raw?.ativo ??
    raw?.active ??
    row?.ativo ??
    true;

  if (
    active === false ||
    String(active)
      .trim()
      .toLowerCase() ===
      'false' ||
    String(active).trim() ===
      '0'
  ) {
    return false;
  }

  const frequency =
    String(
      raw?.frequencia ||
        raw?.frequency ||
        row?.frequencia ||
        ''
    )
      .trim()
      .toUpperCase();

  if (
    !(
      frequency ===
        'POR_VISITA' ||
      frequency ===
        'POR VISITA' ||
      frequency ===
        'PER_VISIT' ||
      frequency ===
        'PER VISIT'
    )
  ) {
    return false;
  }

  const start =
    String(
      raw?.data_inicio ||
        raw?.dataInicio ||
        raw?.startDate ||
        row?.data_inicio ||
        ''
    ).substring(0, 10);

  const end =
    String(
      raw?.data_fim ||
        raw?.dataFim ||
        raw?.endDate ||
        row?.data_fim ||
        ''
    ).substring(0, 10);

  if (
    start &&
    start !== 'undefined' &&
    start !== 'null' &&
    today < start
  ) {
    return false;
  }

  if (
    end &&
    end !== 'undefined' &&
    end !== 'null' &&
    !end.startsWith('2099') &&
    today > end
  ) {
    return false;
  }

  return true;
};

export const createFreePortfolioVisitDraft =
  async ({
    projectId,
    userId,
    user,
    store,
  }: {
    projectId: string;
    userId: string;
    user: any;
    store: LocalFieldPortfolioStore;
  }) => {
    const db =
      await ensureStorage();

    const today =
      getTodayKey();

    /*
     * Se o usuário abriu a loja e voltou
     * antes de finalizar, reutilizamos o
     * mesmo UUID.
     *
     * Uma visita concluída NÃO é
     * reutilizada: novo toque cria uma
     * nova visita legítima no mesmo dia.
     */
    const existing: any =
      await db.getFirstAsync(
        `
          SELECT *
          FROM visits
          WHERE loja_id = ?
            AND substr(
              COALESCE(
                data_programada,
                ''
              ),
              1,
              10
            ) = ?
            AND UPPER(
              COALESCE(
                field_visit_mode,
                ''
              )
            ) = 'CARTEIRA_LIVRE'
            AND UPPER(
              COALESCE(
                status,
                ''
              )
            ) IN (
              'PENDENTE',
              'AGENDADA',
              'EM_ANDAMENTO',
              'INICIADA'
            )
          ORDER BY
            datetime(
              COALESCE(
                updated_at,
                checkin_at,
                data_programada
              )
            ) DESC
          LIMIT 1
        `,
        [
          String(
            store.loja_id
          ),
          today,
        ]
      );

    if (existing?.id) {
      return existing;
    }

    const state: any =
      await db.getFirstAsync(
        `
          SELECT *
          FROM field_portfolio_state
          WHERE project_id = ?
            AND user_id = ?
          LIMIT 1
        `,
        [
          String(projectId),
          String(userId),
        ]
      );

    const catalog =
      safeParse(
        state?.catalog_json,
        {}
      );

    const savedProjectConfig =
      safeParse(
        state?.project_config_json,
        {}
      );

    const custom =
      safeParse(
        user?.custom_data ||
          user?.customData,
        {}
      );

    const profileProject =
      custom?.perfil_mobile
        ?.project ||
      custom?.perfilMobile
        ?.project ||
      custom?.project ||
      {};

    const surveysRows: any[] =
      await db.getAllAsync(
        `
          SELECT *
          FROM pesquisas
        `
      );

    const surveys =
      surveysRows
        .map((row: any) => {
          const raw =
            safeParse(
              row.pesquisa_raw_json,
              row
            );

          return {
            row,
            raw,
          };
        })
        .filter(({ row, raw }) =>
          isSurveyActiveToday(
            row,
            raw,
            today
          )
        )
        .map(({ raw }) => raw);

    const lojaRaw =
      store.loja_raw || {};

    const latitude =
      store.latitude ??
      lojaRaw?.latitude ??
      lojaRaw?.lat ??
      null;

    const longitude =
      store.longitude ??
      lojaRaw?.longitude ??
      lojaRaw?.lng ??
      lojaRaw?.lon ??
      null;

    const gpsRadius =
      lojaRaw?.raio ??
      lojaRaw?.gpsRadius ??
      lojaRaw?.gps_radius ??
      savedProjectConfig
        ?.gpsRadius ??
      profileProject
        ?.gpsRadius ??
      null;

    const id =
      generateUuidV4();

    const now =
      new Date().toISOString();

    const projectConfig = {
      ...savedProjectConfig,
      ...profileProject,

      projectId:
        String(projectId),

      fieldVisitMode:
        'CARTEIRA_LIVRE',

      field_visit_mode:
        'CARTEIRA_LIVRE',

      carteiraLivre: true,
      carteira_livre: true,

      origem:
        'CARTEIRA_LIVRE',

      portfolioStoreId:
        store.assignment_id ||
        store.loja_id,

      allowOutsidePortfolio:
        Number(
          state
            ?.allow_outside_portfolio ||
            0
        ) === 1,

      loja_lat:
        latitude,

      loja_lng:
        longitude,

      gpsRadius,

      mobile_catalog:
        catalog || {},
    };

    await db.runAsync(
      `
        INSERT INTO visits (
          id,
          roteiro_id,
          visita_id_json,
          registro_visita_id,
          field_visit_mode,
          origem,
          portfolio_store_id,
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
          checkin_at,
          checkout_at,
          latitude,
          longitude,
          client_operation_id,
          updated_at,
          pending_sync
        ) VALUES (
          ?, NULL, NULL, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, '', '',
          ?, ?, ?, '[]', 0, NULL, NULL,
          ?, ?, NULL, ?, 0
        )
      `,
      [
        id,
        id,
        'CARTEIRA_LIVRE',
        'CARTEIRA_LIVRE',
        store.assignment_id ||
          store.loja_id,
        String(
          store.loja_id
        ),
        store.loja_nome,
        store.bandeira || '',
        store.rede || '',
        JSON.stringify(
          lojaRaw || {}
        ),
        store.endereco || '',
        'PENDENTE',
        today,
        JSON.stringify(
          projectConfig
        ),
        JSON.stringify(
          surveys
        ),
        JSON.stringify(
          safeArray(
            catalog?.produtos ||
              catalog?.products
          )
        ),
        latitude,
        longitude,
        now,
      ]
    );

    await addAppLog({
      level: 'INFO',
      module:
        'FIELD_PORTFOLIO',
      action:
        'CREATE_FREE_VISIT_DRAFT',
      message:
        'Visita livre preparada localmente.',
      metadata: {
        id,
        projectId,
        userId,
        lojaId:
          store.loja_id,
        lojaNome:
          store.loja_nome,
        surveys:
          surveys.length,
      },
    }).catch(() => {});

    return await db.getFirstAsync(
      `SELECT * FROM visits WHERE id = ?`,
      [id]
    );
  };
