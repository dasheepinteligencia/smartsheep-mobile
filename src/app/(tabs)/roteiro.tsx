import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  ChevronRight,
  ArrowLeft,
  Clock,
  AlertCircle,
  CheckCircle2,
  Lock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react-native';
import { getDBConnection, initializeDatabase } from '../../database/db';
import { useSettingsStore } from '../../store/useSettingsStore';
import { getStatusColors } from '../../utils/statusUtils';
import { globalSync } from '../../services/syncService';
import { useSyncStore } from '../../store/useSyncStore';
import { i18n } from '../../utils/i18n';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/useAuthStore';

// MOBILE_FIELD_PORTFOLIO_V1
import {
  createFreePortfolioVisitDraft,
  getEligiblePortfolioStores,
  getFieldPortfolioOffline,
  getFieldPortfolioProjectId,
} from '../../services/fieldPortfolioService';

// ============================================================================
// 🎯 MOTOR DE ESTILO DE STORE INSIGHTS
// ============================================================================
const priorityMapping: Record<string, any> = {
  ALTA: { color: '#EF4444', icon: AlertCircle, label: i18n.t('priorityHigh') },
  MEDIA: { color: '#F59E0B', icon: AlertCircle, label: i18n.t('priorityMedium') },
  BAIXA: { color: '#3B82F6', icon: AlertCircle, label: i18n.t('priorityLow') },
};

const ROUTE_TEXTS = {
  'pt-BR': {
    taskSurveyDefault: 'Pesquisa da visita',
    taskStoreNotInformed: 'Loja não informada',
    taskAvailableOnlyInVisit: 'Disponível somente dentro da visita',
    taskQuestions: 'perguntas',
    taskInStore: 'NA LOJA',
    taskAnswerInVisit: 'Responder na visita',
    taskLinkedVisitTitle: 'Pesquisa vinculada à visita',
    taskLinkedVisitMessage:
      'Este survey deve ser respondido dentro da visita da loja {{store}}.\n\nEntre na loja pela aba Visitas para realizar o check-in e responder.',
    understood: 'Entendi',
    loadRouteError: 'Não foi possível carregar o roteiro local.',
    refreshRouteError: 'Não foi possível atualizar os dados agora. Tente novamente em instantes.',
    scheduled: 'Agendado',
    done: 'Realizado',
    entry: 'Entrada',
    exit: 'Saída',
    entryRegistered: 'Entrada registrada',
    exitRegistered: 'Saída registrada',
    late: 'Atrasado',
    early: 'Adiantado',
    onTime: 'No horário',
    overdue: 'Atrasada',
    dueToday: 'Vence hoje',
    dueIn: 'Vence em',
    days: 'dias',
    noDeadline: 'Sem vencimento',
    frequencyDaily: 'DIÁRIA',
    frequencyWeekly: 'SEMANAL',
    frequencyBiweekly: 'QUINZENAL',
    frequencyMonthly: 'MENSAL',
    frequencyUnique: 'ÚNICA',
    frequencyPerVisit: 'POR VISITA',
    frequencyStandalone: 'AVULSA',
    standaloneTasksGroup: 'Tarefas avulsas',
    visitTasksGroup: 'Tarefas da visita',
    standaloneTasksGroupHint: 'Podem ser respondidas diretamente aqui',
    visitTasksGroupHint: 'Respondidas dentro do check-in da loja',
    focus: 'Foco',
    routineSurveys: 'pesquisas de rotina',

    // MOBILE_FIELD_PORTFOLIO_V1
    portfolioTab: 'Minha Carteira',
    portfolioBadge: 'CARTEIRA LIVRE',
    portfolioAvailable: 'Disponível para visita',
    portfolioVisitedToday: 'Visitada hoje',
    portfolioInProgress: 'Visita em andamento',
    portfolioEmpty: 'Nenhuma loja da carteira está disponível para hoje.',
    portfolioPriority: 'Prioridade',
    portfolioFrequency: 'Meta',
    portfolioWindow: 'Janela',
    portfolioStores: 'Carteira',
  },
  'en-US': {
    taskSurveyDefault: 'Visit survey',
    taskStoreNotInformed: 'Store not informed',
    taskAvailableOnlyInVisit: 'Available only inside the visit',
    taskQuestions: 'questions',
    taskInStore: 'IN STORE',
    taskAnswerInVisit: 'Answer in visit',
    taskLinkedVisitTitle: 'Survey linked to visit',
    taskLinkedVisitMessage:
      'This survey must be answered inside the visit for store {{store}}.\n\nOpen the store from the Visits tab, check in, and answer it there.',
    understood: 'Got it',
    loadRouteError: 'Unable to load the local route.',
    refreshRouteError: 'Unable to refresh data now. Please try again shortly.',
    scheduled: 'Scheduled',
    done: 'Done',
    entry: 'Check-in',
    exit: 'Check-out',
    entryRegistered: 'Check-in registered',
    exitRegistered: 'Check-out registered',
    late: 'Late',
    early: 'Early',
    onTime: 'On time',
    overdue: 'Overdue',
    dueToday: 'Due today',
    dueIn: 'Due in',
    days: 'days',
    noDeadline: 'No deadline',
    frequencyDaily: 'DAILY',
    frequencyWeekly: 'WEEKLY',
    frequencyBiweekly: 'BIWEEKLY',
    frequencyMonthly: 'MONTHLY',
    frequencyUnique: 'ONE-TIME',
    frequencyPerVisit: 'PER VISIT',
    frequencyStandalone: 'STANDALONE',
    standaloneTasksGroup: 'Standalone tasks',
    visitTasksGroup: 'Visit tasks',
    standaloneTasksGroupHint: 'Can be answered directly here',
    visitTasksGroupHint: 'Answered inside the store check-in',
    focus: 'Focus',
    routineSurveys: 'routine surveys',

    // MOBILE_FIELD_PORTFOLIO_V1
    portfolioTab: 'My Portfolio',
    portfolioBadge: 'FREE PORTFOLIO',
    portfolioAvailable: 'Available for visit',
    portfolioVisitedToday: 'Visited today',
    portfolioInProgress: 'Visit in progress',
    portfolioEmpty: 'No portfolio stores are available today.',
    portfolioPriority: 'Priority',
    portfolioFrequency: 'Target',
    portfolioWindow: 'Window',
    portfolioStores: 'Portfolio',
  },
  'es-ES': {
    taskSurveyDefault: 'Encuesta de la visita',
    taskStoreNotInformed: 'Tienda no informada',
    taskAvailableOnlyInVisit: 'Disponible solo dentro de la visita',
    taskQuestions: 'preguntas',
    taskInStore: 'EN TIENDA',
    taskAnswerInVisit: 'Responder en la visita',
    taskLinkedVisitTitle: 'Encuesta vinculada a la visita',
    taskLinkedVisitMessage:
      'Esta encuesta debe responderse dentro de la visita de la tienda {{store}}.\n\nAbre la tienda desde la pestaña Visitas, haz check-in y responde allí.',
    understood: 'Entendido',
    loadRouteError: 'No fue posible cargar la ruta local.',
    refreshRouteError: 'No fue posible actualizar los datos ahora. Inténtalo nuevamente en unos instantes.',
    scheduled: 'Programado',
    done: 'Realizado',
    entry: 'Entrada',
    exit: 'Salida',
    entryRegistered: 'Entrada registrada',
    exitRegistered: 'Salida registrada',
    late: 'Retrasado',
    early: 'Adelantado',
    onTime: 'A tiempo',
    overdue: 'Vencida',
    dueToday: 'Vence hoy',
    dueIn: 'Vence en',
    days: 'días',
    noDeadline: 'Sin vencimiento',
    frequencyDaily: 'DIARIA',
    frequencyWeekly: 'SEMANAL',
    frequencyBiweekly: 'QUINCENAL',
    frequencyMonthly: 'MENSUAL',
    frequencyUnique: 'ÚNICA',
    frequencyPerVisit: 'POR VISITA',
    frequencyStandalone: 'INDEPENDIENTE',
    standaloneTasksGroup: 'Tareas independientes',
    visitTasksGroup: 'Tareas de visita',
    standaloneTasksGroupHint: 'Se pueden responder directamente aquí',
    visitTasksGroupHint: 'Se responden dentro del check-in de la tienda',
    focus: 'Foco',
    routineSurveys: 'encuestas de rutina',

    // MOBILE_FIELD_PORTFOLIO_V1
    portfolioTab: 'Mi Cartera',
    portfolioBadge: 'CARTERA LIBRE',
    portfolioAvailable: 'Disponible para visita',
    portfolioVisitedToday: 'Visitada hoy',
    portfolioInProgress: 'Visita en curso',
    portfolioEmpty: 'No hay tiendas de la cartera disponibles para hoy.',
    portfolioPriority: 'Prioridad',
    portfolioFrequency: 'Meta',
    portfolioWindow: 'Ventana',
    portfolioStores: 'Cartera',
  },
} as const;

type RouteTextKey = keyof typeof ROUTE_TEXTS['pt-BR'];

const rt = (key: RouteTextKey, language: string, params?: Record<string, string>) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  let value = ROUTE_TEXTS[lang][key];

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(`{{${paramKey}}}`, paramValue);
    });
  }

  return value;
};

const normalizeFrequencyKey = (value: any): RouteTextKey => {
  const freq = String(value || '').trim().toUpperCase();

  if (!freq) return 'frequencyStandalone';
  if (freq.includes('DIARIA') || freq.includes('DIÁRIA') || freq === 'DAILY') return 'frequencyDaily';
  if (freq.includes('SEMANAL') || freq === 'WEEKLY') return 'frequencyWeekly';
  if (freq.includes('QUINZENAL') || freq.includes('BIWEEKLY') || freq.includes('QUINCENAL')) return 'frequencyBiweekly';
  if (freq.includes('MENSAL') || freq === 'MONTHLY') return 'frequencyMonthly';
  if (freq.includes('POR_VISITA') || freq.includes('POR VISITA') || freq.includes('PER VISIT')) return 'frequencyPerVisit';
  if (freq.includes('UNICA') || freq.includes('ÚNICA') || freq === 'UNIQUE' || freq === 'ONE_TIME' || freq === 'ONE-TIME') return 'frequencyUnique';

  return 'frequencyStandalone';
};

const getFrequencyLabel = (value: any, language: string) => rt(normalizeFrequencyKey(value), language);

const makeTaskGroupHeader = (
  id: string,
  title: string,
  subtitle: string,
  count: number
) => ({
  __type: 'TASK_GROUP_HEADER',
  id,
  title,
  subtitle,
  count,
});

const isSystemConfigTask = (task: any, raw: any = {}) => {
  const haystack = [
    task?.titulo,
    task?.nome,
    task?.descricao,
    task?.task_type,
    task?.tipo,
    task?.origem,
    raw?.titulo,
    raw?.nome,
    raw?.descricao,
    raw?.task_type,
    raw?.tipo,
    raw?.origem,
    raw?.payload_type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('system config payload') ||
    haystack.includes('system_config') ||
    haystack.includes('config payload') ||
    haystack.includes('configuração do sistema') ||
    haystack.includes('configuracao do sistema') ||
    raw?.isSystemConfigTask === true ||
    raw?.is_system_config_task === true ||
    task?.isSystemConfigTask === 1 ||
    task?.is_system_config_task === 1
  );
};

const getInsightPriorityStyles = (priority: string, isDark: boolean) => {
  const mapping = priorityMapping[priority?.toUpperCase()] || priorityMapping.BAIXA;
  const bgOpacity = isDark ? 0.2 : 0.05;

  return {
    color: mapping.color,
    bgColor: `${mapping.color}${Math.floor(bgOpacity * 255).toString(16).padStart(2, '0')}`,
    Icon: mapping.icon,
    label: mapping.label,
  };
};

const getLocalDateKey = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

const createLocalDate = (dateString?: string | null) => {
  if (!dateString) return null;

  const clean = String(dateString).substring(0, 10);
  const [y, m, d] = clean.split('-').map(Number);

  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d, 12, 0, 0);
};

const normalizeStatus = (status: any) => {
  const s = String(status || 'PENDENTE').toUpperCase();

  if (s === 'AGENDADA') return 'PENDENTE';
  if (s === 'COMPLETA' || s === 'CONCLUIDA' || s === 'VISITADA') return 'REALIZADA';

  return s;
};

const isDoneStatus = (status: any) => {
  return ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(
    String(status || '').toUpperCase()
  );
};

const safeParseJson = (value: any, fallback: any = {}) => {
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

const getLocaleByLanguage = (language?: string) => {
  if (language === 'en-US') return 'en-US';
  if (language === 'es-ES') return 'es-ES';
  return 'pt-BR';
};

const formatDateByLanguage = (date: Date | null, language?: string) => {
  if (!date) return '';

  return date.toLocaleDateString(getLocaleByLanguage(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getCleanAddress = (rawVal: any) => {
  if (!rawVal || rawVal === 'undefined' || rawVal === 'null') return '';

  let str = String(rawVal).trim();

  if (str.includes('|CFG')) str = str.split('|CFG')[0];

  return str.replace(/\|$/, '').trim();
};



const normalizeRouteTabParam = (
  value: any
): 'VISITAS' | 'CARTEIRA' | 'TAREFAS' | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  const tab = String(raw || '').trim().toUpperCase();

  if (tab === 'VISITAS' || tab === 'VISITS') return 'VISITAS';

  if (
    tab === 'CARTEIRA' ||
    tab === 'PORTFOLIO' ||
    tab === 'MINHA_CARTEIRA'
  ) {
    return 'CARTEIRA';
  }

  if (tab === 'TAREFAS' || tab === 'TASKS') return 'TAREFAS';

  return null;
};

const formatHourMinute = (value?: any, language?: string) => {
  if (!value || value === 'undefined' || value === 'null') return '--:--';

  const raw = String(value).trim();

  if (!raw) return '--:--';

  if (/^\d{1,2}:\d{2}/.test(raw)) {
    return raw.substring(0, 5);
  }

  try {
    const d = new Date(raw);

    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString(getLocaleByLanguage(language), {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  } catch {}

  return raw.substring(0, 5);
};

const getMinutesFromTime = (value?: any) => {
  if (!value || value === 'undefined' || value === 'null') return null;

  const label = formatHourMinute(value);
  const [h, m] = label.split(':').map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  return h * 60 + m;
};

const getMinutesFromDateTime = (value?: any) => {
  if (!value || value === 'undefined' || value === 'null') return null;

  try {
    const d = new Date(String(value));

    if (isNaN(d.getTime())) return null;

    return d.getHours() * 60 + d.getMinutes();
  } catch {
    return null;
  }
};

const formatDurationFromMinutes = (minutes: number) => {
  const abs = Math.abs(minutes);

  if (abs < 60) return `${abs}m`;

  const h = Math.floor(abs / 60);
  const m = abs % 60;

  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
};

const getDiffBadge = (planned: any, actual: any, language: string, tolerance = 15) => {
  const plannedMinutes = getMinutesFromTime(planned);
  const actualMinutes = getMinutesFromDateTime(actual);

  if (plannedMinutes === null || actualMinutes === null) return null;

  const diff = actualMinutes - plannedMinutes;
  const diffText = formatDurationFromMinutes(diff);

  if (diff > tolerance) {
    return {
      label: `${rt('late', language)} ${diffText}`,
      color: '#EF4444',
      bgLight: 'rgba(239, 68, 68, 0.1)',
      bgDark: 'rgba(239, 68, 68, 0.2)',
    };
  }

  if (diff < -tolerance) {
    return {
      label: `${rt('early', language)} ${diffText}`,
      color: '#3B82F6',
      bgLight: 'rgba(59, 130, 246, 0.1)',
      bgDark: 'rgba(59, 130, 246, 0.2)',
    };
  }

  return {
    label: rt('onTime', language),
    color: '#10B981',
    bgLight: 'rgba(16, 185, 129, 0.1)',
    bgDark: 'rgba(16, 185, 129, 0.2)',
  };
};

const getVisitDurationLabel = (checkinAt?: any, checkoutAt?: any) => {
  if (!checkinAt || !checkoutAt) return null;

  try {
    const start = new Date(String(checkinAt));
    const end = new Date(String(checkoutAt));

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    const diffMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

    return formatDurationFromMinutes(diffMinutes);
  } catch {
    return null;
  }
};


const normalizeSurveyTitle = (value?: any, language: string = 'pt-BR') => {
  const title = String(value || '').trim();

  if (!title || title === 'undefined' || title === 'null') {
    return rt('taskSurveyDefault', language);
  }

  return title;
};

const getSurveyIdFromQuestion = (question: any) => {
  return (
    question?.pesquisaId ||
    question?.pesquisa_id ||
    question?.formularioId ||
    question?.formulario_id ||
    question?.surveyId ||
    question?.survey_id ||
    null
  );
};

const getSurveyTitleFromQuestion = (question: any) => {
  return (
    question?.pesquisaTitulo ||
    question?.pesquisa_titulo ||
    question?.formularioTitulo ||
    question?.formulario_titulo ||
    question?.surveyTitle ||
    question?.survey_title ||
    question?.tituloPesquisa ||
    question?.titulo_pesquisa ||
    question?.titulo ||
    question?.nome ||
    null
  );
};

// ============================================================
// MOBILE_FIELD_PORTFOLIO_METRICS_V2
//
// Carteira Livre:
// - existência na carteira NÃO é visita pendente;
// - só vira execução operacional após CHECK-IN;
// - estado de tarefa pode ser obtido pelas coletas locais,
//   inclusive depois de sincronizadas.
// ============================================================

const isPortfolioFreeVisitForMobile = (visit: any) => {
  const config =
    safeParseJson(
      visit?.project_config_json ||
      visit?.projectConfig ||
      {},
      {}
    );

  return (
    String(
      visit?.field_visit_mode ||
      visit?.fieldVisitMode ||
      config?.field_visit_mode ||
      config?.fieldVisitMode ||
      ''
    )
      .trim()
      .toUpperCase() ===
      'CARTEIRA_LIVRE' ||
    String(
      visit?.origem ||
      config?.origem ||
      ''
    )
      .trim()
      .toUpperCase() ===
      'CARTEIRA_LIVRE'
  );
};

const hasStartedPortfolioFreeVisitForMobile = (
  visit: any
) => {
  if (
    !isPortfolioFreeVisitForMobile(
      visit
    )
  ) {
    return true;
  }

  const status =
    normalizeStatus(
      visit?.status ||
      ''
    );

  return (
    Boolean(
      visit?.checkin_at ||
      visit?.checkinAt ||
      visit?.data_checkin ||
      visit?.entrada_at
    ) ||
    [
      'EM_ANDAMENTO',
      'INICIADA',
      'REALIZADA',
      'COMPLETA',
      'CONCLUIDA',
      'CONCLUÍDA',
      'VISITADA'
    ].includes(status)
  );
};

const getPortfolioCollectionCountsForMobile = (
  visit: any,
  coletas: any[] = []
) => {
  const counts =
    new Map<string, number>();

  if (
    !isPortfolioFreeVisitForMobile(
      visit
    )
  ) {
    return counts;
  }

  const visitIds =
    new Set(
      [
        visit?.id,
        visit?.registro_visita_id,
        visit?.registroVisitaId,
        visit?.visita_id,
        visit?.visitaId
      ]
        .map(
          (value) =>
            String(
              value ?? ''
            ).trim()
        )
        .filter(
          (value) =>
            value &&
            value !== 'null' &&
            value !== 'undefined'
        )
    );

  (coletas || []).forEach(
    (row: any) => {
      const raw =
        safeParseJson(
          row?.raw_json ||
          row?.payload ||
          {},
          {}
        );

      const status =
        String(
          row?.status ||
          raw?.status ||
          ''
        )
          .trim()
          .toUpperCase();

      if (
        [
          'ERRO_SYNC',
          'EXCLUIDA',
          'EXCLUÍDA',
          'DELETED',
          'CANCELADA',
          'CANCELLED'
        ].includes(status)
      ) {
        return;
      }

      const collectionVisitIds =
        [
          row?.visita_id,
          row?.visitaId,

          raw?.registroVisitaId,
          raw?.registro_visita_id,

          raw?.visitaId,
          raw?.visita_id,

          raw?.offline_id
        ]
          .map(
            (value) =>
              String(
                value ?? ''
              ).trim()
          )
          .filter(Boolean);

      const belongs =
        collectionVisitIds.some(
          (value) =>
            visitIds.has(value)
        );

      if (!belongs) return;

      const surveyId =
        String(
          row?.pesquisa_id ||
          row?.pesquisaId ||
          raw?.pesquisa_id ||
          raw?.pesquisaId ||
          raw?.surveyId ||
          raw?.survey_id ||
          ''
        ).trim();

      if (!surveyId) return;

      counts.set(
        surveyId,
        (
          counts.get(
            surveyId
          ) || 0
        ) + 1
      );
    }
  );

  return counts;
};

// MOBILE_ROUTE_REAL_SURVEY_STATE_V1
const extractVisitSurveys = (
  visit: any,
  pesquisaById: Record<string, any>,
  language: string,
  coletas: any[] = []
) => {
  const parsed =
    safeParseJson(
      visit?.pesquisa_json,
      []
    );

  const surveysMap =
    new Map<
      string,
      {
        id: string;
        titulo: string;
        qtdPerguntas: number;
        status: string;
        repetivel: boolean;
        currentCount: number;
      }
    >();

  const routeBool = (
    value: any
  ) => {
    if (
      value === true ||
      value === 1
    ) {
      return true;
    }

    return [
      'true',
      '1',
      'sim',
      'yes'
    ].includes(
      String(value || '')
        .trim()
        .toLowerCase()
    );
  };

  const resolveSurveyStatus = (
    source: any,
    repeatable: boolean,
    currentCount: number
  ) => {
    const explicit = String(
      source?.status ||
        source?.statusOnline ||
        ''
    )
      .trim()
      .toUpperCase();

    if (explicit) {
      return normalizeStatus(
        explicit
      );
    }

    const completed =
      routeBool(
        source?.concluida
      ) ||
      routeBool(
        source?.completed
      ) ||
      routeBool(
        source?.realizada
      );

    if (completed) {
      return 'REALIZADA';
    }

    if (
      repeatable &&
      currentCount > 0
    ) {
      return 'EM_ANDAMENTO';
    }

    return 'PENDENTE';
  };

  if (Array.isArray(parsed)) {
    parsed.forEach(
      (
        item: any,
        index: number
      ) => {
        const directId =
          item?.id ||
          item?.pesquisaId ||
          item?.pesquisa_id ||
          item?.formularioId ||
          item?.formulario_id ||
          item?.surveyId ||
          item?.survey_id;

        const questions =
          item?.perguntas ||
          item?.questions ||
          item?.questoes ||
          [];

        const hasQuestions =
          Array.isArray(
            questions
          );

        if (
          directId &&
          (
            item?.titulo ||
            item?.nome ||
            hasQuestions
          )
        ) {
          const id =
            String(directId);

          const currentCount =
            Number(
              item?.currentCount ??
                item?.current_count ??
                item?.coletasCount ??
                item?.coletas_count ??
                0
            ) || 0;

          const repetivel =
            routeBool(
              item?.repetivel
            ) ||
            routeBool(
              item?.repeatable
            );

          surveysMap.set(
            id,
            {
              id,
              titulo:
                normalizeSurveyTitle(
                  item?.titulo ||
                    item?.nome ||
                    pesquisaById[id]
                      ?.titulo ||
                    pesquisaById[id]
                      ?.nome,
                  language
                ),

              qtdPerguntas:
                Array.isArray(
                  questions
                )
                  ? questions.length
                  : 0,

              status:
                resolveSurveyStatus(
                  item,
                  repetivel,
                  currentCount
                ),

              repetivel,

              currentCount
            }
          );

          return;
        }

        const questionSurveyId =
          getSurveyIdFromQuestion(
            item
          ) ||
          visit?.pesquisa_id ||
          visit?.pesquisaId ||
          `visit_survey_${index}`;

        const id =
          String(
            questionSurveyId
          );

        const current =
          surveysMap.get(id);

        const currentCount =
          Math.max(
            Number(
              current?.currentCount ||
                0
            ),
            Number(
              item?.currentCount ??
                item?.current_count ??
                0
            ) || 0
          );

        const repetivel =
          Boolean(
            current?.repetivel
          ) ||
          routeBool(
            item?.repetivel
          ) ||
          routeBool(
            item?.repeatable
          );

        surveysMap.set(
          id,
          {
            id,

            titulo:
              current?.titulo ||
              normalizeSurveyTitle(
                getSurveyTitleFromQuestion(
                  item
                ) ||
                  pesquisaById[id]
                    ?.titulo ||
                  pesquisaById[id]
                    ?.nome,
                language
              ),

            qtdPerguntas:
              (
                current
                  ?.qtdPerguntas ||
                0
              ) + 1,

            status:
              resolveSurveyStatus(
                item,
                repetivel,
                currentCount
              ),

            repetivel,

            currentCount
          }
        );
      }
    );
  }

  const fallbackSurveyId =
    visit?.pesquisa_id ||
    visit?.pesquisaId;

  if (
    surveysMap.size === 0 &&
    fallbackSurveyId
  ) {
    const id =
      String(
        fallbackSurveyId
      );

    surveysMap.set(
      id,
      {
        id,

        titulo:
          normalizeSurveyTitle(
            pesquisaById[id]
              ?.titulo ||
              pesquisaById[id]
                ?.nome,
            language
          ),

        qtdPerguntas:
          0,

        status:
          'PENDENTE',

        repetivel:
          false,

        currentCount:
          0
      }
    );
  }

  /*
   * MOBILE_FIELD_PORTFOLIO_METRICS_V2
   *
   * Visita livre não é recebida novamente pelo /meu-roteiro.
   * Portanto seu pesquisa_json pode continuar com o estado
   * original PENDENTE mesmo depois de a coleta existir.
   *
   * Para Carteira Livre, a coleta local é evidência operacional
   * suficiente para atualizar somente a VISUALIZAÇÃO da tarefa.
   */
  if (
    isPortfolioFreeVisitForMobile(
      visit
    )
  ) {
    const collectionCounts =
      getPortfolioCollectionCountsForMobile(
        visit,
        coletas
      );

    const visitClosed =
      Boolean(
        visit?.checkout_at ||
        visit?.checkoutAt
      ) ||
      isDoneStatus(
        normalizeStatus(
          visit?.status
        )
      );

    surveysMap.forEach(
      (
        survey,
        surveyId
      ) => {
        const count =
          collectionCounts.get(
            String(
              surveyId
            )
          ) || 0;

        if (count <= 0) {
          return;
        }

        surveysMap.set(
          surveyId,
          {
            ...survey,

            currentCount:
              Math.max(
                Number(
                  survey.currentCount ||
                  0
                ),
                count
              ),

            status:
              survey.repetivel &&
              !visitClosed
                ? 'EM_ANDAMENTO'
                : 'REALIZADA'
          }
        );
      }
    );
  }

  return Array.from(
    surveysMap.values()
  );
};


const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isSqlitePrepareTransientError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();

  return (
    message.includes('nativedatabase.prepareasync') ||
    message.includes('nullpointerexception') ||
    message.includes('database is locked') ||
    message.includes('database not open')
  );
};

const runWithDbRetry = async <T,>(operation: () => Promise<T>, retries: number = 2): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await initializeDatabase();

      if (attempt > 0) {
        await sleep(120 * attempt);
      }

      return await operation();
    } catch (error) {
      lastError = error;

      if (!isSqlitePrepareTransientError(error) || attempt === retries) {
        throw error;
      }

      await sleep(180 * (attempt + 1));
    }
  }

  throw lastError;
};

// MOBILE_FIELD_PORTFOLIO_V1
export default function RoteiroScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { theme, language, accentColor } = useSettingsStore();
  const { lastSync } = useSyncStore();
  const { user } = useAuthStore();
  const isDark = theme === 'dark';

  if (language) {
    i18n.locale = language;
  }

  const bg = isDark ? '#020617' : '#F8FAFC';
  const surface = isDark ? '#0F172A' : '#FFFFFF';
  const surfaceAlt = isDark ? '#111827' : '#F1F5F9';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const accent = accentColor || '#FF7A00';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const statusBarBg = bg;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] =
    useState<
      'VISITAS' |
      'CARTEIRA' |
      'TAREFAS'
    >('VISITAS');

  const [searchQuery, setSearchQuery] = useState('');

  const [visits, setVisits] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  // MOBILE_FIELD_PORTFOLIO_V1
  const [fieldPortfolio, setFieldPortfolio] =
    useState<any>({
      mode: 'ROTEIRIZADO',
      hasPortfolio: false,
      allowOutsidePortfolio: false,
      stores: [],
    });

  const [portfolioStores, setPortfolioStores] =
    useState<any[]>([]);

  // =========================================================================
  // 🎯 SISTEMA DE MODAL CUSTOMIZADO (PADRÃO DO APP)
  // =========================================================================
  const [customAlert, setCustomAlert] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'warning' | 'error' | 'info',
    primaryText: 'OK',
    primaryAction: null as any,
  });

  const showCustomAlert = (
    title: string,
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info',
    primaryText = 'OK',
    primaryAction: any = null
  ) => {
    setCustomAlert({ visible: true, title, message, type, primaryText, primaryAction });
  };

  const hideCustomAlert = () => setCustomAlert((prev) => ({ ...prev, visible: false }));

  const getTodayDate = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const getTodayStr = () => getLocalDateKey(new Date());

  useEffect(() => {
    const requestedTab = normalizeRouteTabParam(params?.tab);

    if (requestedTab) {
      setActiveTab(requestedTab);
      setSearchQuery('');
    }
  }, [params?.tab]);

  useFocusEffect(
    useCallback(() => {
      const requestedTab = normalizeRouteTabParam(params?.tab);

      if (requestedTab) {
        setActiveTab(requestedTab);
        setSearchQuery('');
      }
    }, [params?.tab])
  );

  const getDeadlineDate = useCallback((item: any): Date | null => {
    if (item.data_vencimento && item.data_vencimento !== '') {
      return createLocalDate(item.data_vencimento);
    }

    if (!item.frequencia) return null;

    let baseDateStr = getTodayStr();
    const dateSource = item._baseDate;

    if (dateSource && typeof dateSource === 'string' && dateSource.length >= 10) {
      baseDateStr = dateSource.substring(0, 10);
    }

    const d = createLocalDate(baseDateStr);
    if (!d) return null;

    d.setHours(0, 0, 0, 0);

    const freq = String(item.frequencia).toUpperCase();

    if (
      freq.includes('DIARIA') ||
      freq.includes('DIÁRIA') ||
      freq.includes('POR_VISITA') || freq.includes('POR VISITA') || freq.includes('PER VISIT')
    ) {
      return d;
    }

    if (freq.includes('QUINZENAL')) {
      const dQ = new Date(d);
      if (dQ.getDate() <= 15) dQ.setDate(15);
      else dQ.setMonth(dQ.getMonth() + 1, 0);
      return dQ;
    }

    if (freq.includes('SEMANAL')) {
      const dayOfWeek = d.getDay();
      const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      d.setDate(d.getDate() + daysUntilSunday);
      return d;
    }

    if (freq.includes('MENSAL')) {
      d.setMonth(d.getMonth() + 1, 0);
      return d;
    }

    return null;
  }, []);

  const loadData = async () => {
    try {
      await runWithDbRetry(async () => {
        const db = await getDBConnection();
        const todayStr = getTodayStr();

      // Limpeza leve de tarefas que o backend já marcou como inválidas/canceladas.
      await db.runAsync(`
        DELETE FROM other_tasks
        WHERE upper(status) IN (
          'NOT_VISITED',
          'CANCELADA',
          'EXPIRADA',
          'NAO_REALIZADA',
          'NAO REALIZADA',
          'NÃO REALIZADA'
        )
      `);

      const resVisits = (await db.getAllAsync(`SELECT * FROM visits`)) as any[];
      const resTasks = (await db.getAllAsync(`SELECT * FROM other_tasks`)) as any[];
      const resPesquisas = (await db.getAllAsync(`SELECT * FROM pesquisas`)) as any[];

      // =======================================================
      // MOBILE_FIELD_PORTFOLIO_V1
      // =======================================================
      const authUser =
        useAuthStore.getState().user;

      const portfolioProjectId =
        getFieldPortfolioProjectId(
          authUser
        );

      let localPortfolio: any = {
        mode: 'ROTEIRIZADO',
        hasPortfolio: false,
        allowOutsidePortfolio: false,
        stores: [],
      };

      if (
        portfolioProjectId &&
        authUser?.id
      ) {
        localPortfolio =
          await getFieldPortfolioOffline(
            String(
              portfolioProjectId
            ),
            String(
              authUser.id
            )
          );
      }

      const eligibleStores =
        getEligiblePortfolioStores(
          localPortfolio,
          new Date()
        );

      setFieldPortfolio(
        localPortfolio
      );

      setPortfolioStores(
        eligibleStores
      );

      setActiveTab(
        (current) => {
          if (
            localPortfolio.mode ===
              'CARTEIRA_LIVRE' &&
            current === 'VISITAS'
          ) {
            return 'CARTEIRA';
          }

          if (
            localPortfolio.mode ===
              'ROTEIRIZADO' &&
            current === 'CARTEIRA'
          ) {
            return 'VISITAS';
          }

          return current;
        }
      );

            // OMNI_ROUTE_LOAD_COLETAS_REPEATABLE_FINAL_V1
            let resColetas: any[] = [];

            try {
              resColetas = (await db.getAllAsync(`SELECT * FROM coletas`)) as any[];
            } catch {
              resColetas = [];
            }

      const pesquisaById = resPesquisas.reduce((acc: Record<string, any>, pesquisa: any) => {
        acc[String(pesquisa.id)] = pesquisa;
        return acc;
      }, {});

      const visitsNormalized = resVisits
        .map((v) => {
          const visitSurveys =
            extractVisitSurveys(
              v,
              pesquisaById,
              language,
              resColetas
            );

          return {
            ...v,
            status: normalizeStatus(v.status),
            data_programada: String(v.data_programada || v.dataProgramada || '').substring(0, 10),
            hora_entrada_prevista: v.hora_entrada_prevista || v.horaEntradaPrevista || v.hora_entrada || '',
            hora_saida_prevista: v.hora_saida_prevista || v.horaSaidaPrevista || v.hora_saida || '',
            checkin_at: v.checkin_at || v.checkinAt || v.data_checkin || v.entrada_at || null,
            checkout_at: v.checkout_at || v.checkoutAt || v.data_checkout || v.saida_at || null,
            _routineSurveysCount: Math.max(1, visitSurveys.length),
          };
        })
        .sort((a, b) => {
          const statusPriority = (item: any) => {
            const st = normalizeStatus(item.status);
            if (st === 'EM_ANDAMENTO' || st === 'INICIADA') return 0;
            if (st === 'PENDENTE') return 1;
            if (st === 'JUSTIFICADA') return 2;
            if (isDoneStatus(st)) return 3;
            return 4;
          };

          const statusCmp = statusPriority(a) - statusPriority(b);
          if (statusCmp !== 0) return statusCmp;

          return String(a.hora_entrada_prevista || '').localeCompare(
            String(b.hora_entrada_prevista || '')
          );
        });

      let consolidatedTasks: any[] = [];

            // OMNI_ROUTE_REPEATABLE_HELPERS_FINAL_V1
            const routeObject = (value: any): any => {
              if (!value) return {};

              if (
                typeof value === 'object' &&
                !Array.isArray(value)
              ) {
                return value;
              }

              if (typeof value === 'string') {
                try {
                  const parsed =
                    JSON.parse(value);

                  if (
                    parsed &&
                    typeof parsed === 'object' &&
                    !Array.isArray(parsed)
                  ) {
                    return parsed;
                  }
                } catch {}
              }

              return {};
            };

            const routeTruthy = (value: any) => {
              if (value === true) return true;

              const normalized =
                String(value || '')
                  .trim()
                  .toLowerCase();

              return [
                'true',
                '1',
                'sim',
                'yes',
                's',
                'y'
              ].includes(normalized);
            };

            const hasRepeatableFlag = (value: any): boolean => {
              if (!value) return false;

              if (typeof value === 'string') {
                return hasRepeatableFlag(
                  routeObject(value)
                );
              }

              if (Array.isArray(value)) {
                return value.some(
                  hasRepeatableFlag
                );
              }

              if (typeof value !== 'object') {
                return false;
              }

              if (
                routeTruthy(value?.repetivel) ||
                routeTruthy(value?.repeatable)
              ) {
                return true;
              }

              return Object.values(value).some(
                hasRepeatableFlag
              );
            };

            const getStandaloneTaskPesquisaId = (task: any, raw: any) =>
              String(
                task?.pesquisa_id ||
                task?.pesquisaId ||
                raw?.pesquisa_id ||
                raw?.pesquisaId ||
                raw?.id ||
                task?.id ||
                ''
              )
                .replace(/^task-/, '')
                .trim();

              const countStandaloneResponses = (task: any, raw: any) => {
                const taskPesquisaId =
                  getStandaloneTaskPesquisaId(
                    task,
                    raw
                  );

                const taskId =
                  String(task?.id || '')
                    .trim();

                if (
                  !taskPesquisaId &&
                  !taskId
                ) {
                  return 0;
                }

                return resColetas.filter((coleta: any) => {
                  const payload =
                    routeObject(
                      coleta?.payload ||
                      coleta?.payload_json ||
                      coleta?.dados ||
                      coleta?.raw_json ||
                      coleta?.respostas_json
                    );

                  // OMNI_ROUTE_COUNT_ONLY_PENDING_LOCAL_COLETAS_V2
                  // Para tarefas avulsas repetiveis, o card so pode somar coletas locais
                  // ainda pendentes de sync. Coletas antigas com pending_sync=0 nao entram.
                  const pendingSyncValue =
                    coleta?.pending_sync ??
                    coleta?.pendingSync ??
                    payload?.pending_sync ??
                    payload?.pendingSync ??
                    0;

                  const isPendingLocalColeta =
                    pendingSyncValue === 1 ||
                    pendingSyncValue === true ||
                    String(pendingSyncValue).trim() === '1';

                  if (!isPendingLocalColeta) {
                    return false;
                  }

                  const coletaPesquisaId =
                    String(
                      coleta?.pesquisa_id ||
                      coleta?.pesquisaId ||
                      coleta?.pesquisa ||
                      payload?.pesquisa_id ||
                      payload?.pesquisaId ||
                      ''
                    )
                      .replace(/^task-/, '')
                      .trim();

                  const coletaTaskId =
                    String(
                      coleta?.task_id ||
                      coleta?.taskId ||
                      payload?.task_id ||
                      payload?.taskId ||
                      ''
                    )
                      .trim();

                  const tipoRegistro =
                    String(
                      coleta?.tipo_registro ||
                      coleta?.tipoRegistro ||
                      payload?.tipo_registro ||
                      payload?.tipoRegistro ||
                      ''
                    )
                      .toUpperCase();

                  const lojaId =
                    String(
                      coleta?.loja_id ||
                      coleta?.lojaId ||
                      payload?.loja_id ||
                      payload?.lojaId ||
                      ''
                    )
                      .toUpperCase();

                  const visitaId =
                    String(
                      coleta?.visita_id ||
                      coleta?.visitaId ||
                      payload?.visita_id ||
                      payload?.visitaId ||
                      ''
                    )
                      .trim()
                      .toLowerCase();

                  const statusColeta =
                    String(
                      coleta?.status ||
                      payload?.status ||
                      ''
                    )
                      .toUpperCase();

                  const deleted =
                    coleta?.deleted_at ||
                    coleta?.deletedAt ||
                    payload?.deleted_at ||
                    payload?.deletedAt ||
                    statusColeta === 'EXCLUIDA' ||
                    statusColeta === 'EXCLUÍDA' ||
                    statusColeta === 'DELETED';

                  if (deleted) {
                    return false;
                  }

                  const isStandalone =
                    tipoRegistro.includes('AVULSA') ||
                    lojaId === 'GERAL' ||
                    !visitaId ||
                    visitaId === 'null' ||
                    visitaId === 'undefined';

                  if (!isStandalone) {
                    return false;
                  }

                  return (
                    (!!taskPesquisaId && coletaPesquisaId === taskPesquisaId) ||
                    (!!taskId && coletaTaskId === taskId)
                  );
                }).length;
              };


              // OMNI_ROUTE_BACKEND_REPEATABLE_STATUS_SINGLE_SOURCE_V1
              // MOBILE_ROUTE_STANDALONE_STORE_SCOPE_V1
              const getRouteRepeatableContext = (
                task: any,
                raw: any
              ) => {
                const authUser =
                  useAuthStore
                    .getState()
                    .user || {};

                const authCustom =
                  routeObject(
                    authUser?.custom_data ||
                    authUser?.customData
                  );

                const projectId =
                  String(
                    task?.projectId ||
                    task?.project_id ||
                    task?.projetoId ||
                    task?.projeto_id ||
                    raw?.projectId ||
                    raw?.project_id ||
                    raw?.projetoId ||
                    raw?.projeto_id ||
                    authUser?.projectId ||
                    authUser?.project_id ||
                    authUser?.projetoId ||
                    authUser?.projeto_id ||
                    authCustom?.projectId ||
                    authCustom?.project_id ||
                    authCustom?.projetoId ||
                    authCustom?.projeto_id ||
                    ''
                  ).trim();

                const usuarioId =
                  String(
                    task?.usuarioId ||
                    task?.usuario_id ||
                    task?.userId ||
                    task?.user_id ||
                    raw?.usuarioId ||
                    raw?.usuario_id ||
                    raw?.userId ||
                    raw?.user_id ||
                    authUser?.id ||
                    authUser?.usuarioId ||
                    authUser?.usuario_id ||
                    authUser?.userId ||
                    authUser?.user_id ||
                    ''
                  ).trim();

                const pesquisaId =
                  getStandaloneTaskPesquisaId(
                    task,
                    raw
                  );

                const dataProgramada =
                  String(
                    task?.dataProgramada ||
                    task?.data_programada ||
                    raw?.dataProgramada ||
                    raw?.data_programada ||
                    task?.data_vencimento ||
                    raw?.data_vencimento ||
                    raw?.data_fim ||
                    todayStr
                  ).substring(
                    0,
                    10
                  );

                const executionScope =
                  String(
                    task?.escopo_execucao ||
                    task?.escopoExecucao ||
                    raw?.escopo_execucao ||
                    raw?.escopoExecucao ||
                    'AVULSO'
                  )
                    .trim()
                    .toUpperCase();

                const rawLojaId =
                  task?.loja_id ||
                  task?.lojaId ||
                  raw?.loja_id ||
                  raw?.lojaId ||
                  '';

                const lojaId =
                  executionScope ===
                  'LOJA_CICLO'
                    ? String(
                        rawLojaId
                      ).trim()
                    : 'GERAL';

                return {
                  projectId,
                  usuarioId,
                  pesquisaId,
                  dataProgramada,
                  executionScope,
                  lojaId
                };
              };

              const fetchRouteRepeatableStatus = async (task: any, raw: any) => {
                const ctx = getRouteRepeatableContext(task, raw);

                if (!ctx.projectId || !ctx.usuarioId || !ctx.pesquisaId) {
                  return null;
                }

                try {
                  const query = new URLSearchParams();

                  query.set('projectId', ctx.projectId);
                  query.set('pesquisaId', ctx.pesquisaId);
                  query.set('usuarioId', ctx.usuarioId);
                  query.set('dataProgramada', ctx.dataProgramada);

                  query.set(
                    'lojaId',
                    ctx.lojaId || 'GERAL'
                  );

                  const response = await api(
                    '/standalone-task-status?' + query.toString()
                  );

                  if (!response.ok) {
                    return null;
                  }

                  const data = await response.json();

                  return {
                    currentCount: Number(data?.currentCount || 0),
                    closed: data?.closed === true,
                    blocked: data?.blocked === true
                  };
                } catch {
                  return null;
                }
              };

              const backendRepeatableStatusByTaskId: Record<string, any> = {};

              for (const task of resTasks) {
                const raw = safeParseJson(task.task_raw_json, {});

                const isRepeatableCandidate =
                  hasRepeatableFlag(task) ||
                  hasRepeatableFlag(raw) ||
                  hasRepeatableFlag(
                    pesquisaById[
                      getStandaloneTaskPesquisaId(task, raw)
                    ]
                  );

                if (!isRepeatableCandidate) {
                  continue;
                }

                const backendStatus = await fetchRouteRepeatableStatus(task, raw);

                if (backendStatus) {
                  backendRepeatableStatusByTaskId[String(task.id)] = backendStatus;
                }
              }

      resTasks.forEach((task) => {
        const raw = safeParseJson(task.task_raw_json, {});

                // OMNI_ROUTE_STATUS_FROM_COLETAS_FINAL_V1
                const standaloneResponsesFromColetas =
                  countStandaloneResponses(
                    task,
                    raw
                  );

                  // OMNI_ROUTE_REPEATABLE_COUNTER_FALLBACK_V3
                  // Fonte unica do card: backend + respostas locais ainda pendentes.
                  const backendRepeatableStatus =
                    backendRepeatableStatusByTaskId[String(task.id)] || null;

                  const backendRepeatableResponseCount =
                    Number(backendRepeatableStatus?.currentCount || 0);

                  const originalStandaloneStatusForCount =
                    normalizeStatus(
                      task.status ||
                      raw.status ||
                      'PENDENTE'
                    );

                  const rawRepeatableResponseCount =
                    Number(
                      task?.omni_repeatable_current_count ??
                      raw?.omni_repeatable_current_count ??
                      task?.general_repeatable_current_count ??
                      raw?.general_repeatable_current_count ??
                      task?.repeatableCurrentCount ??
                      raw?.repeatableCurrentCount ??
                      task?.currentCount ??
                      raw?.currentCount ??
                      0
                    ) || 0;

                  const rawRepeatableCountAllowed =
                    originalStandaloneStatusForCount !== 'PENDENTE'
                      ? rawRepeatableResponseCount
                      : 0;

                  const standaloneResponseCount =
                    Math.max(
                      backendRepeatableResponseCount + standaloneResponsesFromColetas,
                      rawRepeatableCountAllowed,
                      backendRepeatableResponseCount,
                      standaloneResponsesFromColetas
                    );


              const isRepeatableForRoute =
                hasRepeatableFlag(task) ||
                hasRepeatableFlag(raw) ||
                hasRepeatableFlag(
                  pesquisaById[
                    getStandaloneTaskPesquisaId(
                      task,
                      raw
                    )
                  ]
                ) ||
                standaloneResponseCount > 0;

              const rawClosed =
                backendRepeatableStatus?.closed === true ||
                raw?.omni_repeatable_closed === true ||
                raw?.general_repeatable_closed === true ||
                String(raw?.omni_repeatable_status || '').toUpperCase() === 'FECHADO' ||
                String(raw?.general_repeatable_status || '').toUpperCase() === 'FECHADO';

              const originalStandaloneStatus =
                normalizeStatus(
                  task.status ||
                  raw.status ||
                  'PENDENTE'
                );

              const taskStatusForRoute =
                isRepeatableForRoute &&
                (
                  rawClosed ||
                  isDoneStatus(originalStandaloneStatus)
                )
                  ? 'REALIZADA'
                  : isRepeatableForRoute &&
                    standaloneResponseCount > 0
                    ? 'EM_ANDAMENTO'
                    : originalStandaloneStatus;

        if (isSystemConfigTask(task, raw)) {
          return;
        }

        const baseDate =
          task.data_vencimento ||
          raw.data_programada ||
          raw.criado_em ||
          raw.created_at ||
          raw.data_inicio;

        consolidatedTasks.push({
          ...task,
          ...raw,
          id: task.id,
          titulo: task.titulo || raw.titulo || raw.nome || '',
          status: taskStatusForRoute,
          frequencia: task.frequencia || raw.frequencia || '',
          data_vencimento: task.data_vencimento || raw.data_vencimento || raw.data_fim || raw.deadline || '',
          isLinkedToVisit: false,
                omni_repeatable_current_count: standaloneResponseCount,
                general_repeatable_current_count: standaloneResponseCount,
                omni_repeatable_closed: rawClosed,
                general_repeatable_closed: rawClosed,
          _baseDate: baseDate,
        });
      });

      // MOBILE_ROUTE_VISIT_TASK_INDIVIDUAL_STATE_V1
      visitsNormalized.forEach((visit) => {
        const vDate =
          String(
            visit.data_programada ||
              ''
          ).substring(
            0,
            10
          );

        if (
          vDate !== todayStr
        ) {
          return;
        }

        /*
         * Visita justificada não deixa
         * formulários POR_VISITA pendentes.
         */
        if (
          normalizeStatus(
            visit.status
          ) === 'JUSTIFICADA'
        ) {
          return;
        }

        /*
         * Carteira Livre não cria obrigação apenas por
         * estar disponível na carteira.
         *
         * A tarefa POR_VISITA nasce para a operação
         * somente depois do primeiro check-in.
         */
        if (
          isPortfolioFreeVisitForMobile(
            visit
          ) &&
          !hasStartedPortfolioFreeVisitForMobile(
            visit
          )
        ) {
          return;
        }

        const visitSurveys =
          extractVisitSurveys(
            visit,
            pesquisaById,
            language,
            resColetas
          );

        visitSurveys.forEach(
          (survey) => {
            consolidatedTasks.push({
              id:
                `visit_task_${visit.id}_${survey.id}`,

              titulo:
                survey.titulo,

              surveyTitle:
                survey.titulo,

                            pesquisaId:
                survey.id,

qtdPerguntas:
                survey.qtdPerguntas,

              /*
               * Nunca usar o status geral da visita
               * para decidir o status do formulário.
               */
              status:
                normalizeStatus(
                  survey.status
                ),

              frequencia:
                'POR_VISITA',

              isLinkedToVisit:
                true,

              loja_nome:
                visit.loja_nome,

              visitaId:
                visit.id,

              data_vencimento:
                vDate,

              repetivel:
                survey.repetivel,

              repeatable:
                survey.repetivel,

              currentCount:
                survey.currentCount,

              repeatableCurrentCount:
                survey.currentCount,

              omni_repeatable_current_count:
                survey.currentCount,

              _baseDate:
                vDate,
            });
          }
        );
      });

      consolidatedTasks = consolidatedTasks
        .filter((task) => !isSystemConfigTask(task, safeParseJson(task?.task_raw_json, {})))
        .sort((a, b) => {
        const aDone = isDoneStatus(a.status);
        const bDone = isDoneStatus(b.status);

        if (aDone !== bDone) return aDone ? 1 : -1;

        const aDeadline = getDeadlineDate(a);
        const bDeadline = getDeadlineDate(b);

        const aTime = aDeadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = bDeadline?.getTime() ?? Number.MAX_SAFE_INTEGER;

        if (aTime !== bTime) return aTime - bTime;

        return String(a.titulo || '').localeCompare(String(b.titulo || ''), getLocaleByLanguage(language));
      });

      setVisits(visitsNormalized);
      setTasks(consolidatedTasks);
      });
    } catch (error) {
      console.error('❌ Erro ao carregar roteiro:', error);
      showCustomAlert(
        i18n.t('error') || 'Erro',
        rt('loadRouteError', language),
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [language, lastSync])
  );

  useEffect(() => {
    if (!loading) {
      loadData();
    }
  }, [lastSync]);

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
      await loadData();
    } catch (error) {
      console.error('Erro na atualização:', error);
      showCustomAlert(
        i18n.t('error') || 'Erro',
        rt('refreshRouteError', language),
        'warning'
      );
    } finally {
      setRefreshing(false);
    }
  };

  const getTrafficLightProps = (item: any) => {
    const s = normalizeStatus(item.status);

    if (isDoneStatus(s)) {
      return { color: '#10B981', icon: CheckCircle2, text: i18n.t('statusRealized') };
    }

    const deadline = getDeadlineDate(item);

    if (!deadline) {
      return { color: textSecondary, icon: Clock, text: rt('noDeadline', language) };
    }

    const today = getTodayDate();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { color: '#EF4444', icon: AlertCircle, text: rt('overdue', language) };
    if (diffDays === 0) return { color: '#EF4444', icon: AlertCircle, text: rt('dueToday', language) };
    if (diffDays <= 3) return { color: '#F59E0B', icon: Clock, text: `${rt('dueIn', language)} ${diffDays} ${rt('days', language)}` };

    return { color: '#3B82F6', icon: Clock, text: `${rt('dueIn', language)} ${diffDays} ${rt('days', language)}` };
  };

  const filteredData = useMemo(() => {
    const todayStr = getTodayStr();
    const searchLower = searchQuery.trim().toLowerCase();

    if (activeTab === 'VISITAS') {
      return visits.filter((item) => {
        const vDate = String(item.data_programada || '').substring(0, 10);

        if (vDate !== todayStr) return false;

        /*
         * MOBILE_FIELD_PORTFOLIO_V1
         *
         * A execução livre fica em Minha Carteira.
         * Não duplicamos o mesmo atendimento em Programadas.
         */
        const isFree =
          String(
            item.field_visit_mode ||
            ''
          )
            .trim()
            .toUpperCase() ===
            'CARTEIRA_LIVRE';

        if (isFree) return false;

        return String(item.loja_nome || '').toLowerCase().includes(searchLower);
      });
    }

    if (activeTab === 'CARTEIRA') {
      return portfolioStores
        .map((store: any) => {
          const todayExecutions =
            visits
              .filter((visit: any) => {
                const visitDate =
                  String(
                    visit.data_programada ||
                    ''
                  ).substring(
                    0,
                    10
                  );

                const isFree =
                  String(
                    visit.field_visit_mode ||
                    ''
                  )
                    .trim()
                    .toUpperCase() ===
                    'CARTEIRA_LIVRE';

                return (
                  isFree &&
                  visitDate === todayStr &&
                  String(
                    visit.loja_id ||
                    ''
                  ) ===
                  String(
                    store.loja_id ||
                    ''
                  )
                );
              })
              .sort(
                (a: any, b: any) =>
                  String(
                    b.updated_at ||
                    b.checkout_at ||
                    b.checkin_at ||
                    ''
                  ).localeCompare(
                    String(
                      a.updated_at ||
                      a.checkout_at ||
                      a.checkin_at ||
                      ''
                    )
                  )
              );

          return {
            ...store,
            __type:
              'PORTFOLIO_STORE',
            __latestVisit:
              todayExecutions[0] ||
              null,
          };
        })
        .filter(
          (item: any) =>
            String(
              item.loja_nome ||
              ''
            )
              .toLowerCase()
              .includes(
                searchLower
              )
        );
    }

    // Enterprise UX:
    // Mantém tarefas atrasadas visíveis, para o usuário enxergar pendências críticas.
    // O status visual em vermelho já é tratado pelo getTrafficLightProps.
    const visibleTasks = tasks.filter((item) =>
      String(item.titulo || '').toLowerCase().includes(searchLower)
    );

    const standaloneTasks = visibleTasks.filter((item) => item.isLinkedToVisit !== true);
    const visitTasks = visibleTasks.filter((item) => item.isLinkedToVisit === true);

    const groupedTasks: any[] = [];

    if (standaloneTasks.length > 0) {
      groupedTasks.push(
        makeTaskGroupHeader(
          'standalone_tasks_header',
          rt('standaloneTasksGroup', language),
          rt('standaloneTasksGroupHint', language),
          standaloneTasks.length
        ),
        ...standaloneTasks
      );
    }

    if (visitTasks.length > 0) {
      groupedTasks.push(
        makeTaskGroupHeader(
          'visit_tasks_header',
          rt('visitTasksGroup', language),
          rt('visitTasksGroupHint', language),
          visitTasks.length
        ),
        ...visitTasks
      );
    }

    return groupedTasks;
  }, [
    activeTab,
    visits,
    tasks,
    portfolioStores,
    searchQuery,
    language,
  ]);

  const summary = useMemo(() => {
    const todayStr = getTodayStr();
    const todayVisits =
      visits.filter(
        (v) => {
          const date =
            String(
              v.data_programada ||
              ''
            ).substring(
              0,
              10
            );

          if (
            date !== todayStr
          ) {
            return false;
          }

          /*
           * Loja livre disponível não é visita pendente.
           * Só entra na métrica quando houve check-in.
           */
          if (
            isPortfolioFreeVisitForMobile(
              v
            ) &&
            !hasStartedPortfolioFreeVisitForMobile(
              v
            )
          ) {
            return false;
          }

          return true;
        }
      );
    const visitsDone = todayVisits.filter((v) => isDoneStatus(v.status) || normalizeStatus(v.status) === 'JUSTIFICADA').length;

    const visibleTasks = tasks;
    const tasksDone = visibleTasks.filter((t) => isDoneStatus(t.status)).length;

    return {
      todayVisits: todayVisits.length,
      visitsDone,
      tasks: visibleTasks.length,
      tasksDone,
    };
  }, [visits, tasks]);

  // =========================================================
  // MOBILE_FIELD_PORTFOLIO_V1
  // =========================================================
  const handlePortfolioStorePress =
    async (store: any) => {
      try {
        const currentUser =
          useAuthStore
            .getState()
            .user;

        const projectId =
          getFieldPortfolioProjectId(
            currentUser
          );

        if (
          !projectId ||
          !currentUser?.id
        ) {
          showCustomAlert(
            i18n.t('error') || 'Erro',
            rt(
              'loadRouteError',
              language
            ),
            'error'
          );
          return;
        }

        /*
         * Se já existe visita PENDENTE/EM_ANDAMENTO,
         * o service devolve o mesmo UUID.
         * Se a última foi concluída, gera outra.
         */
        const draft =
          await createFreePortfolioVisitDraft({
            projectId:
              String(projectId),
            userId:
              String(
                currentUser.id
              ),
            user:
              currentUser,
            store,
          });

        if (!draft?.id) {
          throw new Error(
            'free-visit-draft-not-created'
          );
        }

        await loadData();

        router.push({
          pathname:
            '/visita/[id]',
          params: {
            id:
              String(
                draft.id
              ),
          },
        } as any);
      } catch (error: any) {
        console.error(
          '[Carteira Livre] Falha ao abrir loja:',
          error
        );

        showCustomAlert(
          i18n.t('error') ||
            'Erro',
          rt(
            'loadRouteError',
            language
          ),
          'error'
        );
      }
    };

  const renderPortfolioCard =
    ({
      item,
    }: {
      item: any;
    }) => {
      const latest =
        item.__latestVisit;

      const status =
        normalizeStatus(
          latest?.status ||
          'PENDENTE'
        );

      const inProgress =
        status ===
          'EM_ANDAMENTO' ||
        status ===
          'INICIADA';

      const done =
        isDoneStatus(status);

      const stateText =
        inProgress
          ? rt(
              'portfolioInProgress',
              language
            )
          : done
            ? rt(
                'portfolioVisitedToday',
                language
              )
            : rt(
                'portfolioAvailable',
                language
              );

      const stateColor =
        inProgress
          ? '#3B82F6'
          : done
            ? '#10B981'
            : accent;

      const targetVisits =
        Number(
          item.target_visits ||
          0
        );

      const targetDays =
        Number(
          item.target_period_days ||
          0
        );

      const frequencyText =
        targetVisits > 0 &&
        targetDays > 0
          ? `${targetVisits}/${targetDays}d`
          : '';

      const timeWindow =
        item.time_window_start ||
        item.time_window_end
          ? `${String(
              item.time_window_start ||
              '--:--'
            ).substring(
              0,
              5
            )} - ${String(
              item.time_window_end ||
              '--:--'
            ).substring(
              0,
              5
            )}`
          : '';

      return (
        <TouchableOpacity
          style={[
            styles.cardWrapper,
            {
              backgroundColor:
                surface,
              borderColor:
                border,
              borderLeftColor:
                stateColor,
            },
          ]}
          activeOpacity={0.78}
          onPress={() =>
            handlePortfolioStorePress(
              item
            )
          }
        >
          <View
            style={
              styles.cardMainRow
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <View
                style={
                  styles.cardHeader
                }
              >
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor:
                        `${accent}18`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      {
                        color:
                          accent,
                      },
                    ]}
                  >
                    {rt(
                      'portfolioBadge',
                      language
                    )}
                  </Text>
                </View>

                <View
                  style={[
                    styles.timePill,
                    {
                      borderColor:
                        `${stateColor}35`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timePillText,
                      {
                        color:
                          stateColor,
                      },
                    ]}
                  >
                    {stateText}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.cardTitle,
                  {
                    color:
                      textPrimary,
                  },
                ]}
              >
                {item.loja_nome}
              </Text>

              <Text
                style={[
                  styles.cardSubtitle,
                  {
                    color:
                      textSecondary,
                  },
                ]}
                numberOfLines={2}
              >
                {getCleanAddress(
                  item.endereco
                )}
              </Text>

              <View
                style={{
                  flexDirection:
                    'row',
                  flexWrap:
                    'wrap',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <View
                  style={[
                    styles.compactTimingBadge,
                    {
                      backgroundColor:
                        surfaceAlt,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.compactTimingBadgeText,
                      {
                        color:
                          textSecondary,
                      },
                    ]}
                  >
                    {rt(
                      'portfolioPriority',
                      language
                    )}:{' '}
                    {Number(
                      item.priority ||
                      50
                    )}
                  </Text>
                </View>

                {frequencyText ? (
                  <View
                    style={[
                      styles.compactTimingBadge,
                      {
                        backgroundColor:
                          surfaceAlt,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.compactTimingBadgeText,
                        {
                          color:
                            textSecondary,
                        },
                      ]}
                    >
                      {rt(
                        'portfolioFrequency',
                        language
                      )}:{' '}
                      {frequencyText}
                    </Text>
                  </View>
                ) : null}

                {timeWindow ? (
                  <View
                    style={[
                      styles.compactTimingBadge,
                      {
                        backgroundColor:
                          surfaceAlt,
                      },
                    ]}
                  >
                    <Clock
                      size={11}
                      color={
                        textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.compactTimingBadgeText,
                        {
                          color:
                            textSecondary,
                        },
                      ]}
                    >
                      {timeWindow}
                    </Text>
                  </View>
                ) : null}
              </View>

              {latest?.checkin_at ? (
                <Text
                  style={[
                    styles.compactTimingText,
                    {
                      color:
                        textSecondary,
                      marginTop: 10,
                    },
                  ]}
                >
                  {rt(
                    'done',
                    language
                  )}{' '}
                  <Text
                    style={[
                      styles.compactTimingStrong,
                      {
                        color:
                          textPrimary,
                      },
                    ]}
                  >
                    {formatHourMinute(
                      latest.checkin_at,
                      language
                    )}
                    {' → '}
                    {formatHourMinute(
                      latest.checkout_at,
                      language
                    )}
                  </Text>
                </Text>
              ) : null}
            </View>

            <ChevronRight
              size={20}
              color={
                textSecondary
              }
              style={{
                marginLeft: 10,
              }}
            />
          </View>
        </TouchableOpacity>
      );
    };

  const renderVisitCard = ({ item, index }: { item: any; index: number }) => {
    const colors = getStatusColors(item.status);

    let insightToDisplay = null;

    try {
      if (item.store_insights_json && item.store_insights_json !== '[]') {
        const insights = JSON.parse(item.store_insights_json);

        if (Array.isArray(insights) && insights.length > 0) {
          const priorityWeights: Record<string, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

          insightToDisplay = insights.sort((a, b) => {
            const weightA = priorityWeights[a.prioridade?.toUpperCase()] || 0;
            const weightB = priorityWeights[b.prioridade?.toUpperCase()] || 0;
            return weightB - weightA;
          })[0];
        }
      }
    } catch (e) {}

    return (
      <TouchableOpacity
          testID={index === 0 ? "route-first-visit-card" : `route-visit-card-${item.id}`}
          accessibilityLabel={index === 0 ? "route-first-visit-card" : `route-visit-card-${item.id}`}
        style={[
          styles.cardWrapper,
          { backgroundColor: surface, borderLeftColor: colors.text, borderColor: border },
        ]}
        activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/visita/[id]', params: { id: String(item.id) } } as any)}
      >
        <View style={styles.cardMainRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                <Text style={[styles.badgeText, { color: colors.text }]}>
                  {isDoneStatus(item.status)
                    ? i18n.t('statusCompleted')
                    : normalizeStatus(item.status) === 'PENDENTE'
                      ? i18n.t('statusPending')
                      : item.status}
                </Text>
              </View>

              <View style={styles.timePill}>
                <Clock size={12} color={textSecondary} />
                <Text style={[styles.timePillText, { color: textSecondary }]}>
                  {formatHourMinute(item.hora_entrada_prevista, language)}
                  {item.hora_saida_prevista ? ` - ${formatHourMinute(item.hora_saida_prevista, language)}` : ''}
                </Text>
              </View>
            </View>

            <Text
                testID={index === 0 ? "route-first-visit-title" : `route-visit-title-${item.id}`}
                accessibilityLabel={index === 0 ? "route-first-visit-title" : `route-visit-title-${item.id}`}
                style={[styles.cardTitle, { color: textPrimary }]}
              >
                {item.loja_nome}
              </Text>
            <Text style={[styles.cardSubtitle, { color: textSecondary }]} numberOfLines={1}>
              {getCleanAddress(item.endereco)}
            </Text>

            {(() => {
              const entradaBadge = getDiffBadge(item.hora_entrada_prevista, item.checkin_at, language);
              const saidaBadge = getDiffBadge(item.hora_saida_prevista, item.checkout_at, language);
              const durationLabel = getVisitDurationLabel(item.checkin_at, item.checkout_at);

              return (
                <View style={styles.compactTimingArea}>
                  <View style={styles.compactTimingRow}>
                    <Text style={[styles.compactTimingText, { color: textSecondary }]}>
                      {rt('scheduled', language)}{' '}
                      <Text style={[styles.compactTimingStrong, { color: textPrimary }]}>
                        {formatHourMinute(item.hora_entrada_prevista, language)} → {formatHourMinute(item.hora_saida_prevista, language)}
                      </Text>
                    </Text>

                    <Text style={[styles.compactTimingText, { color: textSecondary }]}>
                      {rt('done', language)}{' '}
                      <Text style={[styles.compactTimingStrong, { color: textPrimary }]}>
                        {formatHourMinute(item.checkin_at, language)} → {formatHourMinute(item.checkout_at, language)}
                      </Text>
                    </Text>
                  </View>

                  <View style={styles.compactBadgeRow}>
                    {entradaBadge ? (
                      <View
                        style={[
                          styles.compactTimingBadge,
                          { backgroundColor: isDark ? entradaBadge.bgDark : entradaBadge.bgLight },
                        ]}
                      >

                        <Text style={[styles.compactTimingBadgeText, { color: entradaBadge.color }]}>
                          {rt('entry', language)} {entradaBadge.label}
                        </Text>
                      </View>
                    ) : item.checkin_at ? (
                      <View style={[styles.compactTimingBadge, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.12)' }]}>
                        <Text style={[styles.compactTimingBadgeText, { color: textSecondary }]}>
                          {rt('entryRegistered', language)}
                        </Text>
                      </View>
                    ) : null}

                    {saidaBadge ? (
                      <View
                        style={[
                          styles.compactTimingBadge,
                          { backgroundColor: isDark ? saidaBadge.bgDark : saidaBadge.bgLight },
                        ]}
                      >
                        <Text style={[styles.compactTimingBadgeText, { color: saidaBadge.color }]}>
                          {rt('exit', language)} {saidaBadge.label}
                        </Text>
                      </View>
                    ) : item.checkout_at ? (
                      <View style={[styles.compactTimingBadge, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.12)' }]}>
                        <Text style={[styles.compactTimingBadgeText, { color: textSecondary }]}>
                          {rt('exitRegistered', language)}
                        </Text>
                      </View>
                    ) : null}

                    {durationLabel ? (
                      <View style={[styles.compactTimingBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.1)' }]}>
                        <Text style={[styles.compactTimingBadgeText, { color: '#10B981' }]}>
                          {durationLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })()}
          </View>

          <ChevronRight size={20} color={textSecondary} style={{ marginLeft: 10 }} />
        </View>

        {insightToDisplay ? (() => {
          const priorityStyle = getInsightPriorityStyles(insightToDisplay.prioridade, isDark);
          const { Icon } = priorityStyle;

          return (
            <View style={[styles.insightIntegrated, { backgroundColor: priorityStyle.bgColor, borderTopColor: border }]}>
              <View style={styles.insightHeader}>
                <Icon size={16} color={priorityStyle.color} />
                <Text style={[styles.insightPriority, { color: priorityStyle.color }]}>
                  {priorityStyle.label}
                </Text>
              </View>
              <Text style={[styles.insightMessage, { color: textPrimary }]}>
                {insightToDisplay.mensagemFoco || insightToDisplay.mensagem || ''}
              </Text>
            </View>
          );
        })() : (
          <View style={[styles.insightIntegrated, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : 'rgba(59, 130, 246, 0.08)', borderTopColor: border }]}>
            <View style={styles.insightHeader}>
              <CheckCircle2 size={16} color="#3B82F6" />
              <Text style={[styles.insightPriority, { color: '#3B82F6' }]}>
                {rt('focus', language)}
              </Text>
            </View>
            <Text style={[styles.insightMessage, { color: textPrimary }]}>
              {Math.max(1, Number(item._routineSurveysCount || 1))} {rt('routineSurveys', language)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTaskGroupHeader = (item: any) => (
    <View style={styles.taskGroupHeader}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskGroupTitle, { color: textPrimary }]}>
          {item.title}
        </Text>
        <Text style={[styles.taskGroupSubtitle, { color: textSecondary }]}>
          {item.subtitle}
        </Text>
      </View>

      <View style={[styles.taskGroupCount, { backgroundColor: surfaceAlt, borderColor: border }]}>
        <Text style={[styles.taskGroupCountText, { color: accent }]}>
          {item.count}
        </Text>
      </View>
    </View>
  );

  const renderTaskCard = ({ item }: { item: any }) => {
    const isDone = isDoneStatus(item.status);
    const isVisitSurvey = item.isLinkedToVisit === true;
    // OMNI_OPEN_REPEATABLE_BADGE_V3
    const rawRepeatableResponsesCount =
      Number(
        item.omni_repeatable_current_count ??
        item.general_repeatable_current_count ??
        item.repeatableCurrentCount ??
        item.currentCount ??
        0
      );

    const baseTaskStatus =
      normalizeStatus(item.status);

    const displayTaskStatus =
      isDone
        ? baseTaskStatus
        : rawRepeatableResponsesCount > 0
          ? 'EM_ANDAMENTO'
          : baseTaskStatus;

    // MOBILE_ROUTE_REPEATABLE_VISIT_PROGRESS_V1
    const isOpenRepeatable =
      !isDone &&
      rawRepeatableResponsesCount > 0 &&
      ['EM_ANDAMENTO', 'INICIADA'].includes(
        displayTaskStatus
      );

    const repeatableResponsesCount =
      rawRepeatableResponsesCount;

    // OMNI_ROUTE_BADGE_OPEN_CLOSED_FINAL_V1
    const isClosedRepeatable =
      !isVisitSurvey &&
      isDone &&
      repeatableResponsesCount > 0;

    const colors = getStatusColors(
      displayTaskStatus,
      false
    );
    const traffic = getTrafficLightProps(item);
    const TrafficIcon = traffic.icon;

    const deadline = getDeadlineDate(item);
    const displayDeadline = formatDateByLanguage(deadline, language);

    const disabledCard = isVisitSurvey;
    const cardOpacity = disabledCard && !isDone ? 0.82 : disabledCard ? 0.9 : 1;

    return (
      <TouchableOpacity
        style={[
          styles.cardWrapper,
          {
            backgroundColor: surface,
            // Status individual também define a cor do POR_VISITA.
            borderLeftColor: colors.text,
            borderColor: border,
            padding: 18,
            opacity: cardOpacity,
          },
        ]}
        activeOpacity={disabledCard ? 1 : 0.7}
        disabled={false}
        onPress={() => {
          if (isVisitSurvey) {
            const lojaNome = item.loja_nome || '';

            showCustomAlert(
              rt('taskLinkedVisitTitle', language),
              rt('taskLinkedVisitMessage', language, { store: lojaNome }),
              'warning',
              rt('understood', language)
            );
            return;
          }

          router.push(`../pesquisa_avulsa/${item.id}` as any);
        }}
      >
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  colors.bg
              }
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  color:
                    colors.text
                }
              ]}
            >
              {isVisitSurvey
                ? isDone
                  ? i18n.t(
                      'statusCompleted'
                    )
                  : isOpenRepeatable
                    ? (
                        language === 'en-US'
                          ? `In progress - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'response' : 'responses'}`
                          : language === 'es-ES'
                            ? `En curso - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'respuesta' : 'respuestas'}`
                            : `Em andamento - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'resposta' : 'respostas'}`
                      )
                    : rt(
                        'taskInStore',
                        language
                      )
                : isClosedRepeatable
                  ? (
                      language === 'en-US'
                        ? `Closed - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'response' : 'responses'}`
                        : language === 'es-ES'
                          ? `Cerrado - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'respuesta' : 'respuestas'}`
                          : `Fechado - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'resposta' : 'respostas'}`
                    )
                  : isDone
                    ? i18n.t(
                        'statusCompleted'
                      )
                    : isOpenRepeatable
                      ? (
                          language === 'en-US'
                            ? `Open - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'response' : 'responses'}`
                            : language === 'es-ES'
                              ? `Abierto - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'respuesta' : 'respuestas'}`
                              : `Aberto - ${repeatableResponsesCount} ${repeatableResponsesCount === 1 ? 'resposta' : 'respostas'}`
                        )
                      : i18n.t(
                          'statusPending'
                        )}
            </Text>
          </View>

          {isVisitSurvey ? (
            <View style={styles.lockRow}>
              <Lock size={12} color={textSecondary} />
              <Text style={[styles.lockText, { color: textSecondary }]}>{rt('taskAnswerInVisit', language)}</Text>
            </View>
          ) : (
            <Text style={[styles.freqLabel, { color: accent }]}>
              {getFrequencyLabel(item.frequencia, language)}
            </Text>
          )}
        </View>

        {isVisitSurvey ? (
          <View>
            <Text style={[styles.taskSurveyPrefix, { color: textSecondary }]}>Survey</Text>
            <Text style={[styles.cardTitle, { color: textPrimary, marginBottom: 4 }]}>
              {item.surveyTitle || item.titulo || rt('taskSurveyDefault', language)}
            </Text>

            <Text style={[styles.taskStoreName, { color: textSecondary }]} numberOfLines={1}>
              {item.loja_nome || rt('taskStoreNotInformed', language)}
            </Text>

            <View style={[styles.visitTaskInfoBox, { backgroundColor: surfaceAlt, borderColor: border }]}>
              <Lock size={13} color={textSecondary} />
              <Text style={[styles.visitTaskInfoText, { color: textSecondary }]}>
                {rt('taskAvailableOnlyInVisit', language)}
              </Text>

              {item.qtdPerguntas > 0 ? (
                <Text style={[styles.visitTaskQuestionCount, { color: textSecondary }]}>
                  {item.qtdPerguntas} {rt('taskQuestions', language)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <>
            <Text style={[styles.cardTitle, { color: textPrimary }]}>{item.titulo}</Text>

            <View style={styles.taskFooter}>
              <View style={styles.deadlineRow}>
                <TrafficIcon size={14} color={traffic.color} />
                <Text style={[styles.deadlineText, { color: traffic.color }]}>
                  {traffic.text}
                  {displayDeadline && !isDone && traffic.text !== rt('noDeadline', language)
                    ? ` (${displayDeadline})`
                    : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={textSecondary} />
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View
      testID="route-screen"
      accessibilityLabel="route-screen"
      style={[styles.container, { backgroundColor: bg }]}
    >
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.center}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </View>
    );
  }

  const getModalStyles = (type: string) => {
    switch (type) {
      case 'success':
        return { icon: CheckCircle2, color: '#10B981', bg: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)' };
      case 'warning':
        return { icon: AlertTriangle, color: '#F59E0B', bg: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)' };
      case 'error':
        return { icon: AlertCircle, color: '#EF4444', bg: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)' };
      default:
        return { icon: AlertCircle, color: '#3B82F6', bg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)' };
    }
  };

  const modalUI = getModalStyles(customAlert.type);
  const ModalIcon = modalUI.icon;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <View style={[styles.header, { backgroundColor: bg, borderBottomColor: border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerIconButton, { backgroundColor: surface, borderColor: border }]}
            activeOpacity={0.85}
          >
            <ArrowLeft size={22} color={textPrimary} />
          </TouchableOpacity>

          <Text
              testID="route-screen"
              accessibilityLabel="route-screen"
              style={[styles.headerTitle, { color: textPrimary }]}
            >
              {i18n.t('myRoute')}
            </Text>

          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            style={[styles.headerIconButton, { backgroundColor: surface, borderColor: border }]}
            activeOpacity={0.85}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <RefreshCw size={21} color={textPrimary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryPill, { backgroundColor: surface, borderColor: border }]}>
            <Text style={[styles.summaryValue, { color: textPrimary }]}>
              {summary.visitsDone}/{summary.todayVisits}
            </Text>
            <Text style={[styles.summaryLabel, { color: textSecondary }]}>
              {i18n.t('tabVisits')}
            </Text>
          </View>

          <View style={[styles.summaryPill, { backgroundColor: surface, borderColor: border }]}>
            <Text style={[styles.summaryValue, { color: textPrimary }]}>
              {summary.tasksDone}/{summary.tasks}
            </Text>
            <Text style={[styles.summaryLabel, { color: textSecondary }]}>
              {i18n.t('tabTasks')}
            </Text>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: surface, borderColor: border }]}>
          <Search size={18} color={textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: textPrimary }]}
            placeholder={
              activeTab === 'VISITAS' ||
              activeTab === 'CARTEIRA'
                ? i18n.t('searchStore')
                : i18n.t('searchTask')
            }
            placeholderTextColor={textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: bg, borderBottomColor: border }]}>

        {fieldPortfolio.mode !== 'CARTEIRA_LIVRE' && (
          <TouchableOpacity
            style={[
              styles.tabBtn,
              {
                backgroundColor:
                  activeTab === 'VISITAS'
                    ? surface
                    : 'transparent',
                borderColor:
                  activeTab === 'VISITAS'
                    ? `${accent}33`
                    : 'transparent',
              },
            ]}
            onPress={() => {
              setActiveTab('VISITAS');
              setSearchQuery('');
            }}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === 'VISITAS'
                      ? accent
                      : textSecondary,
                },
              ]}
            >
              {i18n.t('tabVisits')}
            </Text>
          </TouchableOpacity>
        )}

        {(
          fieldPortfolio.mode === 'CARTEIRA_LIVRE' ||
          fieldPortfolio.mode === 'HIBRIDO'
        ) && (
          <TouchableOpacity
            style={[
              styles.tabBtn,
              {
                backgroundColor:
                  activeTab === 'CARTEIRA'
                    ? surface
                    : 'transparent',
                borderColor:
                  activeTab === 'CARTEIRA'
                    ? `${accent}33`
                    : 'transparent',
              },
            ]}
            onPress={() => {
              setActiveTab('CARTEIRA');
              setSearchQuery('');
            }}
          >
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === 'CARTEIRA'
                      ? accent
                      : textSecondary,
                  fontSize: 11,
                },
              ]}
              numberOfLines={1}
            >
              {rt(
                'portfolioTab',
                language
              )}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.tabBtn,
            {
              backgroundColor:
                activeTab === 'TAREFAS'
                  ? surface
                  : 'transparent',
              borderColor:
                activeTab === 'TAREFAS'
                  ? `${accent}33`
                  : 'transparent',
            },
          ]}
          onPress={() => {
            setActiveTab('TAREFAS');
            setSearchQuery('');
          }}
        >
          <Text
            style={[
              styles.tabText,
              {
                color:
                  activeTab === 'TAREFAS'
                    ? accent
                    : textSecondary,
              },
            ]}
          >
            {i18n.t('tabTasks')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredData}
        keyExtractor={(item) => String(item.__type ? item.id : item.id)}
        renderItem={
          activeTab === 'VISITAS'
            ? renderVisitCard
            : activeTab === 'CARTEIRA'
              ? renderPortfolioCard
              : ({ item }: { item: any }) =>
                  item.__type === 'TASK_GROUP_HEADER'
                    ? renderTaskGroupHeader(item)
                    : renderTaskCard({ item })
        }
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        progressViewOffset={Math.max(insets.top, 0) + 120}
        tintColor={accent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <AlertCircle size={40} color={textSecondary} />
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {activeTab === 'CARTEIRA'
                ? rt(
                    'portfolioEmpty',
                    language
                  )
                : i18n.t(
                    'noActivityToday'
                  )}
            </Text>
          </View>
        }
      />

      <Modal visible={customAlert.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: modalUI.bg }]}>
              <ModalIcon size={32} color={modalUI.color} />
            </View>

            <Text style={[styles.modalTitle, { color: textPrimary }]}>{customAlert.title}</Text>
            <Text style={[styles.modalText, { color: textSecondary }]}>{customAlert.message}</Text>

            <TouchableOpacity
              style={[styles.modalBtnPri, { backgroundColor: modalUI.color }]}
              onPress={() => {
                if (customAlert.primaryAction) customAlert.primaryAction();
                else hideCustomAlert();
              }}
            >
              <Text style={styles.modalBtnPriText}>{customAlert.primaryText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryPill: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 11, paddingHorizontal: 13 },
  summaryValue: { fontSize: 19, fontWeight: '900', marginBottom: 2 },
  summaryLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingHorizontal: 15, height: 50, borderWidth: 1, gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600' },
  tabContainer: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20, paddingVertical: 10, gap: 10 },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  tabText: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  listContent: { padding: 20, paddingBottom: 120 },
  taskGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  taskGroupTitle: {
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  taskGroupSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  taskGroupCount: {
    minWidth: 34,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginLeft: 12,
  },
  taskGroupCountText: {
    fontSize: 12,
    fontWeight: '900',
  },

  cardWrapper: {
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  insightIntegrated: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  insightPriority: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginLeft: 6, letterSpacing: 1 },
  insightMessage: { fontSize: 12, fontWeight: '600', lineHeight: 16 },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timePillText: { fontSize: 11, fontWeight: '800' },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  cardSubtitle: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  compactTimingArea: { marginTop: 10 },
  compactTimingRow: { gap: 3 },
  compactTimingText: { fontSize: 11, fontWeight: '700' },
  compactTimingStrong: { fontSize: 11, fontWeight: '900' },
  compactBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  compactTimingBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  compactTimingBadgeText: { fontSize: 10, fontWeight: '900' },
  taskFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: 'rgba(150,150,150,0.1)' },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  deadlineText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
  freqLabel: { fontSize: 11, fontWeight: '800' },
  taskSurveyPrefix: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  taskStoreName: { fontSize: 13, fontWeight: '800', marginBottom: 10 },
  visitTaskInfoBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 6, marginTop: 4 },
  visitTaskInfoText: { fontSize: 11, fontWeight: '800', flex: 1 },
  visitTaskQuestionCount: { fontSize: 10, fontWeight: '900' },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockText: { fontSize: 11, fontWeight: '800' },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 15 },
  emptyText: { fontSize: 15, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', padding: 25, borderRadius: 24, borderWidth: 1, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  modalText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtnPri: { width: '100%', height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  modalBtnPriText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
});
