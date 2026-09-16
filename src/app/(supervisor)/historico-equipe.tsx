// SUPERVISOR_TEAM_HISTORY_DETAIL_V1
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import {
  useLocalSearchParams,
  useRouter
} from 'expo-router';

import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  RotateCcw,
  Store,
  Trophy,
  XCircle
} from 'lucide-react-native';

import {
  useSafeAreaInsets
} from 'react-native-safe-area-context';

import {
  api
} from '../../services/api';

import {
  useAuthStore
} from '../../store/useAuthStore';

import {
  useSettingsStore
} from '../../store/useSettingsStore';

import {
  getMobileProjectId
} from '../../utils/mobileRole';

type SectionKey = 'perfectStore' | 'performance';

const TEXTS = {
  'pt-BR': {
    title: 'Histórico da Equipe',
    subtitle: 'Campanhas, execução e extrato detalhado do promotor.',
    perfectStore: 'Perfect Store',
    performance: 'Performance',
    refresh: 'Atualizar',
    loading: 'Carregando histórico...',
    unavailable: 'Não foi possível carregar o histórico agora.',
    retry: 'Tentar novamente',
    noData: 'Nenhum registro encontrado.',
    points: 'pontos',
    score: 'Score',
    level: 'Nível',
    campaign: 'Campanha',
    store: 'Loja',
    date: 'Data',
    rule: 'Regra',
    origin: 'Origem',
    context: 'Contexto',
    details: 'Detalhes',
    won: 'ganhos',
    possible: 'possíveis',
    executions: 'registros',
    overview: 'Resumo do período',
    extract: 'Extrato detalhado',
    criteria: 'Critérios da avaliação',
    criterion: 'Critério',
    achieved: 'Realizado',
    expected: 'Esperado',
    status: 'Status',
    answer: 'Resposta',
    conquered: 'Conquistado',
    notConquered: 'Não conquistado'
  },
  'en-US': {
    title: 'Team History',
    subtitle: 'Campaigns, execution and detailed promoter statement.',
    perfectStore: 'Perfect Store',
    performance: 'Performance',
    refresh: 'Refresh',
    loading: 'Loading history...',
    unavailable: 'Unable to load history right now.',
    retry: 'Try again',
    noData: 'No records found.',
    points: 'points',
    score: 'Score',
    level: 'Level',
    campaign: 'Campaign',
    store: 'Store',
    date: 'Date',
    rule: 'Rule',
    origin: 'Origin',
    context: 'Context',
    details: 'Details',
    won: 'won',
    possible: 'possible',
    executions: 'records',
    overview: 'Period overview',
    extract: 'Detailed statement',
    criteria: 'Evaluation criteria',
    criterion: 'Criterion',
    achieved: 'Actual',
    expected: 'Expected',
    status: 'Status',
    answer: 'Answer',
    conquered: 'Conquered',
    notConquered: 'Not conquered'
  },
  'es-ES': {
    title: 'Historial del Equipo',
    subtitle: 'Campañas, ejecución y extracto detallado del promotor.',
    perfectStore: 'Perfect Store',
    performance: 'Performance',
    refresh: 'Actualizar',
    loading: 'Cargando historial...',
    unavailable: 'No fue posible cargar el historial ahora.',
    retry: 'Intentar de nuevo',
    noData: 'No se encontraron registros.',
    points: 'puntos',
    score: 'Score',
    level: 'Nivel',
    campaign: 'Campaña',
    store: 'Tienda',
    date: 'Fecha',
    rule: 'Regla',
    origin: 'Origen',
    context: 'Contexto',
    details: 'Detalles',
    won: 'ganados',
    possible: 'posibles',
    executions: 'registros',
    overview: 'Resumen del período',
    extract: 'Extracto detallado',
    criteria: 'Criterios de evaluación',
    criterion: 'Criterio',
    achieved: 'Realizado',
    expected: 'Esperado',
    status: 'Estado',
    answer: 'Respuesta',
    conquered: 'Conquistado',
    notConquered: 'No conquistado'
  }
} as const;

const texts = (language: string) =>
  TEXTS[
    language === 'en-US' || language === 'es-ES'
      ? language
      : 'pt-BR'
  ];

const firstArray = (...values: any[]): any[] => {
  let firstEmpty: any[] | null = null;

  for (const value of values) {
    if (!Array.isArray(value)) continue;
    if (value.length > 0) return value;
    if (!firstEmpty) firstEmpty = value;
  }

  return firstEmpty || [];
};

const safeJsonArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const formatDate = (value: any) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString([], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const numberValue = (...values: any[]) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const displayText = (...values: any[]) => {
  for (const value of values) {
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
};


// SUPERVISOR_TEAM_HISTORY_PERFORMANCE_CRITERION_V3
const getPerformanceCriterionName = (item: any) => displayText(
  item?.criterionName,
  item?.criterion_name,
  item?.criterioNome,
  item?.criterio_nome,
  item?.conditionName,
  item?.condition_name,
  item?.ruleName,
  item?.regra_nome
);

const isGenericPerformanceLabel = (value: any) => {
  const text = String(value || '').trim().toLowerCase();
  return !text ||
    text === 'respondeu uma pesquisa' ||
    text === 'answered a survey' ||
    text === 'respondió una encuesta' ||
    text === 'performance';
};

const getPerformanceTitle = (item: any, fallback: string) => {
  const criterion = getPerformanceCriterionName(item);
  if (criterion && !isGenericPerformanceLabel(criterion)) return criterion;

  const descriptive = displayText(
    item?.descricao,
    item?.description,
    item?.descricaoRegra,
    item?.regra_nome,
    item?.ruleName
  );

  return descriptive || criterion || displayText(item?.campanhaNome, item?.campaignName, item?.origem, fallback);
};

const getPerformancePointColor = (item: any, points: number) => {
  const status = String(item?.status || '').trim().toUpperCase();
  if (status === 'MISSED' || status === 'PERDIDO' || status === 'PERDIDA' || points < 0) return '#EF4444';
  if (status === 'HIT' || status === 'DONE' || status === 'CONCLUIDO' || status === 'CONCLUÍDO' || points > 0) return '#10B981';
  return '#F59E0B';
};

// SUPERVISOR_TEAM_HISTORY_PS_PROMOTER_PARITY_V1
const getPerfectStoreRuleTitle = (rule: any, fallback: string) => {
  const conditionName = displayText(
    rule?.conditionName,
    rule?.condition_name,
    rule?.criterionName,
    rule?.criterion_name,
    rule?.criterioNome,
    rule?.criterio_nome,
    rule?.ruleName,
    rule?.rule_name,
    rule?.perguntaTitulo,
    rule?.questionTitle,
    rule?.fieldLabel,
    rule?.nome,
    rule?.title,
    rule?.descricao,
    rule?.description,
    fallback
  );

  const expression = displayText(
    rule?.ruleExpression,
    rule?.rule_expression,
    rule?.conditionExpression,
    rule?.condition_expression,
    rule?.expressao,
    rule?.expressaoRegra,
    rule?.regraTexto
  );

  if (!expression) return conditionName;
  if (!conditionName || expression.toLowerCase().startsWith(conditionName.toLowerCase())) return expression;
  return `${conditionName} = ${expression}`;
};

const getPerfectStoreRuleAnswer = (rule: any) => displayText(
  rule?.actual,
  rule?.actualValue,
  rule?.actual_value,
  rule?.valorAtual,
  rule?.valor_atual,
  rule?.resposta,
  rule?.answer,
  rule?.resultado,
  rule?.contextoDetalhe,
  rule?.detalhe
);

const getPerfectStoreRuleSecondary = (rule: any) => [
  displayText(rule?.surveyName, rule?.survey_name, rule?.pesquisaTitulo, rule?.pesquisa_titulo),
  displayText(rule?.mixName, rule?.mix_name, rule?.produtoFiltro, rule?.produto_filtro, rule?.scorecardName, rule?.scorecardNome)
].filter(Boolean).join(' · ');

const isPerfectStoreRuleHit = (rule: any) => {
  const status = String(rule?.status || '').trim().toUpperCase();
  return rule?.hit === true ||
    rule?.atingido === true ||
    rule?.ok === true ||
    status === 'HIT' ||
    status === 'DONE' ||
    status === 'CONCLUIDO' ||
    status === 'CONCLUÍDO';
};

export default function SupervisorTeamHistory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    userId?: string;
    userName?: string;
    section?: string;
  }>();

  const { user } = useAuthStore();
  const { theme, language, accentColor } = useSettingsStore();
  const t = texts(language);

  const dark = theme === 'dark';
  const accent = accentColor || '#FF7A00';
  const bg = dark ? '#020617' : '#F8FAFC';
  const surface = dark ? '#111827' : '#FFFFFF';
  const surfaceAlt = dark ? '#172033' : '#F1F5F9';
  const border = dark ? '#253047' : '#E2E8F0';
  const primary = dark ? '#F8FAFC' : '#0F172A';
  const secondary = dark ? '#94A3B8' : '#64748B';

  const targetUserId = String(params.userId || '');
  const targetUserName = String(params.userName || '');

  const initialSection: SectionKey =
    params.section === 'performance'
      ? 'performance'
      : 'perfectStore';

  const [section, setSection] = useState<SectionKey>(initialSection);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [perfectStore, setPerfectStore] = useState<any[]>([]);
  const [perfectStoreSummary, setPerfectStoreSummary] = useState<any>({});
  const [performance, setPerformance] = useState<any[]>([]);
  const [performanceSummary, setPerformanceSummary] = useState<any>({});

  const projectId = getMobileProjectId(user);

  const load = useCallback(
    async (refresh = false) => {
      if (!projectId || !targetUserId) {
        setError('CONTEXT_MISSING');
        setLoading(false);
        return;
      }

      if (refresh) setRefreshing(true);

      try {
        const stamp = Date.now();

        const [
          psHistoryResponse,
          psSummaryResponse,
          performanceExtractResponse,
          performanceSummaryResponse
        ] = await Promise.all([
          api(
            `/perfect-store/historico-mobile/${encodeURIComponent(String(projectId))}/${encodeURIComponent(targetUserId)}?limit=500&t=${stamp}`,
            { method: 'GET' }
          ),
          api(
            `/perfect-store/extrato-geral/${encodeURIComponent(String(projectId))}/${encodeURIComponent(targetUserId)}?t=${stamp}`,
            { method: 'GET' }
          ),
          api(
            `/gamification/extrato/${encodeURIComponent(String(projectId))}/${encodeURIComponent(targetUserId)}?page=1&limit=300&t=${stamp}`,
            { method: 'GET' }
          ),
          api(
            `/gamification/resumo-periodo/${encodeURIComponent(String(projectId))}/${encodeURIComponent(targetUserId)}?t=${stamp}`,
            { method: 'GET' }
          )
        ]);

        const [psHistoryBody, psSummaryBody, performanceExtractBody, performanceSummaryBody] = await Promise.all([
          psHistoryResponse.json().catch(() => ({})),
          psSummaryResponse.json().catch(() => ({})),
          performanceExtractResponse.json().catch(() => ({})),
          performanceSummaryResponse.json().catch(() => ({}))
        ]);

        if (
          !psHistoryResponse.ok &&
          !psSummaryResponse.ok &&
          !performanceExtractResponse.ok &&
          !performanceSummaryResponse.ok
        ) {
          throw new Error('SUPERVISOR_HISTORY_UNAVAILABLE');
        }

        const psRows = firstArray(
          psHistoryBody,
          psHistoryBody?.items,
          psHistoryBody?.historico,
          psHistoryBody?.history,
          psHistoryBody?.data,
          psHistoryBody?.data?.items,
          psHistoryBody?.data?.historico,
          psHistoryBody?.rows,
          psHistoryBody?.results
        );

        // SUPERVISOR_TEAM_HISTORY_NORMALIZATION_V2
        // Os endpoints mobile já usados pelas telas próprias retornam:
        // Performance -> transacoes / periodo.extrato
        // Perfect Store -> lojaNome / extrato / scoreAtingido / scoreMaximo
        const performanceRows = firstArray(
          performanceExtractBody?.transacoes,
          performanceExtractBody?.data?.transacoes,
          performanceExtractBody?.items,
          performanceExtractBody?.extrato,
          performanceExtractBody?.history,
          performanceExtractBody?.data?.items,
          performanceExtractBody?.data?.extrato,
          performanceExtractBody?.rows,
          performanceExtractBody?.results,
          performanceSummaryBody?.periodo?.extrato,
          performanceExtractBody,
          performanceExtractBody?.data
        );

        setPerfectStore(psRows);
        setPerfectStoreSummary(psSummaryBody || {});
        setPerformance(performanceRows);
        setPerformanceSummary(performanceSummaryBody || {});
        setError('');
      } catch (e: any) {
        setError(String(e?.message || t.unavailable));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, targetUserId, t.unavailable]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const psAverage = useMemo(() => {
    const direct = numberValue(
      perfectStoreSummary?.scoreAtual,
      perfectStoreSummary?.score,
      perfectStoreSummary?.scorePercent,
      perfectStoreSummary?.percentual,
      perfectStoreSummary?.average,
      perfectStoreSummary?.media
    );

    if (direct) return direct;
    if (!perfectStore.length) return 0;

    const scores = perfectStore
      .map(item => numberValue(
        item?.scorePercent,
        item?.percentual,
        item?.scoreAtual,
        item?.score,
        item?.scoreAtingido != null && item?.scoreMaximo
          ? (Number(item.scoreAtingido) / Number(item.scoreMaximo)) * 100
          : NaN
      ))
      .filter(value => Number.isFinite(value));

    if (!scores.length) return 0;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
  }, [perfectStore, perfectStoreSummary]);

  const performancePoints = numberValue(
    performanceSummary?.totalGeral,
    performanceSummary?.periodo?.conquistado,
    performanceSummary?.pontos,
    performanceSummary?.points,
    performanceSummary?.totalPontos,
    performanceSummary?.total_points,
    performanceSummary?.total
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={[styles.loadingText, { color: secondary }]}>{t.loading}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        backgroundColor={bg}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 24) + 20
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: surface, borderColor: border }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={primary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: primary }]}>{t.title}</Text>
            <Text style={[styles.memberName, { color: accent }]} numberOfLines={1}>
              {targetUserName || targetUserId}
            </Text>
            <Text style={[styles.subtitle, { color: secondary }]}>{t.subtitle}</Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: dark ? '#3F1D24' : '#FEF2F2', borderColor: dark ? '#7F1D1D' : '#FECACA' }]}>
            <Text style={[styles.errorText, { color: dark ? '#FECACA' : '#991B1B' }]}>
              {t.unavailable}
            </Text>
            <TouchableOpacity onPress={() => load(true)} style={styles.retryButton}>
              <RotateCcw size={15} color={accent} />
              <Text style={[styles.retryText, { color: accent }]}>{t.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.tabs, { backgroundColor: surface, borderColor: border }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              section === 'perfectStore' && { backgroundColor: `${accent}14`, borderColor: accent }
            ]}
            onPress={() => setSection('perfectStore')}
          >
            <Store size={17} color={section === 'perfectStore' ? accent : secondary} />
            <Text style={[styles.tabText, { color: section === 'perfectStore' ? accent : secondary }]}>
              {t.perfectStore}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tab,
              section === 'performance' && { backgroundColor: `${accent}14`, borderColor: accent }
            ]}
            onPress={() => setSection('performance')}
          >
            <Trophy size={17} color={section === 'performance' ? accent : secondary} />
            <Text style={[styles.tabText, { color: section === 'performance' ? accent : secondary }]}>
              {t.performance}
            </Text>
          </TouchableOpacity>
        </View>

        {section === 'perfectStore' ? (
          <>
            <View style={[styles.summaryCard, { backgroundColor: surface, borderColor: border }]}>
              <View style={[styles.summaryIcon, { backgroundColor: `${accent}14` }]}>
                <CircleGauge size={24} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: secondary }]}>{t.overview}</Text>
                <Text style={[styles.summaryValue, { color: primary }]}>{Math.round(psAverage)}%</Text>
                <Text style={[styles.summaryMeta, { color: secondary }]}>
                  {perfectStore.length} {t.executions}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: primary }]}>{t.extract}</Text>

            {perfectStore.length === 0 ? (
              <Empty text={t.noData} color={secondary} border={border} surface={surface} />
            ) : (
              perfectStore.map((item, index) => {
                const id = String(item?.id || item?.coleta_id || index);
                const open = expanded === `ps:${id}`;
                const score = numberValue(
                  item?.scorePercent,
                  item?.percentual,
                  item?.scoreAtual,
                  item?.score,
                  item?.scoreAtingido != null && item?.scoreMaximo
                    ? (Number(item.scoreAtingido) / Number(item.scoreMaximo)) * 100
                    : NaN
                );
                const rules = safeJsonArray(
                  item?.extrato ??
                  item?.extratoRegras ??
                  item?.extrato_regras ??
                  item?.rules ??
                  item?.criterios ??
                  item?.criteria
                );

                return (
                  <TouchableOpacity
                    key={`ps-${id}`}
                    activeOpacity={0.84}
                    onPress={() => setExpanded(open ? null : `ps:${id}`)}
                    style={[styles.historyCard, { backgroundColor: surface, borderColor: border }]}
                  >
                    <View style={styles.historyHeader}>
                      <View style={[styles.historyIcon, { backgroundColor: `${accent}14` }]}>
                        <Store size={18} color={accent} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyTitle, { color: primary }]} numberOfLines={2}>
                          {displayText(
                            item?.lojaNome,
                            item?.loja_nome,
                            item?.storeName,
                            item?.store_name,
                            item?.loja?.nome,
                            item?.nome,
                            t.perfectStore
                          )}
                        </Text>
                        <Text style={[styles.historyMeta, { color: secondary }]}>
                          {formatDate(item?.data || item?.dataAvaliacao || item?.avaliadoEm || item?.criado_em || item?.createdAt || item?.updatedAt)}
                        </Text>
                      </View>

                      <View style={styles.scoreBox}>
                        <Text style={[styles.scoreValue, { color: accent }]}>{Math.round(score)}%</Text>
                        {open ? <ChevronUp size={17} color={secondary} /> : <ChevronDown size={17} color={secondary} />}
                      </View>
                    </View>

                    <View style={styles.metaWrap}>
                      <Meta label={t.campaign} value={displayText(item?.campaignName, item?.campanhaNome, item?.campanha?.nome, item?.scorecardName, item?.scorecardNome, item?.scorecard?.nome, item?.groupName)} primary={primary} secondary={secondary} />
                      <Meta label={t.level} value={displayText(item?.nivel, item?.level)} primary={primary} secondary={secondary} />
                    </View>

                    {open ? (
                      <View style={[styles.expandedArea, { borderColor: border }]}>
                        <Text style={[styles.expandedTitle, { color: primary }]}>{t.criteria}</Text>

                        {rules.length === 0 ? (
                          <Text style={[styles.emptyInline, { color: secondary }]}>{t.noData}</Text>
                        ) : (
                          rules.map((rule: any, ruleIndex: number) => {
                            const hit = isPerfectStoreRuleHit(rule);
                            const ruleColor = hit ? '#10B981' : '#EF4444';
                            const RuleIcon = hit ? CheckCircle2 : XCircle;
                            const rulePoints = Math.abs(numberValue(
                              rule?.points,
                              rule?.pontos,
                              rule?.score,
                              rule?.scoreAtingido,
                              rule?.scoreReal
                            ));
                            const answer = getPerfectStoreRuleAnswer(rule);
                            const secondaryInfo = getPerfectStoreRuleSecondary(rule);

                            return (
                              <View
                                key={`rule-${ruleIndex}`}
                                style={[
                                  styles.scoreEventCard,
                                  {
                                    borderColor: ruleColor,
                                    backgroundColor: surfaceAlt
                                  }
                                ]}
                              >
                                <View style={styles.scoreEventTop}>
                                  <View style={[styles.scoreEventIcon, { backgroundColor: `${ruleColor}18` }]}>
                                    <RuleIcon size={17} color={ruleColor} />
                                  </View>

                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.scoreEventTitle, { color: primary }]} numberOfLines={3}>
                                      {getPerfectStoreRuleTitle(rule, `${t.rule} ${ruleIndex + 1}`)}
                                    </Text>
                                    {secondaryInfo ? (
                                      <Text style={[styles.scoreEventSubtitle, { color: secondary }]} numberOfLines={2}>
                                        {secondaryInfo}
                                      </Text>
                                    ) : null}
                                  </View>

                                  <View style={[styles.scoreEventPointsBadge, { backgroundColor: `${ruleColor}18` }]}>
                                    <Text style={[styles.scoreEventPointsText, { color: ruleColor }]}>
                                      {hit ? '+' : '-'}{rulePoints}
                                    </Text>
                                  </View>
                                </View>

                                {answer ? (
                                  <Text style={[styles.scoreEventDetail, { color: secondary }]}>
                                    {t.answer}: {answer}
                                  </Text>
                                ) : null}

                                <View style={styles.scoreEventFooter}>
                                  <View style={[styles.scoreEventStatusPill, { backgroundColor: `${ruleColor}18` }]}>
                                    <Text style={[styles.scoreEventStatusText, { color: ruleColor }]}>
                                      {hit ? t.conquered : t.notConquered}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : (
          <>
            <View style={[styles.summaryCard, { backgroundColor: surface, borderColor: border }]}>
              <View style={[styles.summaryIcon, { backgroundColor: '#F59E0B14' }]}>
                <Trophy size={24} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.summaryLabel, { color: secondary }]}>{t.overview}</Text>
                <Text style={[styles.summaryValue, { color: primary }]}>{performancePoints} pts</Text>
                <Text style={[styles.summaryMeta, { color: secondary }]}>
                  {performance.length} {t.executions}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionTitle, { color: primary }]}>{t.extract}</Text>

            {performance.length === 0 ? (
              <Empty text={t.noData} color={secondary} border={border} surface={surface} />
            ) : (
              performance.map((item, index) => {
                const id = String(item?.id || index);
                const open = expanded === `perf:${id}`;
                const points = numberValue(item?.pontos, item?.points, item?.score, item?.pontosGanhos, item?.valor);
                const pointColor = getPerformancePointColor(item, points);
                const criterionName = getPerformanceCriterionName(item);

                return (
                  <TouchableOpacity
                    key={`perf-${id}`}
                    activeOpacity={0.84}
                    onPress={() => setExpanded(open ? null : `perf:${id}`)}
                    style={[styles.historyCard, { backgroundColor: surface, borderColor: border }]}
                  >
                    <View style={styles.historyHeader}>
                      <View style={[styles.historyIcon, { backgroundColor: '#F59E0B14' }]}>
                        <Trophy size={18} color="#F59E0B" />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyTitle, { color: primary }]} numberOfLines={2}>
                          {getPerformanceTitle(item, t.performance)}
                        </Text>
                        <Text style={[styles.historyMeta, { color: secondary }]}>
                          {formatDate(item?.data || item?.dataEvento || item?.createdAt || item?.criado_em || item?.updatedAt)}
                        </Text>
                      </View>

                      <View style={styles.scoreBox}>
                        <Text style={[styles.scoreValue, { color: pointColor }]}>
                          {points > 0 ? '+' : ''}{points} pts
                        </Text>
                        {open ? <ChevronUp size={17} color={secondary} /> : <ChevronDown size={17} color={secondary} />}
                      </View>
                    </View>

                    <View style={styles.metaWrap}>
                      <Meta label={t.campaign} value={displayText(item?.campaignName, item?.campanhaNome, item?.campanha?.nome, item?.scorecardName, item?.scorecardNome, item?.groupName, item?.contextoNome)} primary={primary} secondary={secondary} />
                      <Meta label={t.store} value={displayText(item?.lojaNome, item?.loja_nome, item?.storeName, item?.store_name, item?.loja?.nome)} primary={primary} secondary={secondary} />
                      <Meta label={t.origin} value={displayText(item?.tipoOrigem, item?.origem, item?.source)} primary={primary} secondary={secondary} />
                    </View>

                    {open ? (
                      <View style={[styles.expandedArea, { borderColor: border }]}>
                        <Meta label={t.criterion} value={criterionName} primary={primary} secondary={secondary} />
                        <Meta label={t.rule} value={displayText(item?.descricaoRegra, item?.regra_nome, item?.ruleName, item?.descricao, item?.description)} primary={primary} secondary={secondary} />
                        <Meta label={t.context} value={displayText(item?.contextoNome, item?.contextoDetalhe, item?.detail, item?.details)} primary={primary} secondary={secondary} />
                        <Meta label={t.origin} value={displayText(item?.tipoOrigem, item?.origem, item?.source, item?.origemId)} primary={primary} secondary={secondary} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Meta({ label, value, primary, secondary }: { label: string; value: string; primary: string; secondary: string }) {
  if (!value) return null;

  return (
    <View style={styles.metaItem}>
      <Text style={[styles.metaLabel, { color: secondary }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: primary }]}>{value}</Text>
    </View>
  );
}

function Empty({ text, color, border, surface }: { text: string; color: string; border: string; surface: string }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: surface, borderColor: border }]}>
      <Text style={[styles.emptyText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  loadingText: { marginTop: 12, fontSize: 12, fontWeight: '700' },
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  memberName: { marginTop: 3, fontSize: 14, fontWeight: '900' },
  subtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  errorCard: { marginHorizontal: 20, marginTop: 16, padding: 12, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 11, fontWeight: '700' },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  retryText: { fontSize: 10, fontWeight: '900' },
  tabs: { marginHorizontal: 20, marginTop: 18, borderWidth: 1, borderRadius: 20, padding: 6, flexDirection: 'row', gap: 6 },
  tab: { flex: 1, height: 46, borderRadius: 15, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  tabText: { fontSize: 11, fontWeight: '900' },
  summaryCard: { marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 },
  summaryIcon: { width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { marginTop: 3, fontSize: 24, fontWeight: '900' },
  summaryMeta: { marginTop: 2, fontSize: 10, fontWeight: '700' },
  sectionTitle: { marginHorizontal: 20, marginTop: 22, marginBottom: 10, fontSize: 16, fontWeight: '900' },
  historyCard: { marginHorizontal: 20, marginBottom: 10, borderWidth: 1, borderRadius: 20, padding: 14 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  historyIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 13, fontWeight: '900', lineHeight: 18 },
  historyMeta: { marginTop: 3, fontSize: 9, fontWeight: '700' },
  scoreBox: { alignItems: 'flex-end', gap: 4 },
  scoreValue: { fontSize: 14, fontWeight: '900' },
  metaWrap: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexGrow: 1, minWidth: 120, marginTop: 4 },
  metaLabel: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  metaValue: { marginTop: 2, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  expandedArea: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  expandedTitle: { fontSize: 12, fontWeight: '900', marginBottom: 6 },
  ruleRow: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
  ruleTitle: { fontSize: 11, fontWeight: '800' },
  ruleMeta: { marginTop: 2, fontSize: 9, fontWeight: '600' },
  rulePoints: { fontSize: 11, fontWeight: '900' },
  scoreEventCard: { marginTop: 9, borderWidth: 1, borderRadius: 15, padding: 11 },
  scoreEventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  scoreEventIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  scoreEventTitle: { fontSize: 11, lineHeight: 16, fontWeight: '900' },
  scoreEventSubtitle: { marginTop: 3, fontSize: 8, lineHeight: 12, fontWeight: '800', textTransform: 'uppercase' },
  scoreEventPointsBadge: { minWidth: 44, paddingHorizontal: 8, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scoreEventPointsText: { fontSize: 11, fontWeight: '900' },
  scoreEventDetail: { marginTop: 9, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  scoreEventFooter: { marginTop: 9, flexDirection: 'row', alignItems: 'center' },
  scoreEventStatusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  scoreEventStatusText: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyCard: { marginHorizontal: 20, borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  emptyInline: { fontSize: 11, fontWeight: '600' }
});
