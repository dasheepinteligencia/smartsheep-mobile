import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenText,
  Bug,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Copy,
  Database,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wifi,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';
import { globalSync } from '../services/syncService';
import { api } from '../services/api';
import { addAppLog, getDBConnection, getRecentAppLogs } from '../database/db';

const ACCENT_COLOR = '#FF7A00';

const SUPPORT_TEXTS = {
  'pt-BR': {
    userFallback: 'Usuário', emailNotInformed: 'E-mail não informado', neverSynced: 'Nunca sincronizado', checking: 'Verificando', notInformed: 'Não informado', appVersionNotInformed: 'Não informada', profileLoading: 'Carregando', connected: 'Conectado', offline: 'Offline', notChecked: 'Não verificado', active: 'Ativo', inactive: 'Inativo', operational: 'Operacional', profileNotLoaded: 'Não carregado', localRouteSource: 'SQLite / roteiro local', notFoundLocally: 'Não encontrado localmente', sqliteUnavailable: 'SQLite indisponível', apiRouteSource: 'API / meu-roteiro', apiUnavailable: 'API indisponível', syncing: 'Sincronizando', upToDate: 'Em dia', pending: 'Pendente', loadingSupport: 'Carregando suporte...',
    title: 'Ajuda e suporte', subtitle: 'Central operacional do app', needHelp: 'Precisa de ajuda?', needHelpText: 'Use o diagnóstico abaixo para acionar suporte com dados reais do aparelho, usuário e sincronização.', internet: 'Internet', gps: 'GPS', version: 'Versão', sync: 'Sync', supportData: 'Dados do atendimento', user: 'Usuário', email: 'E-mail', phone: 'Telefone', client: 'Cliente', project: 'Projeto', supervisor: 'Supervisor', quickActions: 'Ações rápidas', shareDiagnostic: 'Compartilhar diagnóstico', shareDiagnosticSubtitle: 'Envia os dados técnicos para suporte', whatsapp: 'Falar pelo WhatsApp', whatsappSubtitle: 'Abre uma conversa com o diagnóstico pronto', emailSupport: 'Enviar por e-mail', emailSupportSubtitle: 'Cria um e-mail com o diagnóstico do app', technicalDiagnostic: 'Diagnóstico técnico', lastSync: 'Última sincronização', localDb: 'Banco local', profileSource: 'Origem do perfil', localVisits: 'Visitas locais', pendingQueue: 'Fila pendente', platform: 'Plataforma', appTimeline: 'Linha do tempo do app', appTimelineHint: 'Últimos eventos registrados no aparelho para investigação de suporte.', noLogs: 'Nenhum log local encontrado ainda. Os eventos serão registrados a partir desta atualização.', quickHelp: 'Ajuda rápida',
    faqNoInternetTitle: 'Sem internet', faqNoInternetBody: 'Continue usando o app normalmente. Check-in, checkout, tarefas e fotos ficam locais e sincronizam quando a conexão voltar.', faqGpsInactiveTitle: 'GPS inativo', faqGpsInactiveBody: 'Ative a localização do aparelho antes de iniciar check-in ou checkout. Algumas operações podem exigir GPS ativo.', faqSyncPendingTitle: 'Sincronização pendente', faqSyncPendingBody: 'Puxe a tela para baixo ou toque no ícone de sincronização. Se continuar pendente, compartilhe o diagnóstico.', faqVisitTaskProblemTitle: 'Problema em visita ou tarefa', faqVisitTaskProblemBody: 'Informe loja, data, horário aproximado e compartilhe o diagnóstico para o suporte analisar o caso.', operationalGuidance: 'Orientação operacional', operationalGuidanceText: 'Em caso de falha, não reinstale o app antes de falar com suporte. Dados offline ainda podem estar salvos no aparelho.',
    diagnosticTitle: 'DIAGNÓSTICO DO APP', appLogsTitle: 'ÚLTIMOS LOGS DO APP', userId: 'Usuário ID', projectId: 'Projeto ID', appVersion: 'Versão do app', sqlite: 'SQLite', shareErrorTitle: 'Não foi possível compartilhar', shareErrorMessage: 'Tente novamente em instantes.', emailSubject: 'Suporte Omni Field - Diagnóstico do app', emailUnavailableTitle: 'E-mail indisponível', emailUnavailableMessage: 'Não foi possível abrir o aplicativo de e-mail neste dispositivo.', whatsappUnavailableTitle: 'WhatsApp indisponível', whatsappUnavailableMessage: 'Não foi possível abrir o WhatsApp neste dispositivo.', logLoaded: 'Diagnóstico de suporte carregado.', logShared: 'Diagnóstico compartilhado pelo usuário.', app: 'APP', event: 'EVENT', info: 'INFO'
  },
  'en-US': {
    userFallback: 'User', emailNotInformed: 'E-mail not informed', neverSynced: 'Never synced', checking: 'Checking', notInformed: 'Not informed', appVersionNotInformed: 'Not informed', profileLoading: 'Loading', connected: 'Connected', offline: 'Offline', notChecked: 'Not checked', active: 'Active', inactive: 'Inactive', operational: 'Operational', profileNotLoaded: 'Not loaded', localRouteSource: 'SQLite / local route', notFoundLocally: 'Not found locally', sqliteUnavailable: 'SQLite unavailable', apiRouteSource: 'API / my-route', apiUnavailable: 'API unavailable', syncing: 'Syncing', upToDate: 'Up to date', pending: 'Pending', loadingSupport: 'Loading support...',
    title: 'Help & support', subtitle: 'App operations center', needHelp: 'Need help?', needHelpText: 'Use the diagnostic below to contact support with real device, user and sync data.', internet: 'Internet', gps: 'GPS', version: 'Version', sync: 'Sync', supportData: 'Support data', user: 'User', email: 'E-mail', phone: 'Phone', client: 'Client', project: 'Project', supervisor: 'Supervisor', quickActions: 'Quick actions', shareDiagnostic: 'Share diagnostic', shareDiagnosticSubtitle: 'Sends technical data to support', whatsapp: 'Talk via WhatsApp', whatsappSubtitle: 'Opens a conversation with the diagnostic ready', emailSupport: 'Send by e-mail', emailSupportSubtitle: 'Creates an e-mail with the app diagnostic', technicalDiagnostic: 'Technical diagnostic', lastSync: 'Last sync', localDb: 'Local database', profileSource: 'Profile source', localVisits: 'Local visits', pendingQueue: 'Pending queue', platform: 'Platform', appTimeline: 'App timeline', appTimelineHint: 'Latest events recorded on the device for support investigation.', noLogs: 'No local logs found yet. Events will be recorded from this update onward.', quickHelp: 'Quick help',
    faqNoInternetTitle: 'No internet', faqNoInternetBody: 'Keep using the app normally. Check-in, checkout, tasks and photos stay local and sync when the connection comes back.', faqGpsInactiveTitle: 'GPS inactive', faqGpsInactiveBody: 'Enable device location before starting check-in or checkout. Some operations may require active GPS.', faqSyncPendingTitle: 'Pending synchronization', faqSyncPendingBody: 'Pull the screen down or tap the sync icon. If it remains pending, share the diagnostic.', faqVisitTaskProblemTitle: 'Problem with a visit or task', faqVisitTaskProblemBody: 'Inform store, date, approximate time and share the diagnostic so support can analyze the case.', operationalGuidance: 'Operational guidance', operationalGuidanceText: 'In case of failure, do not reinstall the app before talking to support. Offline data may still be saved on the device.',
    diagnosticTitle: 'APP DIAGNOSTIC', appLogsTitle: 'LATEST APP LOGS', userId: 'User ID', projectId: 'Project ID', appVersion: 'App version', sqlite: 'SQLite', shareErrorTitle: 'Unable to share', shareErrorMessage: 'Please try again shortly.', emailSubject: 'Omni Field Support - App diagnostic', emailUnavailableTitle: 'E-mail unavailable', emailUnavailableMessage: 'Unable to open the e-mail app on this device.', whatsappUnavailableTitle: 'WhatsApp unavailable', whatsappUnavailableMessage: 'Unable to open WhatsApp on this device.', logLoaded: 'Support diagnostic loaded.', logShared: 'Diagnostic shared by the user.', app: 'APP', event: 'EVENT', info: 'INFO'
  },
  'es-ES': {
    userFallback: 'Usuario', emailNotInformed: 'E-mail no informado', neverSynced: 'Nunca sincronizado', checking: 'Verificando', notInformed: 'No informado', appVersionNotInformed: 'No informada', profileLoading: 'Cargando', connected: 'Conectado', offline: 'Sin conexión', notChecked: 'No verificado', active: 'Activo', inactive: 'Inactivo', operational: 'Operacional', profileNotLoaded: 'No cargado', localRouteSource: 'SQLite / ruta local', notFoundLocally: 'No encontrado localmente', sqliteUnavailable: 'SQLite no disponible', apiRouteSource: 'API / mi-ruta', apiUnavailable: 'API no disponible', syncing: 'Sincronizando', upToDate: 'Al día', pending: 'Pendiente', loadingSupport: 'Cargando soporte...',
    title: 'Ayuda y soporte', subtitle: 'Central operacional de la app', needHelp: '¿Necesitas ayuda?', needHelpText: 'Usa el diagnóstico a continuación para contactar soporte con datos reales del dispositivo, usuario y sincronización.', internet: 'Internet', gps: 'GPS', version: 'Versión', sync: 'Sync', supportData: 'Datos de atención', user: 'Usuario', email: 'E-mail', phone: 'Teléfono', client: 'Cliente', project: 'Proyecto', supervisor: 'Supervisor', quickActions: 'Acciones rápidas', shareDiagnostic: 'Compartir diagnóstico', shareDiagnosticSubtitle: 'Envía los datos técnicos a soporte', whatsapp: 'Hablar por WhatsApp', whatsappSubtitle: 'Abre una conversación con el diagnóstico listo', emailSupport: 'Enviar por e-mail', emailSupportSubtitle: 'Crea un e-mail con el diagnóstico de la app', technicalDiagnostic: 'Diagnóstico técnico', lastSync: 'Última sincronización', localDb: 'Base local', profileSource: 'Origen del perfil', localVisits: 'Visitas locales', pendingQueue: 'Cola pendiente', platform: 'Plataforma', appTimeline: 'Línea de tiempo de la app', appTimelineHint: 'Últimos eventos registrados en el dispositivo para investigación de soporte.', noLogs: 'Aún no se encontró ningún log local. Los eventos se registrarán a partir de esta actualización.', quickHelp: 'Ayuda rápida',
    faqNoInternetTitle: 'Sin internet', faqNoInternetBody: 'Continúa usando la app normalmente. Check-in, checkout, tareas y fotos quedan locales y sincronizan cuando vuelva la conexión.', faqGpsInactiveTitle: 'GPS inactivo', faqGpsInactiveBody: 'Activa la ubicación del dispositivo antes de iniciar check-in o checkout. Algunas operaciones pueden exigir GPS activo.', faqSyncPendingTitle: 'Sincronización pendiente', faqSyncPendingBody: 'Desliza la pantalla hacia abajo o toca el ícono de sincronización. Si continúa pendiente, comparte el diagnóstico.', faqVisitTaskProblemTitle: 'Problema en visita o tarea', faqVisitTaskProblemBody: 'Informa tienda, fecha, horario aproximado y comparte el diagnóstico para que soporte analice el caso.', operationalGuidance: 'Orientación operacional', operationalGuidanceText: 'En caso de falla, no reinstales la app antes de hablar con soporte. Los datos offline aún pueden estar guardados en el dispositivo.',
    diagnosticTitle: 'DIAGNÓSTICO DE LA APP', appLogsTitle: 'ÚLTIMOS LOGS DE LA APP', userId: 'Usuario ID', projectId: 'Proyecto ID', appVersion: 'Versión de la app', sqlite: 'SQLite', shareErrorTitle: 'No fue posible compartir', shareErrorMessage: 'Inténtalo nuevamente en unos instantes.', emailSubject: 'Soporte Omni Field - Diagnóstico de la app', emailUnavailableTitle: 'E-mail no disponible', emailUnavailableMessage: 'No fue posible abrir la app de e-mail en este dispositivo.', whatsappUnavailableTitle: 'WhatsApp no disponible', whatsappUnavailableMessage: 'No fue posible abrir WhatsApp en este dispositivo.', logLoaded: 'Diagnóstico de soporte cargado.', logShared: 'Diagnóstico compartido por el usuario.', app: 'APP', event: 'EVENT', info: 'INFO'
  },
} as const;

type SupportTextKey = keyof typeof SUPPORT_TEXTS['pt-BR'];

const supportText = (key: SupportTextKey, language: string) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  return SUPPORT_TEXTS[lang][key];
};

const supportLocale = (language: string) => {
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


type DiagnosticState = {
  internet: string;
  gps: string;
  appVersion: string;
  platform: string;
  lastSync: string;
  sqlite: string;
  profileSource: string;
  visitsCount: number;
  queueCount: number;
};

type ProfileState = {
  nome: string;
  email: string;
  telefone: string | null;
  projeto: string | null;
  cliente: string | null;
  supervisor: string | null;
};

type AppLogRow = {
  id: string;
  created_at: string;
  level: string;
  module: string;
  action: string;
  message: string;
  metadata_json?: string | null;
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

const pickFirst = (...values: any[]) => {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text && text !== 'null' && text !== 'undefined') return text;
  }

  return null;
};

const getProjectId = (user: any) =>
  user?.allowed_project_ids?.[0] ||
  user?.allowedProjectIds?.[0] ||
  user?.projectId ||
  user?.project_id ||
  user?.projeto_id ||
  null;

const getUserId = (user: any) => String(user?.id || user?.usuario_id || user?.user_id || '').trim();

const getUserName = (user: any, language = 'pt-BR') => pickFirst(user?.nome, user?.name, user?.displayName, user?.full_name, user?.fullName) || supportText('userFallback', language);

const getUserEmail = (user: any, language = 'pt-BR') => pickFirst(user?.email, user?.mail, user?.login, user?.username) || supportText('emailNotInformed', language);

const formatLastSync = (value: any, language = 'pt-BR') => {
  if (!value) return supportText('neverSynced', language);

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString(supportLocale(language), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const safeCount = async (db: any, tableName: string) => {
  try {
    const exists = await db.getAllAsync(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tableName]);

    if (!exists?.length) return 0;

    const rows = await db.getAllAsync(`SELECT COUNT(*) as total FROM ${tableName}`);

    return Number(rows?.[0]?.total || 0);
  } catch {
    return 0;
  }
};

const getPerfilFromVisits = async (db: any, language = 'pt-BR') => {
  try {
    const visits = (await db.getAllAsync(`SELECT * FROM visits LIMIT 80`)) as any[];

    for (const visit of visits) {
      const projectConfig = safeParseJson(visit?.project_config_json || visit?.project_config || visit?.projectConfig, {});
      const raw = safeParseJson(visit?.visit_raw_json || visit?.raw_json || {}, {});
      const rawProjectConfig = safeParseJson(raw?.project_config || raw?.projectConfig, raw?.project_config || raw?.projectConfig || {});

      const perfil =
        projectConfig?.perfil_mobile ||
        projectConfig?.perfilMobile ||
        rawProjectConfig?.perfil_mobile ||
        rawProjectConfig?.perfilMobile ||
        raw?.perfil_mobile ||
        raw?.perfilMobile ||
        null;

      if (perfil) return { perfil, source: supportText('localRouteSource', language), visitsCount: visits.length };
    }

    return { perfil: null, source: supportText('notFoundLocally', language), visitsCount: visits.length };
  } catch {
    return { perfil: null, source: supportText('sqliteUnavailable', language), visitsCount: 0 };
  }
};

export default function AjudaSuporteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const { theme, language, accentColor } = useSettingsStore();
  const syncStore = useSyncStore() as any;

  const isSyncing = !!(syncStore?.syncing || syncStore?.isSyncing);
  const lastSync = syncStore?.lastSync || syncStore?.last_sync || null;

  const isDark = theme === 'dark';
  const bg = isDark ? '#020617' : '#F8FAFC';
  const surface = isDark ? '#0F172A' : '#FFFFFF';
  const soft = isDark ? '#111827' : '#F1F5F9';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const accent = accentColor || ACCENT_COLOR;
  const accentText = getReadableTextColor(accent);
  const statusBarBg = bg;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const baseProfile = useMemo<ProfileState>(() => {
    const customData = safeParseJson(user?.custom_data || user?.customData, {});

    return {
      nome: getUserName(user, language),
      email: getUserEmail(user, language),
      telefone: pickFirst(user?.telefone, user?.phone, user?.celular, customData?.telefone, customData?.celular),
      projeto: pickFirst(user?.project?.name, user?.projectName, user?.project_name, user?.projetoNome, user?.projeto_nome, customData?.project_name),
      cliente: pickFirst(user?.client?.name, user?.clientName, user?.empresa_nome, user?.companyName, customData?.empresa_nome),
      supervisor: pickFirst(user?.supervisor?.nome, user?.supervisor_nome, user?.supervisorNome, customData?.supervisor_nome),
    };
  }, [user, language]);

  const [profile, setProfile] = useState<ProfileState>(baseProfile);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>({
    internet: supportText('checking', language),
    gps: supportText('checking', language),
    appVersion: Constants?.expoConfig?.version || Constants?.manifest?.version || Constants?.nativeAppVersion || supportText('appVersionNotInformed', language),
    platform: `${Platform.OS} ${Platform.Version || ''}`.trim(),
    lastSync: formatLastSync(lastSync, language),
    sqlite: supportText('checking', language),
    profileSource: supportText('profileLoading', language),
    visitsCount: 0,
    queueCount: 0,
  });
  const [logs, setLogs] = useState<AppLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLiveChecks = async () => {
    try {
      const net = await Network.getNetworkStateAsync();
      setDiagnostic((prev) => ({
        ...prev,
        internet: net?.isConnected && net?.isInternetReachable !== false ? supportText('connected', language) : supportText('offline', language),
      }));
    } catch {
      setDiagnostic((prev) => ({ ...prev, internet: supportText('notChecked', language) }));
    }

    try {
      const gpsOn = await Location.hasServicesEnabledAsync();
      setDiagnostic((prev) => ({ ...prev, gps: gpsOn ? supportText('active', language) : supportText('inactive', language) }));
    } catch {
      setDiagnostic((prev) => ({ ...prev, gps: supportText('notChecked', language) }));
    }
  };

  const loadSupportData = async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      await loadLiveChecks();

      const db = await getDBConnection();
      const visitsCount = await safeCount(db, 'visits');
      const queueCount =
        (await safeCount(db, 'sync_queue')) ||
        (await safeCount(db, 'syncQueue')) ||
        (await safeCount(db, 'pending_sync')) ||
        0;

      const recentLogs = (await getRecentAppLogs(80)) as AppLogRow[];
      setLogs(recentLogs);

      const localProfile = await getPerfilFromVisits(db, language);

      let perfil = localProfile.perfil;
      let profileSource = localProfile.source;

      if (!perfil && getUserId(user) && getProjectId(user)) {
        try {
          const response = await api(
            `/meu-roteiro?promotorId=${encodeURIComponent(getUserId(user))}&projectId=${encodeURIComponent(String(getProjectId(user)))}&t=${Date.now()}`,
            { method: 'GET' }
          );

          if (response.ok) {
            const payload = await response.json();

            perfil =
              payload?.profile ||
              {
                usuario: payload?.usuario || null,
                supervisor: payload?.supervisor || null,
                project: payload?.project || null,
                client: payload?.client || null,
                lojasResponsaveis: payload?.lojasResponsaveis || [],
              };

            profileSource = supportText('apiRouteSource', language);
          } else {
            profileSource = `${supportText('apiUnavailable', language)} (${response.status})`;
          }
        } catch (error: any) {
          profileSource = supportText('apiUnavailable', language);
          console.log('[Suporte] Falha ao buscar profile:', error?.message || error);
        }
      }

      const usuario = perfil?.usuario || null;
      const project = perfil?.project || perfil?.projeto || null;
      const client = perfil?.client || perfil?.cliente || null;
      const supervisor = perfil?.supervisor || null;

      setProfile({
        nome: pickFirst(usuario?.nome, usuario?.name, baseProfile.nome) || supportText('userFallback', language),
        email: pickFirst(usuario?.email, baseProfile.email) || supportText('emailNotInformed', language),
        telefone: pickFirst(usuario?.telefone, baseProfile.telefone),
        projeto: pickFirst(project?.name, project?.nome, baseProfile.projeto),
        cliente: pickFirst(client?.name, client?.nome, baseProfile.cliente),
        supervisor: pickFirst(supervisor?.nome, supervisor?.name, supervisor?.email, baseProfile.supervisor),
      });

      setDiagnostic((prev) => ({
        ...prev,
        appVersion: Constants?.expoConfig?.version || Constants?.manifest?.version || Constants?.nativeAppVersion || supportText('appVersionNotInformed', language),
        platform: `${Platform.OS} ${Platform.Version || ''}`.trim(),
        lastSync: formatLastSync(lastSync, language),
        sqlite: supportText('operational', language),
        profileSource,
        visitsCount,
        queueCount,
      }));

      await addAppLog({
        level: 'INFO',
        module: 'SUPPORT',
        action: 'LOAD_SUPPORT_DIAGNOSTIC',
        message: supportText('logLoaded', language),
        metadata: {
          profileSource,
          visitsCount,
          queueCount,
          internet: diagnostic.internet,
          gps: diagnostic.gps,
        },
      });

      if (__DEV__) {
        console.log('[Suporte] diagnóstico', {
          profileSource,
          visitsCount,
          queueCount,
          usuario: getUserId(user),
          projectId: getProjectId(user),
        });
      }
    } catch (error: any) {
      console.log('[Suporte] Falha ao carregar diagnóstico:', error?.message || error);

      setDiagnostic((prev) => ({
        ...prev,
        sqlite: supportText('notChecked', language),
        profileSource: supportText('profileNotLoaded', language),
      }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveChecks();

    timerRef.current = setInterval(loadLiveChecks, 8000);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      const isActiveNow = nextState === 'active';

      appStateRef.current = nextState;

      if (wasInactive && isActiveNow) loadLiveChecks();
    });

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      subscription.remove();
    };
  }, [language]);

  useFocusEffect(
    useCallback(() => {
      loadSupportData();
    }, [lastSync, baseProfile.nome, baseProfile.email, language])
  );

  const refresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
    } catch (error: any) {
      console.log('[Suporte] Sync falhou:', error?.message || error);
    }

    await loadSupportData(true);
  };

  const diagnosticText = useMemo(() => {
    return [
      supportText('diagnosticTitle', language),
      `${supportText('user', language)}: ${profile.nome}`,
      `${supportText('email', language)}: ${profile.email}`,
      `${supportText('phone', language)}: ${profile.telefone || supportText('notInformed', language)}`,
      `${supportText('client', language)}: ${profile.cliente || supportText('notInformed', language)}`,
      `${supportText('project', language)}: ${profile.projeto || supportText('notInformed', language)}`,
      `${supportText('supervisor', language)}: ${profile.supervisor || supportText('notInformed', language)}`,
      `${supportText('internet', language)}: ${diagnostic.internet}`,
      `${supportText('gps', language)}: ${diagnostic.gps}`,
      `${supportText('appVersion', language)}: ${diagnostic.appVersion}`,
      `${supportText('platform', language)}: ${diagnostic.platform}`,
      `${supportText('lastSync', language)}: ${diagnostic.lastSync}`,
      `${supportText('sqlite', language)}: ${diagnostic.sqlite}`,
      `${supportText('profileSource', language)}: ${diagnostic.profileSource}`,
      `${supportText('localVisits', language)}: ${diagnostic.visitsCount}`,
      `${supportText('pendingQueue', language)}: ${diagnostic.queueCount}`,
      `${supportText('userId', language)}: ${getUserId(user) || supportText('notInformed', language)}`,
      `${supportText('projectId', language)}: ${getProjectId(user) || supportText('notInformed', language)}`,
      '',
      supportText('appLogsTitle', language),
      ...logs.slice(0, 50).map((log) => {
        const when = new Date(log.created_at);
        const whenText = Number.isNaN(when.getTime())
          ? String(log.created_at)
          : when.toLocaleString(supportLocale(language), {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });

        return `${whenText} [${log.level}] ${log.module}/${log.action}: ${log.message}`;
      }),
    ].join('\n');
  }, [profile, diagnostic, user, logs, language]);

  const shareDiagnostic = async () => {
    try {
      await addAppLog({
        level: 'INFO',
        module: 'SUPPORT',
        action: 'SHARE_DIAGNOSTIC',
        message: supportText('logShared', language),
        metadata: { logs: logs.length },
      });

      await Share.share({ message: diagnosticText });
    } catch (error: any) {
      Alert.alert(supportText('shareErrorTitle', language), error?.message || supportText('shareErrorMessage', language));
    }
  };

  const openEmailSupport = async () => {
    const subject = encodeURIComponent(supportText('emailSubject', language));
    const body = encodeURIComponent(diagnosticText);
    const url = `mailto:suporte@dasheep.com.br?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(url);

      if (!canOpen) {
        Alert.alert(supportText('emailUnavailableTitle', language), supportText('emailUnavailableMessage', language));
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert(supportText('emailUnavailableTitle', language), supportText('emailUnavailableMessage', language));
    }
  };

  const openWhatsAppSupport = async () => {
    const text = encodeURIComponent(diagnosticText);
    const url = `https://wa.me/?text=${text}`;

    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(supportText('whatsappUnavailableTitle', language), supportText('whatsappUnavailableMessage', language));
    }
  };

  const statusColor = (value: string) => {
    const normalized = String(value || '').toLowerCase();

    if (normalized.includes('conectado') || normalized.includes('connected') || normalized.includes('ativo') || normalized.includes('active') || normalized.includes('em dia') || normalized.includes('up to date') || normalized.includes('al día') || normalized.includes('operacional') || normalized.includes('operational')) {
      return '#22C55E';
    }

    if (normalized.includes('offline') || normalized.includes('sin conexión') || normalized.includes('inativo') || normalized.includes('inactive') || normalized.includes('pendente') || normalized.includes('pending') || normalized.includes('indisponível') || normalized.includes('unavailable') || normalized.includes('no disponible')) {
      return '#F59E0B';
    }

    return '#60A5FA';
  };

  const renderStatusCard = (label: string, value: string, Icon: any) => {
    const color = statusColor(value);

    return (
      <View style={[styles.statusCard, { backgroundColor: soft, borderColor: border }]}>
        <View style={[styles.statusIcon, { backgroundColor: `${color}18` }]}>
          <Icon size={22} color={color} />
        </View>
        <Text style={[styles.statusLabel, { color: textSecondary }]}>{label}</Text>
        <Text style={[styles.statusValue, { color }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );
  };

  const renderInfoRow = (label: string, value: any, Icon: any, color = accent) => (
    <View style={[styles.infoRow, { borderBottomColor: border }]}>
      <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={19} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: textPrimary }]} numberOfLines={2}>
          {value || supportText('notInformed', language)}
        </Text>
      </View>
    </View>
  );

  const renderAction = (title: string, subtitle: string, Icon: any, color: string, onPress: () => void) => (
    <TouchableOpacity style={[styles.actionRow, { backgroundColor: soft, borderColor: border }]} onPress={onPress} activeOpacity={0.86}>
      <View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={20} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.actionTitle, { color: textPrimary }]}>{title}</Text>
        <Text style={[styles.actionSubtitle, { color: textSecondary }]}>{subtitle}</Text>
      </View>

      <ChevronRight size={18} color={textSecondary} />
    </TouchableOpacity>
  );

  const renderFaq = (title: string, body: string, Icon: any) => (
    <View style={[styles.faqItem, { backgroundColor: soft, borderColor: border }]}>
      <View style={[styles.faqIcon, { backgroundColor: `${accent}24` }]}>
        <Icon size={18} color={accent} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.faqTitle, { color: textPrimary }]}>{title}</Text>
        <Text style={[styles.faqText, { color: textSecondary }]}>{body}</Text>
      </View>
    </View>
  );

  const logColor = (level: string) => {
    const normalized = String(level || '').toUpperCase();

    if (normalized === 'ERROR') return '#EF4444';
    if (normalized === 'WARNING') return '#F59E0B';
    if (normalized === 'DEBUG') return '#60A5FA';

    return '#22C55E';
  };

  const renderLog = (log: AppLogRow) => {
    const color = logColor(log.level);
    const createdAt = new Date(log.created_at);
    const createdAtText = Number.isNaN(createdAt.getTime())
      ? String(log.created_at)
      : createdAt.toLocaleString(supportLocale(language), {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

    return (
      <View key={log.id} style={[styles.logItem, { backgroundColor: soft, borderColor: border }]}>
        <View style={[styles.logDot, { backgroundColor: color }]} />

        <View style={{ flex: 1 }}>
          <View style={styles.logHeader}>
            <Text style={[styles.logLevel, { color }]}>{String(log.level || 'INFO').toUpperCase()}</Text>
            <Text style={[styles.logTime, { color: textSecondary }]}>{createdAtText}</Text>
          </View>

          <Text style={[styles.logAction, { color: textPrimary }]} numberOfLines={1}>
            {String(log.module || 'APP').toUpperCase()} / {String(log.action || 'EVENT').toUpperCase()}
          </Text>

          <Text style={[styles.logMessage, { color: textSecondary }]} numberOfLines={3}>
            {log.message}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.loading}>
          <ActivityIndicator color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>{supportText('loadingSupport', language)}</Text>
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
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom + 28, 44),
          },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} colors={[accent]} progressViewOffset={Math.max(insets.top, 0) + 80} />}
      >
        <View style={styles.header}>
          <TouchableOpacity style={[styles.headerButton, { backgroundColor: surface, borderColor: border }]} onPress={() => router.back()} activeOpacity={0.85}>
            <ArrowLeft size={22} color={textPrimary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{supportText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>{supportText('subtitle', language)}</Text>
          </View>

          <TouchableOpacity style={[styles.headerButton, { backgroundColor: surface, borderColor: border }]} onPress={refresh} activeOpacity={0.85}>
            <RefreshCw size={21} color={isSyncing || refreshing ? accent : textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.heroCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={[styles.heroIcon, { backgroundColor: accent }]}>
            <HelpCircle size={30} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: textPrimary }]}>{supportText('needHelp', language)}</Text>
            <Text style={[styles.heroText, { color: textSecondary }]}>
              {supportText('needHelpText', language)}
            </Text>
          </View>
        </View>

        <View style={styles.statusGrid}>
          {renderStatusCard(supportText('internet', language), diagnostic.internet, Wifi)}
          {renderStatusCard(supportText('gps', language), diagnostic.gps, Navigation)}
          {renderStatusCard(supportText('version', language), diagnostic.appVersion, Smartphone)}
          {renderStatusCard(supportText('sync', language), isSyncing ? supportText('syncing', language) : lastSync ? supportText('upToDate', language) : supportText('pending', language), CalendarClock)}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{supportText('supportData', language)}</Text>

          <View style={{ height: 12 }} />

          {renderInfoRow(supportText('user', language), profile.nome, UserRound, '#3B82F6')}
          {renderInfoRow(supportText('email', language), profile.email, Mail, '#06B6D4')}
          {renderInfoRow(supportText('client', language), profile.cliente, ShieldCheck, accent)}
          {renderInfoRow(supportText('project', language), profile.projeto, Database, '#8B5CF6')}
          {renderInfoRow(supportText('supervisor', language), profile.supervisor, UserRound, '#10B981')}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{supportText('quickActions', language)}</Text>

          <View style={{ height: 12 }} />

          {renderAction(supportText('shareDiagnostic', language), supportText('shareDiagnosticSubtitle', language), Copy, accent, shareDiagnostic)}
          {renderAction(supportText('whatsapp', language), supportText('whatsappSubtitle', language), MessageCircle, '#22C55E', openWhatsAppSupport)}
          {renderAction(supportText('emailSupport', language), supportText('emailSupportSubtitle', language), Mail, '#3B82F6', openEmailSupport)}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{supportText('technicalDiagnostic', language)}</Text>

          <View style={{ height: 12 }} />

          {renderInfoRow(supportText('lastSync', language), diagnostic.lastSync, RefreshCw, accent)}
          {renderInfoRow(supportText('localDb', language), diagnostic.sqlite, Database, '#8B5CF6')}
          {renderInfoRow(supportText('profileSource', language), diagnostic.profileSource, CheckCircle2, '#10B981')}
          {renderInfoRow(supportText('localVisits', language), String(diagnostic.visitsCount), MapPin, '#3B82F6')}
          {renderInfoRow(supportText('pendingQueue', language), String(diagnostic.queueCount), AlertTriangle, '#F59E0B')}
          {renderInfoRow(supportText('platform', language), diagnostic.platform, Smartphone, '#64748B')}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{supportText('appTimeline', language)}</Text>
          <Text style={[styles.sectionHint, { color: textSecondary }]}>
            {supportText('appTimelineHint', language)}
          </Text>

          <View style={{ height: 12 }} />

          {logs.length > 0 ? (
            logs.slice(0, 20).map(renderLog)
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: soft, borderColor: border }]}>
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                {supportText('noLogs', language)}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{supportText('quickHelp', language)}</Text>

          <View style={{ height: 12 }} />

          {renderFaq(
            supportText('faqNoInternetTitle', language),
            supportText('faqNoInternetBody', language),
            Wifi
          )}
          {renderFaq(
            supportText('faqGpsInactiveTitle', language),
            supportText('faqGpsInactiveBody', language),
            Navigation
          )}
          {renderFaq(
            supportText('faqSyncPendingTitle', language),
            supportText('faqSyncPendingBody', language),
            RefreshCw
          )}
          {renderFaq(
            supportText('faqVisitTaskProblemTitle', language),
            supportText('faqVisitTaskProblemBody', language),
            Bug
          )}
        </View>

        <View style={[styles.policyCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={[styles.policyIcon, { backgroundColor: `${accent}24` }]}>
            <CircleAlert size={22} color={accent} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.policyTitle, { color: textPrimary }]}>{supportText('operationalGuidance', language)}</Text>
            <Text style={[styles.policyText, { color: textSecondary }]}>
              {supportText('operationalGuidanceText', language)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, fontWeight: '700' },
  content: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { fontSize: 27, fontWeight: '900', letterSpacing: -0.7 },
  pageSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  heroText: { fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 4 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statusCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  },
  statusLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  statusValue: { fontSize: 14, fontWeight: '900', marginTop: 3, textAlign: 'center' },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  sectionHint: { fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 5 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  infoValue: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  actionRow: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 9,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 14, fontWeight: '900' },
  actionSubtitle: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 2 },
  faqItem: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 13,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 9,
  },
  faqIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqTitle: { fontSize: 14, fontWeight: '900' },
  faqText: { fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 3 },
  logItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    gap: 11,
    marginBottom: 9,
  },
  logDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 5,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  logLevel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  logTime: { fontSize: 11, fontWeight: '700' },
  logAction: { fontSize: 12, fontWeight: '900', marginBottom: 3 },
  logMessage: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  policyCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  policyIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  policyTitle: { fontSize: 15, fontWeight: '900' },
  policyText: { fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 4 },
});
