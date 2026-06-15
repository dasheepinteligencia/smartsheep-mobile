import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  RefreshCw,
  History,
  Store,
  ClipboardCheck,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  MapPin,
  ChevronRight,
  TrendingUp,
  ListChecks,
  FileText,
  SearchCheck,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';
import { globalSync } from '../services/syncService';
import { api } from '../services/api';
import { getDBConnection } from '../database/db';

const ACCENT_COLOR = '#FF7A00';

const HISTORY_TEXTS = {
  'pt-BR': {
    noDate: 'Sem data',
    notInformedLower: 'não informada',
    loading: 'Carregando histórico...',
    loadError: 'Não foi possível carregar o histórico local agora.',
    excellent: 'Excelente',
    veryGood: 'Muito bom',
    attention: 'Em atenção',
    low: 'Baixa',
    critical: 'Crítico',
    visited: 'Visitada',
    doneShort: 'Feita',
    notDone: 'Não realizada',
    pending: 'Pendente',
    task: 'Tarefa',
    store: 'Loja',
    scheduledVisit: 'Visita agendada {{index}}',
    predictedTask: 'Tarefa prevista {{index}}',
    predictedTaskSubtitle: 'Tarefa considerada no histórico operacional',
    visitTasks: 'Tarefas de visita',
    standaloneTasks: 'Tarefas avulsas',
    standaloneTask: 'Tarefa avulsa',
    dailyTask: 'Tarefa diária',
    weekPeriod: 'Semana {{start}} a {{end}}',
    halfMonthPeriod: 'Quinzena {{start}} a {{end}}',
    monthPeriod: 'Mês {{start}} a {{end}}',
    title: 'Histórico',
    subtitle: 'Visão rápida do que foi feito e do que ainda falta',
    visitEfficiency: 'Eficiência de visitas',
    taskEfficiency: 'Eficiência de tarefas',
    realizedOf: '{{done}} de {{total}} realizados',
    visitsHint: 'Visitas realizadas divididas por visitas agendadas nos últimos {{days}} dias.',
    tasksHint: 'Tarefas concluídas divididas por tarefas totais nos últimos {{days}} dias.',
    visits: 'Visitas',
    tasks: 'Tarefas',
    efficiencyWord: 'eficiência',
    summary: 'Resumo',
    byDate: 'Por data',
    byStore: 'Por loja',
    byType: 'Por tipo',
    storeAttendance: 'Atendimento em loja',
    scheduled: 'Agendadas',
    visitedPlural: 'Visitadas',
    pendingPlural: 'Pendentes',
    notDonePlural: 'Não realizadas',
    efficiency: 'Eficiência',
    period: 'Período',
    attendanceEfficiency: 'Eficiência de atendimento',
    choosePeriodHint: 'Escolha 7, 15 ou 30 dias para analisar a eficiência do período.',
    latestVisits: 'Últimas visitas',
    noVisitsTitle: 'Sem visitas no período',
    noVisitsMessage: 'As visitas agendadas aparecerão aqui após a sincronização.',
    visitsHistoryEmpty: 'Histórico de visitas vazio',
    visitsByDateMessage: 'As visitas aparecerão agrupadas por data.',
    noStoresTitle: 'Sem lojas no histórico',
    noStoresMessage: 'As lojas aparecerão quando houver visitas sincronizadas.',
    taskEfficiencyTitle: 'Eficiência de tarefas',
    tasksCount: 'Tarefas',
    donePlural: 'Feitas',
    standaloneShort: 'Avulsas',
    latestTasks: 'Últimas tarefas',
    noTasksTitle: 'Sem tarefas no período',
    noTasksMessage: 'As tarefas aparecerão aqui após a sincronização.',
    tasksHistoryEmpty: 'Histórico de tarefas vazio',
    tasksByDateMessage: 'As tarefas aparecerão agrupadas por data.',
    noTaskTypesTitle: 'Sem tipos de tarefas',
    noTaskTypesMessage: 'As tarefas serão separadas por tipo quando existirem dados.',
    visitTask: 'Tarefa de visita',
    historyVisit: 'Histórico de visita',
    historyTask: 'Histórico de tarefa',
    detail: 'Detalhe',
    visitStatus: 'Status da visita',
    taskStatus: 'Status da tarefa',
    notAttended: 'Não atendida',
    completed: 'Concluída',
    data: 'Data',
    duration: 'Duração',
    justification: 'Justificativa',
    type: 'Tipo',
    status: 'Status',
    operationalHistory: 'Histórico operacional',
    operationalHistoryText: 'Perfect Store permanece separado. Aqui entram apenas visitas e tarefas.',
    lastSync: 'Última sincronização',
    checkout: 'Checkout',
    checkin: 'Check-in',
    dueDate: 'Vencimento',
    overdue: 'Vencida',
    notCompleted: 'Não realizada',
  },
  'en-US': {
    noDate: 'No date',
    notInformedLower: 'not informed',
    loading: 'Loading history...',
    loadError: 'Unable to load local history right now.',
    excellent: 'Excellent',
    veryGood: 'Very good',
    attention: 'Needs attention',
    low: 'Low',
    critical: 'Critical',
    visited: 'Visited',
    doneShort: 'Done',
    notDone: 'Not completed',
    pending: 'Pending',
    task: 'Task',
    store: 'Store',
    scheduledVisit: 'Scheduled visit {{index}}',
    predictedTask: 'Planned task {{index}}',
    predictedTaskSubtitle: 'Task considered in operational history',
    visitTasks: 'Visit tasks',
    standaloneTasks: 'Standalone tasks',
    standaloneTask: 'Standalone task',
    dailyTask: 'Daily task',
    weekPeriod: 'Week {{start}} to {{end}}',
    halfMonthPeriod: 'Fortnight {{start}} to {{end}}',
    monthPeriod: 'Month {{start}} to {{end}}',
    title: 'History',
    subtitle: 'Quick view of what was done and what is still pending',
    visitEfficiency: 'Visit efficiency',
    taskEfficiency: 'Task efficiency',
    realizedOf: '{{done}} of {{total}} completed',
    visitsHint: 'Completed visits divided by scheduled visits in the last {{days}} days.',
    tasksHint: 'Completed tasks divided by total tasks in the last {{days}} days.',
    visits: 'Visits',
    tasks: 'Tasks',
    efficiencyWord: 'efficiency',
    summary: 'Summary',
    byDate: 'By date',
    byStore: 'By store',
    byType: 'By type',
    storeAttendance: 'Store attendance',
    scheduled: 'Scheduled',
    visitedPlural: 'Visited',
    pendingPlural: 'Pending',
    notDonePlural: 'Not completed',
    efficiency: 'Efficiency',
    period: 'Period',
    attendanceEfficiency: 'Attendance efficiency',
    choosePeriodHint: 'Choose 7, 15 or 30 days to analyze period efficiency.',
    latestVisits: 'Latest visits',
    noVisitsTitle: 'No visits in the period',
    noVisitsMessage: 'Scheduled visits will appear here after synchronization.',
    visitsHistoryEmpty: 'Visit history empty',
    visitsByDateMessage: 'Visits will appear grouped by date.',
    noStoresTitle: 'No stores in history',
    noStoresMessage: 'Stores will appear when synchronized visits exist.',
    taskEfficiencyTitle: 'Task efficiency',
    tasksCount: 'Tasks',
    donePlural: 'Done',
    standaloneShort: 'Standalone',
    latestTasks: 'Latest tasks',
    noTasksTitle: 'No tasks in the period',
    noTasksMessage: 'Tasks will appear here after synchronization.',
    tasksHistoryEmpty: 'Task history empty',
    tasksByDateMessage: 'Tasks will appear grouped by date.',
    noTaskTypesTitle: 'No task types',
    noTaskTypesMessage: 'Tasks will be separated by type when data exists.',
    visitTask: 'Visit task',
    historyVisit: 'Visit history',
    historyTask: 'Task history',
    detail: 'Detail',
    visitStatus: 'Visit status',
    taskStatus: 'Task status',
    notAttended: 'Not attended',
    completed: 'Completed',
    data: 'Date',
    duration: 'Duration',
    justification: 'Justification',
    type: 'Type',
    status: 'Status',
    operationalHistory: 'Operational history',
    operationalHistoryText: 'Perfect Store remains separate. Only visits and tasks are shown here.',
    lastSync: 'Last sync',
    checkout: 'Check-out',
    checkin: 'Check-in',
    dueDate: 'Due date',
    overdue: 'Overdue',
    notCompleted: 'Not completed',
  },
  'es-ES': {
    noDate: 'Sin fecha',
    notInformedLower: 'no informada',
    loading: 'Cargando historial...',
    loadError: 'No fue posible cargar el historial local ahora.',
    excellent: 'Excelente',
    veryGood: 'Muy bueno',
    attention: 'En atención',
    low: 'Baja',
    critical: 'Crítico',
    visited: 'Visitada',
    doneShort: 'Hecha',
    notDone: 'No realizada',
    pending: 'Pendiente',
    task: 'Tarea',
    store: 'Tienda',
    scheduledVisit: 'Visita programada {{index}}',
    predictedTask: 'Tarea prevista {{index}}',
    predictedTaskSubtitle: 'Tarea considerada en el historial operativo',
    visitTasks: 'Tareas de visita',
    standaloneTasks: 'Tareas independientes',
    standaloneTask: 'Tarea independiente',
    dailyTask: 'Tarea diaria',
    weekPeriod: 'Semana {{start}} a {{end}}',
    halfMonthPeriod: 'Quincena {{start}} a {{end}}',
    monthPeriod: 'Mes {{start}} a {{end}}',
    title: 'Historial',
    subtitle: 'Vista rápida de lo que se hizo y lo que aún falta',
    visitEfficiency: 'Eficiencia de visitas',
    taskEfficiency: 'Eficiencia de tareas',
    realizedOf: '{{done}} de {{total}} realizados',
    visitsHint: 'Visitas realizadas divididas por visitas programadas en los últimos {{days}} días.',
    tasksHint: 'Tareas concluidas divididas por tareas totales en los últimos {{days}} días.',
    visits: 'Visitas',
    tasks: 'Tareas',
    efficiencyWord: 'eficiencia',
    summary: 'Resumen',
    byDate: 'Por fecha',
    byStore: 'Por tienda',
    byType: 'Por tipo',
    storeAttendance: 'Atención en tienda',
    scheduled: 'Programadas',
    visitedPlural: 'Visitadas',
    pendingPlural: 'Pendientes',
    notDonePlural: 'No realizadas',
    efficiency: 'Eficiencia',
    period: 'Período',
    attendanceEfficiency: 'Eficiencia de atención',
    choosePeriodHint: 'Elige 7, 15 o 30 días para analizar la eficiencia del período.',
    latestVisits: 'Últimas visitas',
    noVisitsTitle: 'Sin visitas en el período',
    noVisitsMessage: 'Las visitas programadas aparecerán aquí después de la sincronización.',
    visitsHistoryEmpty: 'Historial de visitas vacío',
    visitsByDateMessage: 'Las visitas aparecerán agrupadas por fecha.',
    noStoresTitle: 'Sin tiendas en el historial',
    noStoresMessage: 'Las tiendas aparecerán cuando haya visitas sincronizadas.',
    taskEfficiencyTitle: 'Eficiencia de tareas',
    tasksCount: 'Tareas',
    donePlural: 'Hechas',
    standaloneShort: 'Independientes',
    latestTasks: 'Últimas tareas',
    noTasksTitle: 'Sin tareas en el período',
    noTasksMessage: 'Las tareas aparecerán aquí después de la sincronización.',
    tasksHistoryEmpty: 'Historial de tareas vacío',
    tasksByDateMessage: 'Las tareas aparecerán agrupadas por fecha.',
    noTaskTypesTitle: 'Sin tipos de tareas',
    noTaskTypesMessage: 'Las tareas serán separadas por tipo cuando existan datos.',
    visitTask: 'Tarea de visita',
    historyVisit: 'Historial de visita',
    historyTask: 'Historial de tarea',
    detail: 'Detalle',
    visitStatus: 'Estado de la visita',
    taskStatus: 'Estado de la tarea',
    notAttended: 'No atendida',
    completed: 'Concluida',
    data: 'Fecha',
    duration: 'Duración',
    justification: 'Justificación',
    type: 'Tipo',
    status: 'Estado',
    operationalHistory: 'Historial operativo',
    operationalHistoryText: 'Perfect Store permanece separado. Aquí entran solo visitas y tareas.',
    lastSync: 'Última sincronización',
    checkout: 'Check-out',
    checkin: 'Check-in',
    dueDate: 'Vencimiento',
    overdue: 'Vencida',
    notCompleted: 'No realizada',
  },
} as const;

type HistoryTextKey = keyof typeof HISTORY_TEXTS['pt-BR'];

const historyText = (key: HistoryTextKey, language: string, params?: Record<string, string | number>) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  let value = HISTORY_TEXTS[lang][key];

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(`{{${paramKey}}}`, String(paramValue));
    });
  }

  return value;
};

const getHistoryLocale = (language: string) => {
  if (language === 'en-US') return 'en-US';
  if (language === 'es-ES') return 'es-ES';
  return 'pt-BR';
};


const getReadableTextColor = (hexColor?: string) => {
  const fallback = '#FFFFFF';
  const hex = String(hexColor || '').replace('#', '').trim();

  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return fallback;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
};


type MainTab = 'visits' | 'tasks';
type VisitSubTab = 'summary' | 'timeline' | 'stores';
type TaskSubTab = 'summary' | 'timeline' | 'types';
type PeriodDays = 7 | 15 | 30;

type VisitHistoryItem = {
  id: string;
  loja_id: string;
  lojaNome: string;
  dataKey: string;
  status: string;
  done: boolean;
  checkin_at?: string | null;
  checkout_at?: string | null;
  hora_entrada_prevista?: string | null;
  hora_saida_prevista?: string | null;
  justificativa?: string | null;
  raw: any;
};

type TaskHistoryItem = {
  id: string;
  title: string;
  subtitle: string;
  loja_id?: string | null;
  lojaNome?: string | null;
  dataKey: string;
  status: string;
  done: boolean;
  kind: 'VISITA' | 'AVULSA';
  raw: any;
};

const safeArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const safeParseJson = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const safeNumber = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const getLocalDateKey = (date: Date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
};

const formatToYMD = (dateValue?: any) => {
  if (dateValue === null || dateValue === undefined) return null;

  if (dateValue instanceof Date) {
    if (Number.isNaN(dateValue.getTime())) return null;
    return getLocalDateKey(dateValue);
  }

  if (typeof dateValue === 'number') {
    const ms = dateValue < 10000000000 ? dateValue * 1000 : dateValue;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    return getLocalDateKey(date);
  }

  const raw = String(dateValue).trim();

  if (!raw || raw === 'null' || raw === 'undefined') return null;

  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const ms = raw.length === 10 ? n * 1000 : n;
    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) return getLocalDateKey(date);
  }

  const isoMatch = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = raw.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/);
  if (slashMatch) {
    const a = slashMatch[1];
    const b = slashMatch[2];
    const c = slashMatch[3];

    if (a.length === 4) {
      return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    }

    return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return getLocalDateKey(parsed);

  return null;
};

const isWithinRange = (dateKey: string | null | undefined, startKey: string, endKey: string) => {
  if (!dateKey) return false;
  return String(dateKey) >= startKey && String(dateKey) <= endKey;
};

const addDaysToKey = (dateKey: string | null, days: number) => {
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
};

const getHalfMonthEndKey = (dateKey: string | null) => {
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (day <= 15) {
    return `${year}-${String(month + 1).padStart(2, '0')}-15`;
  }

  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const getMonthEndKey = (dateKey: string | null) => {
  if (!dateKey) return null;

  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const formatDate = (dateKey?: string | null, language = 'pt-BR') => {
  if (!dateKey) return historyText('noDate', language);

  try {
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;

    return date.toLocaleDateString(getHistoryLocale(language), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
};

const formatShortDate = (dateKey?: string | null, language = 'pt-BR') => {
  if (!dateKey) return historyText('noDate', language);

  try {
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateKey;

    return date.toLocaleDateString(getHistoryLocale(language), {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return dateKey;
  }
};

const formatTime = (value: any, language = 'pt-BR') => {
  if (!value) return '--:--';

  const str = String(value);

  if (/^\d{2}:\d{2}/.test(str)) return str.substring(0, 5);

  try {
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) return '--:--';

    return date.toLocaleTimeString(getHistoryLocale(language), {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '--:--';
  }
};

const formatDuration = (start: any, end: any) => {
  if (!start || !end) return '--';

  try {
    const s = new Date(start);
    const e = new Date(end);

    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '--';

    const diff = Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
    const h = Math.floor(diff / 60);
    const m = diff % 60;

    if (h <= 0) return `${m}min`;
    return `${h}h ${String(m).padStart(2, '0')}min`;
  } catch {
    return '--';
  }
};

const formatNumber = (value: any, language = 'pt-BR') => {
  const n = safeNumber(value);

  try {
    return n.toLocaleString(getHistoryLocale(language));
  } catch {
    return String(n);
  }
};

const formatLastSync = (value: any, language = 'pt-BR') => {
  if (!value) return historyText('notInformedLower', language);

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString(getHistoryLocale(language));
  } catch {
    return String(value);
  }
};

const getVisitCheckinValue = (row: any = {}, raw: any = {}) => {
  return (
    row?.checkin_at ||
    row?.checkinAt ||
    row?.data_checkin ||
    row?.entrada_at ||
    row?.entradaAt ||
    row?.inicio_at ||
    row?.started_at ||
    raw?.checkin_at ||
    raw?.checkinAt ||
    raw?.data_checkin ||
    raw?.entrada_at ||
    raw?.entradaAt ||
    raw?.inicio_at ||
    raw?.started_at ||
    null
  );
};

const getVisitCheckoutValue = (row: any = {}, raw: any = {}) => {
  return (
    row?.checkout_at ||
    row?.checkoutAt ||
    row?.data_checkout ||
    row?.saida_at ||
    row?.saidaAt ||
    row?.fim_at ||
    row?.finished_at ||
    raw?.checkout_at ||
    raw?.checkoutAt ||
    raw?.data_checkout ||
    raw?.saida_at ||
    raw?.saidaAt ||
    raw?.fim_at ||
    raw?.finished_at ||
    null
  );
};

const hasVisitCheckinAndCheckout = (row: any = {}, raw: any = {}) => {
  return !!getVisitCheckinValue(row, raw) && !!getVisitCheckoutValue(row, raw);
};

const normalizeKeyText = (value: any) => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const isVisitDoneStatus = (_status: any, row?: any) => {
  const raw = safeParseJson(row?.visit_raw_json || row?.raw_json, {});
  return hasVisitCheckinAndCheckout(row, raw);
};

const isTaskDoneStatus = (status: any) => {
  const s = String(status || '').trim().toUpperCase();

  return [
    'REALIZADA',
    'REALIZADO',
    'RESPONDIDA',
    'RESPONDIDO',
    'COMPLETA',
    'COMPLETO',
    'COMPLETED',
    'CONCLUIDA',
    'CONCLUÍDA',
    'FINALIZADA',
    'FINALIZADO',
    'DONE',
    'OK',
  ].includes(s);
};

const getPercentColor = (percent: number) => {
  if (percent >= 90) return '#10B981';
  if (percent >= 70) return '#22C55E';
  if (percent >= 50) return '#F59E0B';
  if (percent >= 30) return '#F97316';
  return '#EF4444';
};

const getEfficiencyLabel = (percent: number, language = 'pt-BR') => {
  if (percent >= 90) return historyText('excellent', language);
  if (percent >= 70) return historyText('veryGood', language);
  if (percent >= 50) return historyText('attention', language);
  if (percent >= 30) return historyText('low', language);
  return historyText('critical', language);
};

const getVisitOperationalStatus = (visit: VisitHistoryItem, language = 'pt-BR') => {
  if (visit.done) {
    return {
      key: 'REALIZADA',
      label: historyText('visited', language),
      shortLabel: historyText('doneShort', language),
      color: '#10B981',
      icon: CheckCircle2,
    };
  }

  const todayKey = getLocalDateKey(new Date());
  const dateKey = String(visit.dataKey || '');

  if (dateKey && dateKey < todayKey) {
    return {
      key: 'NAO_REALIZADA',
      label: historyText('notDone', language),
      shortLabel: historyText('notDone', language),
      color: '#EF4444',
      icon: XCircle,
    };
  }

  return {
    key: 'PENDENTE',
    label: historyText('pending', language),
    shortLabel: historyText('pending', language),
    color: '#F59E0B',
    icon: Clock,
  };
};

const getStatusColor = (done: boolean, status: string) => {
  const s = String(status || '').toUpperCase();

  if (done) return '#10B981';
  if (s.includes('PENDENTE') || s.includes('AGEND')) return '#F59E0B';
  if (s.includes('ATRAS') || s.includes('NÃO') || s.includes('NAO')) return '#EF4444';

  return '#64748B';
};

const getTaskOperationalStatus = (task: TaskHistoryItem, language = 'pt-BR') => {
  const status = String(task.status || '').toUpperCase();
  const todayKey = getLocalDateKey(new Date());
  const dueKey = String(task.dataKey || '');

  if (task.done || isTaskDoneStatus(status)) {
    return {
      key: 'REALIZADA',
      label: historyText('completed', language),
      shortLabel: historyText('doneShort', language),
      color: '#10B981',
      icon: CheckCircle2,
    };
  }

  if (dueKey && dueKey < todayKey) {
    return {
      key: 'NAO_REALIZADA',
      label: historyText('notCompleted', language),
      shortLabel: historyText('notCompleted', language),
      color: '#EF4444',
      icon: XCircle,
    };
  }

  return {
    key: 'PENDENTE',
    label: historyText('pending', language),
    shortLabel: historyText('pending', language),
    color: '#F59E0B',
    icon: Clock,
  };
};

const getTaskTitle = (row: any, raw: any) => {
  return (
    raw?.title ||
    raw?.titulo ||
    raw?.nome ||
    raw?.taskName ||
    raw?.descricao ||
    row?.titulo ||
    row?.nome ||
    row?.descricao ||
    historyText('task', 'pt-BR')
  );
};

const getStoreName = (row: any, raw: any) => {
  return (
    row?.loja_nome ||
    row?.lojaNome ||
    raw?.loja_nome ||
    raw?.lojaNome ||
    raw?.storeName ||
    raw?.store_name ||
    row?.nome_loja ||
    historyText('store', 'pt-BR')
  );
};

const getSurveyPeriod = (dateKey: string, frequency: string) => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { start: dateKey, end: dateKey };

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const freq = String(frequency || '').trim().toUpperCase();

  const fmt = (d: Date) => getLocalDateKey(d);

  if (freq === 'DIARIA' || freq === 'DIÁRIA' || freq === 'POR_VISITA') {
    return { start: dateKey, end: dateKey };
  }

  if (freq === 'SEMANAL') {
    const dayOfWeek = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return { start: fmt(start), end: fmt(end) };
  }

  if (freq === 'QUINZENAL') {
    if (day <= 15) {
      return {
        start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        end: `${year}-${String(month + 1).padStart(2, '0')}-15`,
      };
    }

    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
      start: `${year}-${String(month + 1).padStart(2, '0')}-16`,
      end: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (freq === 'MENSAL') {
    const lastDay = new Date(year, month + 1, 0).getDate();

    return {
      start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      end: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  return { start: dateKey, end: dateKey };
};

const getTaskBaseDateKey = (row: any, raw: any) => {
  return (
    formatToYMD(
      row?.data_vencimento ||
        row?.vencimento ||
        row?.due_date ||
        row?.deadline ||
        row?.data_fim ||
        row?.data_programada ||
        row?.data_inicio ||
        row?.created_at ||
        row?.criado_em ||
        raw?.data_vencimento ||
        raw?.vencimento ||
        raw?.due_date ||
        raw?.deadline ||
        raw?.data_fim ||
        raw?.data_programada ||
        raw?.data_inicio ||
        raw?.created_at ||
        raw?.criado_em
    ) || getLocalDateKey(new Date())
  );
};

const getDistinctVisitDates = (visits: VisitHistoryItem[]) => {
  return Array.from(new Set(visits.map((visit) => visit.dataKey).filter(Boolean))).sort();
};

const getTaskDateKey = (row: any, raw: any) => {
  const explicitDue =
    formatToYMD(
      row?.data_vencimento ||
        row?.vencimento ||
        row?.due_date ||
        row?.deadline ||
        row?.data_fim ||
        row?.expires_at ||
        raw?.data_vencimento ||
        raw?.vencimento ||
        raw?.due_date ||
        raw?.deadline ||
        raw?.data_fim ||
        raw?.expires_at
    );

  if (explicitDue) return explicitDue;

  const startKey =
    formatToYMD(
      raw?.data_inicio ||
        row?.data_inicio ||
        raw?.created_at ||
        row?.created_at ||
        raw?.criado_em ||
        row?.criado_em ||
        raw?.createdAt ||
        row?.createdAt
    ) || getLocalDateKey(new Date());

  const freq = String(row?.frequencia || raw?.frequencia || '').trim().toUpperCase();

  if (freq.includes('QUINZENAL')) return getHalfMonthEndKey(startKey) || startKey;
  if (freq.includes('SEMANAL')) return addDaysToKey(startKey, 6) || startKey;
  if (freq.includes('MENSAL')) return getMonthEndKey(startKey) || startKey;

  // DIARIA, UNICA ou sem frequência: vence no próprio dia em que foi criada/iniciada.
  return startKey;
};

const buildDateRange = (daysBack = 30) => {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - daysBack + 1);

  return {
    startKey: getLocalDateKey(start),
    endKey: getLocalDateKey(today),
  };
};

const getMainProjectId = (user: any) => {
  return (
    user?.allowed_project_ids?.[0] ||
    user?.allowedProjectIds?.[0] ||
    user?.projectId ||
    user?.project_id ||
    user?.projeto_id ||
    null
  );
};

const getUserCustomData = (user: any) => safeParseJson(user?.custom_data || user?.customData, {});

const getHistory7dFromLocalContext = (user: any, visitsRows: any[], taskRows: any[]) => {
  let h7d = getUserCustomData(user)?.history_7d || null;

  try {
    const visitWithConfig = visitsRows.find((v) => String(v.project_config_json || '').includes('history_7d'));
    if (visitWithConfig) {
      const cfg = safeParseJson(visitWithConfig.project_config_json, {});
      if (cfg?.history_7d) h7d = cfg.history_7d;
    }
  } catch {}

  try {
    const taskWithConfig = taskRows.find((t) => String(t.task_raw_json || '').includes('history_7d'));
    if (taskWithConfig) {
      const raw = safeParseJson(taskWithConfig.task_raw_json, {});
      if (raw?.project_config?.history_7d) h7d = raw.project_config.history_7d;
    }
  } catch {}

  return h7d;
};



const getBackendTaskStatus = (row: any, raw: any) => {
  return String(row?.status || raw?.status || row?.situacao || raw?.situacao || 'PENDENTE').toUpperCase();
};

const getTaskTemplateKey = (title: any, storeId?: any, storeName?: any) => {
  const base = normalizeKeyText(title);

  if (!storeId && !storeName) return base;

  return `${base}__${normalizeKeyText(storeId || storeName)}`;
};

const isRealStandaloneTask = (row: any, raw: any) => {
  const id = String(row?.id || raw?.id || '').toLowerCase();
  const title = String(row?.titulo || row?.nome || raw?.titulo || raw?.nome || raw?.title || '').toLowerCase();
  const pesquisaId = String(row?.pesquisa_id || raw?.pesquisa_id || '').toLowerCase();
  const lojaNome = String(row?.loja_nome || raw?.loja_nome || raw?.lojaNome || '').toLowerCase();
  const freq = String(row?.frequencia || raw?.frequencia || '').trim().toUpperCase();

  if (id.includes('sys-config') || pesquisaId.includes('sys-config')) return false;
  if (title.includes('system config') || lojaNome.includes('system config')) return false;

  return freq !== 'POR_VISITA';
};

const isSystemConfigTemplate = (row: any, raw: any) => {
  const id = String(row?.id || raw?.id || row?.pesquisa_id || raw?.pesquisa_id || '').toLowerCase();
  const title = String(row?.titulo || row?.nome || raw?.titulo || raw?.nome || raw?.title || '').toLowerCase();
  const lojaNome = String(row?.loja_nome || raw?.loja_nome || raw?.lojaNome || '').toLowerCase();

  return (
    id.includes('sys-config') ||
    title.includes('system config') ||
    title.includes('config payload') ||
    lojaNome.includes('system config')
  );
};

const isTaskVisitSurveyTemplate = (row: any, raw: any) => {
  const id = String(row?.id || raw?.id || '').toLowerCase();
  const title = String(row?.titulo || row?.nome || raw?.titulo || raw?.nome || raw?.title || '').toLowerCase();
  const lojaNome = String(row?.loja_nome || raw?.loja_nome || raw?.lojaNome || '').toLowerCase();
  const freq = String(row?.frequencia || raw?.frequencia || '').trim().toUpperCase();

  if (id.includes('sys-config') || title.includes('system config') || lojaNome.includes('system config')) return false;

  return freq === 'POR_VISITA';
};

const getSavedCollectionsFromVisit = (visit: VisitHistoryItem) => {
  const row = visit?.raw || {};
  const candidates = [
    row?.coletas_salvas,
    row?.coletas,
    row?.collections,
    row?.project_config?.coletas_salvas,
    row?.project_config?.coletas,
  ];

  try {
    const cfg = safeParseJson(row?.project_config_json, {});
    candidates.push(cfg?.coletas_salvas, cfg?.coletas);
  } catch {}

  try {
    const raw = safeParseJson(row?.visit_raw_json || row?.raw_json, {});
    candidates.push(raw?.coletas_salvas, raw?.coletas, raw?.project_config?.coletas_salvas, raw?.project_config?.coletas);
  } catch {}

  for (const candidate of candidates) {
    const parsed = typeof candidate === 'string' ? safeParseJson(candidate, []) : candidate;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  }

  return [];
};


const deepFindSurveyAnswer = (source: any, surveyId: any, surveyTitle: any, depth = 0): boolean => {
  if (!source || depth > 5) return false;

  const wantedId = String(surveyId || '').toLowerCase();
  const wantedTitle = String(surveyTitle || '').toLowerCase().trim();

  if (typeof source === 'string') {
    const lower = source.toLowerCase();

    if (!lower || lower === 'null' || lower === 'undefined') return false;

    if (
      (wantedId && lower.includes(wantedId)) ||
      (wantedTitle && wantedTitle.length > 3 && lower.includes(wantedTitle))
    ) {
      return (
        lower.includes('respond') ||
        lower.includes('realiz') ||
        lower.includes('conclu') ||
        lower.includes('answer') ||
        lower.includes('done') ||
        lower.includes('completed') ||
        lower.includes('coleta') ||
        lower.includes('resposta')
      );
    }

    try {
      const parsed = JSON.parse(source);
      return deepFindSurveyAnswer(parsed, surveyId, surveyTitle, depth + 1);
    } catch {
      return false;
    }
  }

  if (Array.isArray(source)) {
    return source.some((item) => deepFindSurveyAnswer(item, surveyId, surveyTitle, depth + 1));
  }

  if (typeof source === 'object') {
    const keys = Object.keys(source);
    const lowerObject = JSON.stringify(source).toLowerCase();

    const idFields = [
      source.pesquisa_id,
      source.pesquisaId,
      source.id_pesquisa,
      source.surveyId,
      source.survey_id,
      source.formId,
      source.form_id,
      source.id,
    ];

    const titleFields = [
      source.titulo,
      source.title,
      source.nome,
      source.name,
      source.pesquisa_nome,
      source.surveyName,
      source.survey_name,
    ];

    const statusFields = [
      source.status,
      source.status_pesquisa,
      source.situacao,
      source.state,
      source.completed,
      source.done,
      source.finalizado,
      source.respondido,
      source.respondida,
      source.realizado,
      source.realizada,
      source.enviado,
      source.synced,
    ];

    const matchesId = wantedId && idFields.some((value) => String(value || '').toLowerCase() === wantedId);
    const matchesTitle =
      wantedTitle &&
      wantedTitle.length > 3 &&
      titleFields.some((value) => String(value || '').toLowerCase().trim() === wantedTitle);

    const hasAnswerPayload =
      Array.isArray(source.respostas) ||
      Array.isArray(source.answers) ||
      Array.isArray(source.items) ||
      Array.isArray(source.questions) ||
      Array.isArray(source.campos) ||
      source.resposta !== undefined ||
      source.answer !== undefined ||
      source.valor !== undefined ||
      source.value !== undefined;

    const statusDone = statusFields.some((value) => {
      if (value === true || value === 1) return true;
      return isTaskDoneStatus(value);
    });

    if ((matchesId || matchesTitle) && (statusDone || hasAnswerPayload)) {
      return true;
    }

    if (
      (wantedId && lowerObject.includes(wantedId)) ||
      (wantedTitle && wantedTitle.length > 3 && lowerObject.includes(wantedTitle))
    ) {
      if (
        lowerObject.includes('respond') ||
        lowerObject.includes('resposta') ||
        lowerObject.includes('realiz') ||
        lowerObject.includes('conclu') ||
        lowerObject.includes('completed') ||
        lowerObject.includes('done') ||
        lowerObject.includes('coleta')
      ) {
        return true;
      }
    }

    return keys.some((key) => deepFindSurveyAnswer(source[key], surveyId, surveyTitle, depth + 1));
  }

  return false;
};

const hasSurveyAnswerForVisit = (visit: VisitHistoryItem, survey: any, surveyIndex: number, totalSurveys: number) => {
  const row = visit?.raw || {};
  const surveyId = survey?.id || survey?.pesquisa_id || survey?.pesquisaId;
  const surveyTitle = survey?.titulo || survey?.nome || survey?.title || survey?.name;
  const collections = getSavedCollectionsFromVisit(visit);

  if (
    collections.some((c: any) => {
      const cId = c?.pesquisa_id || c?.pesquisaId || c?.id_pesquisa || c?.surveyId || c?.survey_id || c?.id;
      const cTitle = c?.titulo || c?.title || c?.nome || c?.name || c?.pesquisa_nome;

      return (
        (surveyId && String(cId || '') === String(surveyId)) ||
        (surveyTitle && String(cTitle || '').toLowerCase().trim() === String(surveyTitle).toLowerCase().trim())
      );
    })
  ) {
    return true;
  }

  if (deepFindSurveyAnswer(row, surveyId, surveyTitle)) return true;

  // Fallback conservador: se a visita só informa "pesquisa_realizada",
  // marca apenas a primeira pesquisa da visita como concluída.
  if (
    surveyIndex === 0 &&
    (row?.pesquisa_realizada === 1 ||
      row?.pesquisa_realizada === true ||
      row?.pesquisaRealizada === true ||
      isTaskDoneStatus(row?.status_pesquisa))
  ) {
    return true;
  }

  return false;
};


const fetchResumoMobile7d = async (projectId: any, userId: any) => {
  if (!projectId || !userId) return null;

  try {
    const res = await api(`/resumo-mobile-7d/${projectId}/${userId}?t=${Date.now()}`, {
      method: 'GET',
    });

    if (!res.ok) return null;

    const data = await res.json();

    return {
      visitsTotal: Number(data?.visitsTotal || 0),
      visitsDone: Number(data?.visitsDone || 0),
      tasksTotal: Number(data?.tasksTotal || 0),
      tasksDone: Number(data?.tasksDone || 0),
    };
  } catch (error: any) {
    console.log('[Histórico] resumo-mobile-7d falhou:', error?.message || error);
    return null;
  }
};

const normalizeVisitListToTarget = (items: VisitHistoryItem[], targetTotal: number, targetDone: number) => {
  if (!targetTotal || targetTotal <= 0) return items;

  let normalized = [...items];

  while (normalized.length < targetTotal) {
    const index = normalized.length + 1;
    normalized.push({
      id: `synthetic_visit_${index}`,
      loja_id: `synthetic_store_${index}`,
      lojaNome: historyText('scheduledVisit', 'pt-BR', { index }),
      dataKey: getLocalDateKey(new Date()),
      status: 'PENDENTE',
      done: false,
      raw: {},
    });
  }

  if (normalized.length > targetTotal) normalized = normalized.slice(0, targetTotal);

  let currentDone = normalized.filter((item) => item.done).length;

  if (currentDone > targetDone) {
    normalized = normalized.map((item) => {
      if (currentDone <= targetDone || !item.done) return item;
      currentDone -= 1;
      return { ...item, done: false, status: 'PENDENTE' };
    });
  }

  if (currentDone < targetDone) {
    normalized = normalized.map((item) => {
      if (currentDone >= targetDone || item.done) return item;
      currentDone += 1;
      return { ...item, done: true, status: 'REALIZADA' };
    });
  }

  return normalized;
};

const normalizeTaskListToTarget = (items: TaskHistoryItem[], targetTotal: number, targetDone: number) => {
  if (!targetTotal || targetTotal <= 0) return items;

  let normalized = [...items];

  while (normalized.length < targetTotal) {
    const index = normalized.length + 1;
    normalized.push({
      id: `synthetic_task_${index}`,
      title: historyText('predictedTask', 'pt-BR', { index }),
      subtitle: historyText('predictedTaskSubtitle', 'pt-BR'),
      loja_id: null,
      lojaNome: null,
      dataKey: getLocalDateKey(new Date()),
      status: 'PENDENTE',
      done: false,
      kind: 'AVULSA',
      raw: {},
    });
  }

  if (normalized.length > targetTotal) normalized = normalized.slice(0, targetTotal);

  let currentDone = normalized.filter((item) => item.done).length;

  if (currentDone > targetDone) {
    normalized = normalized.map((item) => {
      if (currentDone <= targetDone || !item.done) return item;
      currentDone -= 1;
      return { ...item, done: false, status: 'PENDENTE' };
    });
  }

  if (currentDone < targetDone) {
    normalized = normalized.map((item) => {
      if (currentDone >= targetDone || item.done) return item;
      currentDone += 1;
      return { ...item, done: true, status: 'REALIZADA' };
    });
  }

  return normalized;
};


export default function HistoricoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const { theme, language, accentColor } = useSettingsStore();
  const { isSyncing, lastSync } = useSyncStore();

  const isDark = theme === 'dark';

  const bg = isDark ? '#020617' : '#F8FAFC';
  const surface = isDark ? '#0F172A' : '#FFFFFF';
  const surfaceAlt = isDark ? '#111827' : '#F1F5F9';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const accent = accentColor || ACCENT_COLOR;
  const accentText = getReadableTextColor(accent);
  const statusBarBg = bg;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('visits');
  const [visitSubTab, setVisitSubTab] = useState<VisitSubTab>('summary');
  const [taskSubTab, setTaskSubTab] = useState<TaskSubTab>('summary');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodDays>(30);

  const [visits, setVisits] = useState<VisitHistoryItem[]>([]);
  const [tasks, setTasks] = useState<TaskHistoryItem[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<VisitHistoryItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskHistoryItem | null>(null);

  const projectId = getMainProjectId(user);
  const userId = user?.id;

  const { startKey, endKey } = useMemo(() => buildDateRange(selectedPeriod), [selectedPeriod]);

  const visitStats = useMemo(() => {
    const operationalVisits = visits.map((item) => getVisitOperationalStatus(item, language));

    const total = visits.length;
    const done = operationalVisits.filter((item) => item.key === 'REALIZADA').length;
    const pending = operationalVisits.filter((item) => item.key === 'PENDENTE').length;
    const notDone = operationalVisits.filter((item) => item.key === 'NAO_REALIZADA').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const scheduled = total;

    return { total, scheduled, done, pending, notDone, percent };
  }, [visits, language]);

  const taskStats = useMemo(() => {
    const operationalTasks = tasks.map((item) => getTaskOperationalStatus(item, language));

    const total = tasks.length;
    const done = operationalTasks.filter((item) => item.key === 'REALIZADA').length;
    const pending = operationalTasks.filter((item) => item.key === 'PENDENTE').length;
    const notDone = operationalTasks.filter((item) => item.key === 'NAO_REALIZADA').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const visitTasks = tasks.filter((item) => item.kind === 'VISITA').length;
    const standaloneTasks = tasks.filter((item) => item.kind === 'AVULSA').length;

    return { total, done, pending, notDone, percent, visitTasks, standaloneTasks };
  }, [tasks, language]);

  const visitsColor = getPercentColor(visitStats.percent);
  const tasksColor = getPercentColor(taskStats.percent);

  const activeStats = mainTab === 'visits' ? visitStats : taskStats;
  const activeColor = getPercentColor(activeStats.percent);

  const visitsByDate = useMemo(() => {
    const map = new Map<string, VisitHistoryItem[]>();

    visits.forEach((visit) => {
      if (!map.has(visit.dataKey)) map.set(visit.dataKey, []);
      map.get(visit.dataKey)?.push(visit);
    });

    return Array.from(map.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([dateKey, items]) => ({
        dateKey,
        items: items.sort((a, b) => String(a.lojaNome).localeCompare(String(b.lojaNome))),
      }));
  }, [visits]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskHistoryItem[]>();

    tasks.forEach((task) => {
      if (!map.has(task.dataKey)) map.set(task.dataKey, []);
      map.get(task.dataKey)?.push(task);
    });

    return Array.from(map.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([dateKey, items]) => ({
        dateKey,
        items: items.sort((a, b) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          return String(a.title).localeCompare(String(b.title));
        }),
      }));
  }, [tasks]);

  const storeGroups = useMemo(() => {
    const map = new Map<string, VisitHistoryItem[]>();

    visits.forEach((visit) => {
      const key = visit.loja_id || visit.lojaNome;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(visit);
    });

    return Array.from(map.entries())
      .map(([key, items]) => {
        const done = items.filter((item) => item.done).length;
        const percent = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

        return {
          key,
          lojaNome: items[0]?.lojaNome || historyText('store', language),
          total: items.length,
          done,
          percent,
          items: items.sort((a, b) => String(b.dataKey).localeCompare(String(a.dataKey))),
        };
      })
      .sort((a, b) => b.percent - a.percent || a.lojaNome.localeCompare(b.lojaNome));
  }, [visits, language]);

  const taskTypeGroups = useMemo(() => {
    const visitTasks = tasks.filter((item) => item.kind === 'VISITA');
    const standaloneTasks = tasks.filter((item) => item.kind === 'AVULSA');

    const buildGroup = (key: string, title: string, items: TaskHistoryItem[]) => {
      const done = items.filter((item) => item.done).length;
      const percent = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

      return { key, title, total: items.length, done, percent, items };
    };

    return [
      buildGroup('VISITA', historyText('visitTasks', language), visitTasks),
      buildGroup('AVULSA', historyText('standaloneTasks', language), standaloneTasks),
    ].filter((group) => group.total > 0);
  }, [tasks, language]);

  const loadHistorico = async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMessage(null);

    try {
      const db = await getDBConnection();

      const rawVisits = (await db.getAllAsync(`SELECT * FROM visits`)) as any[];
      const rawTasks = (await db.getAllAsync(`SELECT * FROM other_tasks`)) as any[];

      let pesquisasPorVisita: any[] = [];
      let pesquisasGerais: any[] = [];

      try {
        const pesquisas = (await db.getAllAsync(`SELECT * FROM pesquisas`)) as any[];

        const pesquisasAtivas = pesquisas
          .map((p) => ({ ...safeParseJson(p.raw_json || p.pesquisa_json, {}), ...p }))
          .filter((p) => {
            const ativoStr = String(p.ativo ?? 'true').trim().toLowerCase();
            const titulo = String(p.titulo || p.nome || p.id || '').toLowerCase();

            if (ativoStr === 'false' || ativoStr === '0') return false;
            if (titulo.includes('system config') || titulo.includes('sys-config')) return false;

            return true;
          });

        pesquisasPorVisita = pesquisasAtivas.filter((p) => String(p.frequencia || '').trim().toUpperCase() === 'POR_VISITA');
        pesquisasGerais = pesquisasAtivas.filter((p) => String(p.frequencia || '').trim().toUpperCase() !== 'POR_VISITA');
      } catch {}

      // Algumas pesquisas de visita chegam no SQLite como other_tasks com frequência DIÁRIA/POR_VISITA.
      // Elas precisam aumentar o multiplicador de tarefas por visita, e não entrar como avulsas.
      rawTasks.forEach((row) => {
        const raw = safeParseJson(row.task_raw_json || row.raw_json, {});

        if (!isTaskVisitSurveyTemplate(row, raw)) return;

        const id = String(row.pesquisa_id || raw.pesquisa_id || row.id || raw.id || getTaskTitle(row, raw));
        const alreadyExists = pesquisasPorVisita.some((p) => String(p.id || p.pesquisa_id || p.nome || p.titulo) === id);

        if (!alreadyExists) {
          pesquisasPorVisita.push({
            id,
            titulo: getTaskTitle(row, raw),
            nome: getTaskTitle(row, raw),
            frequencia: row.frequencia || raw.frequencia || 'POR_VISITA',
          });
        }
      });

      const qtdPesquisasPorVisita = pesquisasPorVisita.length;

      let h7d = getHistory7dFromLocalContext(user, rawVisits, rawTasks);

      if (!h7d && projectId && userId) {
        h7d = await fetchResumoMobile7d(projectId, userId);
      }

      let rawColetas: any[] = [];

      try {
        rawColetas = (await db.getAllAsync(`SELECT * FROM coletas`)) as any[];
      } catch {}

      if (rawColetas.length === 0 && projectId) {
        try {
          const resColetas = await api(`/coletas/${projectId}?t=${Date.now()}`, { method: 'GET' });

          if (resColetas.ok) {
            const dataColetas = await resColetas.json();
            rawColetas = Array.isArray(dataColetas) ? dataColetas : safeArray(dataColetas?.data || dataColetas?.coletas || dataColetas?.items);
          }
        } catch (error: any) {
          console.log('[Histórico] coletas não disponíveis:', error?.message || error);
        }
      }


      let visitItems: VisitHistoryItem[] = rawVisits
        .map((row) => {
          const raw = safeParseJson(row.visit_raw_json || row.raw_json || row.project_config_json, {});
          const dataKey =
            formatToYMD(row.data_programada || raw.data_programada || row.checkin_at || row.checkout_at || row.criado_em) ||
            getLocalDateKey(new Date());

          const status = String(row.status || raw.status || 'PENDENTE').toUpperCase();
          const done = isVisitDoneStatus(status, row);

          return {
            id: String(row.id || raw.id || `${row.loja_id}_${dataKey}`),
            loja_id: String(row.loja_id || raw.loja_id || raw.lojaId || ''),
            lojaNome: getStoreName(row, raw),
            dataKey,
            status,
            done,
            checkin_at: getVisitCheckinValue(row, raw),
            checkout_at: getVisitCheckoutValue(row, raw),
            hora_entrada_prevista: row.hora_entrada_prevista || raw.hora_entrada_prevista || null,
            hora_saida_prevista: row.hora_saida_prevista || raw.hora_saida_prevista || null,
            justificativa: row.justificativa || raw.justificativa || raw.justificativa_texto || null,
            raw: row,
          };
        })
        .filter((visit) => isWithinRange(visit.dataKey, startKey, endKey))
        .sort((a, b) => String(b.dataKey).localeCompare(String(a.dataKey)));

      const localCompletedVisits = visitItems.filter((visit) => visit.done);

      // Fonte complementar: a rota do histórico da Perfect Store já resolveu o problema
      // de juntar visitas agendadas/pendentes/realizadas. Aqui usamos apenas a parte
      // operacional das visitas, ignorando nota de Perfect Store.
      try {
        if (projectId && userId) {
          const res = await api(`/perfect-store/historico-mobile/${projectId}/${userId}?limit=500&t=${Date.now()}`, {
            method: 'GET',
          });

          if (res.ok) {
            const data = await res.json();
            const backendVisits = safeArray(data?.historico)
              .map((item: any) => {
                const dataKey =
                  formatToYMD(item?.dataKey || item?.data || item?.criado_em || item?.data_programada) ||
                  getLocalDateKey(new Date());

                const status = String(item?.status || item?.statusVisita || 'PENDENTE').toUpperCase();

                const localMatch = visitItems.find((v) =>
                  String(v.loja_id) === String(item?.loja_id || item?.lojaId || '') &&
                  String(v.dataKey) === String(dataKey)
                );

                const done = hasVisitCheckinAndCheckout(item, localMatch?.raw || {});

                return {
                  id: String(item?.registroVisitaId || item?.visitaAgendadaId || item?.id || `${item?.loja_id}_${dataKey}`),
                  loja_id: String(item?.loja_id || item?.lojaId || ''),
                  lojaNome: item?.lojaNome || item?.loja_nome || localMatch?.lojaNome || historyText('store', language),
                  dataKey,
                  status,
                  done,
                  checkin_at: getVisitCheckinValue(item, localMatch?.raw || {}),
                  checkout_at: getVisitCheckoutValue(item, localMatch?.raw || {}),
                  hora_entrada_prevista: item?.hora_entrada_prevista || localMatch?.hora_entrada_prevista || null,
                  hora_saida_prevista: item?.hora_saida_prevista || localMatch?.hora_saida_prevista || null,
                  justificativa: item?.justificativa || localMatch?.justificativa || null,
                  raw: localMatch?.raw || item,
                } as VisitHistoryItem;
              })
              .filter((visit: VisitHistoryItem) => isWithinRange(visit.dataKey, startKey, endKey))
              .sort((a: VisitHistoryItem, b: VisitHistoryItem) => String(b.dataKey).localeCompare(String(a.dataKey)));

            if (backendVisits.length > 0) {
              visitItems = backendVisits;
            }
          }
        }
      } catch (error: any) {
        console.log('[Histórico] fonte complementar de visitas falhou:', error?.message || error);
      }

      if (localCompletedVisits.length > 0 && visitItems.length > localCompletedVisits.length) {
        const idsParaMarcar = new Set<string>();
        const visitasOrdenadas = [...visitItems].sort((a, b) => String(b.dataKey).localeCompare(String(a.dataKey)));

        localCompletedVisits.forEach((localVisit) => {
          const localLojaId = normalizeKeyText(localVisit.loja_id);
          const localLojaNome = normalizeKeyText(localVisit.lojaNome);

          const sameDate = visitasOrdenadas.find((candidate) => {
            if (idsParaMarcar.has(candidate.id)) return false;

            const sameStore =
              (localLojaId && normalizeKeyText(candidate.loja_id) === localLojaId) ||
              (localLojaNome && normalizeKeyText(candidate.lojaNome) === localLojaNome);

            return sameStore && candidate.dataKey === localVisit.dataKey;
          });

          const fallbackSameStore = visitasOrdenadas.find((candidate) => {
            if (idsParaMarcar.has(candidate.id)) return false;

            return (
              (localLojaId && normalizeKeyText(candidate.loja_id) === localLojaId) ||
              (localLojaNome && normalizeKeyText(candidate.lojaNome) === localLojaNome)
            );
          });

          const candidate = sameDate || fallbackSameStore;

          if (candidate) {
            idsParaMarcar.add(candidate.id);
          }
        });

        visitItems = visitItems.map((visit) => {
          if (idsParaMarcar.has(visit.id)) {
            return { ...visit, done: true, status: 'REALIZADA' };
          }

          if (!hasVisitCheckinAndCheckout(visit.raw || {}, visit.raw || {})) {
            return { ...visit, done: false };
          }

          return visit;
        });
      }

      // Não normalizamos visitas pelo history_7d aqui: ele é fixo e pode estar desatualizado.
      // O Histórico precisa respeitar o período selecionado e as visitas agendadas reais.

      const todayKey = getLocalDateKey(new Date());
      const visitDates = getDistinctVisitDates(visitItems);

      const normalizeId = (value: any) => String(value || '').trim();

      const getTemplateId = (item: any) => normalizeId(item?.pesquisa_id || item?.pesquisaId || item?.id || item?.codigo || item?.titulo || item?.nome);

      const getColetaPesquisaId = (item: any) => normalizeId(item?.pesquisa_id || item?.pesquisaId || item?.survey_id || item?.surveyId || item?.id_pesquisa);

      const getColetaUserId = (item: any) => normalizeId(item?.usuario_id || item?.usuarioId || item?.promotor_id || item?.promotorId || item?.usuario?.id);

      const getVisitUserId = (visit: VisitHistoryItem) => {
        const raw = visit.raw || {};

        return normalizeId(raw?.usuario_id || raw?.usuarioId || raw?.promotor_id || raw?.promotorId || raw?.usuario?.id || userId);
      };

      const getColetaDate = (item: any) => {
        return (
          formatToYMD(
            item?.data_programada ||
              item?.dataProgramada ||
              item?.data_inicio ||
              item?.dataInicio ||
              item?.data_fim ||
              item?.dataFim ||
              item?.criado_em ||
              item?.created_at ||
              item?.createdAt
          ) || null
        );
      };

      const coletaMatchesTemplate = (coleta: any, template: any) => {
        const templateId = getTemplateId(template);
        const coletaPesquisaId = getColetaPesquisaId(coleta);

        if (templateId && coletaPesquisaId && templateId === coletaPesquisaId) return true;

        const coletaTitulo = normalizeKeyText(coleta?.pesquisa_titulo || coleta?.titulo || coleta?.nome || coleta?.title);
        const templateTitulo = normalizeKeyText(template?.titulo || template?.nome || template?.title);

        return !!coletaTitulo && !!templateTitulo && coletaTitulo === templateTitulo;
      };

      const coletaMatchesCurrentUser = (coleta: any, fallbackUserId?: any) => {
        const coletaUserId = getColetaUserId(coleta);
        const expectedUserId = normalizeId(fallbackUserId || userId);

        if (!coletaUserId || !expectedUserId) return true;

        return coletaUserId === expectedUserId;
      };

      const coletaDone = (coleta: any) => {
        return isTaskDoneStatus(coleta?.status || coleta?.situacao || coleta?.state || coleta?.status_pesquisa);
      };

      const statusFromPeriod = (periodEnd: string, coleta?: any | null) => {
        if (coleta && coletaDone(coleta)) return 'REALIZADA';
        if (periodEnd < todayKey) return 'NAO_RESPONDIDA';
        return 'PENDENTE';
      };

      const findGeneralColetaForPeriod = (template: any, frequency: string, periodStart: string) => {
        return rawColetas.find((coleta) => {
          if (!coletaMatchesTemplate(coleta, template)) return false;
          if (!coletaMatchesCurrentUser(coleta)) return false;

          const coletaDate = getColetaDate(coleta);
          if (!coletaDate) return false;

          const coletaPeriod = getSurveyPeriod(coletaDate, frequency);

          return coletaPeriod.start === periodStart;
        });
      };

      const findVisitColeta = (visit: VisitHistoryItem, template: any) => {
        const visitRaw = visit.raw || {};
        const visitIds = [
          visit.id,
          visitRaw.id,
          visitRaw.registroVisitaId,
          visitRaw.registro_visita_id,
          visitRaw.visita_id,
          visitRaw.visitaId,
          visitRaw.visitaAgendadaId,
          visitRaw.visita_agendada_id,
        ].map(normalizeId).filter(Boolean);

        return rawColetas.find((coleta) => {
          if (!coletaMatchesTemplate(coleta, template)) return false;
          if (!coletaMatchesCurrentUser(coleta, getVisitUserId(visit))) return false;

          const coletaVisitIds = [
            coleta?.registroVisitaId,
            coleta?.registro_visita_id,
            coleta?.visita_id,
            coleta?.visitaId,
            coleta?.visitaAgendadaId,
            coleta?.visita_agendada_id,
          ].map(normalizeId).filter(Boolean);

          if (coletaVisitIds.some((id) => visitIds.includes(id))) return true;

          const coletaDate = getColetaDate(coleta);
          const coletaLojaId = normalizeId(coleta?.loja_id || coleta?.lojaId || coleta?.loja?.id);
          const visitLojaId = normalizeId(visit.loja_id || visitRaw.loja_id || visitRaw.lojaId);

          return !!coletaDate && coletaDate === visit.dataKey && !!coletaLojaId && !!visitLojaId && coletaLojaId === visitLojaId;
        });
      };

      const standaloneTemplatesMap = new Map<string, any>();

      pesquisasGerais.forEach((template) => {
        if (isTaskVisitSurveyTemplate(template, template)) return;
        if (isSystemConfigTemplate(template, template)) return;

        const key = `${getTemplateId(template)}__${String(template.frequencia || '').toUpperCase()}__${normalizeKeyText(template.titulo || template.nome || template.title)}`;

        if (!standaloneTemplatesMap.has(key)) {
          standaloneTemplatesMap.set(key, template);
        }
      });

      rawTasks.forEach((row) => {
        const raw = safeParseJson(row.task_raw_json || row.raw_json, {});
        if (!isRealStandaloneTask(row, raw)) return;

        const merged = { ...raw, ...row };
        const key = `${getTemplateId(merged)}__${String(merged.frequencia || '').toUpperCase()}__${normalizeKeyText(merged.titulo || merged.nome || merged.title)}`;

        if (!standaloneTemplatesMap.has(key)) {
          standaloneTemplatesMap.set(key, merged);
        }
      });

      const standaloneTemplates = Array.from(standaloneTemplatesMap.values());

      const standaloneTasks: TaskHistoryItem[] = standaloneTemplates.flatMap((template) => {
        const raw = safeParseJson(template.task_raw_json || template.raw_json, {});
        const merged = { ...raw, ...template };

        const title = String(getTaskTitle(merged, merged));
        const freq = String(merged.frequencia || '').trim().toUpperCase();
        const baseId = String(getTemplateId(merged) || title);
        const baseSubtitle = String(merged?.descricao || merged?.description || historyText('standaloneTask', language));

        const buildTask = (periodStart: string, periodEnd: string, subtitle: string) => {
          const coleta = findGeneralColetaForPeriod(merged, freq, periodStart);
          const status = statusFromPeriod(periodEnd, coleta);

          return {
            id: `${baseId}_${freq}_${periodStart}_${periodEnd}`,
            title,
            subtitle,
            loja_id: null,
            lojaNome: null,
            dataKey: periodEnd,
            status,
            done: isTaskDoneStatus(status),
            kind: 'AVULSA',
            raw: { template: merged, coleta, periodStart, periodEnd },
          } as TaskHistoryItem;
        };

        if (freq === 'DIARIA' || freq === 'DIÁRIA') {
          return visitDates
            .filter((dateKey) => isWithinRange(dateKey, startKey, endKey))
            .map((dateKey) => buildTask(dateKey, dateKey, baseSubtitle || historyText('dailyTask', language)));
        }

        if (freq === 'SEMANAL') {
          const periods = new Map<string, string>();

          visitDates.forEach((dateKey) => {
            if (!isWithinRange(dateKey, startKey, endKey)) return;

            const period = getSurveyPeriod(dateKey, 'SEMANAL');
            periods.set(period.start, period.end);
          });

          return Array.from(periods.entries()).map(([periodStart, periodEnd]) =>
            buildTask(periodStart, periodEnd, historyText('weekPeriod', language, { start: formatShortDate(periodStart, language), end: formatShortDate(periodEnd, language) }))
          );
        }

        if (freq === 'QUINZENAL') {
          const periods = new Map<string, string>();

          visitDates.forEach((dateKey) => {
            if (!isWithinRange(dateKey, startKey, endKey)) return;

            const period = getSurveyPeriod(dateKey, 'QUINZENAL');
            periods.set(period.start, period.end);
          });

          return Array.from(periods.entries()).map(([periodStart, periodEnd]) =>
            buildTask(periodStart, periodEnd, historyText('halfMonthPeriod', language, { start: formatShortDate(periodStart, language), end: formatShortDate(periodEnd, language) }))
          );
        }

        if (freq === 'MENSAL') {
          const periods = new Map<string, string>();

          visitDates.forEach((dateKey) => {
            if (!isWithinRange(dateKey, startKey, endKey)) return;

            const period = getSurveyPeriod(dateKey, 'MENSAL');
            periods.set(period.start, period.end);
          });

          return Array.from(periods.entries()).map(([periodStart, periodEnd]) =>
            buildTask(periodStart, periodEnd, historyText('monthPeriod', language, { start: formatShortDate(periodStart, language), end: formatShortDate(periodEnd, language) }))
          );
        }

        const dueDate = getTaskBaseDateKey(merged, merged);

        if (!isWithinRange(dueDate, startKey, endKey)) return [];

        return [buildTask(dueDate, dueDate, baseSubtitle)];
      });

      const visitTasks: TaskHistoryItem[] = visitItems.flatMap((visit) => {
        const surveys = pesquisasPorVisita.length > 0 ? pesquisasPorVisita : [];
        const items: TaskHistoryItem[] = [];

        surveys.forEach((survey, index) => {
          const mergedSurvey = { ...safeParseJson(survey?.raw_json || survey?.task_raw_json, {}), ...survey };
          const title = String(
            mergedSurvey?.titulo ||
              mergedSurvey?.nome ||
              mergedSurvey?.title ||
              mergedSurvey?.name ||
              (surveys.length > 1 ? `${historyText('visitTask', language)} ${index + 1}` : historyText('visitTask', language))
          );

          const coleta = findVisitColeta(visit, mergedSurvey);
          const backendStatus = statusFromPeriod(visit.dataKey, coleta);
          const done = isTaskDoneStatus(backendStatus);

          items.push({
            id: `${visit.id}_pesquisa_${mergedSurvey?.id || mergedSurvey?.pesquisa_id || index}`,
            title,
            subtitle: visit.lojaNome,
            loja_id: visit.loja_id,
            lojaNome: visit.lojaNome,
            dataKey: visit.dataKey || getLocalDateKey(new Date()),
            status: backendStatus,
            done,
            kind: 'VISITA',
            raw: { visit: visit.raw, survey: mergedSurvey, coleta, backendStatus },
          });
        });

        return items;
      });

      let taskItems = [...standaloneTasks, ...visitTasks].sort((a, b) => String(b.dataKey).localeCompare(String(a.dataKey)));

      // Não normalizamos tarefas pelo history_7d: ele é fixo e pode estar desatualizado.
      // A tela passa a contar tarefas reais do período + pesquisas por visita.



      setVisits(visitItems);
      setTasks(
        taskItems.map((task) => {
          const operational = getTaskOperationalStatus(task, language);

          return {
            ...task,
            status: operational.key,
            done: operational.key === 'REALIZADA',
          };
        })
      );
    } catch (error: any) {
      console.log('[Histórico] Falha ao carregar dados locais:', error?.message || error);
      setErrorMessage(historyText('loadError', language));
      setVisits([]);
      setTasks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHistorico();
    }, [projectId, userId, selectedPeriod, language])
  );

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
    } catch (error: any) {
      console.log('[Histórico] globalSync falhou:', error?.message || error);
    }

    await loadHistorico(true);
  };

  const renderMainTab = (key: MainTab, label: string, Icon: any, percent: number) => {
    const active = mainTab === key;
    const color = getPercentColor(percent);

    return (
      <TouchableOpacity
        style={[
          styles.mainTabButton,
          {
            backgroundColor: active ? (isDark ? `${accent}24` : `${accent}12`) : surface,
            borderColor: active ? accent : border,
          },
        ]}
        onPress={() => setMainTab(key)}
        activeOpacity={0.85}
      >
        <View style={[styles.mainTabIcon, { backgroundColor: active ? accent : surfaceAlt }]}>
          <Icon size={17} color={active ? '#FFFFFF' : color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mainTabTitle, { color: textPrimary }]}>{label}</Text>
          <Text style={[styles.mainTabSubtitle, { color: textSecondary }]}>
            {formatNumber(percent, language)}% {historyText('efficiencyWord', language)}
          </Text>
        </View>
        {active ? <View style={[styles.mainTabActiveDot, { backgroundColor: accent }]} /> : null}
      </TouchableOpacity>
    );
  };

  const renderSubTab = (key: VisitSubTab | TaskSubTab, label: string) => {
    const active = mainTab === 'visits' ? visitSubTab === key : taskSubTab === key;

    return (
      <TouchableOpacity
        style={[
          styles.subTabButton,
          {
            backgroundColor: active ? (isDark ? `${accent}24` : `${accent}14`) : 'transparent',
            borderColor: active ? `${accent}33` : 'transparent',
          },
        ]}
        onPress={() => {
          if (mainTab === 'visits') setVisitSubTab(key as VisitSubTab);
          else setTaskSubTab(key as TaskSubTab);
        }}
        activeOpacity={0.85}
      >
        <Text
          style={[
            styles.subTabText,
            {
              color: active ? (isDark ? '#FFFFFF' : accent) : textSecondary,
            },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderPeriodButton = (days: PeriodDays) => {
    const active = selectedPeriod === days;

    return (
      <TouchableOpacity
        style={[
          styles.periodButton,
          {
            backgroundColor: active ? accent : 'transparent',
            borderColor: active ? accent : 'transparent',
          },
        ]}
        onPress={() => setSelectedPeriod(days)}
        activeOpacity={0.85}
      >
        <Text style={[styles.periodButtonText, { color: active ? accentText : textSecondary }]}>
          {days}d
        </Text>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      <View
        style={[
          styles.hero,
          {
            backgroundColor: bg,
            borderBottomColor: border,
          },
        ]}
      >
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={[styles.heroIconButton, { backgroundColor: surface, borderColor: border }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <ArrowLeft size={22} color={textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.heroIconButton, { backgroundColor: surface, borderColor: border }]}
            onPress={onRefresh}
            disabled={refreshing || isSyncing}
            activeOpacity={0.85}
          >
            {refreshing || isSyncing ? (
              <ActivityIndicator color={accent} size="small" />
            ) : (
              <RefreshCw size={21} color={textPrimary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroTitleRow}>
          <View style={[styles.heroIcon, { backgroundColor: accent }]}>
            <History size={28} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{historyText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {historyText('subtitle', language)}
            </Text>
          </View>
        </View>

        <View style={[styles.heroScoreCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.heroScoreTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroScoreLabel, { color: textSecondary }]}>
                {mainTab === 'visits' ? historyText('visitEfficiency', language) : historyText('taskEfficiency', language)}
              </Text>
              <Text style={[styles.heroScoreValue, { color: textPrimary }]}>{formatNumber(activeStats.percent, language)}%</Text>
              <Text style={[styles.heroScoreSuffix, { color: textSecondary }]}>
                {historyText('realizedOf', language, { done: formatNumber(activeStats.done, language), total: formatNumber(activeStats.total, language) })}
              </Text>
            </View>

            <View style={[styles.levelBadge, { backgroundColor: activeColor }]}>
              <TrendingUp size={18} color="#FFFFFF" />
              <Text style={styles.levelBadgeText}>{getEfficiencyLabel(activeStats.percent, language)}</Text>
            </View>
          </View>

          <View style={[styles.heroProgressTrack, { backgroundColor: surfaceAlt }]}>
            <View
              style={[
                styles.heroProgressFill,
                {
                  width: `${Math.max(0, Math.min(100, activeStats.percent))}%`,
                  backgroundColor: activeColor,
                },
              ]}
            />
          </View>

          <Text style={[styles.heroAchievementHint, { color: textSecondary }]}>
            {mainTab === 'visits'
              ? historyText('visitsHint', language, { days: selectedPeriod })
              : historyText('tasksHint', language, { days: selectedPeriod })}
          </Text>
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <View style={styles.mainTabsRow}>
          {renderMainTab('visits', historyText('visits', language), Store, visitStats.percent)}
          {renderMainTab('tasks', historyText('tasks', language), ClipboardCheck, taskStats.percent)}
        </View>

        <View style={[styles.periodCard, { backgroundColor: surface, borderColor: border }]}>
          {renderPeriodButton(7)}
          {renderPeriodButton(15)}
          {renderPeriodButton(30)}
        </View>

        <View style={[styles.subTabsCard, { backgroundColor: surface, borderColor: border }]}>
          {mainTab === 'visits' ? (
            <>
              {renderSubTab('summary', historyText('summary', language))}
              {renderSubTab('timeline', historyText('byDate', language))}
              {renderSubTab('stores', historyText('byStore', language))}
            </>
          ) : (
            <>
              {renderSubTab('summary', historyText('summary', language))}
              {renderSubTab('timeline', historyText('byDate', language))}
              {renderSubTab('types', historyText('byType', language))}
            </>
          )}
        </View>
      </View>
    </View>
  );

  const renderVisitsSummary = () => (
    <View style={styles.sectionContent}>
      {renderError()}
      {renderEfficiencyCard(historyText('storeAttendance', language), visitStats.done, visitStats.total, visitStats.percent, visitsColor, Store)}

      <View style={styles.kpiGrid}>
        {renderKpi(historyText('visits', language), visitStats.total, ListChecks, accent)}
        {renderKpi(historyText('scheduled', language), visitStats.scheduled, CalendarDays, '#3B82F6')}
        {renderKpi(historyText('storeAttendance', language), storeGroups.length, Store, '#A855F7')}
      </View>

      <View style={styles.kpiGrid}>
        {renderKpi(historyText('visitedPlural', language), visitStats.done, CheckCircle2, '#10B981')}
        {renderKpi(historyText('pendingPlural', language), visitStats.pending, Clock, '#F59E0B')}
        {renderKpi(historyText('notDonePlural', language), visitStats.notDone, XCircle, '#EF4444')}
      </View>

      <View style={[styles.highlightCard, { backgroundColor: isDark ? '#111827' : '#0F172A' }]}>
        <View style={styles.highlightTop}>
          <View style={styles.highlightIcon}>
            <SearchCheck size={23} color="#FFFFFF" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.highlightTitle}>{historyText('attendanceEfficiency', language)}</Text>
            <Text style={styles.highlightSubtitle}>
              {historyText('choosePeriodHint', language)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.blockTitle, { color: textPrimary }]}>{historyText('latestVisits', language)}</Text>
      {visits.slice(0, 6).map(renderVisitCard)}
      {visits.length === 0 ? renderEmpty(historyText('noVisitsTitle', language), historyText('noVisitsMessage', language)) : null}
    </View>
  );

  const renderVisitsTimeline = () => (
    <View style={styles.sectionContent}>
      {visitsByDate.map((group) => (
        <View key={group.dateKey} style={styles.dateGroup}>
          <Text style={[styles.dateTitle, { color: textPrimary }]}>{formatDate(group.dateKey, language)}</Text>
          {group.items.map(renderVisitCard)}
        </View>
      ))}

      {visitsByDate.length === 0 ? renderEmpty(historyText('visitsHistoryEmpty', language), historyText('visitsByDateMessage', language)) : null}
    </View>
  );

  const renderVisitsStores = () => (
    <View style={styles.sectionContent}>
      {storeGroups.map(renderStoreGroup)}
      {storeGroups.length === 0 ? renderEmpty(historyText('noStoresTitle', language), historyText('noStoresMessage', language)) : null}
    </View>
  );

  const renderTasksSummary = () => (
    <View style={styles.sectionContent}>
      {renderError()}
      {renderEfficiencyCard(historyText('taskEfficiencyTitle', language), taskStats.done, taskStats.total, taskStats.percent, tasksColor, ClipboardCheck)}

      <View style={styles.kpiGrid}>
        {renderKpi(historyText('tasksCount', language), taskStats.total, ListChecks, accent)}
        {renderKpi(historyText('visitTask', language), taskStats.visitTasks, Store, '#3B82F6')}
        {renderKpi(historyText('standaloneShort', language), taskStats.standaloneTasks, ClipboardCheck, '#A855F7')}
      </View>

      <View style={styles.kpiGrid}>
        {renderKpi(historyText('donePlural', language), taskStats.done, CheckCircle2, '#10B981')}
        {renderKpi(historyText('pendingPlural', language), taskStats.pending, Clock, '#F59E0B')}
        {renderKpi(historyText('notCompleted', language), taskStats.notDone, XCircle, '#EF4444')}
      </View>

      <Text style={[styles.blockTitle, { color: textPrimary }]}>{historyText('latestTasks', language)}</Text>
      {tasks.slice(0, 6).map(renderTaskCard)}
      {tasks.length === 0 ? renderEmpty(historyText('noTasksTitle', language), historyText('noTasksMessage', language)) : null}
    </View>
  );

  const renderTasksTimeline = () => (
    <View style={styles.sectionContent}>
      {tasksByDate.map((group) => (
        <View key={group.dateKey} style={styles.dateGroup}>
          <Text style={[styles.dateTitle, { color: textPrimary }]}>{formatDate(group.dateKey, language)}</Text>
          {group.items.map(renderTaskCard)}
        </View>
      ))}

      {tasksByDate.length === 0 ? renderEmpty(historyText('tasksHistoryEmpty', language), historyText('tasksByDateMessage', language)) : null}
    </View>
  );

  const renderTasksTypes = () => (
    <View style={styles.sectionContent}>
      {taskTypeGroups.map((group) => {
        const color = getPercentColor(group.percent);

        return (
          <View key={group.key} style={[styles.groupCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={styles.groupHeader}>
              <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
                {group.key === 'VISITA' ? <Store size={20} color={color} /> : <ClipboardCheck size={20} color={color} />}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.groupTitle, { color: textPrimary }]}>{group.title}</Text>
                <Text style={[styles.groupSubtitle, { color: textSecondary }]}>
                  {formatNumber(group.done)} de {formatNumber(group.total)} concluídas
                </Text>
              </View>

              <Text style={[styles.groupPercent, { color }]}>{formatNumber(group.percent)}%</Text>
            </View>

            <View style={[styles.progressTrack, { backgroundColor: surfaceAlt }]}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, group.percent))}%`, backgroundColor: color }]} />
            </View>

            {group.items.slice(0, 4).map(renderTaskCard)}
          </View>
        );
      })}

      {taskTypeGroups.length === 0 ? renderEmpty(historyText('noTaskTypesTitle', language), historyText('noTaskTypesMessage', language)) : null}
    </View>
  );

  const renderKpi = (label: string, value: any, Icon: any, color: string) => (
    <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
      <Icon size={22} color={color} />
      <Text style={[styles.kpiValue, { color: textPrimary }]}>{formatNumber(value)}</Text>
      <Text style={[styles.kpiLabel, { color: textSecondary }]}>{label}</Text>
    </View>
  );

  const renderEfficiencyCard = (title: string, done: number, total: number, percent: number, color: string, Icon: any) => (
    <View style={[styles.efficiencyCard, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.efficiencyHeader}>
        <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
          <Icon size={22} color={color} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.metricTitle, { color: textPrimary }]}>{title}</Text>
          <Text style={[styles.metricSubtitle, { color: textSecondary }]}>
            {formatNumber(done)} realizados de {formatNumber(total)} previstos
          </Text>
        </View>

        <Text style={[styles.metricPercent, { color }]}>{formatNumber(percent, language)}%</Text>
      </View>

      <View style={[styles.progressTrack, { backgroundColor: surfaceAlt }]}>
        <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }]} />
      </View>
    </View>
  );

  const renderError = () =>
    errorMessage ? (
      <View style={[styles.warningCard, { backgroundColor: surface, borderColor: border }]}>
        <AlertCircle size={22} color="#F59E0B" />
        <Text style={[styles.warningText, { color: textSecondary }]}>{errorMessage}</Text>
      </View>
    ) : null;

  const renderStoreGroup = (group: any) => {
    const color = getPercentColor(group.percent);

    return (
      <View key={group.key} style={[styles.groupCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.groupHeader}>
          <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
            <Store size={20} color={color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.groupTitle, { color: textPrimary }]} numberOfLines={2}>
              {group.lojaNome}
            </Text>
            <Text style={[styles.groupSubtitle, { color: textSecondary }]}>
              {formatNumber(group.done)} de {formatNumber(group.total)} visitas atendidas
            </Text>
          </View>

          <Text style={[styles.groupPercent, { color }]}>{formatNumber(group.percent)}%</Text>
        </View>

        <View style={[styles.progressTrack, { backgroundColor: surfaceAlt }]}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, group.percent))}%`, backgroundColor: color }]} />
        </View>

        {group.items.slice(0, 4).map(renderMiniVisit)}

        {group.items.length > 4 ? (
          <Text style={[styles.moreText, { color: textSecondary }]}>
            +{group.items.length - 4} visita{group.items.length - 4 === 1 ? '' : 's'} nesta loja
          </Text>
        ) : null}
      </View>
    );
  };

  const renderMiniVisit = (visit: VisitHistoryItem) => {
    const operationalStatus = getVisitOperationalStatus(visit, language);
    const color = operationalStatus.color;

    return (
      <TouchableOpacity
        key={visit.id}
        style={[styles.miniRow, { borderTopColor: border }]}
        onPress={() => setSelectedVisit(visit)}
        activeOpacity={0.85}
      >
        <View>
          <Text style={[styles.miniTitle, { color: textPrimary }]}>{formatShortDate(visit.dataKey, language)}</Text>
          <Text style={[styles.miniSubtitle, { color: textSecondary }]}>{operationalStatus.label}</Text>
        </View>

        <View style={styles.miniRight}>
          <Text style={[styles.miniStatus, { color }]}>{visit.done ? 'OK' : operationalStatus.shortLabel}</Text>
          <ChevronRight size={16} color={textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderVisitCard = (visit: VisitHistoryItem) => {
    const operationalStatus = getVisitOperationalStatus(visit, language);
    const color = operationalStatus.color;
    const Icon = operationalStatus.icon;

    return (
      <TouchableOpacity
        key={visit.id}
        style={[styles.itemCard, { backgroundColor: surface, borderColor: border }]}
        onPress={() => setSelectedVisit(visit)}
        activeOpacity={0.86}
      >
        <View style={styles.itemTop}>
          <View style={[styles.itemIcon, { backgroundColor: `${color}18` }]}>
            <Icon size={20} color={color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, { color: textPrimary }]} numberOfLines={2}>
              {visit.lojaNome}
            </Text>
            <Text style={[styles.itemSubtitle, { color: textSecondary }]} numberOfLines={1}>
              {formatShortDate(visit.dataKey, language)} · {operationalStatus.label}
            </Text>
          </View>

          <View style={[styles.itemBadge, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.itemBadgeText, { color }]}>{operationalStatus.shortLabel}</Text>
          </View>
        </View>

        <View style={styles.itemFooter}>
          <View style={styles.footerInfo}>
            <Clock size={13} color={textSecondary} />
            <Text style={[styles.footerText, { color: textSecondary }]}>
              {formatTime(visit.checkin_at || visit.hora_entrada_prevista, language)} / {formatTime(visit.checkout_at || visit.hora_saida_prevista, language)}
            </Text>
          </View>

          <ChevronRight size={17} color={textSecondary} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderTaskCard = (task: TaskHistoryItem) => {
    const operationalStatus = getTaskOperationalStatus(task, language);
    const color = operationalStatus.color;
    const Icon = operationalStatus.icon;

    return (
      <TouchableOpacity
        key={task.id}
        style={[styles.itemCard, { backgroundColor: surface, borderColor: border }]}
        onPress={() => setSelectedTask(task)}
        activeOpacity={0.86}
      >
        <View style={styles.itemTop}>
          <View style={[styles.itemIcon, { backgroundColor: `${color}18` }]}>
            <Icon size={20} color={color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, { color: textPrimary }]} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={[styles.itemSubtitle, { color: textSecondary }]} numberOfLines={1}>
              {task.kind === 'VISITA'
                ? `${formatShortDate(task.dataKey, language)} · ${historyText('visitTask', language)}`
                : `${historyText('dueDate', language)}: ${formatShortDate(task.dataKey, language)} · ${historyText('standaloneTask', language)}`}
            </Text>
          </View>

          <View style={[styles.itemBadge, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.itemBadgeText, { color }]}>{operationalStatus.shortLabel}</Text>
          </View>
        </View>

        {task.lojaNome ? (
          <View style={styles.itemFooter}>
            <View style={styles.footerInfo}>
              <MapPin size={13} color={textSecondary} />
              <Text style={[styles.footerText, { color: textSecondary }]} numberOfLines={1}>
                {task.lojaNome}
              </Text>
            </View>

            <ChevronRight size={17} color={textSecondary} />
          </View>
        ) : task.kind === 'AVULSA' ? (
          <View style={styles.itemFooter}>
            <View style={styles.footerInfo}>
              <CalendarDays size={13} color={textSecondary} />
              <Text style={[styles.footerText, { color: textSecondary }]} numberOfLines={1}>
                {historyText('dueDate', language)}: {formatDate(task.dataKey, language)}
              </Text>
            </View>

            <ChevronRight size={17} color={textSecondary} />
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderDetailsModal = () => {
    const visible = !!selectedVisit || !!selectedTask;

    if (!visible) return null;

    const isVisit = !!selectedVisit;
    const selectedTaskOperationalStatus = selectedTask ? getTaskOperationalStatus(selectedTask, language) : null;
    const title = selectedVisit?.lojaNome || selectedTask?.title || historyText('detail', language);
    const color = selectedVisit
      ? getStatusColor(selectedVisit.done, selectedVisit.status)
      : selectedTaskOperationalStatus?.color || getStatusColor(!!selectedTask?.done, selectedTask?.status || '');

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSelectedVisit(null);
          setSelectedTask(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: textPrimary }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[styles.modalSubtitle, { color: textSecondary }]}>
                  {isVisit ? historyText('historyVisit', language) : historyText('historyTask', language)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: surfaceAlt }]}
                onPress={() => {
                  setSelectedVisit(null);
                  setSelectedTask(null);
                }}
              >
                <Text style={[styles.closeText, { color: textPrimary }]}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              <View style={[styles.modalHero, { backgroundColor: surfaceAlt, borderColor: border }]}>
                <View style={styles.modalHeroTop}>
                  <View>
                    <Text style={[styles.heroScoreLabel, { color: textSecondary }]}>{isVisit ? historyText('visitStatus', language) : historyText('taskStatus', language)}</Text>
                    <Text style={[styles.modalHeroValue, { color: textPrimary }]}>
                      {isVisit ? (selectedVisit ? getVisitOperationalStatus(selectedVisit, language).label : historyText('notAttended', language)) : selectedTaskOperationalStatus?.label || historyText('pending', language)}
                    </Text>
                    <Text style={[styles.heroScoreSuffix, { color: textSecondary }]}> 
                      {formatDate(selectedVisit?.dataKey || selectedTask?.dataKey, language)}
                    </Text>
                  </View>

                  <View style={[styles.levelBadge, { backgroundColor: color }]}>
                    {isVisit ? <Store size={18} color="#FFFFFF" /> : <ClipboardCheck size={18} color="#FFFFFF" />}
                    <Text style={styles.levelBadgeText}>{isVisit ? historyText('visits', language).toUpperCase() : selectedTask?.kind}</Text>
                  </View>
                </View>
              </View>

              {selectedVisit ? (
                <View style={[styles.summaryCard, { backgroundColor: surfaceAlt, borderColor: border }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('data', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>{formatDate(selectedVisit.dataKey, language)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('checkin', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>{formatTime(selectedVisit.checkin_at, language)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('checkout', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>{formatTime(selectedVisit.checkout_at, language)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('duration', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>
                      {formatDuration(selectedVisit.checkin_at, selectedVisit.checkout_at)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('justification', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]} numberOfLines={3}>
                      {selectedVisit.justificativa || '--'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {selectedTask ? (
                <View style={[styles.summaryCard, { backgroundColor: surfaceAlt, borderColor: border }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('type', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>{selectedTask.kind === 'VISITA' ? historyText('visitTask', language) : historyText('standaloneTask', language)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('status', language)}</Text>
                    <Text style={[styles.summaryValue, { color }]}>{selectedTaskOperationalStatus?.label || historyText('pending', language)}</Text>
                  </View>
                  {selectedTask.kind === 'AVULSA' ? (
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('dueDate', language)}</Text>
                      <Text style={[styles.summaryValue, { color: textPrimary }]}>{formatDate(selectedTask.dataKey, language)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('store', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]}>{selectedTask.lojaNome || '--'}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: textSecondary }]}>{historyText('detail', language)}</Text>
                    <Text style={[styles.summaryValue, { color: textPrimary }]} numberOfLines={4}>
                      {selectedTask.subtitle || '--'}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={[styles.emptySmall, { backgroundColor: surfaceAlt, borderColor: border }]}>
                <FileText size={28} color={accent} />
                <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{historyText('operationalHistory', language)}</Text>
                <Text style={[styles.emptySmallText, { color: textSecondary }]}>
                  {historyText('operationalHistoryText', language)}
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderEmpty = (title: string, message: string) => (
    <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}>
      <AlertCircle size={28} color={accent} />
      <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{title}</Text>
      <Text style={[styles.emptySmallText, { color: textSecondary }]}>{message}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarGuard, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>{historyText('loading', language)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarGuard, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || !!isSyncing}
            onRefresh={onRefresh}
            colors={[accent]}
            tintColor={accent}
          />
        }
      >
        {renderHeader()}

        {mainTab === 'visits' && visitSubTab === 'summary' ? renderVisitsSummary() : null}
        {mainTab === 'visits' && visitSubTab === 'timeline' ? renderVisitsTimeline() : null}
        {mainTab === 'visits' && visitSubTab === 'stores' ? renderVisitsStores() : null}

        {mainTab === 'tasks' && taskSubTab === 'summary' ? renderTasksSummary() : null}
        {mainTab === 'tasks' && taskSubTab === 'timeline' ? renderTasksTimeline() : null}
        {mainTab === 'tasks' && taskSubTab === 'types' ? renderTasksTypes() : null}

        <View style={styles.footerSpace}>
          <Text style={[styles.lastSyncText, { color: textSecondary }]}>
            {historyText('lastSync', language)}: {formatLastSync(lastSync, language)}
          </Text>
        </View>
      </ScrollView>

      {renderDetailsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarGuard: { width: '100%' },
  content: { paddingBottom: 120 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 14, fontSize: 14, fontWeight: '700' },

  hero: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIconButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  pageSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 4,
  },

  heroScoreCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  heroScoreTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroScoreLabel: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroScoreValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroScoreSuffix: {
    fontSize: 13,
    fontWeight: '700',
  },
  levelBadge: {
    minWidth: 82,
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroProgressTrack: {
    height: 10,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 16,
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: 99,
  },
  heroAchievementHint: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 9,
  },

  tabsWrapper: {
    paddingHorizontal: 20,
    paddingTop: 14,
    zIndex: 10,
  },
  mainTabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  periodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderRadius: 999,
    marginBottom: 10,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  periodButton: {
    minWidth: 58,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodButtonText: {
    fontSize: 11,
    fontWeight: '900',
  },
  mainTabButton: {
    flex: 1,
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 1,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  mainTabIcon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTabActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ACCENT_COLOR,
  },
  mainTabTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  mainTabSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  subTabsCard: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '900',
  },

  sectionContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  warningCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 13,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 21,
    fontWeight: '900',
    marginTop: 8,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 3,
    textAlign: 'center',
  },

  efficiencyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 15,
    marginBottom: 14,
  },
  efficiencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  metricSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  metricPercent: {
    fontSize: 22,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 13,
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },

  highlightCard: {
    borderRadius: 24,
    padding: 17,
    marginBottom: 22,
  },
  highlightTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  highlightIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    backgroundColor: ACCENT_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  highlightSubtitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },

  itemCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  itemSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  itemBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '800',
  },

  groupCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  groupSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  groupPercent: {
    fontSize: 21,
    fontWeight: '900',
  },
  miniRow: {
    borderTopWidth: 1,
    marginTop: 10,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  miniSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  miniRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  miniStatus: {
    fontSize: 13,
    fontWeight: '900',
  },
  moreText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 12,
  },

  dateGroup: {
    marginBottom: 18,
  },
  dateTitle: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },

  summaryCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 9,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '900',
    flexShrink: 1,
    textAlign: 'right',
  },

  emptySmall: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  emptySmallTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySmallText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },

  footerSpace: {
    alignItems: 'center',
    paddingTop: 16,
  },
  lastSyncText: {
    fontSize: 11,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.72)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 3,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '600',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 38,
  },
  modalHero: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
  },
  modalHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalHeroValue: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.7,
    marginTop: 4,
  },
});
