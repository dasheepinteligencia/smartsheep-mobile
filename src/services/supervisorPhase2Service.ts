import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from './api';
import { getMobileProjectId } from '../utils/mobileRole';

export type SupervisorTaskItem = {
  id: string;
  type?: string;
  surveyId?: string | null;
  title?: string;
  storeId?: string | null;
  storeName?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  rawStatus?: string | null;
  status?: 'PENDING' | 'OVERDUE' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | string;
  currentCount?: number;
  repeatable?: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type SupervisorJourneyItem = {
  id: string;
  scheduledVisitId?: string | null;
  actualVisitId?: string | null;
  source?: string | null;
  sequence?: number;
  storeId?: string | null;
  storeName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  storeLatitude?: number | null;
  storeLongitude?: number | null;
  status?: 'DONE' | 'IN_PROGRESS' | 'UPCOMING' | 'OVERDUE' | 'JUSTIFIED' | string;
  rawStatus?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  checkinAt?: string | null;
  checkoutAt?: string | null;
  actualCheckinLatitude?: number | null;
  actualCheckinLongitude?: number | null;
  actualCheckoutLatitude?: number | null;
  actualCheckoutLongitude?: number | null;
};

export type SupervisorPhase2Member = {
  userId: string;
  name: string;
  roleName?: string | null;
  operationalStatus?: string;
  currentPosition?: {
    latitude: number;
    longitude: number;
    capturedAt?: string | null;
    lastSyncAt?: string | null;
    gpsEnabled?: boolean | null;
  } | null;
  counts?: {
    done?: number;
    inProgress?: number;
    upcoming?: number;
    overdue?: number;
    justified?: number;
  };
  journey?: SupervisorJourneyItem[];
};

export type SupervisorPhase2Data = {
  project?: {
    id?: string;
    name?: string;
    timezone?: string;
  };
  date?: string;
  isToday?: boolean;
  scope?: {
    mode?: string | null;
    usersCount?: number;
  };
  myTasks?: {
    pending?: number;
    dueToday?: number;
    overdue?: number;
    items?: SupervisorTaskItem[];
  };
  map?: {
    date?: string;
    members?: SupervisorPhase2Member[];
  };
  __cached?: boolean;
  __cachedAt?: string | null;
};

export type SupervisorHistoryDetail = {
  perfectStore: any[];
  performance: any[];
};

const normalizeText = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const isManagementRole = (roleName: any) => {
  const role = normalizeText(roleName);

  return [
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
  ].some(key => role.includes(key));
};

const phase2CacheKey = (
  projectId: string,
  userId: string,
  date: string
) => `OmniSupervisorPhase2:${projectId}:${userId}:${date}`;

const readPhase2Cache = async (
  projectId: string,
  userId: string,
  date: string
): Promise<SupervisorPhase2Data | null> => {
  try {
    const raw = await AsyncStorage.getItem(
      phase2CacheKey(projectId, userId, date)
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      ...parsed?.data,
      __cached: true,
      __cachedAt: parsed?.cachedAt || null
    };
  } catch {
    return null;
  }
};

const savePhase2Cache = async (
  projectId: string,
  userId: string,
  date: string,
  data: SupervisorPhase2Data
) => {
  try {
    await AsyncStorage.setItem(
      phase2CacheKey(projectId, userId, date),
      JSON.stringify({
        cachedAt: new Date().toISOString(),
        data
      })
    );
  } catch {}
};

export const getSupervisorDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const shiftSupervisorDateKey = (
  dateKey: string,
  days: number
) => {
  const [year, month, day] = String(dateKey)
    .split('-')
    .map(Number);

  const date = new Date(
    Number(year),
    Math.max(0, Number(month) - 1),
    Number(day),
    12,
    0,
    0,
    0
  );

  date.setDate(date.getDate() + days);
  return getSupervisorDateKey(date);
};

export const formatSupervisorDate = (
  dateKey: string,
  language = 'pt-BR'
) => {
  const [year, month, day] = String(dateKey)
    .split('-')
    .map(Number);

  const date = new Date(
    Number(year),
    Math.max(0, Number(month) - 1),
    Number(day),
    12,
    0,
    0,
    0
  );

  return new Intl.DateTimeFormat(
    language === 'en-US' || language === 'es-ES'
      ? language
      : 'pt-BR',
    {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }
  ).format(date);
};

export const fetchSupervisorPhase2 = async (
  user: any,
  date = getSupervisorDateKey(),
  options: {
    cacheOnly?: boolean;
    allowCacheFallback?: boolean;
  } = {}
): Promise<SupervisorPhase2Data> => {
  const projectId = getMobileProjectId(user);
  const userId = user?.id;

  if (!projectId || !userId) {
    throw new Error('SUPERVISOR_PHASE2_CONTEXT_MISSING');
  }

  const cached = await readPhase2Cache(
    String(projectId),
    String(userId),
    String(date)
  );

  if (options.cacheOnly) {
    if (cached) return cached;
    throw new Error('SUPERVISOR_PHASE2_CACHE_EMPTY');
  }

  try {
    const response = await api(
      `/team/supervisor-phase2/${encodeURIComponent(
        String(projectId)
      )}?date=${encodeURIComponent(String(date))}&t=${Date.now()}`,
      { method: 'GET' }
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        String(
          body?.message ||
            body?.error ||
            `HTTP ${response.status}`
        )
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('SUPERVISOR_PHASE2_RESPONSE_INVALID');
    }

    const normalized: SupervisorPhase2Data = {
      ...body,
      myTasks: {
        ...(body?.myTasks || {}),
        items: Array.isArray(body?.myTasks?.items)
          ? body.myTasks.items
          : []
      },
      map: {
        ...(body?.map || {}),
        members: Array.isArray(body?.map?.members)
          ? body.map.members
          : []
      }
    };

    await savePhase2Cache(
      String(projectId),
      String(userId),
      String(date),
      normalized
    );

    return normalized;
  } catch (error) {
    if (options.allowCacheFallback !== false && cached) {
      return cached;
    }
    throw error;
  }
};

export const getPhase2FieldMembers = (
  data: SupervisorPhase2Data | null,
  currentUserId?: string | null
) => {
  const members = Array.isArray(data?.map?.members)
    ? data!.map!.members!
    : [];

  return members.filter(member => {
    if (
      currentUserId &&
      String(member.userId) === String(currentUserId)
    ) {
      return false;
    }

    return !isManagementRole(member.roleName);
  });
};

const firstArray = (...values: any[]): any[] => {
  let firstEmpty: any[] | null = null;

  for (const value of values) {
    if (!Array.isArray(value)) continue;
    if (value.length > 0) return value;
    if (!firstEmpty) firstEmpty = value;
  }

  return firstEmpty || [];
};

export const fetchSupervisorMemberHistory = async (
  user: any,
  memberId: string
): Promise<SupervisorHistoryDetail> => {
  const projectId = getMobileProjectId(user);

  if (!projectId || !memberId) {
    throw new Error('SUPERVISOR_HISTORY_CONTEXT_MISSING');
  }

  const t = Date.now();

  const [psResponse, performanceResponse] = await Promise.all([
    api(
      `/perfect-store/historico-mobile/${encodeURIComponent(
        String(projectId)
      )}/${encodeURIComponent(String(memberId))}?limit=20&t=${t}`,
      { method: 'GET' }
    ),
    api(
      `/gamification/extrato/${encodeURIComponent(
        String(projectId)
      )}/${encodeURIComponent(String(memberId))}?page=1&limit=20&t=${t}`,
      { method: 'GET' }
    )
  ]);

  const psBody = await psResponse.json().catch(() => ({}));
  const performanceBody = await performanceResponse
    .json()
    .catch(() => ({}));

  const perfectStore = psResponse.ok
    ? firstArray(
        psBody,
        psBody?.items,
        psBody?.historico,
        psBody?.history,
        psBody?.data,
        psBody?.data?.items,
        psBody?.data?.historico,
        psBody?.data?.history,
        psBody?.rows,
        psBody?.results
      )
    : [];

  const performance = performanceResponse.ok
    ? firstArray(
        performanceBody?.transacoes,
        performanceBody?.data?.transacoes,
        performanceBody?.items,
        performanceBody?.extrato,
        performanceBody?.history,
        performanceBody?.data?.items,
        performanceBody?.data?.extrato,
        performanceBody?.data?.history,
        performanceBody?.rows,
        performanceBody?.results,
        performanceBody,
        performanceBody?.data
      )
    : [];

  return {
    perfectStore,
    performance
  };
};
