import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Trophy,
  Medal,
  Target,
  Gauge,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Star,
  Users,
  ListChecks,
  Zap,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';
import { api } from '../services/api';
import { globalSync } from '../services/syncService';

const ACCENT_COLOR = '#FF7A00';

const PERF_TEXTS = {
  'pt-BR': {
    projectUserError: 'Não foi possível identificar o projeto ou o usuário logado.',
    loadDataError: 'Não foi possível carregar os dados de performance agora.',
    loadPageError: 'Erro ao carregar a página de performance.',
    worker: 'Colaborador',
    statusHit: 'Conquistado',
    statusMissed: 'Perdido',
    statusPending: 'Pendente',
    excellent: 'Excelente',
    veryGood: 'Muito bom',
    attention: 'Em atenção',
    belowGoal: 'Abaixo da meta',
    critical: 'Crítico',
    hint90: 'Você está muito perto da performance máxima.',
    hint70: 'Boa execução. Mantenha o ritmo para fechar o ciclo forte.',
    hint50: 'Ainda há pontos importantes disponíveis neste período.',
    hint30: 'Priorize as oportunidades pendentes para recuperar pontos.',
    hint0: 'Hora de agir: existem muitos pontos disponíveis para conquistar.',
    summary: 'Resumo',
    ranking: 'Ranking',
    extract: 'Histórico',
    title: 'Performance',
    subtitle: 'Campanhas, pontos, ranking e extrato de conquistas',
    totalScore: 'Pontuação total',
    accumulatedPoints: 'pontos acumulados',
    periodAchievement: 'Atingimento do período',
    points: 'pontos',
    periodProgress: 'Progresso do período',
    possiblePoints: '{{done}} de {{total}} pontos possíveis',
    achievements: 'Conquistas',
    pendingPlural: 'Pendentes',
    missedPlural: 'Perdidas',
    rankingFormation: 'Ranking em formação',
    youArePosition: 'Você está na posição #{{position}}',
    rankingHint: 'Continue executando visitas e pesquisas para subir no ranking.',
    nextOpportunities: 'Próximas oportunidades',
    noPendingNow: 'Nenhuma pendência agora',
    noPendingText: 'As próximas oportunidades aparecerão aqui quando houver metas abertas.',
    projectRanking: 'Ranking do projeto',
    rankingInfo: 'Sua posição considera as campanhas ativas de performance.',
    you: 'você',
    pts: 'pts',
    emptyRanking: 'Ranking vazio',
    emptyRankingText: 'O ranking aparecerá quando houver pontos ou oportunidades vencidas.',
    pointsExtract: 'Histórico de pontos',
    pointsExtractInfo: 'Histórico de pontos conquistados, perdidos e oportunidades abertas.',
    opportunity: 'Oportunidade',
    campaign: 'Campanha',
    goal: 'Meta',
    score: 'Pontuação',
    performance: 'Performance',
    emptyExtract: 'Sem histórico ainda',
    emptyExtractText: 'Quando houver pontuação, o histórico aparecerá aqui.',
    loading: 'Carregando performance...',
    lastSync: 'Última sincronização: {{date}}',
    lastSyncUnknown: 'não informada',
  },
  'en-US': {
    projectUserError: 'Unable to identify the project or signed-in user.',
    loadDataError: 'Unable to load performance data right now.',
    loadPageError: 'Error loading the performance page.',
    worker: 'Employee',
    statusHit: 'Achieved',
    statusMissed: 'Missed',
    statusPending: 'Pending',
    excellent: 'Excellent',
    veryGood: 'Very good',
    attention: 'Needs attention',
    belowGoal: 'Below target',
    critical: 'Critical',
    hint90: 'You are very close to maximum performance.',
    hint70: 'Good execution. Keep the pace to finish the cycle strong.',
    hint50: 'There are still important points available this period.',
    hint30: 'Prioritize pending opportunities to recover points.',
    hint0: 'Time to act: there are many points available to earn.',
    summary: 'Summary',
    ranking: 'Ranking',
    extract: 'History',
    title: 'Performance',
    subtitle: 'Campaigns, points, ranking and achievement history',
    totalScore: 'Total score',
    accumulatedPoints: 'accumulated points',
    periodAchievement: 'Period achievement',
    points: 'points',
    periodProgress: 'Period progress',
    possiblePoints: '{{done}} of {{total}} possible points',
    achievements: 'Achievements',
    pendingPlural: 'Pending',
    missedPlural: 'Missed',
    rankingFormation: 'Ranking in progress',
    youArePosition: 'You are in position #{{position}}',
    rankingHint: 'Keep completing visits and surveys to move up the ranking.',
    nextOpportunities: 'Next opportunities',
    noPendingNow: 'No pending items now',
    noPendingText: 'Next opportunities will appear here when there are open targets.',
    projectRanking: 'Project ranking',
    rankingInfo: 'Your position considers active performance campaigns.',
    you: 'you',
    pts: 'pts',
    emptyRanking: 'Empty ranking',
    emptyRankingText: 'The ranking will appear when there are points or completed opportunities.',
    pointsExtract: 'Points history',
    pointsExtractInfo: 'History of earned points, missed points and open opportunities.',
    opportunity: 'Opportunity',
    campaign: 'Campaign',
    goal: 'Goal',
    score: 'Score',
    performance: 'Performance',
    emptyExtract: 'No history yet',
    emptyExtractText: 'When there is scoring history, it will appear here.',
    loading: 'Loading performance...',
    lastSync: 'Last sync: {{date}}',
    lastSyncUnknown: 'not informed',
  },
  'es-ES': {
    projectUserError: 'No fue posible identificar el proyecto o el usuario conectado.',
    loadDataError: 'No fue posible cargar los datos de performance ahora.',
    loadPageError: 'Error al cargar la página de performance.',
    worker: 'Colaborador',
    statusHit: 'Conquistado',
    statusMissed: 'Perdido',
    statusPending: 'Pendiente',
    excellent: 'Excelente',
    veryGood: 'Muy bueno',
    attention: 'En atención',
    belowGoal: 'Por debajo de la meta',
    critical: 'Crítico',
    hint90: 'Estás muy cerca del rendimiento máximo.',
    hint70: 'Buena ejecución. Mantén el ritmo para cerrar el ciclo fuerte.',
    hint50: 'Todavía hay puntos importantes disponibles en este período.',
    hint30: 'Prioriza las oportunidades pendientes para recuperar puntos.',
    hint0: 'Hora de actuar: hay muchos puntos disponibles para conquistar.',
    summary: 'Resumen',
    ranking: 'Ranking',
    extract: 'Historial',
    title: 'Performance',
    subtitle: 'Campañas, puntos, ranking e historial de conquistas',
    totalScore: 'Puntuación total',
    accumulatedPoints: 'puntos acumulados',
    periodAchievement: 'Cumplimiento del período',
    points: 'puntos',
    periodProgress: 'Progreso del período',
    possiblePoints: '{{done}} de {{total}} puntos posibles',
    achievements: 'Conquistas',
    pendingPlural: 'Pendientes',
    missedPlural: 'Perdidas',
    rankingFormation: 'Ranking en formación',
    youArePosition: 'Estás en la posición #{{position}}',
    rankingHint: 'Sigue ejecutando visitas y encuestas para subir en el ranking.',
    nextOpportunities: 'Próximas oportunidades',
    noPendingNow: 'Ninguna pendiente ahora',
    noPendingText: 'Las próximas oportunidades aparecerán aquí cuando haya metas abiertas.',
    projectRanking: 'Ranking del proyecto',
    rankingInfo: 'Tu posición considera las campañas activas de performance.',
    you: 'tú',
    pts: 'pts',
    emptyRanking: 'Ranking vacío',
    emptyRankingText: 'El ranking aparecerá cuando haya puntos u oportunidades vencidas.',
    pointsExtract: 'Historial de puntos',
    pointsExtractInfo: 'Historial de puntos conquistados, perdidos y oportunidades abiertas.',
    opportunity: 'Oportunidad',
    campaign: 'Campaña',
    goal: 'Meta',
    score: 'Puntuación',
    performance: 'Performance',
    emptyExtract: 'Sin historial todavía',
    emptyExtractText: 'Cuando haya puntuación, el historial aparecerá aquí.',
    loading: 'Cargando performance...',
    lastSync: 'Última sincronización: {{date}}',
    lastSyncUnknown: 'no informada',
  },
} as const;

type PerfTextKey = keyof typeof PERF_TEXTS['pt-BR'];

const perfText = (key: PerfTextKey, language: string, params?: Record<string, string | number>) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  let value = PERF_TEXTS[lang][key];

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(`{{${paramKey}}}`, String(paramValue));
    });
  }

  return value;
};

const getLocaleByLanguage = (language: string) => {
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

type TabType = 'overview' | 'ranking' | 'extract';

type PeriodSummary = {
  totalGeral: number;
  periodo: {
    maximo: number;
    conquistado: number;
    percentual: number;
    extrato: any[];
  };
};

type RankingItem = {
  id: string;
  nome: string;
  cargo?: string;
  pontos_gamificacao: number;
};

const safeArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  return [];
};

const safeNumber = (value: any) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
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

const formatNumber = (value: any, language = 'pt-BR') => {
  const n = safeNumber(value);

  try {
    return n.toLocaleString(getLocaleByLanguage(language));
  } catch {
    return String(n);
  }
};

const formatDate = (value?: string | null, language = 'pt-BR') => {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString(getLocaleByLanguage(language), {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
};

const formatLastSync = (value: any, language = 'pt-BR') => {
  if (!value) return perfText('lastSyncUnknown', language);

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString(getLocaleByLanguage(language));
  } catch {
    return String(value);
  }
};

const normalizeStatus = (status: any) => {
  return String(status || '').trim().toUpperCase();
};

const getStatusConfig = (status: any, isDark: boolean, language = 'pt-BR') => {
  const s = normalizeStatus(status);

  if (s === 'HIT' || s === 'DONE' || s === 'CONCLUIDO' || s === 'CONCLUÍDO') {
    return {
      label: perfText('statusHit', language),
      color: '#10B981',
      bg: isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)',
      Icon: CheckCircle2,
    };
  }

  if (s === 'MISSED' || s === 'PERDIDO' || s === 'PERDIDA') {
    return {
      label: perfText('statusMissed', language),
      color: '#EF4444',
      bg: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
      Icon: XCircle,
    };
  }

  return {
    label: perfText('statusPending', language),
    color: '#F59E0B',
    bg: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)',
    Icon: Clock,
  };
};

const getExtractPointStatus = (item: any, isDark: boolean, language = 'pt-BR') => {
  const explicitStatus = item?.status ? normalizeStatus(item.status) : '';
  const rawPoints = safeNumber(item?.pontos ?? item?.points ?? item?.score ?? 0);

  if (explicitStatus) {
    return getStatusConfig(explicitStatus, isDark, language);
  }

  if (rawPoints < 0) {
    return {
      label: perfText('statusMissed', language),
      color: '#EF4444',
      bg: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
      Icon: XCircle,
    };
  }

  if (rawPoints > 0) {
    return {
      label: perfText('statusHit', language),
      color: '#10B981',
      bg: isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)',
      Icon: CheckCircle2,
    };
  }

  return getStatusConfig('PENDING', isDark, language);
};

const formatPerformancePoints = (item: any, language = 'pt-BR') => {
  const status = normalizeStatus(item?.status);

  const achievedValue = safeNumber(item?.pontos ?? item?.points ?? item?.score ?? item?.maxPontos ?? 0);
  const opportunityValue = safeNumber(item?.maxPontos ?? item?.pontosPossiveis ?? item?.pontos_possiveis ?? item?.pontos ?? item?.points ?? item?.score ?? 0);

  if (status === 'MISSED' || status === 'PERDIDO' || status === 'PERDIDA') {
    return `-${formatNumber(Math.abs(opportunityValue), language)}`;
  }

  if (status === 'HIT' || status === 'DONE' || status === 'CONCLUIDO' || status === 'CONCLUÍDO') {
    return `+${formatNumber(Math.abs(achievedValue), language)}`;
  }

  if (achievedValue < 0) {
    return `-${formatNumber(Math.abs(achievedValue), language)}`;
  }

  // Pendente/oportunidade aberta: mostra a pontuação disponível sem sinal.
  return formatNumber(Math.abs(opportunityValue), language);
};

const getRankColor = (position: number) => {
  if (position === 1) return '#F59E0B';
  if (position === 2) return '#94A3B8';
  if (position === 3) return '#B45309';
  return '#64748B';
};

const getAchievementColor = (percent: number) => {
  if (percent >= 90) return '#10B981';
  if (percent >= 70) return '#22C55E';
  if (percent >= 50) return '#F59E0B';
  if (percent >= 30) return '#F97316';
  return '#EF4444';
};

const getAchievementLabel = (percent: number, language = 'pt-BR') => {
  if (percent >= 90) return perfText('excellent', language);
  if (percent >= 70) return perfText('veryGood', language);
  if (percent >= 50) return perfText('attention', language);
  if (percent >= 30) return perfText('belowGoal', language);
  return perfText('critical', language);
};

const getAchievementHint = (percent: number, language = 'pt-BR') => {
  if (percent >= 90) return perfText('hint90', language);
  if (percent >= 70) return perfText('hint70', language);
  if (percent >= 50) return perfText('hint50', language);
  if (percent >= 30) return perfText('hint30', language);
  return perfText('hint0', language);
};

export default function PerformanceScreen() {
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

  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);

  const projectId = getMainProjectId(user);
  const userId = user?.id;

  const myRankingPosition = useMemo(() => {
    if (!userId) return null;

    const idx = ranking.findIndex((item) => String(item.id) === String(userId));

    return idx >= 0 ? idx + 1 : null;
  }, [ranking, userId]);

  const period = summary?.periodo;
  const extractItems = safeArray(period?.extrato);
  const hits = extractItems.filter((item) => normalizeStatus(item?.status) === 'HIT');
  const pending = extractItems.filter((item) => normalizeStatus(item?.status) === 'PENDING');
  const missed = extractItems.filter((item) => normalizeStatus(item?.status) === 'MISSED');

  const loadPerformance = async (silent = false) => {
    if (!projectId || !userId) {
      setLoading(false);
      setErrorMessage(perfText('projectUserError', language));
      return;
    }

    if (!silent) setLoading(true);
    setErrorMessage(null);

    try {
      const t = Date.now();

      const summaryUrl = `/gamification/resumo-periodo/${projectId}/${userId}?t=${t}`;
      const rankingUrl = `/gamification/ranking/${projectId}?t=${t}`;
      const extractUrl = `/gamification/extrato/${projectId}/${userId}?page=1&limit=50&t=${t}`;

      const [resSummary, resRanking, resExtract] = await Promise.all([
        api(summaryUrl, { method: 'GET' }).catch((err: any) => {
          console.log('[Performance] resumo-periodo falhou:', err?.message || err);
          return null;
        }),
        api(rankingUrl, { method: 'GET' }).catch((err: any) => {
          console.log('[Performance] ranking falhou:', err?.message || err);
          return null;
        }),
        api(extractUrl, { method: 'GET' }).catch((err: any) => {
          console.log('[Performance] extrato falhou:', err?.message || err);
          return null;
        }),
      ]);

      if (resSummary?.ok) {
        const data = await resSummary.json();

        setSummary({
          totalGeral: safeNumber(data?.totalGeral),
          periodo: {
            maximo: safeNumber(data?.periodo?.maximo),
            conquistado: safeNumber(data?.periodo?.conquistado),
            percentual: safeNumber(data?.periodo?.percentual),
            extrato: safeArray(data?.periodo?.extrato),
          },
        });
      } else {
        setSummary({
          totalGeral: safeNumber(user?.pontos_gamificacao),
          periodo: {
            maximo: 0,
            conquistado: 0,
            percentual: 0,
            extrato: [],
          },
        });
      }

      if (resRanking?.ok) {
        const data = await resRanking.json();
        const list = safeArray(data?.ranking || data);

        setRanking(
          list
            .map((item: any) => ({
              id: String(item.id || item.usuario_id || ''),
              nome: String(item.nome || item.name || perfText('worker', language)),
              cargo: item.cargo || item.roleName || item.perfil || '',
              pontos_gamificacao: safeNumber(item.pontos_gamificacao || item.pontos),
            }))
            .filter((item: RankingItem) => item.id)
        );
      } else {
        setRanking([]);
      }

      if (resExtract?.ok) {
        const data = await resExtract.json();
        setTransactions(safeArray(data?.transacoes || data?.items || data));
      } else {
        setTransactions([]);
      }

      if (!resSummary?.ok && !resRanking?.ok && !resExtract?.ok) {
        setErrorMessage(perfText('loadDataError', language));
      }
    } catch (error: any) {
      console.log('[Performance] Erro geral:', error?.message || error);
      setErrorMessage(perfText('loadPageError', language));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPerformance();
    }, [projectId, userId, language])
  );

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
    } catch (error: any) {
      console.log('[Performance] globalSync falhou:', error?.message || error);
    }

    await loadPerformance(true);
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
            <Trophy size={28} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{perfText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {perfText('subtitle', language)}
            </Text>
          </View>
        </View>

        <View style={[styles.heroPointsCard, { backgroundColor: surface, borderColor: border }]}>
          {(() => {
            const conquered = safeNumber(period?.conquistado);
            const possible = safeNumber(period?.maximo);
            const percent =
              possible > 0
                ? Math.round((conquered / possible) * 100)
                : safeNumber(period?.percentual);

            const cappedPercent = Math.max(0, Math.min(100, percent));
            const achievementColor = getAchievementColor(cappedPercent);

            return (
              <>
                <View style={styles.heroPointsTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.heroPointsLabel, { color: textSecondary }]}>{perfText('totalScore', language)}</Text>
                    <Text style={[styles.heroPointsValue, { color: textPrimary }]}>
                      {formatNumber(summary?.totalGeral ?? user?.pontos_gamificacao ?? 0, language)}
                    </Text>
                    <Text style={[styles.heroPointsSuffix, { color: textSecondary }]}>{perfText('accumulatedPoints', language)}</Text>
                  </View>

                  <View style={[styles.heroPercentBadge, { backgroundColor: achievementColor }]}>
                    <Gauge size={18} color="#FFFFFF" />
                    <Text style={styles.heroPercentBadgeText}>{cappedPercent}%</Text>
                  </View>
                </View>

                <View style={[styles.heroDivider, { backgroundColor: border }]} />

                <View style={styles.heroAchievementRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.heroAchievementLabel, { color: textSecondary }]}>{perfText('periodAchievement', language)}</Text>
                    <Text style={[styles.heroAchievementValue, { color: textPrimary }]}>
                      {formatNumber(conquered, language)} / {formatNumber(possible, language)} {perfText('points', language)}
                    </Text>
                  </View>

                  <Text style={[styles.heroAchievementStatus, { color: achievementColor }]}>
                    {getAchievementLabel(cappedPercent, language)}
                  </Text>
                </View>

                <View style={[styles.heroProgressTrack, { backgroundColor: surfaceAlt }]}>
                  <View
                    style={[
                      styles.heroProgressFill,
                      {
                        width: `${cappedPercent}%`,
                        backgroundColor: achievementColor,
                      },
                    ]}
                  />
                </View>

                <Text style={[styles.heroAchievementHint, { color: textSecondary }]}>
                  {getAchievementHint(cappedPercent, language)}
                </Text>
              </>
            );
          })()}
        </View>
      </View>

      <View style={styles.tabsWrapper}>
        <View style={[styles.tabsCard, { backgroundColor: surface, borderColor: border }]}> 
          {renderTab('overview', perfText('summary', language))}
          {renderTab('ranking', perfText('ranking', language))}
          {renderTab('extract', perfText('extract', language))}
        </View>
      </View>
    </View>
  );

  const renderOpportunity = (item: any, key: string, mode: 'overview' | 'extract') => {
    const status = getStatusConfig(item?.status, isDark, language);
    const StatusIcon = status.Icon;
    return (
      <View key={key} style={[styles.opportunityCard, { backgroundColor: surface, borderColor: border }]}> 
        <View style={styles.opportunityTop}>
          <View style={[styles.statusDot, { backgroundColor: status.bg }]}> 
            <StatusIcon size={18} color={status.color} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.opportunityTitle, { color: textPrimary }]} numberOfLines={2}>
              {item?.contextoNome || item?.descricaoRegra || perfText('opportunity', language)}
            </Text>
            <Text style={[styles.opportunitySubtitle, { color: textSecondary }]} numberOfLines={2}>
              {item?.campanhaNome || perfText('campaign', language)} · {item?.lojaNome || perfText('goal', language)}
            </Text>
          </View>

          <View style={[styles.pointsBadge, { backgroundColor: status.color }]}>
            <Text style={styles.pointsBadgeText}>
              {formatPerformancePoints(item, language)}
            </Text>
          </View>
        </View>

        <View style={styles.opportunityBottom}>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}> 
            <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
          </View>

          <Text style={[styles.dateText, { color: textSecondary }]}> 
            {formatDate(item?.data || item?.criado_em, language)}
          </Text>
        </View>

        {mode === 'extract' && item?.contextoDetalhe ? (
          <Text style={[styles.detailText, { color: textSecondary }]} numberOfLines={3}>
            {item.contextoDetalhe}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderOverview = () => {
    const conquered = safeNumber(period?.conquistado);
    const possible = safeNumber(period?.maximo);
    const percent = Math.max(
      0,
      Math.min(
        100,
        possible > 0 ? Math.round((conquered / possible) * 100) : safeNumber(period?.percentual)
      )
    );
    const achievementColor = getAchievementColor(percent);

    return (
      <View style={styles.sectionContent}>
        {errorMessage ? (
          <View style={[styles.warningCard, { backgroundColor: surface, borderColor: border }]}> 
            <AlertCircle size={22} color="#F59E0B" />
            <Text style={[styles.warningText, { color: textSecondary }]}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={[styles.scoreCard, { backgroundColor: surface, borderColor: border }]}> 
          <View style={styles.scoreHeader}>
            <View style={[styles.scoreIcon, { backgroundColor: isDark ? `${accent}24` : `${accent}14` }]}> 
              <Target size={24} color={accent} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.scoreTitle, { color: textPrimary }]}>{perfText('periodProgress', language)}</Text>
              <Text style={[styles.scoreSubtitle, { color: textSecondary }]}> 
                {perfText('possiblePoints', language, { done: formatNumber(conquered, language), total: formatNumber(possible, language) })}
              </Text>
            </View>

            <Text style={[styles.percentValue, { color: achievementColor }]}>{percent}%</Text>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: surfaceAlt }]}> 
            <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: achievementColor }]} />
          </View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}> 
            <CheckCircle2 size={22} color="#10B981" />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{hits.length}</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{perfText('achievements', language)}</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}> 
            <Clock size={22} color="#F59E0B" />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{pending.length}</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{perfText('pendingPlural', language)}</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: surface, borderColor: border }]}> 
            <XCircle size={22} color="#EF4444" />
            <Text style={[styles.kpiValue, { color: textPrimary }]}>{missed.length}</Text>
            <Text style={[styles.kpiLabel, { color: textSecondary }]}>{perfText('missedPlural', language)}</Text>
          </View>
        </View>

        <View style={[styles.highlightCard, { backgroundColor: surface, borderColor: border }]}> 
          <View style={styles.highlightTop}>
            <View style={[styles.highlightIcon, { backgroundColor: accent }]}>
              <Medal size={23} color={accentText} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.highlightTitle, { color: textPrimary }]}>
                {myRankingPosition ? perfText('youArePosition', language, { position: myRankingPosition }) : perfText('rankingFormation', language)}
              </Text>
              <Text style={[styles.highlightSubtitle, { color: textSecondary }]}>
                {perfText('rankingHint', language)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.blockTitle, { color: textPrimary }]}>{perfText('nextOpportunities', language)}</Text>

        {pending.slice(0, 5).map((item, index) => renderOpportunity(item, `pending_${index}`, 'overview'))}

        {pending.length === 0 ? (
          <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}> 
            <Star size={26} color={accent} />
            <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{perfText('noPendingNow', language)}</Text>
            <Text style={[styles.emptySmallText, { color: textSecondary }]}> 
              {perfText('noPendingText', language)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderRanking = () => (
    <View style={styles.sectionContent}>
      <View style={[styles.rankingInfoCard, { backgroundColor: surface, borderColor: border }]}> 
        <Users size={22} color={accent} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rankingInfoTitle, { color: textPrimary }]}>{perfText('projectRanking', language)}</Text>
          <Text style={[styles.rankingInfoText, { color: textSecondary }]}> 
            {perfText('rankingInfo', language)}
          </Text>
        </View>
      </View>

      {ranking.map((item, index) => {
        const pos = index + 1;
        const isMe = String(item.id) === String(userId);
        const rankColor = getRankColor(pos);

        return (
          <View
            key={item.id}
            style={[
              styles.rankingCard,
              {
                backgroundColor: isMe ? (isDark ? `${accent}24` : `${accent}12`) : surface,
                borderColor: isMe ? accent : border,
              },
            ]}
          >
            <View style={[styles.positionCircle, { backgroundColor: `${rankColor}22` }]}> 
              <Text style={[styles.positionText, { color: rankColor }]}>#{pos}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.rankingName, { color: textPrimary }]} numberOfLines={1}>
                {item.nome} {isMe ? `· ${perfText('you', language)}` : ''}
              </Text>
              <Text style={[styles.rankingRole, { color: textSecondary }]} numberOfLines={1}>
                {item.cargo || perfText('worker', language)}
              </Text>
            </View>

            <View style={styles.rankingPoints}>
              <Text style={[styles.rankingPointsValue, { color: textPrimary }]}> 
                {formatNumber(item.pontos_gamificacao, language)}
              </Text>
              <Text style={[styles.rankingPointsLabel, { color: textSecondary }]}>{perfText('pts', language)}</Text>
            </View>
          </View>
        );
      })}

      {ranking.length === 0 ? (
        <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}> 
          <Trophy size={28} color={accent} />
          <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{perfText('emptyRanking', language)}</Text>
          <Text style={[styles.emptySmallText, { color: textSecondary }]}> 
            {perfText('emptyRankingText', language)}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderExtract = () => {
    const mixedExtract = extractItems.length > 0 ? extractItems : transactions;

    return (
      <View style={styles.sectionContent}>
        <View style={[styles.rankingInfoCard, { backgroundColor: surface, borderColor: border }]}> 
          <ListChecks size={22} color={accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rankingInfoTitle, { color: textPrimary }]}>{perfText('pointsExtract', language)}</Text>
            <Text style={[styles.rankingInfoText, { color: textSecondary }]}> 
              {perfText('pointsExtractInfo', language)}
            </Text>
          </View>
        </View>

        {mixedExtract.map((item: any, index: number) => {
          if (item?.status) {
            return renderOpportunity(item, String(item.id || `opp_${index}`), 'extract');
          }

          const extractStatus = getExtractPointStatus(item, isDark, language);
          const ExtractIcon = extractStatus.Icon;

          return (
            <View
              key={String(item?.id || index)}
              style={[styles.opportunityCard, { backgroundColor: surface, borderColor: border }]}
            >
              <View style={styles.opportunityTop}>
                <View style={[styles.statusDot, { backgroundColor: extractStatus.bg }]}> 
                  <ExtractIcon size={18} color={extractStatus.color} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={[styles.opportunityTitle, { color: textPrimary }]} numberOfLines={2}>
                    {item?.descricaoRegra || item?.contextoNome || perfText('score', language)}
                  </Text>
                  <Text style={[styles.opportunitySubtitle, { color: textSecondary }]} numberOfLines={2}>
                    {item?.lojaNome || item?.contextoNome || item?.tipoOrigem || perfText('performance', language)}
                  </Text>
                </View>

                <View style={[styles.pointsBadge, { backgroundColor: extractStatus.color }]}>
                  <Text style={styles.pointsBadgeText}>{formatPerformancePoints(item, language)}</Text>
                </View>
              </View>

              <View style={styles.opportunityBottom}>
                <View style={[styles.statusPill, { backgroundColor: extractStatus.bg }]}> 
                  <Text style={[styles.statusPillText, { color: extractStatus.color }]}>{extractStatus.label}</Text>
                </View>

                <Text style={[styles.dateText, { color: textSecondary }]}> 
                  {formatDate(item?.criado_em || item?.data, language)}
                </Text>
              </View>
            </View>
          );
        })}

        {mixedExtract.length === 0 ? (
          <View style={[styles.emptySmall, { backgroundColor: surface, borderColor: border }]}> 
            <AlertCircle size={28} color={accent} />
            <Text style={[styles.emptySmallTitle, { color: textPrimary }]}>{perfText('emptyExtract', language)}</Text>
            <Text style={[styles.emptySmallText, { color: textSecondary }]}> 
              {perfText('emptyExtractText', language)}
            </Text>
          </View>
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
            {perfText('loading', language)}
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
        {activeTab === 'extract' ? renderExtract() : null}

        <View style={styles.footerSpace}>
          <Text style={[styles.lastSyncText, { color: textSecondary }]}> 
            {perfText('lastSync', language, { date: formatLastSync(lastSync, language) })}
          </Text>
        </View>
      </ScrollView>
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
  heroPointsCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  heroPointsTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroPointsLabel: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroPointsValue: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  heroPointsSuffix: {
    fontSize: 13,
    fontWeight: '700',
  },
  heroPercentBadge: {
    minWidth: 82,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  heroPercentBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
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
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  heroProgressTrack: {
    height: 10,
    borderRadius: 99,
    overflow: 'hidden',
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
    paddingHorizontal: 20,
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
  scoreCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 15,
  },
  scoreIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  scoreSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  percentValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  progressTrack: {
    height: 12,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
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
  opportunityCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 15,
    marginBottom: 12,
  },
  opportunityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opportunityTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  opportunitySubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
    lineHeight: 17,
  },
  pointsBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pointsBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  opportunityBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
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
  dateText: {
    fontSize: 11,
    fontWeight: '800',
  },
  detailText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
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
  rankingCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
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
  rankingName: {
    fontSize: 15,
    fontWeight: '900',
  },
  rankingRole: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  rankingPoints: {
    alignItems: 'flex-end',
  },
  rankingPointsValue: {
    fontSize: 17,
    fontWeight: '900',
  },
  rankingPointsLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  emptySmall: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginTop: 6,
  },
  emptySmallTitle: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 12,
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
});
