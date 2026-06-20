import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MapPin,
  Star,
  Trophy,
  ChevronRight,
  AlertCircle,
  Clock,
  CheckSquare,
  Wifi,
} from 'lucide-react-native';
import { useSettingsStore } from '../../store/useSettingsStore';
import { i18n } from '../../utils/i18n';
import { getDBConnection, initializeDatabase } from '../../database/db';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { globalSync } from '../../services/syncService';
import { getStatusColors } from '../../utils/statusUtils';

// ============================================================================
// 🎯 MOTOR DE ESTILO DE STORE INSIGHTS
// ============================================================================
const priorityMapping: Record<string, any> = {
  ALTA: { color: '#EF4444', icon: AlertCircle, label: i18n.t('priorityHigh') },
  MEDIA: { color: '#F59E0B', icon: AlertCircle, label: i18n.t('priorityMedium') },
  BAIXA: { color: '#3B82F6', icon: AlertCircle, label: i18n.t('priorityLow') },
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

const formatToYMD = (dateStr?: string | null) => {
  if (!dateStr || String(dateStr) === 'null' || String(dateStr) === 'undefined') return null;

  const s = String(dateStr).trim().substring(0, 10);

  if (s.length < 10) return null;

  if (s.includes('/')) {
    const parts = s.split('/');

    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }

      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  if (s.includes('-')) {
    const parts = s.split('-');

    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }

      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  return s;
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


const firstFilled = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== 'null' && String(value).trim() !== 'undefined') {
      return value;
    }
  }

  return null;
};

const normalizeCampaignStatus = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const normalizeCampaignActiveFlag = (value: any): boolean | null => {
  const normalized = normalizeCampaignStatus(value);

  if (
    value === true ||
    value === 1 ||
    ['1', 'TRUE', 'SIM', 'YES', 'ATIVO', 'ATIVA', 'ACTIVE', 'PUBLICADO', 'PUBLICADA', 'EM_ANDAMENTO', 'RUNNING'].includes(normalized)
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    ['0', 'FALSE', 'NAO', 'NÃO', 'NO', 'INATIVO', 'INATIVA', 'INACTIVE', 'CANCELADO', 'CANCELADA', 'ENCERRADO', 'ENCERRADA', 'FINALIZADO', 'FINALIZADA', 'PAUSADO', 'PAUSADA', 'ARQUIVADO', 'ARQUIVADA'].includes(normalized)
  ) {
    return false;
  }

  return null;
};

const getCampaignRaw = (row: any) => {
  return safeParseJson(
    row?.scorecard_raw_json ||
      row?.campanha_raw_json ||
      row?.raw_json ||
      '{}',
    {}
  );
};

const getCampaignActiveValue = (row: any, raw: any) => {
  // O raw_json vem do backend e tem prioridade sobre colunas locais antigas.
  // Regra obrigatória: sem ativo explícito, não aparece.
  return firstFilled(
    raw?.ativo,
    raw?.active,
    raw?.enabled,
    raw?.isActive,
    raw?.is_active,
    raw?.habilitado,
    raw?.status,
    raw?.situacao,
    row?.ativo,
    row?.active,
    row?.enabled,
    row?.isActive,
    row?.is_active,
    row?.habilitado,
    row?.status,
    row?.situacao
  );
};

const getCampaignStartDate = (row: any, raw: any) => {
  return formatToYMD(firstFilled(
    raw?.dataInicio,
    raw?.data_inicio,
    raw?.startDate,
    raw?.start_date,
    raw?.inicio,
    raw?.starts_at,
    row?.dataInicio,
    row?.data_inicio,
    row?.startDate,
    row?.start_date,
    row?.inicio,
    row?.starts_at
  ));
};

const getCampaignEndDate = (row: any, raw: any) => {
  return formatToYMD(firstFilled(
    raw?.dataFim,
    raw?.data_fim,
    raw?.endDate,
    raw?.end_date,
    raw?.fim,
    raw?.ends_at,
    row?.dataFim,
    row?.data_fim,
    row?.endDate,
    row?.end_date,
    row?.fim,
    row?.ends_at
  ));
};

const isCampaignActiveForToday = (row: any, todayStr: string) => {
  const raw = getCampaignRaw(row);
  const activeValue = getCampaignActiveValue(row, raw);
  const isActive = normalizeCampaignActiveFlag(activeValue);

  // Se estiver inativa, não aparece. Se não vier explicitamente ativa, também não aparece.
  if (isActive !== true) return false;

  const startDate = getCampaignStartDate(row, raw);
  const endDate = getCampaignEndDate(row, raw);

  // Ativa, mas ainda fora da vigência: não aparece.
  if (startDate && startDate > todayStr) return false;

  // Ativa, mas vencida: não aparece.
  if (endDate && endDate < todayStr) return false;

  return true;
};

const tableExists = async (db: any, tableName: string) => {
  try {
    const row = await db.getFirstAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1`,
      [tableName]
    );

    return !!row;
  } catch {
    return false;
  }
};

const hasActiveCampaignInTable = async (db: any, tableName: string, todayStr: string) => {
  if (!(await tableExists(db, tableName))) return false;

  try {
    const rows = (await db.getAllAsync(`SELECT * FROM ${tableName}`)) as any[];
    return (rows || []).some((row) => isCampaignActiveForToday(row, todayStr));
  } catch {
    return false;
  }
};

const isDoneStatus = (status: any) => {
  return ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA', 'JUSTIFICADA'].includes(
    String(status || '').toUpperCase()
  );
};

const isInProgressStatus = (status: any) => {
  return ['EM_ANDAMENTO', 'INICIADA'].includes(String(status || '').toUpperCase());
};

const isTaskDoneStatus = (status: any) => {
  return ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA'].includes(
    String(status || '').toUpperCase()
  );
};

const formatFullName = (name?: string) => {
  if (!name) return 'Promotor';

  const parts = name.trim().split(' ').filter(Boolean);

  if (parts.length === 0) return 'Promotor';
  if (parts.length === 1) return parts[0];

  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const getLocaleByLanguage = (language?: string) => {
  if (language === 'en-US') return 'en-US';
  if (language === 'es-ES') return 'es-ES';
  return 'pt-BR';
};

const formatLastSync = (date: Date | null, language?: string) => {
  if (!date) return '--:--';

  return date.toLocaleTimeString(getLocaleByLanguage(language), {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toPngIfDicebearSvg = (url?: string | null) => {
  if (!url) return null;

  if (url.includes('api.dicebear.com') && url.includes('/svg')) {
    return url.replace('/svg', '/png');
  }

  return url;
};


const getPendingStatusStyle = (pending: number, isDark: boolean) => {
  const hasPending = Number(pending || 0) > 0;

  if (hasPending) {
    return {
      icon: '#EF4444',
      text: '#EF4444',
      background: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)',
    };
  }

  return {
    icon: '#10B981',
    text: '#10B981',
    background: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)',
  };
};


const getVisitRouteOrder = (visit: any) => {
  const value =
    visit?.ordem_roteiro ??
    visit?.ordemRoteiro ??
    visit?.roteiro_ordem ??
    visit?.ordem ??
    visit?.sequencia ??
    visit?.posicao ??
    visit?.position ??
    visit?.sort_order ??
    visit?.sortOrder;

  if (value === undefined || value === null || String(value).trim() === '') return null;

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
};

const sortVisitsByRouteOrder = (visits: any[]) => {
  return visits
    .map((visit, originalIndex) => ({ visit, originalIndex }))
    .sort((a, b) => {
      const orderA = getVisitRouteOrder(a.visit);
      const orderB = getVisitRouteOrder(b.visit);

      if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;
      if (orderA !== null && orderB === null) return -1;
      if (orderA === null && orderB !== null) return 1;

      // Se o SQLite ainda não salvou ordem_roteiro, não podemos reordenar por horário/nome,
      // porque isso quebra a ordem definida no roteiro. Preservamos a ordem em que o banco
      // retornou as linhas, que vem do mirror salvo pelo sync.
      return a.originalIndex - b.originalIndex;
    })
    .map((item) => item.visit);
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

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { isSyncing, lastSync } = useSyncStore();
  const { theme, accentColor, language } = useSettingsStore();
  const isDark = theme === 'dark';

  if (language) {
    i18n.locale = language;
  }

  const bg = isDark ? '#020617' : '#F8FAFC';
  const cardBg = isDark ? '#0F172A' : '#FFFFFF';
  const cardBgAlt = isDark ? '#111827' : '#F1F5F9';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const accent = accentColor || '#FF7A00';
  const statusBarBg = bg;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [imgError, setImgError] = useState(false);

  const [visitsData, setVisitsData] = useState({ total: 0, done: 0, pending: 0, percent: 0 });
  const [tasksData, setTasksData] = useState({ total: 0, done: 0, pending: 0, percent: 0 });

  const [perfectStore, setPerfectStore] = useState({ active: false });
  const [performance, setPerformance] = useState({ active: false });

  const [history, setHistory] = useState({
    visitsTotal: 0,
    visitsDone: 0,
    tasksTotal: 0,
    tasksDone: 0,
    percent: 0,
  });

  const [nextStop, setNextStop] = useState<any>(null);
  const [dynamicPSScore, setDynamicPSScore] = useState(0);

  const custom = useMemo(() => {
    const rawCustomData = user?.custom_data ?? user?.customData ?? {};

    let parsed = safeParseJson(rawCustomData, {});

    if (typeof parsed === 'string') {
      parsed = safeParseJson(parsed, {});
    }

    return parsed || {};
  }, [user?.custom_data, user?.customData]);

  const currentPSScore = Number(custom?.perfect_store_score || 0);
  const currentGamiPoints = Number(user?.pontos_gamificacao || custom?.pontos_gamificacao || 0);


  let fotoUrl =
    custom?.avatar_url ||
    custom?.avatarUrl ||
    custom?.foto_url ||
    custom?.fotoUrl ||
    user?.avatar_url ||
    user?.avatarUrl ||
    user?.foto_url ||
    user?.fotoUrl ||
    user?.avatar ||
    user?.foto;

  fotoUrl = toPngIfDicebearSvg(fotoUrl);

  const avatarSource = fotoUrl
    ? {
        uri: String(fotoUrl).startsWith('http')
          ? String(fotoUrl)
          : `https://painel.dasheep.com.br${String(fotoUrl).startsWith('/') ? '' : '/'}${fotoUrl}`,
      }
    : null;

  const initialName = user?.nome ? user.nome.charAt(0).toUpperCase() : 'U';

  useEffect(() => {
    setImgError(false);
  }, [fotoUrl]);

  const loadDashboardData = async () => {
    try {
      await runWithDbRetry(async () => {
        const db = await getDBConnection();
        const todayStr = getLocalDateKey(new Date());

      // Campanhas ativas / Perfect Store ativo
      let hasActivePerformanceCampaign = false;
      let hasActivePerfectStoreCampaign = false;

      try {
        hasActivePerformanceCampaign = await hasActiveCampaignInTable(db, 'campanhas_gamificacao', todayStr);
        hasActivePerfectStoreCampaign = await hasActiveCampaignInTable(db, 'scorecards', todayStr);
      } catch (e) {
        hasActivePerformanceCampaign = false;
        hasActivePerfectStoreCampaign = false;
      }

      setPerformance({ active: hasActivePerformanceCampaign });
      setPerfectStore({ active: hasActivePerfectStoreCampaign });

      const todasVisitas = (await db.getAllAsync(`SELECT rowid as __rowid, * FROM visits ORDER BY rowid ASC`)) as any[];
      const allTasks = (await db.getAllAsync(`SELECT * FROM other_tasks`)) as any[];

      let qtdPesquisasPorVisita = 0;

      try {
        const pesquisasData = (await db.getAllAsync(`SELECT * FROM pesquisas`)) as any[];

        pesquisasData.forEach((p) => {
          if (String(p.frequencia || '').trim().toUpperCase() === 'POR_VISITA') {
            const ativoStr = String(p.ativo ?? 'true').trim().toLowerCase();
            if (ativoStr !== 'false' && ativoStr !== '0') qtdPesquisasPorVisita++;
          }
        });
      } catch (e) {}

      // Mantém o comportamento antigo: se não encontrou pesquisa por visita, considera ao menos 1.
      if (qtdPesquisasPorVisita === 0) qtdPesquisasPorVisita = 1;

      // 1. Resumo de Hoje - Visitas
      let vHojeTotal = 0;
      let vHojeDone = 0;
      const lojasAgendadas = new Set<string>();
      const lojasVisitadas = new Set<string>();

      todasVisitas.forEach((v) => {
        const dataProg = formatToYMD(v.data_programada);

        if (dataProg === todayStr) {
          vHojeTotal++;
          lojasAgendadas.add(String(v.loja_id));

          const status = String(v.status || '').toUpperCase();

          if (isDoneStatus(status) || v.pesquisa_realizada === 1) {
            vHojeDone++;
            lojasVisitadas.add(String(v.loja_id));
          }
        }
      });

      setVisitsData({
        total: vHojeTotal,
        done: vHojeDone,
        pending: Math.max(0, vHojeTotal - vHojeDone),
        percent: vHojeTotal > 0 ? Math.round((vHojeDone / vHojeTotal) * 100) : 0,
      });

      // 2. Resumo de Hoje - Tarefas
      let tAvulsaHojeTotal = 0;
      let tAvulsaHojeDone = 0;

      allTasks.forEach((row) => {
        const raw = safeParseJson(row.task_raw_json, {});
        const status = String(row.status || raw.status || '').toUpperCase();
        const isDone = isTaskDoneStatus(status);

        const vencimento = formatToYMD(row.data_vencimento || raw.data_vencimento || raw.data_fim || raw.deadline);
        const dataInicio = formatToYMD(raw.data_inicio || row.data_inicio || raw.criado_em || raw.created_at);

        const jaIniciou = !dataInicio || dataInicio <= todayStr;
        const naoVenceu = !vencimento || vencimento >= todayStr;

        if (jaIniciou && naoVenceu) {
          const freq = String(row.frequencia || raw.frequencia || '').toUpperCase();
          const dependeDeVisita = freq.includes('VISITA') || freq.includes('DIARIA') || freq.includes('DIÁRIA');

          if (!dependeDeVisita || vHojeTotal > 0) {
            tAvulsaHojeTotal++;
            if (isDone) tAvulsaHojeDone++;
          }
        }
      });

      const finalTasksTotal = tAvulsaHojeTotal + vHojeTotal * qtdPesquisasPorVisita;
      const finalTasksDone = tAvulsaHojeDone + vHojeDone * qtdPesquisasPorVisita;

      setTasksData({
        total: finalTasksTotal,
        done: finalTasksDone,
        pending: Math.max(0, finalTasksTotal - finalTasksDone),
        percent: finalTasksTotal > 0 ? Math.round((finalTasksDone / finalTasksTotal) * 100) : 0,
      });

      // 3. Histórico 7 dias e Perfect Store
      let h7d = custom?.history_7d;
      let livePSScore = currentPSScore;

      try {
        let achouHistory = false;

        const visitWithConfig = todasVisitas.find(
          (v) => v.project_config_json && String(v.project_config_json).includes('history_7d')
        );

        if (visitWithConfig) {
          const cfg = safeParseJson(visitWithConfig.project_config_json, {});

          if (cfg?.history_7d) {
            h7d = cfg.history_7d;
            achouHistory = true;
          }

          if (cfg?.perfect_store_score !== undefined) {
            livePSScore = Number(cfg.perfect_store_score);
          }
        }

        if (!achouHistory) {
          const taskWithConfig = allTasks.find(
            (t) => t.task_raw_json && String(t.task_raw_json).includes('history_7d')
          );

          if (taskWithConfig) {
            const raw = safeParseJson(taskWithConfig.task_raw_json, {});

            if (raw?.project_config?.history_7d) {
              h7d = raw.project_config.history_7d;
            }

            if (raw?.project_config?.perfect_store_score !== undefined) {
              livePSScore = Number(raw.project_config.perfect_store_score);
            }
          }
        }
      } catch (e) {}

      if (h7d) {
        const hVisitsTotal = Number(h7d.visitsTotal || 0);
        const hVisitsDone = Number(h7d.visitsDone || 0);
        const hBackendTasksTotal = Number(h7d.tasksTotal || 0);
        const hBackendTasksDone = Number(h7d.tasksDone || 0);

        const hTasksTotal = hVisitsTotal * qtdPesquisasPorVisita + hBackendTasksTotal + tAvulsaHojeTotal;
        const hTasksDone = hVisitsDone * qtdPesquisasPorVisita + hBackendTasksDone + tAvulsaHojeDone;

        setHistory({
          visitsTotal: hVisitsTotal,
          visitsDone: hVisitsDone,
          tasksTotal: hTasksTotal,
          tasksDone: hTasksDone,
          percent: hTasksTotal > 0 ? Math.round((hTasksDone / hTasksTotal) * 100) : 0,
        });
      } else {
        setHistory({
          visitsTotal: 0,
          visitsDone: 0,
          tasksTotal: 0,
          tasksDone: 0,
          percent: 0,
        });
      }

      // 4. Próxima parada
      try {
        const visitasElegiveisProximaParada = todasVisitas.filter((v) => {
          const status = String(v.status || '').toUpperCase();
          const dataProg = formatToYMD(v.data_programada);

          return ['PENDENTE', 'AGENDADA', 'EM_ANDAMENTO', 'INICIADA'].includes(status) && dataProg === todayStr;
        });

        const visitasEmAndamento = sortVisitsByRouteOrder(
          visitasElegiveisProximaParada.filter((v) => isInProgressStatus(v.status))
        );

        const visitasPendentes = sortVisitsByRouteOrder(
          visitasElegiveisProximaParada.filter((v) => !isInProgressStatus(v.status))
        );

        // Regra operacional:
        // se existe uma visita aberta/em andamento, ela sempre é a próxima parada.
        // Não podemos sugerir outra loja enquanto a visita iniciada não for finalizada.
        const nextVisit = visitasEmAndamento[0] || visitasPendentes[0];

        let contextAlert = null;
        let insightToDisplay = null;

        if (nextVisit) {
          const pendenciasDaLoja = allTasks.filter((t) => {
            const raw = safeParseJson(t.task_raw_json, {});
            const lojaId = t.loja_id || raw.loja_id || raw.lojaId;

            return (
              String(lojaId || '') === String(nextVisit.loja_id || '') &&
              !isTaskDoneStatus(t.status || raw.status)
            );
          });

          if (pendenciasDaLoja.length > 0) {
            contextAlert = `⚠️ ${i18n.t('focus')}: ${pendenciasDaLoja.length} ${i18n.t('pendingStandaloneTasks')}`;
          } else if (qtdPesquisasPorVisita > 0) {
            contextAlert = `🎯 ${i18n.t('focus')}: ${qtdPesquisasPorVisita} ${i18n.t('routineSurveys')}`;
          }

          let insights = [];

          try {
            if (nextVisit.store_insights_json && nextVisit.store_insights_json !== '[]') {
              insights = JSON.parse(nextVisit.store_insights_json);
            }
          } catch (e) {}

          if (Array.isArray(insights) && insights.length > 0) {
            const priorityWeights: Record<string, number> = { ALTA: 3, MEDIA: 2, BAIXA: 1 };

            insightToDisplay = insights.sort((a, b) => {
              const weightA = priorityWeights[a.prioridade?.toUpperCase()] || 0;
              const weightB = priorityWeights[b.prioridade?.toUpperCase()] || 0;
              return weightB - weightA;
            })[0];
          }
        }

        setNextStop(
          nextVisit
            ? {
                type: 'visit',
                ...nextVisit,
                title: nextVisit.loja_nome,
                contextAlert,
                insight: insightToDisplay,
              }
            : null
        );
      } catch (e) {
        console.log('Erro ao calcular insights no dashboard', e);
      }

      // Perfect Store: mostra nota somente quando há campanha ativa sincronizada.
      setDynamicPSScore(hasActivePerfectStoreCampaign && Number.isFinite(livePSScore) ? livePSScore : 0);
      });
    } catch (error) {
      console.log('Erro no loadDashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    globalSync();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    setImgError(false);

    try {
      await globalSync();
      await loadDashboardData();
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [user?.id, user?.custom_data, user?.pontos_gamificacao, lastSync])
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.loadingContent}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </View>
    );
  }

  const nsColors = nextStop ? getStatusColors(nextStop.status) : getStatusColors('PENDENTE');
  const visitsPendingStyle = getPendingStatusStyle(visitsData.pending, isDark);
  const tasksPendingStyle = getPendingStatusStyle(tasksData.pending, isDark);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <ScrollView
        testID="home-screen"
        accessibilityLabel="home-screen"
        style={[styles.container, { backgroundColor: bg }]}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[accent]} tintColor={accent} />}
      >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: textPrimary }]}>
            {i18n.t('hello')}, {formatFullName(user?.nome)}
          </Text>

          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)' }]}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.statusText, { color: '#10B981' }]}>{i18n.t('online')}</Text>
            </View>

            <View style={styles.syncInline}>
              <Wifi size={11} color={isSyncing ? accent : textSecondary} />
              <Text style={[styles.syncText, { color: isSyncing ? accent : textSecondary }]}>
                {isSyncing ? i18n.t('syncing') : `${i18n.t('updatedAt')} ${formatLastSync(lastSync, language)}`}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/menu' as any)}
          style={[styles.avatarContainer, { backgroundColor: cardBg, borderColor: border }]}
          activeOpacity={0.86}
        >
          <View style={[styles.avatar, { backgroundColor: cardBgAlt, borderColor: accent, borderWidth: 2, overflow: 'hidden' }]}>
            {avatarSource && !imgError ? (
              <Image
                source={avatarSource}
                style={{ width: '100%', height: '100%' }}
                onError={() => setImgError(true)}
              />
            ) : (
              <Text style={[styles.avatarText, { color: textPrimary }]}>{initialName}</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: textSecondary }]}>{i18n.t('nextStopSection')}</Text>

      <TouchableOpacity
        testID="home-route-button"
        accessibilityLabel="home-route-button"
        style={[
          styles.nextStopCardWrapper,
          { backgroundColor: cardBg, borderLeftColor: nsColors.text, borderColor: border },
        ]}
        onPress={() => router.push({ pathname: '/roteiro', params: { tab: 'VISITAS' } } as any)}
      >
        <View style={styles.nextStopMainRow}>
          <View style={styles.nextStopLeft}>
            <View style={[styles.iconBoxSmall, { backgroundColor: nsColors.bg }]}>
              <MapPin size={18} color={nsColors.text} />
            </View>

            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[styles.nextStopTitle, { color: textPrimary }]} numberOfLines={1}>
                {nextStop ? nextStop.title : i18n.t('noNextStop')}
              </Text>

              {nextStop && (
                <>
                  <View style={styles.nextStopFooter}>
                    <Clock size={12} color={nsColors.text} />
                    <Text style={[styles.nextStopSubtitle, { color: nsColors.text, fontWeight: 'bold' }]}>
                      {isInProgressStatus(nextStop.status)
                        ? i18n.t('statusInProgress')
                        : i18n.t('statusPending')}
                    </Text>
                  </View>

                  {nextStop.contextAlert && !nextStop.insight && (
                    <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: textSecondary, fontWeight: '600' }}>
                        {nextStop.contextAlert}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

          <ChevronRight size={20} color={textSecondary} />
        </View>

        {nextStop?.insight && (() => {
          const priorityStyle = getInsightPriorityStyles(nextStop.insight.prioridade, isDark);
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
                {nextStop.insight.mensagemFoco || nextStop.insight.mensagem || ''}
              </Text>
            </View>
          );
        })()}
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { color: textSecondary, marginTop: 10 }]}>{i18n.t('todaySummary')}</Text>

      <View style={styles.row}>
        <TouchableOpacity
          testID="home-route-summary-card"
          accessibilityLabel="home-route-summary-card"
          style={[styles.cardSquare, { backgroundColor: cardBg, borderColor: border }]}
          onPress={() => router.push('/roteiro' as any)}
        >
          <Text style={[styles.cardTitle, { color: textSecondary }]}>{i18n.t('routeProgress')}</Text>
          <Text style={[styles.cardPercent, { color: accent }]}>{visitsData.percent}%</Text>

          <Text style={[styles.cardInfoText, { color: textPrimary, fontWeight: '700' }]}>
            {visitsData.done}{' '}
            <Text style={{ fontWeight: '400', color: textSecondary }}>
              {i18n.t('realizedOf')} {visitsData.total}
            </Text>
          </Text>

          <View style={[styles.cardStatusRow, { backgroundColor: visitsPendingStyle.background }]}>
            {visitsData.pending > 0 ? (
              <AlertCircle size={12} color={visitsPendingStyle.icon} />
            ) : (
              <CheckSquare size={12} color={visitsPendingStyle.icon} />
            )}

            <Text style={[styles.cardStatusText, { color: visitsPendingStyle.text }]}>
              {visitsData.pending} {i18n.t('pending')}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cardSquare, { backgroundColor: cardBg, borderColor: border }]}
          onPress={() => router.push({ pathname: '/roteiro', params: { tab: 'TAREFAS' } } as any)}
        >
          <Text style={[styles.cardTitle, { color: textSecondary }]}>{i18n.t('taskProgress')}</Text>
          <Text style={[styles.cardPercent, { color: '#3B82F6' }]}>{tasksData.percent}%</Text>

          <Text style={[styles.cardInfoText, { color: textPrimary, fontWeight: '700' }]}>
            {tasksData.done}{' '}
            <Text style={{ fontWeight: '400', color: textSecondary }}>
              {i18n.t('realizedOf')} {tasksData.total}
            </Text>
          </Text>

          <View style={[styles.cardStatusRow, { backgroundColor: tasksPendingStyle.background }]}>
            {tasksData.pending > 0 ? (
              <AlertCircle size={12} color={tasksPendingStyle.icon} />
            ) : (
              <CheckSquare size={12} color={tasksPendingStyle.icon} />
            )}

            <Text style={[styles.cardStatusText, { color: tasksPendingStyle.text }]}>
              {tasksData.pending} {i18n.t('pending')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {(perfectStore.active || performance.active) && (
        <>
          <Text style={[styles.sectionTitle, { color: textSecondary }]}>{i18n.t('campaignIndicators')}</Text>

          <View style={styles.row}>
            {perfectStore.active && (
              <TouchableOpacity
                style={[
                  styles.cardSquare,
                  { backgroundColor: cardBg, borderColor: border, width: performance.active ? '48%' : '100%' },
                ]}
                onPress={() => router.push('/perfectstore' as any)}
                activeOpacity={0.86}
              >
                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.10)' }]}>
                  <Star size={20} color="#A855F7" />
                </View>
                <Text style={[styles.cardBigNumber, { color: textPrimary }]}>{dynamicPSScore}%</Text>
                <Text style={[styles.cardLabel, { color: textSecondary }]}>{i18n.t('perfectStore')}</Text>
              </TouchableOpacity>
            )}

            {performance.active && (
              <TouchableOpacity
                style={[
                  styles.cardSquare,
                  { backgroundColor: cardBg, borderColor: border, width: perfectStore.active ? '48%' : '100%' },
                ]}
                onPress={() => router.push('/performance' as any)}
                activeOpacity={0.86}
              >
                <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)' }]}>
                  <Trophy size={20} color="#F59E0B" />
                </View>
                <Text style={[styles.cardBigNumber, { color: textPrimary }]}>{currentGamiPoints} pts</Text>
                <Text style={[styles.cardLabel, { color: textSecondary }]}>{i18n.t('performanceCampaign')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <View style={styles.historyHeader}>
        <Text style={[styles.sectionTitle, { color: textSecondary, marginBottom: 0 }]}>
          {i18n.t('myHistory')}
        </Text>

        <View style={styles.badge30d}>
          <Text style={styles.badge30dText}>{i18n.t('last7Days')}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.cardHistory, { backgroundColor: cardBg, borderColor: border }]} onPress={() => router.push('/historico' as any)}>
        <View style={styles.historyContent}>
          <View style={styles.historyRow}>
            <MapPin size={16} color={textSecondary} />
            <Text style={[styles.historyLabel, { color: textSecondary }]}>{i18n.t('visits')}</Text>
            <View style={styles.historyLine} />
            <Text style={[styles.historyValue, { color: textPrimary }]}>
              {history.visitsDone} / {history.visitsTotal}
            </Text>
          </View>

          <View style={[styles.historyRow, { marginTop: 10 }]}>
            <CheckSquare size={16} color={textSecondary} />
            <Text style={[styles.historyLabel, { color: textSecondary }]}>{i18n.t('tasks')}</Text>
            <View style={styles.historyLine} />
            <Text style={[styles.historyValue, { color: textPrimary }]}>
              {history.tasksDone} / {history.tasksTotal}
            </Text>
          </View>
        </View>

        <View style={styles.historyRight}>
          <Text style={[styles.historyPercentGiant, { color: '#10B981' }]}>{history.percent}%</Text>
          <Text style={[styles.historyEficText, { color: textSecondary }]}>{i18n.t('efficiencyCardTitle')}</Text>
        </View>
      </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  loadingContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 10 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  syncInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText: { fontSize: 10, fontWeight: '600' },
  avatarContainer: { padding: 3, borderRadius: 31, borderWidth: 1 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontWeight: 'bold' },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 15, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },

  nextStopCardWrapper: {
    borderRadius: 20,
    borderLeftWidth: 4,
    borderWidth: 1,
    elevation: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  nextStopMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  insightIntegrated: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  nextStopLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBoxSmall: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nextStopTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  nextStopFooter: { flexDirection: 'row', alignItems: 'center' },
  nextStopSubtitle: { fontSize: 11, marginLeft: 4 },
  insightPriority: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginLeft: 6, letterSpacing: 1 },
  insightMessage: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  cardSquare: {
    width: '48%',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 1,
    minHeight: 144,
  },
  cardTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  cardPercent: { fontSize: 38, fontWeight: '900', marginBottom: 8 },
  cardInfoText: { fontSize: 12, marginBottom: 6 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  cardStatusText: { fontSize: 10, fontWeight: '700', marginLeft: 4 },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardBigNumber: { fontSize: 26, fontWeight: 'bold' },
  cardLabel: { fontSize: 12, fontWeight: '500' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  badge30d: { backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badge30dText: { fontSize: 10, fontWeight: 'bold', color: '#3B82F6' },
  cardHistory: { flexDirection: 'row', padding: 20, borderRadius: 20, borderWidth: 1, elevation: 1, alignItems: 'center' },
  historyContent: { flex: 1, paddingRight: 20, borderRightWidth: 1, borderRightColor: 'rgba(150,150,150,0.2)' },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyLabel: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  historyLine: { flex: 1, height: 1, backgroundColor: 'rgba(150,150,150,0.2)', marginHorizontal: 10, borderStyle: 'dashed' },
  historyValue: { fontSize: 14, fontWeight: 'bold' },
  historyRight: { paddingLeft: 20, alignItems: 'center', justifyContent: 'center' },
  historyPercentGiant: { fontSize: 32, fontWeight: '900' },
  historyEficText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
});
