import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  User,
  Megaphone,
  History,
  RefreshCw,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Trophy,
  Star,
  ShieldCheck,
  Wifi,
  Moon,
  Sun,
  Globe2,
  AlertCircle,
  CheckCircle2,
  Smartphone,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSyncStore } from '../../store/useSyncStore';
import { globalSync } from '../../services/syncService';
import { api } from '../../services/api';
import { getDBConnection } from '../../database/db';
import { setI18nLocale, t } from '../../utils/i18n';
import * as SecureStore from 'expo-secure-store';

const ACCENT_COLOR = '#FF7A00';


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

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  primaryText: string;
  primaryAction?: (() => void) | null;
  secondaryText?: string;
  secondaryAction?: (() => void) | null;
};

const safeParseJson = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const formatFullName = (name?: string) => {
  if (!name) return 'Usuário';

  const parts = name.trim().split(' ').filter(Boolean);

  if (parts.length <= 2) return name.trim();

  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const getInitials = (name?: string) => {
  if (!name) return 'U';

  const parts = name.trim().split(' ').filter(Boolean);

  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

const toPngIfDicebearSvg = (url?: string | null) => {
  if (!url) return null;

  if (url.includes('api.dicebear.com') && url.includes('/svg')) {
    return url.replace('/svg', '/png');
  }

  return url;
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
  if (!dateValue || String(dateValue) === 'null' || String(dateValue) === 'undefined') return null;

  const s = String(dateValue).trim().substring(0, 10);

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

const isFalseLike = (value: any) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return (
    value === false ||
    value === 0 ||
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'nao' ||
    normalized === 'não' ||
    normalized === 'no' ||
    normalized === 'inactive' ||
    normalized === 'inativo' ||
    normalized === 'inativa' ||
    normalized === 'encerrado' ||
    normalized === 'encerrada' ||
    normalized === 'cancelado' ||
    normalized === 'cancelada' ||
    normalized === 'disabled'
  );
};

const getFirstFilled = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }

  return null;
};

const isCampaignActiveNow = (campaign: any) => {
  const today = getLocalDateKey(new Date());

  const rawStatus = String(
    getFirstFilled(campaign?.status, campaign?.situacao, campaign?.state, campaign?.campaign_status, '')
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  if (['INATIVA', 'INATIVO', 'ENCERRADA', 'ENCERRADO', 'CANCELADA', 'CANCELADO', 'FINALIZADA', 'FINALIZADO', 'PAUSADA', 'PAUSADO', 'ARQUIVADA', 'ARQUIVADO'].includes(rawStatus)) {
    return false;
  }

  const activeFlag = getFirstFilled(
    campaign?.ativo,
    campaign?.active,
    campaign?.isActive,
    campaign?.is_active,
    campaign?.habilitado,
    campaign?.enabled
  );

  if (activeFlag !== null && isFalseLike(activeFlag)) return false;

  const startDate = formatToYMD(
    getFirstFilled(
      campaign?.data_inicio,
      campaign?.dataInicio,
      campaign?.startDate,
      campaign?.start_date,
      campaign?.inicio,
      campaign?.starts_at
    )
  );

  const endDate = formatToYMD(
    getFirstFilled(
      campaign?.data_fim,
      campaign?.dataFim,
      campaign?.endDate,
      campaign?.end_date,
      campaign?.fim,
      campaign?.ends_at
    )
  );

  if (startDate && startDate > today) return false;
  if (endDate && endDate < today) return false;

  return true;
};

const calculatePerfectStoreScoreFromHistory = (payload: any) => {
  const lojas = Array.isArray(payload?.lojas) ? payload.lojas : [];

  if (lojas.length > 0) {
    const total = lojas.reduce((sum: number, loja: any) => sum + safeNumber(loja?.scoreAtual), 0);
    return Math.round(total / lojas.length);
  }

  const historico = Array.isArray(payload?.historico) ? payload.historico : [];

  if (historico.length > 0) {
    const total = historico.reduce((sum: number, item: any) => sum + safeNumber(item?.percent), 0);
    return Math.round(total / historico.length);
  }

  return 0;
};

const getMuralItemId = (item: any) =>
  String(
    item?.id ||
      item?._id ||
      item?.avisoId ||
      item?.aviso_id ||
      item?.comunicadoId ||
      item?.comunicado_id ||
      item?.slug ||
      item?.titulo ||
      ''
  ).trim();

const getMuralUnreadCount = async (projectId: string | null) => {
  if (!projectId) return 0;

  const readKey = `MuralReadIds_${projectId}`;

  let list: any[] = [];

  try {
    const response = await api(`/mural/${encodeURIComponent(String(projectId))}?apenasAtivos=true&t=${Date.now()}`, {
      method: 'GET',
    });

    if (response?.ok) {
      const data = await response.json();
      list = Array.isArray(data) ? data : data?.avisos || data?.items || data?.data || [];
      // Não salvar a lista completa no SecureStore: comunicados com HTML/anexos passam de 2048 bytes.
    }
  } catch {}

  let readIds = new Set<string>();

  try {
    const raw = await SecureStore.getItemAsync(readKey).catch(() => null);
    const parsed = raw ? JSON.parse(raw) : [];
    readIds = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {}

  return list.filter((item) => {
    const id = getMuralItemId(item);
    return id && !readIds.has(id);
  }).length;
};

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user, logout } = useAuthStore();
  const { theme, language, accentColor, toggleTheme, setLanguage } = useSettingsStore();
  const { isSyncing, lastSync } = useSyncStore();
  const projectId = getMainProjectId(user);
  const [muralUnreadCount, setMuralUnreadCount] = useState(0);
  const [activeCampaigns, setActiveCampaigns] = useState({
    perfectStore: false,
    performance: false,
    checked: false,
  });

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

  const [syncingNow, setSyncingNow] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [languageRenderKey, setLanguageRenderKey] = useState(0);

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    primaryText: 'OK',
    primaryAction: null,
    secondaryText: '',
    secondaryAction: null,
  });

  const customData = useMemo(() => safeParseJson(user?.custom_data, {}), [user?.custom_data]);

  const fallbackPerfectStoreScore = Number(customData?.perfect_store_score || 0);
  const [perfectStoreScore, setPerfectStoreScore] = useState(fallbackPerfectStoreScore);
  const [loadingPerfectStoreScore, setLoadingPerfectStoreScore] = useState(false);
  const gamificationPoints = Number(user?.pontos_gamificacao || customData?.pontos_gamificacao || 0);
  const performanceMenuBadge = `${Math.round(gamificationPoints || 0)}`;
  const perfectStoreMenuBadge = loadingPerfectStoreScore ? '...' : `${Math.round(perfectStoreScore || 0)}%`;


  const translate = useCallback(
    (key: string, fallback: string, params?: Record<string, string | number>) => {
      const value = t(key, params as any);
      return value && value !== key ? String(value) : fallback;
    },
    [language]
  );

  const languageShortLabel = useMemo(() => {
    if (language === 'en-US') return 'English';
    if (language === 'es-ES') return 'Español';
    return 'Português';
  }, [language]);

  const formatLastSyncLabel = useCallback(
    (date: Date | null) => {
      if (!date) {
        if (language === 'en-US') return 'Never synced';
        if (language === 'es-ES') return 'Nunca sincronizado';
        return 'Nunca sincronizado';
      }

      try {
        const locale = language === 'en-US' ? 'en-US' : language === 'es-ES' ? 'es-ES' : 'pt-BR';

        return date.toLocaleString(locale, {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        if (language === 'en-US') return 'Recently synced';
        if (language === 'es-ES') return 'Sincronización reciente';
        return 'Sincronização recente';
      }
    },
    [language]
  );


  const loadActiveCampaignVisibility = useCallback(async () => {
    try {
      const db = await getDBConnection();

      const performanceRows = await db.getAllAsync(`SELECT * FROM campanhas_gamificacao`).catch(() => []);
      const perfectStoreRows = await db.getAllAsync(`SELECT * FROM scorecards`).catch(() => []);

      const visibility = {
        performance: Array.isArray(performanceRows) && performanceRows.some(isCampaignActiveNow),
        perfectStore: Array.isArray(perfectStoreRows) && perfectStoreRows.some(isCampaignActiveNow),
        checked: true,
      };

      setActiveCampaigns(visibility);

      if (!visibility.perfectStore) {
        setPerfectStoreScore(0);
      }

      return visibility;
    } catch {
      const visibility = { performance: false, perfectStore: false, checked: true };
      setActiveCampaigns(visibility);
      setPerfectStoreScore(0);
      return visibility;
    }
  }, []);

  const loadPerfectStoreScore = useCallback(async () => {
    if (!projectId || !user?.id) {
      setPerfectStoreScore(fallbackPerfectStoreScore);
      return;
    }

    setLoadingPerfectStoreScore(true);

    try {
      const res = await api(`/perfect-store/historico-mobile/${projectId}/${user.id}?limit=500&t=${Date.now()}`, {
        method: 'GET',
      });

      if (res.ok) {
        const data = await res.json();
        const score = calculatePerfectStoreScoreFromHistory(data);
        setPerfectStoreScore(score);
      } else {
        setPerfectStoreScore(fallbackPerfectStoreScore);
      }
    } catch (error: any) {
      console.log('[Menu] Falha ao buscar Perfect Store score:', error?.message || error);
      setPerfectStoreScore(fallbackPerfectStoreScore);
    } finally {
      setLoadingPerfectStoreScore(false);
    }
  }, [projectId, user?.id, fallbackPerfectStoreScore]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      getMuralUnreadCount(projectId).then((count) => {
        if (active) setMuralUnreadCount(count);
      });

      return () => {
        active = false;
      };
    }, [projectId])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      loadActiveCampaignVisibility().then((visibility) => {
        if (!active) return;
        if (visibility?.perfectStore) loadPerfectStoreScore();
      });

      return () => {
        active = false;
      };
    }, [loadActiveCampaignVisibility, loadPerfectStoreScore, lastSync])
  );

  let avatarUrl =
    user?.foto_url ||
    user?.avatar ||
    user?.foto ||
    user?.avatarUrl ||
    customData?.avatar_url ||
    customData?.foto;

  avatarUrl = toPngIfDicebearSvg(avatarUrl);

  const avatarSource = avatarUrl
    ? {
        uri: String(avatarUrl).startsWith('http')
          ? String(avatarUrl)
          : `https://painel.dasheep.com.br${String(avatarUrl).startsWith('/') ? '' : '/'}${avatarUrl}`,
      }
    : null;

  const closeModal = () => setModal((prev) => ({ ...prev, visible: false }));

  const showSoon = (title: string, message?: string) => {
    setModal({
      visible: true,
      title,
      message:
        message ||
        translate(
          'menuSoonMessage',
          language === 'en-US'
            ? 'This screen is already planned in the menu. Next we will create the page and connect offline data.'
            : language === 'es-ES'
              ? 'Esta pantalla ya está prevista en el menú. En el próximo paso crearemos la página y conectaremos los datos offline.'
              : 'Esta tela já está prevista no menu. No próximo passo vamos criar a página e conectar os dados offline.'
        ),
      type: 'info',
      primaryText: translate('understoodBtn', 'Entendi'),
      primaryAction: closeModal,
    });
  };

  const handleSync = async () => {
    setSyncingNow(true);

    try {
      await globalSync();

      // Sem popup de confirmação: a própria tela já mostra a última sincronização.
    } catch {
      setModal({
        visible: true,
        title:
          language === 'en-US'
            ? 'Sync failed'
            : language === 'es-ES'
              ? 'Fallo en la sincronización'
              : 'Falha na sincronização',
        message:
          language === 'en-US'
            ? 'Unable to sync now. Check your connection and try again.'
            : language === 'es-ES'
              ? 'No fue posible sincronizar ahora. Verifica la conexión e inténtalo nuevamente.'
              : 'Não foi possível sincronizar agora. Verifique a conexão e tente novamente.',
        type: 'error',
        primaryText: translate('commonOk', 'OK'),
        primaryAction: closeModal,
      });
    } finally {
      setSyncingNow(false);
    }
  };

  const handleLogout = () => {
    setModal({
      visible: true,
      title:
        language === 'en-US'
          ? 'Sign out?'
          : language === 'es-ES'
            ? '¿Cerrar sesión?'
            : 'Sair do app?',
      message:
        language === 'en-US'
          ? 'You will be signed out of this device. Pending data remains protected in the sync queue.'
          : language === 'es-ES'
            ? 'Serás desconectado de este dispositivo. Los datos pendientes seguirán protegidos en la cola de sincronización.'
            : 'Você será desconectado deste aparelho. Os dados pendentes continuam protegidos na fila de sincronização.',
      type: 'warning',
      primaryText: translate('settingsLogoutConfirm', 'Sair'),
      primaryAction: async () => {
        closeModal();
        await logout();
        router.replace('/login' as any);
      },
      secondaryText: translate('cancel', 'Cancelar'),
      secondaryAction: closeModal,
    });
  };

  const cycleLanguage = () => {
    const langs: ('pt-BR' | 'en-US' | 'es-ES')[] = ['pt-BR', 'en-US', 'es-ES'];
    const currentIndex = langs.indexOf(language);
    const next = langs[(currentIndex >= 0 ? currentIndex + 1 : 0) % langs.length];

    setLanguage(next);
    setI18nLocale(next);
    setLanguageRenderKey((value) => value + 1);
  };

  const openRouteSafely = (route: string, fallbackTitle: string, fallbackMessage?: string) => {
    try {
      router.push(route as any);
    } catch {
      showSoon(fallbackTitle, fallbackMessage);
    }
  };

  const resultCampaignItems = [
    ...(activeCampaigns.performance
      ? [
          {
            title: translate('menuPerformanceTitle', 'Campanha de Performance'),
            subtitle: translate('menuPerformanceSubtitle', 'Pontos, metas, conquistas e extrato de gamificação'),
            badge: performanceMenuBadge,
            metric: translate('commonPoints', 'pontos'),
            icon: Trophy,
            color: '#F59E0B',
            onPress: () => router.push('/performance' as any),
          },
        ]
      : []),
    ...(activeCampaigns.perfectStore
      ? [
          {
            title: translate('menuPerfectStoreTitle', 'Perfect Store'),
            subtitle: translate('menuPerfectStoreSubtitle', 'Score, regras, lojas avaliadas e extrato de execução'),
            badge: perfectStoreMenuBadge,
            metric: translate('commonScore', 'score'),
            icon: Star,
            color: '#A855F7',
            onPress: () => router.push('/perfectstore' as any),
          },
        ]
      : []),
  ];

  const menuSections = [
    {
      title: translate('menuSectionOperation', 'Minha operação'),
      items: [
        {
          title: translate('menuProfileTitle', 'Perfil do usuário'),
          subtitle: translate('menuProfileSubtitle', 'Dados pessoais, cargo e projeto vinculado'),
          icon: User,
          color: '#3B82F6',
          onPress: () => router.push({ pathname: '/perfil' } as any),
        },
        {
          title: translate('menuWallTitle', 'Mural de avisos'),
          subtitle: translate('menuWallSubtitle', 'Comunicados gerais da gestão e campanhas internas'),
          icon: Megaphone,
          color: '#F59E0B',
          badge: muralUnreadCount > 0 ? (muralUnreadCount > 99 ? '99+' : String(muralUnreadCount)) : '',
          metric: translate('menuUnread', 'novos'),
          onPress: () => openRouteSafely('/mural', translate('menuWallTitle', 'Mural de avisos')),
        },
        {
          title: translate('menuHistoryTitle', 'Histórico'),
          subtitle: translate('menuHistorySubtitle', 'Visitas, tarefas e execução dos últimos dias'),
          icon: History,
          color: '#10B981',
          onPress: () => openRouteSafely('/historico', translate('menuHistoryTitle', 'Histórico')),
        },
      ],
    },
    ...(resultCampaignItems.length > 0
      ? [
          {
            title: translate('menuSectionResults', 'Resultados e campanhas'),
            items: resultCampaignItems,
          },
        ]
      : []),
    {
      title: translate('menuSectionSupport', 'App e suporte'),
      items: [
        {
          title: translate('menuSyncTitle', 'Sincronização'),
          subtitle: translate('menuSyncSubtitle', `Última atualização: ${formatLastSyncLabel(lastSync)}`, {
            date: formatLastSyncLabel(lastSync),
          }),
          icon: RefreshCw,
          color: accent,
          loading: syncingNow || isSyncing,
          onPress: handleSync,
        },
        {
          title: translate('menuSettingsTitle', 'Configurações'),
          subtitle: translate('menuSettingsSubtitle', 'Tema, cor, idioma e conta'),
          icon: Settings,
          color: '#64748B',
          onPress: () => router.push({ pathname: '/configuracoes' } as any),
        },
        {
          title: translate('menuSupportTitle', 'Ajuda e suporte'),
          subtitle: translate('menuSupportSubtitle', 'Diagnóstico, logs e ajuda operacional'),
          icon: HelpCircle,
          color: '#06B6D4',
          onPress: () => router.push({ pathname: '/suporte' } as any),
        },
      ],
    },
  ];

  const getModalUi = () => {
    switch (modal.type) {
      case 'success':
        return { Icon: CheckCircle2, color: '#10B981', bg: isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)' };
      case 'warning':
        return { Icon: AlertCircle, color: '#F59E0B', bg: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)' };
      case 'error':
        return { Icon: AlertCircle, color: '#EF4444', bg: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)' };
      default:
        return { Icon: AlertCircle, color: '#3B82F6', bg: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)' };
    }
  };

  const modalUi = getModalUi();
  const ModalIcon = modalUi.Icon;

  return (
    <View key={`menu-${language}-${languageRenderKey}`} style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 12,
            paddingBottom: 130,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{translate('menuTitle', 'Menu')}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {translate('menuSubtitle', 'Recursos, resultados e preferências')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.themeButton, { backgroundColor: surface, borderColor: border }]}
            onPress={toggleTheme}
          >
            {isDark ? <Sun size={21} color={accent} /> : <Moon size={21} color={accent} />}
          </TouchableOpacity>
        </View>

        <View style={[styles.profileCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.profileTop}>
            <View style={[styles.avatar, { backgroundColor: surfaceAlt, borderColor: accent }]}>
              {avatarSource && !imgError ? (
                <Image
                  source={avatarSource}
                  style={styles.avatarImage}
                  onError={() => setImgError(true)}
                />
              ) : (
                <Text style={[styles.avatarInitials, { color: textPrimary }]}>
                  {getInitials(user?.nome || translate('profileUserFallback', 'Usuário'))}
                </Text>
              )}
            </View>

            <View style={styles.profileInfo}>
              <Text style={[styles.userName, { color: textPrimary }]} numberOfLines={1}>
                {formatFullName(user?.nome || translate('profileUserFallback', 'Usuário'))}
              </Text>
              <Text style={[styles.userRole, { color: textSecondary }]} numberOfLines={1}>
                {user?.cargo || user?.roleName || user?.perfil || translate('commonWorker', 'Colaborador')}
              </Text>

              <View style={styles.profileBadgesRow}>
                <View style={[styles.profileBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)' }]}>
                  <ShieldCheck size={12} color="#10B981" />
                  <Text style={[styles.profileBadgeText, { color: '#10B981' }]}>{translate('menuMobileActive', 'Mobile ativo')}</Text>
                </View>

                <View style={[styles.profileBadge, { backgroundColor: isDark ? `${accent}24` : `${accent}14` }]}>
                  <Smartphone size={12} color={accent} />
                  <Text style={[styles.profileBadgeText, { color: accent }]}>Omni Field</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={[styles.profileDivider, { backgroundColor: border }]} />

          <View style={styles.quickStatsRow}>
            <View style={styles.quickStat}>
              <Text style={[styles.quickStatValue, { color: textPrimary }]}>{translate('commonProfileShort', 'Perfil')}</Text>
              <Text style={[styles.quickStatLabel, { color: textSecondary }]}>{translate('commonUser', 'Usuário')}</Text>
            </View>

            <View style={[styles.quickStatDivider, { backgroundColor: border }]} />

            <View style={styles.quickStat}>
              <Text style={[styles.quickStatValue, { color: textPrimary }]}>{translate('commonField', 'Campo')}</Text>
              <Text style={[styles.quickStatLabel, { color: textSecondary }]}>{translate('commonOperation', 'Operação')}</Text>
            </View>

            <View style={[styles.quickStatDivider, { backgroundColor: border }]} />

            <View style={styles.quickStat}>
              <Text style={[styles.quickStatValue, { color: isSyncing ? accent : textPrimary }]}>
                {isSyncing ? 'Sync' : 'OK'}
              </Text>
              <Text style={[styles.quickStatLabel, { color: textSecondary }]}>Status</Text>
            </View>
          </View>
        </View>

        <View style={[styles.syncCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.syncLeft}>
            <View style={[styles.syncIconWrap, { backgroundColor: `${accent}24` }]}>
              <Wifi size={20} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.syncTitle, { color: textPrimary }]}>{translate('menuOfflineProtected', 'Dados offline protegidos')}</Text>
              <Text style={[styles.syncSubtitle, { color: textSecondary }]}>
                {translate('menuSyncSubtitle', `Última atualização: ${formatLastSyncLabel(lastSync)}`, { date: formatLastSyncLabel(lastSync) })}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.syncButton, { backgroundColor: accent }]}
            onPress={handleSync}
            disabled={syncingNow || isSyncing}
            activeOpacity={0.85}
          >
            {syncingNow || isSyncing ? (
              <ActivityIndicator color={accentText} size="small" />
            ) : (
              <RefreshCw size={18} color={accentText} />
            )}
          </TouchableOpacity>
        </View>

        {menuSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textSecondary }]}>{section.title}</Text>

            <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
              {section.items.map((item, index) => {
                const Icon = item.icon;
                const isLast = index === section.items.length - 1;

                return (
                  <TouchableOpacity
                    key={item.title}
                    style={[styles.menuItem, !isLast && { borderBottomWidth: 1, borderBottomColor: border }]}
                    activeOpacity={0.75}
                    onPress={item.onPress}
                    disabled={item.loading}
                  >
                    <View style={[styles.menuIconWrap, { backgroundColor: `${item.color}20` }]}>
                      {item.loading ? (
                        <ActivityIndicator size="small" color={item.color} />
                      ) : (
                        <Icon size={21} color={item.color} />
                      )}
                    </View>

                    <View style={styles.menuItemText}>
                      <View style={styles.menuTitleRow}>
                        <Text style={[styles.menuItemTitle, { color: textPrimary }]} numberOfLines={1}>
                          {item.title}
                        </Text>

                        {item.badge ? (
                          <View style={[styles.itemBadge, { backgroundColor: `${item.color}20` }]}>
                            <Text style={[styles.itemBadgeText, { color: item.color }]}>
                              {item.badge}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <Text style={[styles.menuItemSubtitle, { color: textSecondary }]} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    </View>

                    <ChevronRight size={19} color={textSecondary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.preferencesRow}>
          <TouchableOpacity
            style={[styles.preferenceButton, { backgroundColor: surface, borderColor: border }]}
            onPress={cycleLanguage}
          >
            <Globe2 size={18} color={accent} />
            <Text style={[styles.preferenceText, { color: textPrimary }]}>
              {languageShortLabel}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.preferenceButton, { backgroundColor: surface, borderColor: border }]}
            onPress={toggleTheme}
          >
            {isDark ? <Sun size={18} color={accent} /> : <Moon size={18} color={accent} />}
            <Text style={[styles.preferenceText, { color: textPrimary }]}>
              {isDark ? translate('settingsLightThemeEnabled', 'Claro').replace('Interface ', '').replace(' ativada', '') : translate('settingsDarkTheme', 'Escuro')}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.08)', borderColor: isDark ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.18)' }]}
          onPress={handleLogout}
        >
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.logoutText}>{translate('settingsLogout', 'Sair da conta')}</Text>
        </TouchableOpacity>

        <Text style={[styles.versionText, { color: textSecondary }]}>
          SmartSheep · Omni Field
        </Text>
      </ScrollView>

      <Modal visible={modal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: modalUi.bg }]}>
              <ModalIcon size={32} color={modalUi.color} />
            </View>

            <Text style={[styles.modalTitle, { color: textPrimary }]}>{modal.title}</Text>
            <Text style={[styles.modalMessage, { color: textSecondary }]}>{modal.message}</Text>

            <View style={styles.modalActions}>
              {modal.secondaryText ? (
                <TouchableOpacity
                  style={[styles.modalSecondaryButton, { borderColor: border, backgroundColor: surfaceAlt }]}
                  onPress={() => {
                    if (modal.secondaryAction) modal.secondaryAction();
                    else closeModal();
                  }}
                >
                  <Text style={[styles.modalSecondaryText, { color: textPrimary }]}>
                    {modal.secondaryText}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.modalPrimaryButton, { backgroundColor: modalUi.color }] }
                onPress={() => {
                  if (modal.primaryAction) modal.primaryAction();
                  else closeModal();
                }}
              >
                <Text style={styles.modalPrimaryText}>{modal.primaryText}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  content: { paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  pageTitle: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  pageSubtitle: { fontSize: 14, fontWeight: '600', marginTop: 3 },
  themeButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  profileCard: { borderRadius: 24, borderWidth: 1, padding: 18, marginBottom: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },
  profileTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 15 },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 22, fontWeight: '900' },
  profileInfo: { flex: 1 },
  userName: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  userRole: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  profileBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  profileBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  profileBadgeText: { fontSize: 10, fontWeight: '900' },
  profileDivider: { height: 1, marginVertical: 16 },
  quickStatsRow: { flexDirection: 'row', alignItems: 'center' },
  quickStat: { flex: 1, alignItems: 'center' },
  quickStatValue: { fontSize: 18, fontWeight: '900' },
  quickStatLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 },
  quickStatDivider: { width: 1, height: 34 },

  syncCard: { borderRadius: 24, borderWidth: 1, padding: 16, marginBottom: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8 },
  syncLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  syncIconWrap: { width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  syncTitle: { fontSize: 14, fontWeight: '900' },
  syncSubtitle: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  syncButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },

  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase', marginLeft: 4, marginBottom: 10 },
  sectionCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16 },
  menuIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  menuItemText: { flex: 1, paddingRight: 8 },
  menuTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  menuItemTitle: { fontSize: 15, fontWeight: '900', flexShrink: 1, flex: 1 },
  menuItemSubtitle: { fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 3 },
  itemBadge: {
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBadgeText: { fontSize: 12, fontWeight: '900' },

  preferencesRow: { flexDirection: 'row', gap: 12, marginTop: 2, marginBottom: 16 },
  preferenceButton: { flex: 1, height: 50, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8 },
  preferenceText: { fontSize: 13, fontWeight: '900' },

  logoutButton: { height: 54, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  logoutText: { color: '#EF4444', fontSize: 15, fontWeight: '900' },
  versionText: { textAlign: 'center', fontSize: 11, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  modalCard: { width: '100%', borderRadius: 28, borderWidth: 1, padding: 24, alignItems: 'center' },
  modalIconWrap: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 21, fontWeight: '900', textAlign: 'center', marginBottom: 10 },
  modalMessage: { fontSize: 14, fontWeight: '600', lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  modalActions: { width: '100%', flexDirection: 'row', gap: 12 },
  modalPrimaryButton: { flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  modalSecondaryButton: { flex: 1, height: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalSecondaryText: { fontSize: 14, fontWeight: '900' },

  metricWrap: {
    minWidth: 52,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 8,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
});
