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
  Store,
  Star,
  Trophy,
  Target,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Medal,
  ListChecks,
  Eye,
  History,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';
import { api } from '../services/api';
import { globalSync } from '../services/syncService';

const ACCENT_COLOR = '#FF7A00';

const DEBUG_PERFECT_STORE_RULES = false;

const psSpy = (step: string, payload?: any) => {
  if (!__DEV__ || !DEBUG_PERFECT_STORE_RULES) return;

  try {
    console.log(`[PS RULE SPY][${step}]`, payload ?? '');
  } catch {
    console.log(`[PS RULE SPY][${step}]`);
  }
};

const compactRuleForSpy = (item: any) => ({
  id: item?.id,
  criterionId: item?.criterionId,
  criterionName: item?.criterionName,
  ruleName: item?.ruleName,
  ruleExpression: item?.ruleExpression,
  conditionExpression: item?.conditionExpression,
  fieldLabel: item?.fieldLabel,
  questionTitle: item?.questionTitle,
  surveyName: item?.surveyName,
  scorecardName: item?.scorecardName,
  groupName: item?.groupName,
  operator: item?.operator,
  operatorLabel: item?.operatorLabel,
  expectedValue: item?.expectedValue,
  valorEsperado: item?.valorEsperado,
  mixName: item?.mixName,
  actual: item?.actual,
  resposta: item?.resposta,
  answer: item?.answer,
  points: item?.points,
  pontos: item?.pontos,
  hit: item?.hit,
  atingido: item?.atingido,
  status: item?.status,
  conditions: Array.isArray(item?.conditions)
    ? item.conditions.map((c: any) => ({
        id: c?.id,
        surveyId: c?.surveyId,
        surveyName: c?.surveyName,
        questionId: c?.questionId,
        questionTitle: c?.questionTitle,
        fieldLabel: c?.fieldLabel,
        operator: c?.operator,
        operatorLabel: c?.operatorLabel,
        expectedValue: c?.expectedValue,
        valorEsperado: c?.valorEsperado,
        rawExpectedValue: c?.rawExpectedValue,
        ruleExpression: c?.ruleExpression,
        hit: c?.hit,
      }))
    : item?.conditions,
  condicoes: item?.condicoes,
  conditionDetails: item?.conditionDetails,
});

const PERFECT_STORE_TEXTS = {
  'pt-BR': {
    unableIdentify: 'Não foi possível identificar o projeto ou o usuário logado.',
    unableLoad: 'Não foi possível carregar os dados de Perfect Store agora.',
    loadError: 'Erro ao carregar a página de Perfect Store.',
    defaultStore: 'Loja',
    evaluatedStore: 'Loja avaliada',
    executionCriterion: 'Critério de execução',
    diamond: 'Diamante',
    gold: 'Ouro',
    silver: 'Prata',
    bronze: 'Bronze',
    critical: 'Crítico',
    pending: 'Pendente',
    scoreHintDiamond: 'Excelente execução. A loja está muito próxima do padrão perfeito.',
    scoreHintGold: 'Ótima execução. Pequenos ajustes podem levar ao nível Diamante.',
    scoreHintSilver: 'Boa base, mas ainda existem oportunidades importantes no PDV.',
    scoreHintBronze: 'A loja precisa de atenção para recuperar pontos de execução.',
    scoreHintCritical: 'Execução crítica. Priorize os critérios pendentes na próxima visita.',
    scoreHintPending: 'Sem auditoria no período atual.',
    title: 'Perfect Store',
    subtitle: 'Loja perfeita, execução em campo e ranking de PDVs',
    currentScore: 'Score atual',
    auditedStoresAverage: 'média das lojas auditadas',
    lastAuditPoints: 'Pontos da última auditoria',
    overview: 'Resumo',
    ranking: 'Ranking',
    history: 'Histórico',
    topStores: 'Top lojas',
    attention: 'Atenção',
    scorecards: 'Scorecards',
    executionStandard: 'Padrão de execução',
    executionStandardText: 'Use a próxima visita para corrigir rupturas, exposição, sortimento e critérios pendentes do scorecard.',
    attentionStores: 'Lojas que precisam de atenção',
    noCriticalStores: 'Nenhuma loja crítica no momento',
    lowScoreStoresAppear: 'As lojas com score abaixo de 60% aparecerão aqui.',
    bestExecutions: 'Melhores execuções',
    lastScore: 'última nota',
    storesRanking: 'Ranking de lojas',
    storesRankingText: 'Ordenado pela nota da Loja Perfeita no período atual.',
    emptyRanking: 'Ranking vazio',
    emptyRankingText: 'O ranking aparecerá quando houver auditorias de Perfect Store.',
    storeHistory: 'Histórico por loja',
    storeHistoryText: 'Considera todas as visitas agendadas da loja: visitadas, não visitadas e pendentes.',
    stores: 'Lojas',
    visits: 'Visitas',
    average: 'Média',
    noScheduledVisits: 'Sem visitas agendadas',
    noScheduledVisitsText: 'Não encontramos visitas agendadas, coletas ou registros para compor o histórico.',
    generalStoreScore: 'Nota geral da loja',
    visitSingular: 'visita',
    visitPlural: 'visitas',
    general: 'geral',
    visitsConsidered: 'Visitas consideradas na nota',
    visitOf: 'Visita de',
    noDateLower: 'sem data',
    points: 'pontos',
    noPerfectStoreAnswer: 'Esta visita ainda não possui resposta de Perfect Store, por isso entra como 0% na média.',
    noDate: 'Sem data',
    won: 'ganhos',
    lost: 'perdidos',
    evaluationCriteria: 'Critérios da avaliação',
    ruleSingular: 'regra',
    rulePlural: 'regras',
    noSavedCriteria: 'Esta avaliação não possui critérios detalhados salvos.',
    conquered: 'Conquistado',
    notConquered: 'Não conquistado',
    storeXray: 'Raio-X da última auditoria',
    loadingDetails: 'Carregando detalhes...',
    storeScore: 'Score da loja',
    lastAuditCriteria: 'Critérios da última auditoria',
    noDetailedExtract: 'Sem extrato detalhado',
    noDetailedExtractText: 'Os critérios aparecerão aqui após a próxima auditoria.',
    visitsHistory: 'Histórico de visitas',
    rule: 'Regra',
    condition: 'Condição',
    expected: 'Esperado',
    answer: 'Resposta',
    loading: 'Carregando Perfect Store...',
    lastSync: 'Última sincronização',
    notInformed: 'não informada',
  },
  'en-US': {
    unableIdentify: 'Unable to identify the project or signed-in user.',
    unableLoad: 'Unable to load Perfect Store data right now.',
    loadError: 'Error loading the Perfect Store page.',
    defaultStore: 'Store',
    evaluatedStore: 'Evaluated store',
    executionCriterion: 'Execution criterion',
    diamond: 'Diamond',
    gold: 'Gold',
    silver: 'Silver',
    bronze: 'Bronze',
    critical: 'Critical',
    pending: 'Pending',
    scoreHintDiamond: 'Excellent execution. The store is very close to the perfect standard.',
    scoreHintGold: 'Great execution. Small adjustments can take it to Diamond level.',
    scoreHintSilver: 'Good foundation, but there are still important opportunities at the POS.',
    scoreHintBronze: 'The store needs attention to recover execution points.',
    scoreHintCritical: 'Critical execution. Prioritize pending criteria on the next visit.',
    scoreHintPending: 'No audit in the current period.',
    title: 'Perfect Store',
    subtitle: 'Perfect store, field execution and POS ranking',
    currentScore: 'Current score',
    auditedStoresAverage: 'average of audited stores',
    lastAuditPoints: 'Last audit points',
    overview: 'Overview',
    ranking: 'Ranking',
    history: 'History',
    topStores: 'Top stores',
    attention: 'Attention',
    scorecards: 'Scorecards',
    executionStandard: 'Execution standard',
    executionStandardText: 'Use the next visit to fix out-of-stocks, display, assortment and pending scorecard criteria.',
    attentionStores: 'Stores needing attention',
    noCriticalStores: 'No critical stores right now',
    lowScoreStoresAppear: 'Stores with score below 60% will appear here.',
    bestExecutions: 'Best executions',
    lastScore: 'last score',
    storesRanking: 'Store ranking',
    storesRankingText: 'Sorted by Perfect Store score in the current period.',
    emptyRanking: 'Empty ranking',
    emptyRankingText: 'The ranking will appear when there are Perfect Store audits.',
    storeHistory: 'History by store',
    storeHistoryText: 'Considers all scheduled store visits: visited, not visited and pending.',
    stores: 'Stores',
    visits: 'Visits',
    average: 'Average',
    noScheduledVisits: 'No scheduled visits',
    noScheduledVisitsText: 'We did not find scheduled visits, collections or records to build the history.',
    generalStoreScore: 'Overall store score',
    visitSingular: 'visit',
    visitPlural: 'visits',
    general: 'overall',
    visitsConsidered: 'Visits considered in the score',
    visitOf: 'Visit on',
    noDateLower: 'no date',
    points: 'points',
    noPerfectStoreAnswer: 'This visit does not have a Perfect Store answer yet, so it counts as 0% in the average.',
    noDate: 'No date',
    won: 'won',
    lost: 'lost',
    evaluationCriteria: 'Evaluation criteria',
    ruleSingular: 'rule',
    rulePlural: 'rules',
    noSavedCriteria: 'This evaluation does not have saved detailed criteria.',
    conquered: 'Conquered',
    notConquered: 'Not conquered',
    storeXray: 'Last audit X-ray',
    loadingDetails: 'Loading details...',
    storeScore: 'Store score',
    lastAuditCriteria: 'Last audit criteria',
    noDetailedExtract: 'No detailed extract',
    noDetailedExtractText: 'The criteria will appear here after the next audit.',
    visitsHistory: 'Visit history',
    rule: 'Rule',
    condition: 'Condition',
    expected: 'Expected',
    answer: 'Answer',
    loading: 'Loading Perfect Store...',
    lastSync: 'Last sync',
    notInformed: 'not informed',
  },
  'es-ES': {
    unableIdentify: 'No fue posible identificar el proyecto o el usuario conectado.',
    unableLoad: 'No fue posible cargar los datos de Perfect Store ahora.',
    loadError: 'Error al cargar la página de Perfect Store.',
    defaultStore: 'Tienda',
    evaluatedStore: 'Tienda evaluada',
    executionCriterion: 'Criterio de ejecución',
    diamond: 'Diamante',
    gold: 'Oro',
    silver: 'Plata',
    bronze: 'Bronce',
    critical: 'Crítico',
    pending: 'Pendiente',
    scoreHintDiamond: 'Excelente ejecución. La tienda está muy cerca del estándar perfecto.',
    scoreHintGold: 'Muy buena ejecución. Pequeños ajustes pueden llevarla al nivel Diamante.',
    scoreHintSilver: 'Buena base, pero todavía hay oportunidades importantes en el PDV.',
    scoreHintBronze: 'La tienda necesita atención para recuperar puntos de ejecución.',
    scoreHintCritical: 'Ejecución crítica. Prioriza los criterios pendientes en la próxima visita.',
    scoreHintPending: 'Sin auditoría en el período actual.',
    title: 'Perfect Store',
    subtitle: 'Tienda perfecta, ejecución en campo y ranking de PDVs',
    currentScore: 'Score actual',
    auditedStoresAverage: 'promedio de tiendas auditadas',
    lastAuditPoints: 'Puntos de la última auditoría',
    overview: 'Resumen',
    ranking: 'Ranking',
    history: 'Historial',
    topStores: 'Top tiendas',
    attention: 'Atención',
    scorecards: 'Scorecards',
    executionStandard: 'Estándar de ejecución',
    executionStandardText: 'Usa la próxima visita para corregir quiebres, exhibición, surtido y criterios pendientes del scorecard.',
    attentionStores: 'Tiendas que necesitan atención',
    noCriticalStores: 'Ninguna tienda crítica por el momento',
    lowScoreStoresAppear: 'Las tiendas con score inferior a 60% aparecerán aquí.',
    bestExecutions: 'Mejores ejecuciones',
    lastScore: 'última nota',
    storesRanking: 'Ranking de tiendas',
    storesRankingText: 'Ordenado por la nota de Perfect Store en el período actual.',
    emptyRanking: 'Ranking vacío',
    emptyRankingText: 'El ranking aparecerá cuando haya auditorías de Perfect Store.',
    storeHistory: 'Historial por tienda',
    storeHistoryText: 'Considera todas las visitas programadas de la tienda: visitadas, no visitadas y pendientes.',
    stores: 'Tiendas',
    visits: 'Visitas',
    average: 'Promedio',
    noScheduledVisits: 'Sin visitas programadas',
    noScheduledVisitsText: 'No encontramos visitas programadas, colectas o registros para componer el historial.',
    generalStoreScore: 'Nota general de la tienda',
    visitSingular: 'visita',
    visitPlural: 'visitas',
    general: 'general',
    visitsConsidered: 'Visitas consideradas en la nota',
    visitOf: 'Visita de',
    noDateLower: 'sin fecha',
    points: 'puntos',
    noPerfectStoreAnswer: 'Esta visita aún no tiene respuesta de Perfect Store, por eso entra como 0% en el promedio.',
    noDate: 'Sin fecha',
    won: 'ganados',
    lost: 'perdidos',
    evaluationCriteria: 'Criterios de la evaluación',
    ruleSingular: 'regla',
    rulePlural: 'reglas',
    noSavedCriteria: 'Esta evaluación no tiene criterios detallados guardados.',
    conquered: 'Conquistado',
    notConquered: 'No conquistado',
    storeXray: 'Radiografía de la última auditoría',
    loadingDetails: 'Cargando detalles...',
    storeScore: 'Score de la tienda',
    lastAuditCriteria: 'Criterios de la última auditoría',
    noDetailedExtract: 'Sin extracto detallado',
    noDetailedExtractText: 'Los criterios aparecerán aquí después de la próxima auditoría.',
    visitsHistory: 'Historial de visitas',
    rule: 'Regla',
    condition: 'Condición',
    expected: 'Esperado',
    answer: 'Respuesta',
    loading: 'Cargando Perfect Store...',
    lastSync: 'Última sincronización',
    notInformed: 'no informada',
  },
} as const;

type PerfectStoreTextKey = keyof typeof PERFECT_STORE_TEXTS['pt-BR'];

const psText = (key: PerfectStoreTextKey, language: string) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  return PERFECT_STORE_TEXTS[lang][key];
};

const localeFromLanguage = (language: string) => {
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


type TabType = 'overview' | 'ranking' | 'history';

type PerfectSummary = {
  scoreAtual: number;
  scoreReal: number;
  scoreMaximo: number;
  nivel: string;
  data?: string | null;
  extrato: any[];
};

type RankingItem = {
  id: string;
  lojaId?: string;
  loja_id?: string;
  nome: string;
  scoreAtual: number;
  score?: number;
  percent?: number;
  nivel?: string;
  scoreReal?: number;
  scoreMaximo?: number;
  ultimaNota?: number;
  avaliado?: boolean;
};

type StoreDetails = {
  lojaNome: string;
  scoreAtual: number;
  ultimaNota: number;
  scoreReal: number;
  scoreMaximo: number;
  nivel: string;
  data?: string | null;
  extrato: any[];
  totalVisitas: number;
  historicoVisitas: any[];
};

const safeArray = (value: any): any[] => (Array.isArray(value) ? value : []);

const safeNumber = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const safeJsonParse = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const cleanHtmlText = (value: any) => {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
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

const getCustomData = (user: any) => safeJsonParse(user?.custom_data ?? user?.customData, {});

const formatNumber = (value: any, language = 'pt-BR') => {
  const n = safeNumber(value);

  try {
    return n.toLocaleString(localeFromLanguage(language));
  } catch {
    return String(n);
  }
};

const formatDate = (value?: string | null, language = 'pt-BR') => {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(localeFromLanguage(language), {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
};

const formatLastSync = (value: any, language = 'pt-BR') => {
  if (!value) return psText('notInformed', language);

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString(localeFromLanguage(language));
  } catch {
    return String(value);
  }
};

const getScoreColor = (percent: number) => {
  if (percent >= 90) return '#10B981';
  if (percent >= 80) return '#22C55E';
  if (percent >= 60) return '#F59E0B';
  if (percent >= 40) return '#F97316';
  return '#EF4444';
};

const getScoreLevel = (percent: number, language = 'pt-BR') => {
  if (percent >= 90) return psText('diamond', language);
  if (percent >= 80) return psText('gold', language);
  if (percent >= 60) return psText('silver', language);
  if (percent >= 40) return psText('bronze', language);
  if (percent > 0) return psText('critical', language);
  return psText('pending', language);
};

const getScoreHint = (percent: number, language = 'pt-BR') => {
  if (percent >= 90) return psText('scoreHintDiamond', language);
  if (percent >= 80) return psText('scoreHintGold', language);
  if (percent >= 60) return psText('scoreHintSilver', language);
  if (percent >= 40) return psText('scoreHintBronze', language);
  if (percent > 0) return psText('scoreHintCritical', language);
  return psText('scoreHintPending', language);
};

const getRankColor = (position: number) => {
  if (position === 1) return '#F59E0B';
  if (position === 2) return '#94A3B8';
  if (position === 3) return '#B45309';
  return '#64748B';
};

const normalizeRankingItem = (item: any, language = 'pt-BR'): RankingItem => {
  const score =
    item?.scoreAtual ??
    item?.score ??
    item?.percent ??
    item?.nota ??
    item?.perfect_store_score ??
    item?.perfectStoreScore ??
    0;

  const nome =
    item?.nome ||
    item?.lojaNome ||
    item?.loja_nome ||
    item?.name ||
    item?.razao_social ||
    psText('defaultStore', language);

  const id = String(item?.id || item?.lojaId || item?.loja_id || '');

  return {
    ...item,
    id,
    lojaId: item?.lojaId || item?.loja_id || id,
    loja_id: item?.loja_id || item?.lojaId || id,
    nome: String(nome),
    scoreAtual: safeNumber(score),
    nivel: item?.nivel || getScoreLevel(safeNumber(score), language),
    scoreReal: safeNumber(item?.scoreReal || item?.scoreAtingido),
    scoreMaximo: safeNumber(item?.scoreMaximo),
    ultimaNota: safeNumber(item?.ultimaNota || score),
    avaliado: item?.avaliado ?? safeNumber(score) > 0,
  };
};

const formatRuleValue = (value: any) => {
  if (value === null || value === undefined || String(value).trim() === '') return '';

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  if (typeof value === 'object') {
    const label =
      value?.label ||
      value?.nome ||
      value?.name ||
      value?.titulo ||
      value?.title ||
      value?.valor ||
      value?.value;

    if (label !== undefined && label !== null) return cleanHtmlText(label);

    return cleanHtmlText(JSON.stringify(value));
  }

  return cleanHtmlText(value);
};

const normalizeRuleOperator = (value: any) => {
  const op = String(value || '').trim().toUpperCase();

  const map: Record<string, string> = {
    EQUALS: '=',
    EQUAL: '=',
    EQ: '=',
    '==': '=',
    '=': '=',
    NOT_EQUALS: '≠',
    NOT_EQUAL: '≠',
    NE: '≠',
    '!=': '≠',
    GREATER_THAN: '>',
    GT: '>',
    '>': '>',
    GREATER_THAN_EQUALS: '≥',
    GREATER_THAN_OR_EQUAL: '≥',
    GTE: '≥',
    '>=': '≥',
    LESS_THAN: '<',
    LT: '<',
    '<': '<',
    LESS_THAN_EQUALS: '≤',
    LESS_THAN_OR_EQUAL: '≤',
    LTE: '≤',
    '<=': '≤',
    CONTAINS: 'contém',
    CONTEM: 'contém',
    NOT_CONTAINS: 'não contém',
    NAO_CONTEM: 'não contém',
    IN: 'em',
  };

  return map[op] || cleanHtmlText(value);
};

const getRuleConditionName = (item: any, language = 'pt-BR') => {
  return cleanHtmlText(
    item?.conditionName ||
      item?.condition_name ||
      item?.ruleName ||
      item?.rule_name ||
      item?.criterionName ||
      item?.criterion_name ||
      item?.criterioNome ||
      item?.criterio_nome ||
      item?.criterio ||
      item?.perguntaTitulo ||
      item?.pergunta_titulo ||
      item?.questionTitle ||
      item?.question_title ||
      item?.questionLabel ||
      item?.question_label ||
      item?.campoLabel ||
      item?.campo_label ||
      item?.fieldLabel ||
      item?.field_label ||
      item?.label ||
      item?.name ||
      item?.titulo ||
      item?.title ||
      item?.descricao ||
      item?.description ||
      psText('executionCriterion', language)
  );
};

const getRuleFieldName = (item: any, language = 'pt-BR') => {
  return cleanHtmlText(
    item?.fieldLabel ||
      item?.field_label ||
      item?.campoLabel ||
      item?.campo_label ||
      item?.perguntaTitulo ||
      item?.pergunta_titulo ||
      item?.questionTitle ||
      item?.question_title ||
      item?.questionLabel ||
      item?.question_label ||
      item?.field ||
      item?.campo ||
      item?.chave ||
      item?.key ||
      getRuleConditionName(item, language)
  );
};

const getRuleExpectedValue = (item: any) => {
  const value =
    item?.expectedValue ??
    item?.expected_value ??
    item?.valorEsperado ??
    item?.valor_esperado ??
    item?.targetValue ??
    item?.target_value ??
    item?.comparisonValue ??
    item?.comparison_value ??
    item?.ruleValue ??
    item?.rule_value ??
    item?.metaValor ??
    item?.meta_valor ??
    item?.expected ??
    item?.target;

  return formatRuleValue(value);
};

const getRuleExpression = (item: any, language = 'pt-BR') => {
  const explicit = cleanHtmlText(
    item?.ruleExpression ||
      item?.rule_expression ||
      item?.conditionExpression ||
      item?.condition_expression ||
      item?.expressao ||
      item?.expressaoRegra ||
      item?.expressao_regra ||
      item?.regra ||
      item?.regraTexto ||
      item?.regra_texto
  );

  if (explicit) return explicit;

  const conditions = safeArray(item?.conditions || item?.condicoes || item?.conditionDetails);

  if (conditions.length > 0) {
    const expressions = conditions
      .map((condition: any) => {
        const expression = cleanHtmlText(
          condition?.ruleExpression ||
            condition?.rule_expression ||
            condition?.conditionExpression ||
            condition?.condition_expression ||
            condition?.expressao ||
            condition?.regraTexto ||
            condition?.regra_texto
        );

        if (expression) return expression;

        const field = cleanHtmlText(
          condition?.questionTitle ||
            condition?.question_title ||
            condition?.fieldLabel ||
            condition?.field_label ||
            condition?.perguntaTitulo ||
            condition?.pergunta_titulo ||
            condition?.label ||
            condition?.name ||
            condition?.questionId ||
            ''
        );

        const operator = normalizeRuleOperator(
          condition?.operator ??
            condition?.operatorLabel ??
            condition?.operador ??
            condition?.conditionOperator ??
            condition?.condition_operator
        );

        const expected = formatRuleValue(
          condition?.expectedValue ??
            condition?.expected_value ??
            condition?.valorEsperado ??
            condition?.valor_esperado ??
            condition?.rawExpectedValue ??
            condition?.raw_expected_value ??
            condition?.value
        );

        if (field && operator && expected) return `${field} ${operator} ${expected}`;
        if (field && expected) return `${field} = ${expected}`;
        if (field && operator) return `${field} ${operator}`;

        return '';
      })
      .filter(Boolean);

    if (expressions.length > 0) {
      const joiner = String(item?.matchType || item?.match_type || '').toUpperCase() === 'OR' ? ' OU ' : ' E ';
      return expressions.join(joiner);
    }
  }

  const field = getRuleFieldName(item, language);
  const operator = normalizeRuleOperator(
    item?.operator ??
      item?.operatorLabel ??
      item?.operador ??
      item?.conditionOperator ??
      item?.condition_operator ??
      item?.comparisonOperator ??
      item?.comparison_operator
  );
  const expected = getRuleExpectedValue(item);

  if (field && operator && expected) return `${field} ${operator} ${expected}`;
  if (field && expected) return `${field} = ${expected}`;
  if (field && operator) return `${field} ${operator}`;

  return '';
};

const getRuleTitle = (item: any, language = 'pt-BR') => {
  const expression = getRuleExpression(item, language);

  if (expression) {
    const conditionName = getRuleConditionName(item, language);
    const isGeneric =
      !conditionName ||
      conditionName.toLowerCase().includes('critério padrão') ||
      conditionName.toLowerCase().includes('criterio padrao') ||
      conditionName === psText('executionCriterion', language);

    return isGeneric ? `${psText('condition', language)} = ${expression}` : `${conditionName} = ${expression}`;
  }

  return getRuleConditionName(item, language);
};

const getRuleContext = (item: any) => {
  return cleanHtmlText(
    item?.actual ||
      item?.actualValue ||
      item?.actual_value ||
      item?.valorAtual ||
      item?.valor_atual ||
      item?.resposta ||
      item?.answer ||
      item?.valor ||
      item?.observacao ||
      item?.contextoDetalhe ||
      item?.detalhe ||
      ''
  );
};

const getRulePoints = (item: any) => {
  return safeNumber(
    item?.points ??
      item?.pontos ??
      item?.score ??
      item?.scoreAtingido ??
      item?.scoreReal ??
      0
  );
};

const isRuleHit = (item: any) => {
  const status = String(item?.status || '').toUpperCase();

  return (
    item?.hit === true ||
    item?.atingido === true ||
    item?.ok === true ||
    status === 'HIT' ||
    status === 'DONE' ||
    status === 'CONCLUIDO' ||
    status === 'CONCLUÍDO'
  );
};

const getScorecardName = (item: any) => {
  return item?.scorecardName || item?.scorecard || item?.campanhaNome || item?.campaignName || item?.groupName || '';
};

const getRuleSecondaryInfo = (item: any) => {
  const parts = [
    cleanHtmlText(item?.surveyName || item?.survey_name || item?.pesquisaTitulo || item?.pesquisa_titulo),
    cleanHtmlText(item?.mixName || item?.mix_name || item?.produtoFiltro || item?.produto_filtro),
  ].filter(Boolean);

  return parts.join(' · ');
};

const parseConditionValue = (value: any) => {
  const raw = String(value ?? '');
  const parts = raw.split('_@CTX@_');

  return {
    expectedValue: formatRuleValue(parts[0] ?? ''),
    ctxType: parts[1] || 'NONE',
    ctxId: parts[2] || '',
  };
};

const normalizeScorecardCondition = (condition: any) => {
  const parsed = parseConditionValue(
    condition?.value ??
      condition?.valor ??
      condition?.expectedValue ??
      condition?.valorEsperado
  );

  const questionTitle = cleanHtmlText(
    condition?.questionTitle ||
      condition?.question_title ||
      condition?.fieldLabel ||
      condition?.field_label ||
      condition?.perguntaTitulo ||
      condition?.pergunta_titulo ||
      condition?.label ||
      condition?.name ||
      condition?.questionId ||
      condition?.question_id ||
      ''
  );

  const operator = normalizeRuleOperator(condition?.operator ?? condition?.operador);
  const expression =
    questionTitle && operator && parsed.expectedValue
      ? `${questionTitle} ${operator} ${parsed.expectedValue}`
      : '';

  return {
    ...condition,
    surveyId: condition?.surveyId || condition?.survey_id,
    questionId: condition?.questionId || condition?.question_id,
    questionTitle,
    fieldLabel: questionTitle,
    operator: condition?.operator ?? condition?.operador,
    operatorLabel: operator,
    expectedValue: parsed.expectedValue,
    valorEsperado: parsed.expectedValue,
    rawExpectedValue: parsed.expectedValue,
    ctxType: parsed.ctxType,
    ctxId: parsed.ctxId,
    mixName: parsed.ctxType && parsed.ctxType !== 'NONE' ? parsed.ctxType : 'Qualquer Produto (Geral)',
    ruleExpression: expression,
  };
};

const normalizeScorecardCriterion = (scorecard: any, criterion: any) => {
  const conditions = safeArray(criterion?.conditions || criterion?.condicoes).map(normalizeScorecardCondition);
  const expressions = conditions.map((condition: any) => condition.ruleExpression).filter(Boolean);
  const joiner = String(criterion?.matchType || criterion?.match_type || '').toUpperCase() === 'OR' ? ' OU ' : ' E ';
  const ruleExpression = expressions.join(joiner);

  return {
    criterionId: criterion?.id,
    criterionName: criterion?.name || criterion?.nome || 'Critério',
    ruleName: criterion?.name || criterion?.nome || 'Critério',
    scorecardName: scorecard?.name || scorecard?.nome || scorecard?.scorecardName || '',
    campaignName: scorecard?.name || scorecard?.nome || scorecard?.scorecardName || '',
    groupName: scorecard?.name || scorecard?.nome || scorecard?.scorecardName || '',
    ruleExpression,
    conditionExpression: ruleExpression,
    fieldLabel: conditions[0]?.fieldLabel || '',
    questionTitle: conditions[0]?.questionTitle || '',
    surveyName: conditions[0]?.surveyName || '',
    operator: conditions[0]?.operator || '',
    operatorLabel: conditions[0]?.operatorLabel || '',
    expectedValue: conditions[0]?.expectedValue || '',
    valorEsperado: conditions[0]?.expectedValue || '',
    mixName: conditions[0]?.mixName || 'Qualquer Produto (Geral)',
    conditions,
    points: safeNumber(criterion?.points ?? criterion?.pontos),
  };
};

const buildScorecardRuleLookup = (scorecards: any[]) => {
  const lookup = new Map<string, any>();

  safeArray(scorecards).forEach((scorecard: any) => {
    safeArray(scorecard?.criteria || scorecard?.criterios).forEach((criterion: any) => {
      const normalized = normalizeScorecardCriterion(scorecard, criterion);
      const criterionId = String(normalized.criterionId || '');
      const criterionName = String(normalized.criterionName || '').toLowerCase();
      const scorecardName = String(normalized.scorecardName || '').toLowerCase();
      const points = String(safeNumber(normalized.points));

      if (criterionId) {
        lookup.set(criterionId, normalized);
        lookup.set(criterionId.toLowerCase(), normalized);
      }

      if (criterionName) lookup.set(criterionName, normalized);
      if (scorecardName && points) lookup.set(`${scorecardName}|${points}`, normalized);
      if (scorecardName && criterionName && points) lookup.set(`${scorecardName}|${criterionName}|${points}`, normalized);
    });
  });

  return lookup;
};

const isGenericCriterionName = (value: any) => {
  const text = cleanHtmlText(value).toLowerCase();

  return !text || text.includes('critério padrão') || text.includes('criterio padrao') || text === 'critério' || text === 'criterio';
};

const enrichRuleFromScorecardLookup = (item: any, lookup: Map<string, any>) => {
  if (!item || lookup.size === 0) return item;

  const criterionId = String(item?.criterionId || item?.criterioId || item?.id || '');
  const criterionName = String(item?.criterionName || item?.ruleName || item?.criterioNome || '').toLowerCase();
  const scorecardName = String(item?.scorecardName || item?.groupName || item?.campaignName || '').toLowerCase();
  const points = String(safeNumber(item?.points ?? item?.pontos ?? item?.score));

  const matched =
    lookup.get(criterionId) ||
    lookup.get(criterionId.toLowerCase()) ||
    lookup.get(criterionName) ||
    lookup.get(`${scorecardName}|${points}`) ||
    lookup.get(`${scorecardName}|${criterionName}|${points}`);

  if (!matched) return item;

  return {
    ...matched,
    ...item,
    ruleName: isGenericCriterionName(item?.ruleName || item?.criterionName) ? matched.ruleName : item?.ruleName || matched.ruleName,
    criterionName: isGenericCriterionName(item?.criterionName || item?.ruleName) ? matched.criterionName : item?.criterionName || matched.criterionName,
    ruleExpression: item?.ruleExpression || matched.ruleExpression,
    conditionExpression: item?.conditionExpression || matched.conditionExpression,
    scorecardName: item?.scorecardName || matched.scorecardName,
    groupName: item?.groupName || matched.groupName,
    campaignName: item?.campaignName || matched.campaignName,
    fieldLabel: item?.fieldLabel || matched.fieldLabel,
    questionTitle: item?.questionTitle || matched.questionTitle,
    surveyName: item?.surveyName || matched.surveyName,
    operator: item?.operator || matched.operator,
    operatorLabel: item?.operatorLabel || matched.operatorLabel,
    expectedValue: item?.expectedValue ?? matched.expectedValue,
    valorEsperado: item?.valorEsperado ?? matched.valorEsperado,
    mixName: item?.mixName || matched.mixName,
    conditions: item?.conditions || matched.conditions,
  };
};

const enrichVisitExtract = (visit: any, lookup: Map<string, any>) => ({
  ...visit,
  extrato: safeArray(visit?.extrato).map((rule: any) => enrichRuleFromScorecardLookup(rule, lookup)),
});

const enrichStoreHistory = (store: any, lookup: Map<string, any>) => ({
  ...store,
  visitas: safeArray(store?.visitas).map((visit: any) => enrichVisitExtract(visit, lookup)),
});

export default function PerfectStoreScreen() {
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
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [summary, setSummary] = useState<PerfectSummary | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [scorecards, setScorecards] = useState<any[]>([]);
  const [historySnapshots, setHistorySnapshots] = useState<any[]>([]);
  const [historyStores, setHistoryStores] = useState<any[]>([]);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [details, setDetails] = useState<StoreDetails | null>(null);

  const projectId = getMainProjectId(user);
  const userId = user?.id;

  const customData = getCustomData(user);
  const fallbackScore = safeNumber(customData?.perfect_store_score || user?.perfect_store_score);

  const currentScore = safeNumber(summary?.scoreAtual ?? fallbackScore);
  const currentLevel = summary?.nivel || getScoreLevel(currentScore, language);
  const scoreColor = getScoreColor(currentScore);

  const ruleLookup = useMemo(() => buildScorecardRuleLookup(scorecards), [scorecards]);

  const enrichedHistoryStores = useMemo(
    () => safeArray(historyStores).map((store: any) => enrichStoreHistory(store, ruleLookup)),
    [historyStores, ruleLookup]
  );

  const enrichedHistorySnapshots = useMemo(
    () =>
      safeArray(historySnapshots).map((snapshot: any) => ({
        ...snapshot,
        extrato: safeArray(snapshot?.extrato).map((rule: any) => enrichRuleFromScorecardLookup(rule, ruleLookup)),
      })),
    [historySnapshots, ruleLookup]
  );

  const lojasHistorico = enrichedHistoryStores;

  psSpy('client-enrichment-state', {
    scorecardsLength: safeArray(scorecards).length,
    ruleLookupSize: ruleLookup.size,
    historyStoresLength: safeArray(historyStores).length,
    enrichedHistoryStoresLength: safeArray(enrichedHistoryStores).length,
    firstEnrichedRule: compactRuleForSpy(
      safeArray(safeArray(enrichedHistoryStores?.[0]?.visitas)[0]?.extrato)[0]
    ),
  });

  const scoreCoerente =
    lojasHistorico.length > 0
      ? Math.round(
          lojasHistorico.reduce((sum: number, loja: any) => sum + safeNumber(loja?.scoreAtual), 0) /
            lojasHistorico.length
        )
      : currentScore;
  const scoreCoerenteColor = getScoreColor(scoreCoerente);
  const scoreCoerenteLevel = getScoreLevel(scoreCoerente, language);


  const activeScorecards = useMemo(() => {
    return scorecards.filter((scorecard) => {
      if (scorecard?.enabled === false || scorecard?.ativo === false) return false;

      const end = scorecard?.endDate || scorecard?.dataFim;
      if (!end) return true;

      const endDate = new Date(end);
      if (Number.isNaN(endDate.getTime())) return true;

      return endDate >= new Date();
    });
  }, [scorecards]);

  const rankingCoerente = useMemo(() => {
    if (lojasHistorico.length > 0) {
      return lojasHistorico.map((loja: any) => ({
        id: String(loja.loja_id),
        lojaId: String(loja.loja_id),
        loja_id: String(loja.loja_id),
        nome: loja.lojaNome || psText('defaultStore', language),
        scoreAtual: safeNumber(loja.scoreAtual),
        nivel: loja.nivel || getScoreLevel(safeNumber(loja.scoreAtual), language),
        ultimaNota: safeNumber(loja.scoreAtual),
        scoreReal: 0,
        scoreMaximo: 0,
        avaliado: safeArray(loja.visitas).some((v: any) => v.avaliado),
        visitas: safeArray(loja.visitas),
      }));
    }

    return ranking;
  }, [lojasHistorico, ranking, language]);

  const topStores = useMemo(() => rankingCoerente.slice(0, 5), [rankingCoerente]);
  const attentionStores = useMemo(
    () => rankingCoerente.filter((item) => item.scoreAtual >= 0 && item.scoreAtual < 60).slice(0, 5),
    [rankingCoerente]
  );
  const pendingStores = useMemo(
    () => ranking.filter((item) => !item.avaliado || item.scoreAtual <= 0).slice(0, 5),
    [ranking]
  );

  const loadPerfectStore = async (silent = false) => {
    if (!projectId || !userId) {
      setLoading(false);
      setErrorMessage(psText('unableIdentify', language));
      return;
    }

    if (!silent) setLoading(true);
    setErrorMessage(null);

    try {
      const t = Date.now();

      const [resSummary, resRanking, resRules, resHistory] = await Promise.all([
        api(`/perfect-store/extrato-geral/${projectId}/${userId}?t=${t}`, { method: 'GET' }).catch((err: any) => {
          console.log('[PerfectStore] extrato-geral falhou:', err?.message || err);
          return null;
        }),
        api(`/perfect-store/ranking/${projectId}?scorecard=ALL&t=${t}`, { method: 'GET' }).catch((err: any) => {
          console.log('[PerfectStore] ranking falhou:', err?.message || err);
          return null;
        }),
        api(`/perfect-store/rules/${projectId}?t=${t}`, { method: 'GET' }).catch((err: any) => {
          console.log('[PerfectStore] rules falhou:', err?.message || err);
          return null;
        }),
        api(`/perfect-store/historico-mobile/${projectId}/${userId}?limit=80&t=${t}`, { method: 'GET' }).catch((err: any) => {
          console.log('[PerfectStore] historico-mobile falhou:', err?.message || err);
          return null;
        }),
      ]);

      if (resSummary?.ok) {
        const data = await resSummary.json();

        psSpy('extrato-geral-response', {
          keys: Object.keys(data || {}),
          extratoLength: safeArray(data?.extrato).length,
          firstExtrato: compactRuleForSpy(safeArray(data?.extrato)[0]),
          raw: data,
        });

        setSummary({
          scoreAtual: safeNumber(data?.scoreAtual),
          scoreReal: safeNumber(data?.scoreReal),
          scoreMaximo: safeNumber(data?.scoreMaximo),
          nivel: data?.nivel || getScoreLevel(safeNumber(data?.scoreAtual), language),
          data: data?.data || null,
          extrato: safeArray(data?.extrato),
        });
      } else {
        setSummary({
          scoreAtual: fallbackScore,
          scoreReal: 0,
          scoreMaximo: 0,
          nivel: getScoreLevel(fallbackScore, language),
          data: null,
          extrato: [],
        });
      }

      if (resRanking?.ok) {
        const data = await resRanking.json();
        const list = safeArray(data?.ranking || data);

        setRanking(list.map((item: any) => normalizeRankingItem(item, language)).filter((item) => item.id));
      } else {
        setRanking([]);
      }

      if (resRules?.ok) {
        const data = await resRules.json();
        const parsed =
          typeof data?.perfectStoreRules === 'string'
            ? safeJsonParse(data.perfectStoreRules, [])
            : data?.perfectStoreRules;

        psSpy('rules-response', {
          keys: Object.keys(data || {}),
          scorecardsLength: safeArray(parsed).length,
          firstScorecard: {
            id: safeArray(parsed)[0]?.id,
            name: safeArray(parsed)[0]?.name,
            criteriaJson: JSON.stringify(
              safeArray(safeArray(parsed)[0]?.criteria).map((criterion: any) => ({
                id: criterion?.id,
                name: criterion?.name,
                points: criterion?.points,
                matchType: criterion?.matchType,
                conditions: safeArray(criterion?.conditions),
              })),
              null,
              2
            ),
          },
        });

        setScorecards(safeArray(parsed));
      } else {
        setScorecards([]);
      }

      if (resHistory?.ok) {
        const data = await resHistory.json();

        const historicoRaw = safeArray(data?.historico || data?.items || data);
        const lojasRaw = safeArray(data?.lojas);
        const firstVisit = safeArray(lojasRaw?.[0]?.visitas)[0];
        const firstRule = safeArray(firstVisit?.extrato)[0];

        psSpy('historico-mobile-response', {
          keys: Object.keys(data || {}),
          historicoLength: historicoRaw.length,
          lojasLength: lojasRaw.length,
          firstHistorico: {
            lojaNome: historicoRaw?.[0]?.lojaNome,
            status: historicoRaw?.[0]?.status,
            extratoLength: safeArray(historicoRaw?.[0]?.extrato).length,
            firstRule: compactRuleForSpy(safeArray(historicoRaw?.[0]?.extrato)[0]),
          },
          firstLoja: {
            lojaNome: lojasRaw?.[0]?.lojaNome,
            visitasLength: safeArray(lojasRaw?.[0]?.visitas).length,
            firstVisit: {
              status: firstVisit?.status,
              percent: firstVisit?.percent,
              extratoLength: safeArray(firstVisit?.extrato).length,
              firstRule: compactRuleForSpy(firstRule),
            },
          },
        });

        setHistorySnapshots(historicoRaw);
        setHistoryStores(lojasRaw);
      } else {
        setHistorySnapshots([]);
        setHistoryStores([]);
      }

      if (!resSummary?.ok && !resRanking?.ok && !resRules?.ok && !resHistory?.ok) {
        setErrorMessage(psText('unableLoad', language));
      }
    } catch (error: any) {
      console.log('[PerfectStore] Erro geral:', error?.message || error);
      setErrorMessage(psText('loadError', language));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadStoreDetails = async (item: RankingItem) => {
    if (!projectId) return;

    const lojaId = item.lojaId || item.loja_id || item.id;

    if (!lojaId) return;

    setDetailsLoading(true);
    setDetails({
      lojaNome: item.nome,
      scoreAtual: item.scoreAtual,
      ultimaNota: item.ultimaNota || item.scoreAtual,
      scoreReal: item.scoreReal || 0,
      scoreMaximo: item.scoreMaximo || 0,
      nivel: item.nivel || getScoreLevel(item.scoreAtual, language),
      data: null,
      extrato: [],
      totalVisitas: 0,
      historicoVisitas: [],
    });

    try {
      const res = await api(`/perfect-store/extrato/${projectId}/${lojaId}?t=${Date.now()}`, {
        method: 'GET',
      });

      if (res.ok) {
        const data = await res.json();

        psSpy('extrato-loja-response', {
          keys: Object.keys(data || {}),
          lojaNome: item.nome,
          extratoLength: safeArray(data?.extrato).length,
          firstExtrato: compactRuleForSpy(safeArray(data?.extrato)[0]),
          historicoVisitasLength: safeArray(data?.historicoVisitas).length,
          firstVisitRule: compactRuleForSpy(safeArray(safeArray(data?.historicoVisitas)[0]?.extrato)[0]),
          raw: data,
        });

        setDetails({
          lojaNome: item.nome,
          scoreAtual: safeNumber(data?.scoreAtual),
          ultimaNota: safeNumber(data?.ultimaNota),
          scoreReal: safeNumber(data?.scoreReal),
          scoreMaximo: safeNumber(data?.scoreMaximo),
          nivel: data?.nivel || getScoreLevel(safeNumber(data?.scoreAtual), language),
          data: data?.data || null,
          extrato: safeArray(data?.extrato),
          totalVisitas: safeNumber(data?.totalVisitas),
          historicoVisitas: safeArray(data?.historicoVisitas),
        });
      }
    } catch (error: any) {
      console.log('[PerfectStore] detalhes falhou:', error?.message || error);
    } finally {
      setDetailsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPerfectStore();
    }, [projectId, userId, language])
  );

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
    } catch (error: any) {
      console.log('[PerfectStore] globalSync falhou:', error?.message || error);
    }

    await loadPerfectStore(true);
  };

  const renderTab = (key: TabType, label: string) => {
    const active = activeTab === key;

    return (
      <TouchableOpacity
        style={[
          styles.tabButton,
          {
            backgroundColor: active ? accent : surface,
            borderColor: active ? accent : border,
          },
        ]}
        onPress={() => setActiveTab(key)}
        activeOpacity={0.85}
      >
        <Text style={[styles.tabText, { color: active ? accentText : textSecondary }]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      <View style={[styles.hero, { backgroundColor: bg, borderBottomColor: border }]}>
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
            <Store size={28} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{psText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {psText('subtitle', language)}
            </Text>
          </View>
        </View>

        <View style={[styles.heroScoreCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.heroScoreTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroScoreLabel, { color: textSecondary }]}>{psText('currentScore', language)}</Text>
              <Text style={[styles.heroScoreValue, { color: textPrimary }]}>{formatNumber(scoreCoerente, language)}%</Text>
              <Text style={[styles.heroScoreSuffix, { color: textSecondary }]}>{psText('auditedStoresAverage', language)}</Text>
            </View>

            <View style={[styles.levelBadge, { backgroundColor: scoreCoerenteColor }]}>
              <Star size={18} color="#FFFFFF" />
              <Text style={styles.levelBadgeText}>{scoreCoerenteLevel}</Text>
            </View>
          </View>

          <View style={[styles.heroDivider, { backgroundColor: border }]} />

          <View style={styles.heroAchievementRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroAchievementLabel, { color: textSecondary }]}>{psText('lastAuditPoints', language)}</Text>
              <Text style={[styles.heroAchievementValue, { color: textPrimary }]}>
                {formatNumber(summary?.scoreReal || 0, language)} / {formatNumber(summary?.scoreMaximo || 0, language)}
              </Text>
            </View>

            <Text style={[styles.heroAchievementStatus, { color: scoreCoerenteColor }]}>
              {formatNumber(scoreCoerente, language)}%
            </Text>
          </View>

          <View style={[styles.heroProgressTrack, { backgroundColor: surfaceAlt }]}>
            <View
              style={[
                styles.heroProgressFill,
                {
                  width: `${Math.max(0, Math.min(100, scoreCoerente))}%`,
                  backgroundColor: scoreCoerenteColor,
                },
              ]}
            />
          </View>

          <Text style={[styles.heroAchievementHint, { color: textSecondary }]}>{getScoreHint(scoreCoerente, language)}</Text>
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <View style={[styles.tabsCard, { backgroundColor: surface, borderColor: border }]}>
          {renderTab('overview', psText('overview', language))}
          {renderTab('ranking', psText('ranking', language))}
          {renderTab('history', psText('history', language))}
        </View>
      </View>
    </View>
  );

  const renderOverview = () => (
    <View style={styles.sectionContent}>
      {errorMessage ? (
        <View style={[styles.warningCard, { backgroundColor: surface, borderColor: border }]}>
          <AlertCircle size={22} color="#F59E0B" />
          <Text style={[styles.warningText, { color: textSecondary }]}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
          <Trophy size={22} color="#F59E0B" />
          <Text style={[styles.kpiValue, { color: textPrimary }]}>{topStores.length}</Text>
          <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('topStores', language)}</Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
          <AlertCircle size={22} color="#F97316" />
          <Text style={[styles.kpiValue, { color: textPrimary }]}>{attentionStores.length}</Text>
          <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('attention', language)}</Text>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
          <Target size={22} color={accent} />
          <Text style={[styles.kpiValue, { color: textPrimary }]}>{activeScorecards.length}</Text>
          <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('scorecards', language)}</Text>
        </View>
      </View>

      <View style={[styles.highlightCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.highlightTop}>
          <View style={[styles.highlightIcon, { backgroundColor: accent }]}>
            <Sparkles size={23} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.highlightTitle, { color: textPrimary }]}>{psText('executionStandard', language)}</Text>
            <Text style={[styles.highlightSubtitle, { color: textSecondary }]}>
              {psText('executionStandardText', language)}
            </Text>
          </View>
        </View>
      </View>

      <Text style={[styles.blockTitle, { color: textPrimary }]}>{psText('attentionStores', language)}</Text>

      {attentionStores.length > 0 ? (
        attentionStores.map((item, index) => renderStoreCard(item, index, true))
      ) : (
        <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}>
          <CheckCircle2 size={28} color="#10B981" />
          <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{psText('noCriticalStores', language)}</Text>
          <Text style={[styles.emptySmallText, { color: textSecondary }]}>
            {psText('lowScoreStoresAppear', language)}
          </Text>
        </View>
      )}

      <Text style={[styles.blockTitle, { color: textPrimary, marginTop: 20 }]}>{psText('bestExecutions', language)}</Text>
      {topStores.map((item, index) => renderStoreCard(item, index))}
    </View>
  );

  const renderStoreCard = (item: RankingItem, index: number, attention = false) => {
    const score = safeNumber(item.scoreAtual);
    const color = getScoreColor(score);
    const rankColor = getRankColor(index + 1);

    return (
      <TouchableOpacity
        key={`${item.id}_${index}`}
        style={[
          styles.storeCard,
          {
            backgroundColor: surface,
            borderColor: attention ? color : border,
          },
        ]}
        onPress={() => loadStoreDetails(item)}
        activeOpacity={0.86}
      >
        <View style={styles.storeTop}>
          <View style={[styles.positionCircle, { backgroundColor: attention ? `${color}22` : `${rankColor}22` }]}>
            <Text style={[styles.positionText, { color: attention ? color : rankColor }]}>
              {attention ? '!' : `#${index + 1}`}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.storeName, { color: textPrimary }]} numberOfLines={1}>
              {item.nome}
            </Text>
            <Text style={[styles.storeSubtitle, { color: textSecondary }]} numberOfLines={1}>
              {item.nivel || getScoreLevel(score, language)} · {psText('lastScore', language)} {formatNumber(item.ultimaNota || score, language)}%
            </Text>
          </View>

          <View style={styles.storeScoreBox}>
            <Text style={[styles.storeScore, { color }]}>{formatNumber(score, language)}%</Text>
            <Eye size={15} color={textSecondary} />
          </View>
        </View>

        <View style={[styles.smallProgressTrack, { backgroundColor: surfaceAlt }]}>
          <View
            style={[
              styles.smallProgressFill,
              {
                width: `${Math.max(0, Math.min(100, score))}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderRanking = () => (
    <View style={styles.sectionContent}>
      <View style={[styles.rankingInfoCard, { backgroundColor: surface, borderColor: border }]}>
        <Medal size={22} color={accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rankingInfoTitle, { color: textPrimary }]}>{psText('storesRanking', language)}</Text>
          <Text style={[styles.rankingInfoText, { color: textSecondary }]}>
            {psText('storesRankingText', language)}
          </Text>
        </View>
      </View>

      {rankingCoerente.map((item, index) => renderStoreCard(item, index))}

      {rankingCoerente.length === 0 ? (
        <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}>
          <Store size={28} color={accent} />
          <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{psText('emptyRanking', language)}</Text>
          <Text style={[styles.emptySmallText, { color: textSecondary }]}>
            {psText('emptyRankingText', language)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderHistory = () => {
    const lojas = lojasHistorico;
    const totalAvaliacoes = enrichedHistorySnapshots.length;
    const avgPercent =
      totalAvaliacoes > 0
        ? Math.round(
            enrichedHistorySnapshots.reduce((sum: number, item: any) => sum + safeNumber(item?.percent), 0) /
              totalAvaliacoes
          )
        : 0;

    return (
      <View style={styles.sectionContent}>
        <View style={[styles.rankingInfoCard, { backgroundColor: surface, borderColor: border }]}>
          <History size={22} color={accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rankingInfoTitle, { color: textPrimary }]}>{psText('storeHistory', language)}</Text>
            <Text style={[styles.rankingInfoText, { color: textSecondary }]}>
              {psText('storeHistoryText', language)}
            </Text>
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
            <Store size={22} color="#10B981" />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{lojas.length}</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('stores', language)}</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
            <Target size={22} color={accent} />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{totalAvaliacoes}</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('visits', language)}</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}>
            <Trophy size={22} color={getScoreColor(avgPercent)} />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{formatNumber(avgPercent, language)}%</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{psText('average', language)}</Text>
          </View>
        </View>

        {lojas.map((loja: any, index: number) => renderStoreHistoryGroup(loja, index))}

        {lojas.length === 0 ? (
          <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}>
            <AlertCircle size={28} color={accent} />
            <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{psText('noScheduledVisits', language)}</Text>
            <Text style={[styles.emptySmallText, { color: textSecondary }]}>
              {psText('noScheduledVisitsText', language)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderStoreHistoryGroup = (loja: any, index: number) => {
    const visitas = safeArray(loja?.visitas);
    const score = safeNumber(loja?.scoreAtual);
    const color = getScoreColor(score);
    const visitLabel = visitas.length === 1 ? psText('visitSingular', language) : psText('visitPlural', language);

    return (
      <View
        key={String(loja?.loja_id || index)}
        style={[styles.storeHistoryGroup, { backgroundColor: surface, borderColor: border }]}
      >
        <View style={styles.storeHistoryHeader}>
          <View style={styles.storeHistoryIdentity}>
            <View style={[styles.storeHistoryIcon, { backgroundColor: `${color}18` }]}>
              <Store size={20} color={color} />
            </View>

            <View style={styles.storeHistoryTextColumn}>
              <Text style={[styles.storeHistoryName, { color: textPrimary }]} numberOfLines={2}>
                {loja?.lojaNome || psText('defaultStore', language)}
              </Text>
              <Text style={[styles.storeHistorySubtitle, { color: textSecondary }]} numberOfLines={1}>
                {psText('generalStoreScore', language)} · {visitas.length} {visitLabel}
              </Text>
            </View>
          </View>

          <View style={styles.storeHistoryScoreBox}>
            <Text style={[styles.storeHistoryScore, { color }]}>{formatNumber(score, language)}%</Text>
            <Text style={[styles.storeHistoryScoreLabel, { color: textSecondary }]}>
              {psText('general', language)}
            </Text>
          </View>
        </View>

        <View style={[styles.smallProgressTrack, { backgroundColor: surfaceAlt }]}>
          <View
            style={[
              styles.smallProgressFill,
              {
                width: `${Math.max(0, Math.min(100, score))}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        <View style={[styles.storeVisitsPill, { backgroundColor: surfaceAlt, borderColor: border }]}>
          <ListChecks size={15} color={textSecondary} />
          <Text style={[styles.storeVisitsPillText, { color: textSecondary }]} numberOfLines={1}>
            {psText('visitsConsidered', language)}: {visitas.length}
          </Text>
        </View>

        {visitas.map((visit: any, visitIndex: number) =>
          renderVisitHistoryItem(visit, `${loja?.loja_id || index}_${visitIndex}`)
        )}
      </View>
    );
  };

  const renderVisitHistoryItem = (visit: any, key: string) => {
    const p = safeNumber(visit?.percent);
    const c = getScoreColor(p);
    const extrato = safeArray(visit?.extrato);
    const avaliado = visit?.avaliado === true;
    const status = visit?.status || (avaliado ? 'AVALIADO' : 'PENDENTE');

    return (
      <View key={key} style={[styles.visitHistoryCard, { backgroundColor: surfaceAlt, borderColor: border }]}>
        <View style={styles.visitHistoryHeader}>
          <View style={styles.visitTextColumn}>
            <Text style={[styles.visitDate, { color: textPrimary }]} numberOfLines={1}>
              {psText('visitOf', language)} {formatDate(visit?.data || visit?.criado_em, language) || psText('noDateLower', language)}
            </Text>
            <Text style={[styles.visitMeta, { color: textSecondary }]} numberOfLines={1}>
              {status} · {formatNumber(visit?.scoreAtingido || 0, language)} / {formatNumber(visit?.scoreMaximo || 0, language)} {psText('points', language)}
            </Text>
          </View>

          <View style={styles.visitScoreBox}>
            <Text style={[styles.visitScore, { color: c }]}>{formatNumber(p, language)}%</Text>
          </View>
        </View>

        <View style={[styles.smallProgressTrack, { backgroundColor: isDark ? '#111827' : '#E2E8F0' }]}>
          <View style={[styles.smallProgressFill, { width: `${Math.max(0, Math.min(100, p))}%`, backgroundColor: c }]} />
        </View>

        {extrato.map((rule: any, ruleIndex: number) =>
          renderModalRule(rule, `${key}_${ruleIndex}`)
        )}

        {!avaliado && extrato.length === 0 ? (
          <View style={[styles.noRulesBox, { backgroundColor: isDark ? '#0B1220' : '#FFFFFF', borderColor: border }]}>
            <AlertCircle size={18} color={accent} />
            <Text style={[styles.noRulesText, { color: textSecondary }]}>
              {psText('noPerfectStoreAnswer', language)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderSnapshotCard = (snapshot: any, index: number) => {
    const max = safeNumber(snapshot?.scoreMaximo);
    const hit = safeNumber(snapshot?.scoreAtingido);
    const percent = max > 0 ? Math.round((hit / max) * 100) : safeNumber(snapshot?.percent);
    const color = getScoreColor(percent);
    const extrato = safeArray(snapshot?.extrato || snapshot?.extratoRegras);
    const ganhos = extrato.filter((item: any) => isRuleHit(item));
    const perdidos = extrato.filter((item: any) => !isRuleHit(item));

    return (
      <View key={String(snapshot?.id || index)} style={[styles.snapshotCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.snapshotHeader}>
          <View style={[styles.statusDot, { backgroundColor: `${color}18` }]}>
            <Store size={18} color={color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.snapshotTitle, { color: textPrimary }]} numberOfLines={2}>
              {snapshot?.lojaNome || snapshot?.loja_nome || psText('evaluatedStore', language)}
            </Text>
            <Text style={[styles.snapshotSubtitle, { color: textSecondary }]} numberOfLines={2}>
              {formatDate(snapshot?.data || snapshot?.criado_em, language) || psText('noDate', language)} · {snapshot?.nivel || getScoreLevel(percent, language)}
            </Text>
          </View>

          <View style={styles.snapshotScoreBox}>
            <Text style={[styles.snapshotScore, { color }]}>{formatNumber(percent, language)}%</Text>
            <Text style={[styles.snapshotPoints, { color: textSecondary }]}>
              {formatNumber(hit, language)} / {formatNumber(max, language)}
            </Text>
          </View>
        </View>

        <View style={[styles.smallProgressTrack, { backgroundColor: surfaceAlt }]}>
          <View
            style={[
              styles.smallProgressFill,
              {
                width: `${Math.max(0, Math.min(100, percent))}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>

        <View style={styles.snapshotStatsRow}>
          <View style={[styles.snapshotMiniBadge, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
            <CheckCircle2 size={13} color="#10B981" />
            <Text style={[styles.snapshotMiniText, { color: '#10B981' }]}>
              {ganhos.length} {psText('won', language)}
            </Text>
          </View>

          <View style={[styles.snapshotMiniBadge, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
            <XCircle size={13} color="#EF4444" />
            <Text style={[styles.snapshotMiniText, { color: '#EF4444' }]}>
              {perdidos.length} {psText('lost', language)}
            </Text>
          </View>
        </View>

        <View style={[styles.snapshotDetailHeader, { borderTopColor: border }]}>
          <Text style={[styles.snapshotDetailTitle, { color: textPrimary }]}>
            {psText('evaluationCriteria', language)}
          </Text>
          <Text style={[styles.snapshotDetailCount, { color: textSecondary }]}>
            {extrato.length} {extrato.length === 1 ? psText('ruleSingular', language) : psText('rulePlural', language)}
          </Text>
        </View>

        {extrato.map((item: any, itemIndex: number) =>
          renderModalRule(item, `${snapshot?.id || index}_${itemIndex}`)
        )}

        {extrato.length === 0 ? (
          <Text style={[styles.noRulesText, { color: textSecondary }]}>
            {psText('noSavedCriteria', language)}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderScoreEvent = (item: any, key: string, earned: boolean) => {
    const color = earned ? '#10B981' : '#EF4444';
    const Icon = earned ? CheckCircle2 : XCircle;
    const points = getRulePoints(item);
    const scorecardName = getScorecardName(item);
    const detail = getRuleContext(item);
    const secondaryInfo = getRuleSecondaryInfo(item);

    psSpy('render-score-event', {
      key,
      earned,
      title: getRuleTitle(item, language),
      detail,
      secondaryInfo,
      scorecardName,
      expression: getRuleExpression(item, language),
      raw: compactRuleForSpy(item),
    });

    return (
      <View key={key} style={[styles.scoreEventCard, { backgroundColor: surface, borderColor: border }]}>
        <View style={styles.scoreEventTop}>
          <View style={[styles.statusDot, { backgroundColor: `${color}18` }]}>
            <Icon size={18} color={color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.scoreEventTitle, { color: textPrimary }]} numberOfLines={2}>
              {getRuleTitle(item, language)}
            </Text>

            <Text style={[styles.scoreEventSubtitle, { color: textSecondary }]} numberOfLines={2}>
              {secondaryInfo || scorecardName || 'Perfect Store'}{formatDate(item?.data || item?.criado_em, language) ? ` · ${formatDate(item?.data || item?.criado_em, language)}` : ''}
            </Text>
          </View>

          <View style={[styles.scoreEventPointsBadge, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.scoreEventPointsText, { color }]}>
              {earned ? '+' : '-'}
              {formatNumber(points, language)}
            </Text>
          </View>
        </View>

        {detail ? (
          <Text style={[styles.scoreEventDetail, { color: textSecondary }]} numberOfLines={3}>
            {psText('answer', language)}: {detail}
          </Text>
        ) : null}

        <View style={styles.scoreEventFooter}>
          <View style={[styles.statusPill, { backgroundColor: `${color}18` }]}>
            <Text style={[styles.statusPillText, { color }]}>
              {earned ? psText('conquered', language) : psText('notConquered', language)}
            </Text>
          </View>

          {item?.lojaNome || item?.loja_nome ? (
            <Text style={[styles.scoreEventStore, { color: textSecondary }]} numberOfLines={1}>
              {item?.lojaNome || item?.loja_nome}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderDetailsModal = () => {
    const score = safeNumber(details?.scoreAtual);
    const color = getScoreColor(score);
    const extract = safeArray(details?.extrato).map((rule: any) => enrichRuleFromScorecardLookup(rule, ruleLookup));
    const visits = safeArray(details?.historicoVisitas).map((visit: any) => enrichVisitExtract(visit, ruleLookup));

    return (
      <Modal
        visible={!!details}
        transparent
        animationType="slide"
        onRequestClose={() => setDetails(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surface }]}>
            <View style={[styles.modalHeader, { borderBottomColor: border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: textPrimary }]} numberOfLines={1}>
                  {details?.lojaNome || psText('defaultStore', language)}
                </Text>
                <Text style={[styles.modalSubtitle, { color: textSecondary }]}>
                  {psText('storeXray', language)}
                </Text>
              </View>

              <TouchableOpacity style={[styles.closeButton, { backgroundColor: surfaceAlt }]} onPress={() => setDetails(null)}>
                <Text style={[styles.closeText, { color: textPrimary }]}>×</Text>
              </TouchableOpacity>
            </View>

            {detailsLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={[styles.loadingText, { color: textSecondary }]}>{psText('loadingDetails', language)}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
                <View style={[styles.modalScoreCard, { backgroundColor: surfaceAlt, borderColor: border }]}>
                  <View style={styles.heroScoreTop}>
                    <View>
                      <Text style={[styles.heroScoreLabel, { color: textSecondary }]}>{psText('storeScore', language)}</Text>
                      <Text style={[styles.heroScoreValue, { color: textPrimary }]}>{formatNumber(score, language)}%</Text>
                      <Text style={[styles.heroScoreSuffix, { color: textSecondary }]}>{details?.nivel || getScoreLevel(score, language)}</Text>
                    </View>

                    <View style={[styles.levelBadge, { backgroundColor: color }]}>
                      <Star size={18} color="#FFFFFF" />
                      <Text style={styles.levelBadgeText}>{details?.nivel || getScoreLevel(score, language)}</Text>
                    </View>
                  </View>

                  <View style={[styles.heroDivider, { backgroundColor: border }]} />
                  <Text style={[styles.heroAchievementValue, { color: textPrimary }]}>
                    {formatNumber(details?.scoreReal || 0, language)} / {formatNumber(details?.scoreMaximo || 0, language)} {psText('points', language)}
                  </Text>

                  <View style={[styles.heroProgressTrack, { backgroundColor: surfaceAlt }]}>
                    <View style={[styles.heroProgressFill, { width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: color }]} />
                  </View>
                </View>

                <Text style={[styles.blockTitle, { color: textPrimary }]}>{psText('lastAuditCriteria', language)}</Text>

                {extract.map((item: any, index: number) => {
                  const hit = item?.hit === true || item?.status === 'HIT' || item?.atingido === true;
                  const itemColor = hit ? '#10B981' : '#EF4444';

                  return (
                    <View key={String(item?.id || index)} style={[styles.ruleItem, { backgroundColor: surfaceAlt, borderColor: border }]}>
                      <View style={[styles.statusDot, { backgroundColor: `${itemColor}18` }]}>
                        {hit ? <CheckCircle2 size={18} color={itemColor} /> : <XCircle size={18} color={itemColor} />}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.ruleTitle, { color: textPrimary }]} numberOfLines={2}>
                          {getRuleTitle(item, language)}
                        </Text>
                        {getRuleContext(item) ? (
                          <Text style={[styles.ruleDetail, { color: textSecondary }]} numberOfLines={3}>
                            {psText('answer', language)}: {getRuleContext(item)}
                          </Text>
                        ) : null}
                      </View>

                      <Text style={[styles.rulePoints, { color: itemColor }]}>
                        {formatNumber(item?.points || item?.pontos || 0, language)}
                      </Text>
                    </View>
                  );
                })}

                {extract.length === 0 ? (
                  <View style={[styles.emptySmall, { backgroundColor: surfaceAlt, borderColor: border }]}>
                    <AlertCircle size={28} color={accent} />
                    <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{psText('noDetailedExtract', language)}</Text>
                    <Text style={[styles.emptySmallText, { color: textSecondary }]}>
                      {psText('noDetailedExtractText', language)}
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.blockTitle, { color: textPrimary, marginTop: 20 }]}>{psText('visitsHistory', language)}</Text>

                {visits.map((visit: any, index: number) => {
                  const p = safeNumber(visit?.percent);
                  const c = getScoreColor(p);
                  const visitExtract = safeArray(visit?.extrato);

                  return (
                    <View key={String(visit?.id || index)} style={[styles.visitHistoryCard, { backgroundColor: surfaceAlt, borderColor: border }]}>
                      <View style={styles.visitHistoryHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.visitDate, { color: textPrimary }]}>
                            {formatDate(visit?.data, language) || psText('noDate', language)}
                          </Text>
                          <Text style={[styles.visitMeta, { color: textSecondary }]}>
                            {formatNumber(visit?.scoreAtingido || 0, language)} / {formatNumber(visit?.scoreMaximo || 0, language)} {psText('points', language)} · {visit?.nivel || getScoreLevel(p, language)}
                          </Text>
                        </View>

                        <Text style={[styles.visitScore, { color: c }]}>{formatNumber(p, language)}%</Text>
                      </View>

                      <View style={[styles.smallProgressTrack, { backgroundColor: isDark ? '#111827' : '#E2E8F0' }]}>
                        <View style={[styles.smallProgressFill, { width: `${Math.max(0, Math.min(100, p))}%`, backgroundColor: c }]} />
                      </View>

                      {visitExtract.map((rule: any, ruleIndex: number) =>
                        renderModalRule(rule, `${visit?.id || index}_${ruleIndex}`)
                      )}

                      {visitExtract.length === 0 ? (
                        <Text style={[styles.noRulesText, { color: textSecondary }]}>
                          {psText('noSavedCriteria', language)}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const renderModalRule = (item: any, key: string) => {
    const displayItem = enrichRuleFromScorecardLookup(item, ruleLookup);
    const hit = isRuleHit(displayItem);
    const itemColor = hit ? '#10B981' : '#EF4444';
    const RuleIcon = hit ? CheckCircle2 : XCircle;
    const title = getRuleTitle(displayItem, language);
    const detail = getRuleContext(displayItem);
    const secondaryInfo = getRuleSecondaryInfo(displayItem);
    const scorecardName = cleanHtmlText(displayItem?.groupName || displayItem?.scorecardName || displayItem?.scorecard || '');

    psSpy('render-rule', {
      key,
      title,
      detail,
      secondaryInfo,
      scorecardName,
      expression: getRuleExpression(displayItem, language),
      conditionName: getRuleConditionName(displayItem, language),
      raw: compactRuleForSpy(displayItem),
    });

    return (
      <View
        key={key}
        style={[
          styles.modalRuleCompact,
          {
            backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
            borderColor: itemColor,
          },
        ]}
      >
        <View style={styles.ruleMainRow}>
          <View style={[styles.statusDotSmall, { backgroundColor: `${itemColor}18` }]}>
            <RuleIcon size={15} color={itemColor} />
          </View>

          <View style={styles.ruleTextColumn}>
            <Text style={[styles.ruleTitle, { color: textPrimary }]} numberOfLines={3}>
              {title}
            </Text>

            {secondaryInfo ? (
              <Text style={[styles.ruleGroup, { color: textSecondary }]} numberOfLines={2}>
                {secondaryInfo}
              </Text>
            ) : scorecardName ? (
              <Text style={[styles.ruleGroup, { color: textSecondary }]} numberOfLines={2}>
                {scorecardName}
              </Text>
            ) : null}
          </View>

          <View style={[styles.rulePointsPill, { backgroundColor: `${itemColor}18` }]}>
            <Text style={[styles.rulePoints, { color: itemColor }]}>
              {hit ? '+' : '-'}
              {formatNumber(getRulePoints(displayItem), language)}
            </Text>
          </View>
        </View>

        {detail ? (
          <Text style={[styles.ruleDetail, { color: textSecondary }]} numberOfLines={4}>
            {psText('answer', language)}: {detail}
          </Text>
        ) : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>
            {psText('loading', language)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || !!isSyncing}
            onRefresh={onRefresh}
            progressViewOffset={Math.max(insets.top, 0) + 80}
            colors={[accent]}
            tintColor={accent}
          />
        }
      >
        {renderHeader()}

        {activeTab === 'overview' ? renderOverview() : null}
        {activeTab === 'ranking' ? renderRanking() : null}
        {activeTab === 'history' ? renderHistory() : null}

        <View style={styles.footerSpace}>
          <Text style={[styles.lastSyncText, { color: textSecondary }]}>
            {psText('lastSync', language)}: {formatLastSync(lastSync, language)}
          </Text>
        </View>
      </ScrollView>

      {renderDetailsModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
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
    marginBottom: 18,
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
    marginBottom: 20,
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
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroScoreSuffix: {
    fontSize: 13,
    fontWeight: '700',
  },
  levelBadge: {
    minWidth: 92,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroDivider: {
    height: 1,
    marginVertical: 15,
  },
  heroAchievementRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  heroAchievementLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroAchievementValue: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 3,
  },
  heroAchievementStatus: {
    fontSize: 18,
    fontWeight: '900',
  },
  heroProgressTrack: {
    height: 10,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 10,
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
  tabsCard: {
    flexDirection: 'row',
    gap: 8,
    padding: 8,
    borderWidth: 1,
    borderRadius: 22,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '900',
  },

  sectionContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
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
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 3,
  },
  highlightCard: {
    borderRadius: 24,
    borderWidth: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  highlightSubtitle: {
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

  storeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    marginBottom: 12,
  },
  storeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  positionCircle: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    fontSize: 14,
    fontWeight: '900',
  },
  storeName: {
    fontSize: 15,
    fontWeight: '900',
  },
  storeSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  storeScoreBox: {
    alignItems: 'flex-end',
    gap: 4,
  },
  storeScore: {
    fontSize: 19,
    fontWeight: '900',
  },
  smallProgressTrack: {
    height: 8,
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: 13,
  },
  smallProgressFill: {
    height: '100%',
    borderRadius: 99,
  },

  rankingInfoCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  rankingInfoTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  rankingInfoText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
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
  },
  scorecardItem: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  statusDot: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorecardName: {
    fontSize: 14,
    fontWeight: '900',
  },
  scorecardMeta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
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

  snapshotCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 15,
    marginBottom: 16,
  },
  storeHistoryGroup: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
  },
  storeHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  storeHistoryIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  storeHistoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeHistoryTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  storeHistoryName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  storeHistorySubtitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  storeHistoryScoreBox: {
    minWidth: 58,
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  storeHistoryScore: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
  },
  storeHistoryScoreLabel: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
    textTransform: 'lowercase',
  },
  storeVisitsPill: {
    minHeight: 38,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeVisitsPillText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },

  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  snapshotTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  snapshotSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  snapshotScoreBox: {
    alignItems: 'flex-end',
  },
  snapshotScore: {
    fontSize: 20,
    fontWeight: '900',
  },
  snapshotPoints: {
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
  },
  snapshotStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 2,
  },
  snapshotMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  snapshotMiniText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  snapshotMoreText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
  },

  scoreEventCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  scoreEventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreEventTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  scoreEventSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
    lineHeight: 17,
  },
  scoreEventPointsBadge: {
    minWidth: 54,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  scoreEventPointsText: {
    fontSize: 12,
    fontWeight: '900',
  },
  scoreEventDetail: {
    marginTop: 11,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  scoreEventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  scoreEventStore: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800',
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
  modalLoading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  modalContent: {
    padding: 20,
    paddingBottom: 38,
  },
  modalScoreCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
  },
  ruleItem: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 10,
  },
  ruleTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  ruleDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 9,
  },
  rulePointsPill: {
    minWidth: 48,
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  rulePoints: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  visitItem: {
    borderTopWidth: 1,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitHistoryCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  visitHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  visitTextColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  visitScoreBox: {
    minWidth: 56,
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  modalRuleCompact: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  ruleMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ruleTextColumn: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  statusDotSmall: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  ruleGroup: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  noRulesBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  noRulesText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  visitDate: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  visitMeta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  visitScore: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
});
