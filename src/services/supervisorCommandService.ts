import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './api';
import { getMobileProjectId } from '../utils/mobileRole';

// ============================================================================
// OMNI_SUPERVISOR_COMMAND_SERVICE_V1
//
// O Command Center é online-first, mas preserva o último snapshot para
// consulta quando a conexão oscilar.
// ============================================================================

export type SupervisorMember = {
  id: string;
  nome: string;
  email?: string;
  cargo?: string;
  roleName?: string;

  operationalStatus?: string;

  telemetry?: any;

  visits?: {
    planned?: number;
    total?: number;
    done?: number;
    inProgress?: number;
    pending?: number;
    percent?: number;
  };

  perfectStore?: {
    average?: number | null;
    audits30d?: number;
    latestLevel?: string | null;
    latestAt?: string | null;
  };

  performance?: {
    points30d?: number;
  };

  lastVisit?: {
    id?: string;
    storeId?: string;
    storeName?: string | null;
    status?: string;
    origin?: string;
    checkinAt?: string | null;
    checkoutAt?: string | null;
  } | null;
};

export type SupervisorCriticalStore = {
  id: string;
  nome: string;
  cidade?: string | null;
  bandeira?: string | null;
  perfectStore?: number;
  nivel?: string | null;
  ultimaAvaliacao?: string | null;
  audits30d?: number;
  critical?: boolean;
};

export type SupervisorCommandData = {
  version?: string;

  project?: {
    id?: string;
    name?: string;
    timezone?: string;
  };

  date?: string;

  scope?: {
    mode?: string;
    users?: number;
  };

  summary?: any;

  priorities?: any[];

  team?: SupervisorMember[];

  criticalStores?: SupervisorCriticalStore[];

  __cached?: boolean;

  __cachedAt?: string;
};

const cacheKey = (
  projectId: string,
  userId: string
) =>
  `OmniSupervisorCommand:${projectId}:${userId}`;

const readCache = async (
  projectId: string,
  userId: string
): Promise<SupervisorCommandData | null> => {
  try {
    const raw =
      await AsyncStorage.getItem(
        cacheKey(
          projectId,
          userId
        )
      );

    if (!raw) return null;

    const parsed =
      JSON.parse(raw);

    return {
      ...parsed?.data,
      __cached: true,
      __cachedAt:
        parsed?.cachedAt ||
        null
    };
  } catch {
    return null;
  }
};

const saveCache = async (
  projectId: string,
  userId: string,
  data: SupervisorCommandData
) => {
  try {
    await AsyncStorage.setItem(
      cacheKey(
        projectId,
        userId
      ),
      JSON.stringify({
        cachedAt:
          new Date().toISOString(),
        data
      })
    );
  } catch {}
};

export const fetchSupervisorCommand =
  async (
    user: any,
    options: {
      cacheOnly?: boolean;
      allowCacheFallback?: boolean;
    } = {}
  ): Promise<SupervisorCommandData> => {
    const projectId =
      getMobileProjectId(user);

    const userId =
      user?.id;

    if (
      !projectId ||
      !userId
    ) {
      throw new Error(
        'SUPERVISOR_CONTEXT_MISSING'
      );
    }

    const cached =
      await readCache(
        String(projectId),
        String(userId)
      );

    if (options.cacheOnly) {
      if (cached) {
        return cached;
      }

      throw new Error(
        'SUPERVISOR_CACHE_EMPTY'
      );
    }

    try {
      const response =
        await api(
          `/team/supervisor-command/${encodeURIComponent(
            String(projectId)
          )}?t=${Date.now()}`,
          {
            method: 'GET'
          }
        );

      const body =
        await response
          .json()
          .catch(
            () => ({})
          );

      if (!response.ok) {
        const message =
          body?.message ||
          body?.error ||
          `HTTP ${response.status}`;

        throw new Error(
          String(message)
        );
      }

      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        throw new Error(
          'SUPERVISOR_RESPONSE_INVALID'
        );
      }

      const normalized: SupervisorCommandData = {
        ...body,
        team:
          Array.isArray(body?.team)
            ? body.team
            : [],
        priorities:
          Array.isArray(body?.priorities)
            ? body.priorities
            : [],
        criticalStores:
          Array.isArray(body?.criticalStores)
            ? body.criticalStores
            : []
      };

      await saveCache(
        String(projectId),
        String(userId),
        normalized
      );

      return normalized;
    } catch (error) {
      if (
        options
          .allowCacheFallback !==
        false &&
        cached
      ) {
        return cached;
      }

      throw error;
    }
  };

const normalizeText = (
  value: any
) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

export const getFieldTeamMembers = (
  data: SupervisorCommandData | null,
  currentUserId?: string | null
) => {
  const list =
    Array.isArray(data?.team)
      ? data!.team!
      : [];

  return list.filter(
    member => {
      if (
        currentUserId &&
        String(member.id) ===
          String(currentUserId)
      ) {
        return false;
      }

      const role =
        normalizeText(
          [
            member.roleName,
            member.cargo
          ]
            .filter(Boolean)
            .join(' ')
        );

      /*
       * Command Center mostra equipe de execução.
       * O backend continua sendo a fronteira de segurança.
       */
      const management =
        [
          'ADMIN',
          'DIRETOR',
          'GERENTE',
          'COORDENADOR',
          'BACKOFFICE',
          'SUPERVISOR',
          'SUPORTE',
          'LIDER DE SUPORTE',
          'SUPPORT',
          'SUPPORT LEAD'
        ].some(
          key =>
            role.includes(key)
        );

      return !management;
    }
  );
};

const firstNumber = (
  ...values: any[]
): number | null => {
  for (
    const value of values
  ) {
    const number =
      Number(value);

    if (
      Number.isFinite(number)
    ) {
      return number;
    }
  }

  return null;
};

export const getMemberPosition = (
  member: SupervisorMember
) => {
  const source =
    Array.isArray(
      member?.telemetry
    )
      ? member.telemetry[0]
      : member?.telemetry ||
        {};

  const latitude =
    firstNumber(
      source?.latitude,
      source?.lat,
      source?.latitude_atual,
      source?.latitudeAtual,
      source?.last_latitude,
      source?.lastLatitude,
      source?.position?.latitude,
      source?.position?.lat
    );

  const longitude =
    firstNumber(
      source?.longitude,
      source?.lng,
      source?.lon,
      source?.longitude_atual,
      source?.longitudeAtual,
      source?.last_longitude,
      source?.lastLongitude,
      source?.position?.longitude,
      source?.position?.lng
    );

  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return {
    latitude,
    longitude,

    updatedAt:
      source?.updated_at ||
      source?.updatedAt ||
      source?.data_hora ||
      source?.timestamp ||
      source?.criado_em ||
      null
  };
};

export const calculateVisibleTeamSummary = (
  members: SupervisorMember[]
) => {
  const team =
    members || [];

  const visitsTotal =
    team.reduce(
      (
        total,
        member
      ) =>
        total +
        Number(
          member?.visits
            ?.total ||
          0
        ),
      0
    );

  const visitsDone =
    team.reduce(
      (
        total,
        member
      ) =>
        total +
        Number(
          member?.visits
            ?.done ||
          0
        ),
      0
    );

  const visitsInProgress =
    team.reduce(
      (
        total,
        member
      ) =>
        total +
        Number(
          member?.visits
            ?.inProgress ||
          0
        ),
      0
    );

  const psValues =
    team
      .map(
        member =>
          member?.perfectStore
            ?.average
      )
      .filter(
        value =>
          value !== null &&
          value !== undefined &&
          Number.isFinite(
            Number(value)
          )
      )
      .map(Number);

  return {
    teamTotal:
      team.length,

    activeMembers:
      team.filter(
        member =>
          member
            .operationalStatus !==
          'NOT_STARTED'
      ).length,

    visitsTotal,

    visitsDone,

    visitsInProgress,

    visitsPending:
      Math.max(
        0,
        visitsTotal -
          visitsDone -
          visitsInProgress
      ),

    visitsPercent:
      visitsTotal > 0
        ? Math.round(
            (
              visitsDone /
              visitsTotal
            ) *
            100
          )
        : 0,

    perfectStoreAverage:
      psValues.length
        ? Math.round(
            psValues.reduce(
              (
                sum,
                value
              ) =>
                sum + value,
              0
            ) /
            psValues.length
          )
        : null,

    performancePoints30d:
      team.reduce(
        (
          total,
          member
        ) =>
          total +
          Number(
            member
              ?.performance
              ?.points30d ||
            0
          ),
        0
      )
  };
};
