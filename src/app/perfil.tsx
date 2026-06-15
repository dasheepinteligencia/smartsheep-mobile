
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import * as Location from 'expo-location';
import {
  ArrowLeft,
  Building2,
  CalendarCheck2,
  Car,
  ChevronRight,
  Home,
  Mail,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Smartphone,
  Store,
  UserRound,
  Wifi,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';
import { globalSync } from '../services/syncService';
import { api } from '../services/api';
import { getDBConnection } from '../database/db';

const ACCENT_COLOR = '#FF7A00';

const PROFILE_TEXTS = {
  'pt-BR': {
    userFallback: 'Usuário',
    emailNotInformed: 'E-mail não informado',
    worker: 'Colaborador',
    linkedProject: 'Projeto vinculado',
    notInformed: 'Não informado',
    loading: 'Carregando perfil...',
    title: 'Perfil',
    subtitle: 'Dados do usuário',
    supervisor: 'Supervisor',
    transport: 'Transporte',
    address: 'Endereço',
    responsibleStores: 'Lojas sob responsabilidade',
    noStores: 'Nenhuma loja encontrada no banco local para este usuário.',
    appChecklist: 'Checklist do app',
    gps: 'GPS',
    internet: 'Internet',
    appVersion: 'Versão do app',
    synchronization: 'Sincronização',
    checking: 'Verificando',
    connected: 'Conectado',
    offline: 'Offline',
    notChecked: 'Não verificado',
    active: 'Ativo',
    inactive: 'Inativo',
    syncing: 'Sincronizando',
    upToDate: 'Em dia',
    pending: 'Pendente',
    versionNotInformed: 'Não informada',
    car: 'Carro',
    motorcycle: 'Moto',
    publicTransport: 'Transporte público',
    walking: 'A pé',
  },
  'en-US': {
    userFallback: 'User',
    emailNotInformed: 'E-mail not informed',
    worker: 'Employee',
    linkedProject: 'Linked project',
    notInformed: 'Not informed',
    loading: 'Loading profile...',
    title: 'Profile',
    subtitle: 'User details',
    supervisor: 'Supervisor',
    transport: 'Transport',
    address: 'Address',
    responsibleStores: 'Stores under responsibility',
    noStores: 'No store found in the local database for this user.',
    appChecklist: 'App checklist',
    gps: 'GPS',
    internet: 'Internet',
    appVersion: 'App version',
    synchronization: 'Synchronization',
    checking: 'Checking',
    connected: 'Connected',
    offline: 'Offline',
    notChecked: 'Not checked',
    active: 'Active',
    inactive: 'Inactive',
    syncing: 'Syncing',
    upToDate: 'Up to date',
    pending: 'Pending',
    versionNotInformed: 'Not informed',
    car: 'Car',
    motorcycle: 'Motorcycle',
    publicTransport: 'Public transport',
    walking: 'Walking',
  },
  'es-ES': {
    userFallback: 'Usuario',
    emailNotInformed: 'E-mail no informado',
    worker: 'Colaborador',
    linkedProject: 'Proyecto vinculado',
    notInformed: 'No informado',
    loading: 'Cargando perfil...',
    title: 'Perfil',
    subtitle: 'Datos del usuario',
    supervisor: 'Supervisor',
    transport: 'Transporte',
    address: 'Dirección',
    responsibleStores: 'Tiendas bajo responsabilidad',
    noStores: 'No se encontró ninguna tienda en la base local para este usuario.',
    appChecklist: 'Checklist de la app',
    gps: 'GPS',
    internet: 'Internet',
    appVersion: 'Versión de la app',
    synchronization: 'Sincronización',
    checking: 'Verificando',
    connected: 'Conectado',
    offline: 'Sin conexión',
    notChecked: 'No verificado',
    active: 'Activo',
    inactive: 'Inactivo',
    syncing: 'Sincronizando',
    upToDate: 'Al día',
    pending: 'Pendiente',
    versionNotInformed: 'No informada',
    car: 'Auto',
    motorcycle: 'Moto',
    publicTransport: 'Transporte público',
    walking: 'A pie',
  },
} as const;

type ProfileTextKey = keyof typeof PROFILE_TEXTS['pt-BR'];

const profileText = (key: ProfileTextKey, language: string) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  return PROFILE_TEXTS[lang][key];
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

type LojaPerfil = {
  id: string;
  nome: string;
  detalhe?: string | null;
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

const looksLikeId = (value: any) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const cleanName = (value: any, fallback?: string) => {
  const text = pickFirst(value);
  if (!text) return fallback || null;
  if (looksLikeId(text)) return fallback || null;
  return text;
};

const initials = (name?: string | null) => {
  const parts = String(name || '').trim().split(' ').filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const shortName = (name?: string | null, fallback = 'Usuário') => {
  const parts = String(name || '').trim().split(' ').filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const formatTransport = (value: any, language = 'pt-BR') => {
  const raw = String(value || '').trim().toUpperCase();
  const map: Record<string, string> = {
    CARRO: profileText('car', language),
    MOTO: profileText('motorcycle', language),
    TRANSPORTE_PUBLICO: profileText('publicTransport', language),
    A_PE: profileText('walking', language),
  };
  return map[raw] || pickFirst(value);
};

const normalizeImageUrl = (url?: string | null) => {
  let raw = String(url || '').trim();
  if (!raw) return null;
  if (raw.includes('api.dicebear.com') && raw.includes('/svg')) raw = raw.replace('/svg', '/png');
  if (raw.startsWith('http')) return raw;
  return `https://painel.dasheep.com.br${raw.startsWith('/') ? '' : '/'}${raw}`;
};

const getEndereco = (obj: any) => {
  const custom = safeParseJson(obj?.custom_data || obj?.customData, {});
  const direct = pickFirst(obj?.endereco_completo, obj?.enderecoCompleto, custom?.endereco_completo);
  if (direct) return direct;

  const rua = pickFirst(obj?.logradouro, obj?.rua, custom?.logradouro, custom?.rua);
  const numero = pickFirst(obj?.numero, custom?.numero);
  const compl = pickFirst(obj?.complemento, custom?.complemento);
  const bairro = pickFirst(obj?.bairro, custom?.bairro);
  const cidade = pickFirst(obj?.cidade, obj?.city, custom?.cidade, custom?.city);
  const uf = pickFirst(obj?.estado, obj?.uf, obj?.state, custom?.estado, custom?.uf, custom?.state);
  const cep = pickFirst(obj?.cep, obj?.zip, obj?.zipcode, custom?.cep);

  const linha1 = [rua, numero].filter(Boolean).join(', ');
  const linha2 = [compl, bairro].filter(Boolean).join(' · ');
  const linha3 = [cidade, uf].filter(Boolean).join(' / ');
  return [linha1, linha2, linha3, cep].filter(Boolean).join('\n') || null;
};

const getCidadeUf = (obj: any) => {
  const custom = safeParseJson(obj?.custom_data || obj?.customData, {});
  const cidade = pickFirst(obj?.cidade, obj?.city, custom?.cidade, custom?.city);
  const uf = pickFirst(obj?.estado, obj?.uf, obj?.state, custom?.estado, custom?.uf);
  return [cidade, uf].filter(Boolean).join(' / ') || null;
};

const getProjectId = (user: any) =>
  user?.allowed_project_ids?.[0] ||
  user?.allowedProjectIds?.[0] ||
  user?.projectId ||
  user?.project_id ||
  user?.projeto_id ||
  null;

const normalizeArray = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    } catch {}

    return trimmed
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((item) => item.replace(/^"|"$/g, '').trim())
      .filter(Boolean);
  }

  return [];
};

const getCurrentUserId = (user: any) => String(user?.id || user?.usuario_id || user?.user_id || '').trim();

const safeQuery = async (db: any, sql: string, params: any[] = []) => {
  try {
    return (await db.getAllAsync(sql, params)) as any[];
  } catch {
    return [];
  }
};

const readTableIfExists = async (db: any, tableName: string) => {
  const exists = await safeQuery(db, `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [tableName]);
  if (!exists.length) return [];
  return safeQuery(db, `SELECT * FROM ${tableName}`);
};

const getStoreName = (row: any, raw: any = {}) =>
  pickFirst(row?.nome, row?.loja_nome, row?.lojaNome, row?.storeName, raw?.nome, raw?.loja_nome, raw?.lojaNome, raw?.storeName);

const getStoreDetail = (row: any, raw: any = {}) => {
  const rede = pickFirst(row?.rede, raw?.rede, row?.network, raw?.network);
  const cidade = pickFirst(row?.cidade, raw?.cidade, row?.city, raw?.city);
  const uf = pickFirst(row?.estado, row?.uf, raw?.estado, raw?.uf);
  return [rede, [cidade, uf].filter(Boolean).join(' / ')].filter(Boolean).join(' · ') || null;
};

export default function PerfilUsuarioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const { theme, language, accentColor } = useSettingsStore();
  const syncStore = useSyncStore() as any;
  const syncing = !!(syncStore?.syncing || syncStore?.isSyncing);
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

  const customData = useMemo(() => safeParseJson(user?.custom_data || user?.customData, {}), [user]);

  const base = useMemo(() => {
    return {
      nome: pickFirst(user?.nome, user?.name, user?.displayName) || profileText('userFallback', language),
      email: pickFirst(user?.email, user?.mail, user?.login, user?.username) || profileText('emailNotInformed', language),
      telefone: pickFirst(user?.telefone, user?.phone, user?.celular, customData?.telefone, customData?.celular),
      cargo: pickFirst(user?.cargo, user?.roleName, user?.role?.name, user?.role) || profileText('worker', language),
      empresa: cleanName(pickFirst(user?.client?.name, user?.clientName, user?.empresa_nome, user?.companyName, customData?.empresa_nome)),
      projeto: cleanName(pickFirst(user?.project?.name, user?.projectName, user?.project_name, user?.projetoNome, user?.projeto_nome, customData?.project_name), profileText('linkedProject', language)),
      supervisor: pickFirst(user?.supervisor?.nome, user?.supervisor_nome, user?.supervisorNome, user?.gestor_nome, customData?.supervisor_nome),
      endereco: getEndereco(user),
      cidadeUf: getCidadeUf(user),
      transporte: formatTransport(pickFirst(user?.modo_transporte, user?.modoTransporte, customData?.modo_transporte), language),
    };
  }, [user, customData, language]);

  const avatarUrl = normalizeImageUrl(
    user?.foto_url ||
      user?.fotoUrl ||
      user?.avatar ||
      user?.foto ||
      user?.imageUrl ||
      user?.profileImage ||
      user?.avatarUrl ||
      customData?.avatar_url ||
      customData?.foto_url ||
      customData?.foto ||
      customData?.imageUrl
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [empresa, setEmpresa] = useState<string | null>(base.empresa);
  const [projeto, setProjeto] = useState<string | null>(base.projeto);
  const [supervisor, setSupervisor] = useState<string | null>(base.supervisor);
  const [endereco, setEndereco] = useState<string | null>(base.endereco);
  const [transporte, setTransporte] = useState<string | null>(base.transporte);
  const [lojas, setLojas] = useState<LojaPerfil[]>([]);
  const [gps, setGps] = useState(profileText('checking', language));
  const [internet, setInternet] = useState(profileText('checking', language));
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const version =
    Constants?.expoConfig?.version ||
    Constants?.manifest?.version ||
    Constants?.nativeAppVersion ||
    profileText('versionNotInformed', language);

  const loadChecks = async () => {
    try {
      const net = await Network.getNetworkStateAsync();

      if (net?.isConnected && net?.isInternetReachable !== false) {
        setInternet(profileText('connected', language));
      } else {
        setInternet(profileText('offline', language));
      }
    } catch {
      setInternet(profileText('notChecked', language));
    }

    try {
      const gpsOn = await Location.hasServicesEnabledAsync();
      setGps(gpsOn ? profileText('active', language) : profileText('inactive', language));
    } catch {
      setGps(profileText('notChecked', language));
    }
  };

  useEffect(() => {
    loadChecks();

    checkTimerRef.current = setInterval(() => {
      loadChecks();
    }, 8000);

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasInactive = appStateRef.current.match(/inactive|background/);
      const isActiveNow = nextState === 'active';

      appStateRef.current = nextState;

      if (wasInactive && isActiveNow) {
        loadChecks();
      }
    });

    return () => {
      if (checkTimerRef.current) {
        clearInterval(checkTimerRef.current);
        checkTimerRef.current = null;
      }

      subscription.remove();
    };
  }, [language]);

  const loadProfile = async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      const db = await getDBConnection();

      const currentUserId = getCurrentUserId(user);
      const userProjectId = String(getProjectId(user) || '').trim();

      const [usuarios, projects, clients, lojasTable, visits] = await Promise.all([
        readTableIfExists(db, 'usuarios'),
        readTableIfExists(db, 'projects'),
        readTableIfExists(db, 'clients'),
        readTableIfExists(db, 'lojas'),
        safeQuery(db, `SELECT * FROM visits LIMIT 150`),
      ]);

      const getPerfilFromVisits = () => {
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

          if (perfil) return perfil;
        }

        return null;
      };

      let perfilFromVisit = getPerfilFromVisits();
      let perfilFromApi: any = null;

      // Se o SQLite ainda está vazio, busca a nova rota diretamente.
      // Isso evita depender da próxima sync salvar profile em tabelas locais.
      if (!perfilFromVisit && currentUserId && userProjectId) {
        try {
          const res = await api(`/meu-roteiro?promotorId=${encodeURIComponent(currentUserId)}&projectId=${encodeURIComponent(userProjectId)}&t=${Date.now()}`, {
            method: 'GET',
          });

          if (res.ok) {
            const payload = await res.json();

            perfilFromApi =
              payload?.profile ||
              {
                usuario: payload?.usuario || null,
                supervisor: payload?.supervisor || null,
                project: payload?.project || payload?.projeto || null,
                client: payload?.client || payload?.cliente || null,
                lojasResponsaveis: payload?.lojasResponsaveis || payload?.lojas_responsaveis || [],
              };

            if (perfilFromApi?.usuario || perfilFromApi?.project || perfilFromApi?.client || perfilFromApi?.lojasResponsaveis?.length) {
              perfilFromVisit = perfilFromApi;
            }
          }
        } catch {}
      }

      const perfilUsuario = perfilFromVisit?.usuario || perfilFromVisit?.user || null;
      const perfilSupervisor = perfilFromVisit?.supervisor || null;
      const perfilProject = perfilFromVisit?.project || perfilFromVisit?.projeto || null;
      const perfilClient = perfilFromVisit?.client || perfilFromVisit?.cliente || null;
      const perfilLojas = Array.isArray(perfilFromVisit?.lojasResponsaveis)
        ? perfilFromVisit.lojasResponsaveis
        : Array.isArray(perfilFromVisit?.lojas_responsaveis)
          ? perfilFromVisit.lojas_responsaveis
          : [];

      const usuarioDb =
        perfilUsuario ||
        usuarios.find((row) => String(row?.id || '').trim() === currentUserId) ||
        usuarios.find((row) => String(row?.email || '').trim().toLowerCase() === String(base.email || '').trim().toLowerCase()) ||
        null;

      const allowedProjectIds = [
        ...normalizeArray(usuarioDb?.allowed_project_ids),
        ...normalizeArray(user?.allowed_project_ids),
        ...normalizeArray(user?.allowedProjectIds),
        userProjectId,
      ].filter(Boolean);

      const projectId = allowedProjectIds[0] || userProjectId;

      const projectRow =
        perfilProject ||
        projects.find((row) => String(row?.id || '').trim() === String(projectId || '').trim()) ||
        null;

      const clientId = String(projectRow?.clientId || projectRow?.client_id || usuarioDb?.clientId || usuarioDb?.client_id || user?.clientId || user?.client_id || '').trim();

      const clientRow =
        perfilClient ||
        clients.find((row) => String(row?.id || '').trim() === clientId) ||
        null;

      const supervisorId = String(usuarioDb?.supervisor_id || user?.supervisor_id || user?.supervisorId || '').trim();

      const supervisorRow =
        perfilSupervisor ||
        usuarios.find((row) => String(row?.id || '').trim() === supervisorId) ||
        null;

      const firstVisit = visits
        .map((visit) => ({
          visit,
          raw: safeParseJson(visit?.visit_raw_json || visit?.raw_json || visit?.project_config_json, {}),
          loja: safeParseJson(visit?.loja_custom_data_json, {}),
        }))
        .find(Boolean);

      const raw = firstVisit?.raw || {};
      const loja = firstVisit?.loja || {};
      const visit = firstVisit?.visit || {};

      const resolvedEmpresa = cleanName(
        pickFirst(
          clientRow?.name,
          clientRow?.nome,
          user?.client?.name,
          base.empresa,
          raw?.client?.name,
          raw?.cliente_nome,
          raw?.empresa_nome,
          loja?.empresa_nome
        )
      );

      const resolvedProjeto = cleanName(
        pickFirst(
          projectRow?.name,
          projectRow?.nome,
          projectRow?.appName,
          base.projeto,
          raw?.project?.name,
          raw?.projeto?.nome,
          raw?.projectName,
          raw?.project_name,
          raw?.projetoNome,
          raw?.projeto_nome
        ),
        profileText('linkedProject', language)
      );

      const resolvedSupervisor = pickFirst(
        supervisorRow?.nome,
        supervisorRow?.name,
        supervisorRow?.email,
        user?.supervisor?.nome,
        base.supervisor,
        raw?.supervisor?.nome,
        raw?.supervisor_nome,
        raw?.gestor_nome,
        loja?.nome_supervisor
      );

      const resolvedEndereco = pickFirst(
        usuarioDb?.endereco_completo,
        usuarioDb?.enderecoCompleto,
        getEndereco(usuarioDb || {}),
        base.endereco,
        getEndereco(raw?.usuario || {}),
        getEndereco(visit),
        getEndereco(raw),
        getEndereco(loja),
        base.cidadeUf
      );

      const resolvedTransporte = pickFirst(
        formatTransport(usuarioDb?.modo_transporte, language),
        formatTransport(user?.modo_transporte || user?.modoTransporte, language),
        base.transporte,
        formatTransport(raw?.usuario?.modo_transporte || raw?.modo_transporte, language)
      );

      setEmpresa(resolvedEmpresa);
      setProjeto(resolvedProjeto);
      setSupervisor(resolvedSupervisor);
      setEndereco(resolvedEndereco);
      setTransporte(resolvedTransporte);

      const map = new Map<string, LojaPerfil>();

      perfilLojas.forEach((store: any, index: number) => {
        const nome = getStoreName(store, store);

        if (!nome) return;

        const id = String(store?.id || store?.loja_id || nome || index);

        map.set(id, {
          id,
          nome,
          detalhe: getStoreDetail(store, store) || store?.endereco || null,
        });
      });

      if (map.size === 0) {
        const lojasDoResponsavel = lojasTable.filter((store) => {
          const responsavelId = String(store?.responsavel_id || store?.responsavelId || '').trim();

          if (responsavelId && currentUserId && responsavelId === currentUserId) return true;

          const rawStore = safeParseJson(store?.raw_json || store?.custom_data || store?.loja_custom_data_json, {});
          const rawResponsavelId = String(rawStore?.responsavel_id || rawStore?.responsavelId || '').trim();

          if (rawResponsavelId && currentUserId && rawResponsavelId === currentUserId) return true;

          return false;
        });

        lojasDoResponsavel.forEach((store: any, index: number) => {
          const rawStore = safeParseJson(store?.raw_json || store?.custom_data || store?.loja_custom_data_json, {});
          const nome = getStoreName(store, rawStore);

          if (!nome) return;

          const id = String(store?.id || store?.loja_id || nome || index);

          map.set(id, {
            id,
            nome,
            detalhe: getStoreDetail(store, rawStore),
          });
        });
      }

      if (map.size === 0) {
        visits.forEach((row, index) => {
          const rawVisit = safeParseJson(row?.visit_raw_json || row?.raw_json || row?.project_config_json, {});
          const rawStore = safeParseJson(row?.loja_custom_data_json, {});
          const nome = getStoreName(row, rawVisit) || getStoreName(rawStore, rawStore);

          if (!nome) return;

          const id = String(row?.loja_id || rawVisit?.loja_id || rawVisit?.lojaId || nome || index);

          map.set(id, {
            id,
            nome,
            detalhe: getStoreDetail(row, rawVisit) || getStoreDetail(rawStore, rawStore),
          });
        });
      }

      setLojas(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 20));


      await loadChecks();
    } catch {
      await loadChecks();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [base.projeto, base.empresa, base.supervisor, syncing, lastSync, language])
  );

  const refresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
    } catch {}

    await loadProfile(true);
  };

  const miniLine = (value: any, Icon: any) => {
    if (!value) return null;

    return (
      <View style={styles.miniLine}>
        <Icon size={17} color={textSecondary} />
        <Text style={[styles.miniText, { color: textSecondary }]} numberOfLines={1}>
          {String(value)}
        </Text>
      </View>
    );
  };

  const infoItem = (label: string, value: any, Icon: any, color: string, multiline = false) => (
    <View style={[styles.infoItem, { borderBottomColor: border }]}>
      <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.infoLabel, { color: textSecondary }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: textPrimary }]} numberOfLines={multiline ? 4 : 2}>
          {value || profileText('notInformed', language)}
        </Text>
      </View>
      <ChevronRight size={18} color={textSecondary} />
    </View>
  );

  const storeItem = (store: LojaPerfil) => (
    <View key={store.id} style={[styles.storeItem, { backgroundColor: soft, borderColor: border }]}>
      <View style={[styles.storeIcon, { backgroundColor: `${accent}24` }]}>
        <Store size={18} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.storeName, { color: textPrimary }]} numberOfLines={1}>
          {store.nome}
        </Text>
        {store.detalhe ? (
          <Text style={[styles.storeDetail, { color: textSecondary }]} numberOfLines={1}>
            {store.detalhe}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={textSecondary} />
    </View>
  );

  const checkItem = (label: string, value: string, Icon: any, color: string) => (
    <View style={[styles.checkItem, { backgroundColor: soft, borderColor: border }]}>
      <Icon size={24} color={color} />
      <Text style={[styles.checkLabel, { color: textSecondary }]}>{label}</Text>
      <Text style={[styles.checkValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.loading}>
          <ActivityIndicator color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>{profileText('loading', language)}</Text>
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
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{profileText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>{profileText('subtitle', language)}</Text>
          </View>

          <TouchableOpacity style={[styles.headerButton, { backgroundColor: surface, borderColor: border }]} onPress={refresh} activeOpacity={0.85}>
            <RefreshCw size={21} color={syncing || refreshing ? accent : textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.profileCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: accent, borderColor: `${accent}33` }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={[styles.avatarInitials, { color: accentText }]}>{initials(base.nome)}</Text>
              )}
            </View>
          </View>

          <View style={styles.profileDivider} />

          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: textPrimary }]} numberOfLines={1}>
              {shortName(base.nome, profileText('userFallback', language))}
            </Text>

            <Text style={[styles.role, { color: accent }]} numberOfLines={1}>
              {String(base.cargo || profileText('worker', language)).toUpperCase()}
            </Text>

            {miniLine(base.email, Mail)}
            {miniLine(base.telefone, Phone)}
            {miniLine(empresa, Building2)}
            {miniLine(projeto, Store)}
          </View>
        </View>

        <View style={[styles.compactCard, { backgroundColor: surface, borderColor: border }]}>
          {infoItem(profileText('supervisor', language), supervisor, UserRound, '#3B82F6')}
          {infoItem(profileText('transport', language), transporte, Car, '#06B6D4')}
          {infoItem(profileText('address', language), endereco, MapPin, '#3B82F6', true)}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{profileText('responsibleStores', language)}</Text>

          <View style={{ height: 14 }} />

          {lojas.length > 0 ? (
            lojas.map(storeItem)
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: soft, borderColor: border }]}>
              <Text style={[styles.emptyText, { color: textSecondary }]}>{profileText('noStores', language)}</Text>
            </View>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>{profileText('appChecklist', language)}</Text>

          <View style={{ height: 14 }} />

          <View style={styles.checkGrid}>
            {checkItem(profileText('gps', language), gps, Navigation, gps === profileText('active', language) ? '#22C55E' : '#F59E0B')}
            {checkItem(profileText('internet', language), internet, Wifi, internet === profileText('connected', language) ? '#22C55E' : '#F59E0B')}
            {checkItem(profileText('appVersion', language), String(version), Smartphone, '#60A5FA')}
            {checkItem(profileText('synchronization', language), syncing ? profileText('syncing', language) : lastSync ? profileText('upToDate', language) : profileText('pending', language), CalendarCheck2, lastSync ? '#22C55E' : accent)}
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
  pageTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  pageSubtitle: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  profileCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  avatarWrap: {
    width: 102,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    overflow: 'hidden',
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 86,
    height: 86,
    borderRadius: 43,
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '900',
  },
  profileDivider: {
    width: 1,
    height: 116,
    backgroundColor: 'rgba(148,163,184,0.22)',
    marginHorizontal: 18,
  },
  name: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  role: { fontSize: 12, fontWeight: '900', letterSpacing: 1.1, marginTop: 4, marginBottom: 14 },
  miniLine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  miniText: { fontSize: 14, fontWeight: '700', flex: 1 },
  compactCard: {
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  infoValue: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
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
  storeItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  storeIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: { fontSize: 15, fontWeight: '900' },
  storeDetail: { fontSize: 12, fontWeight: '700', marginTop: 3 },
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
  checkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  checkItem: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: { fontSize: 12, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  checkValue: { fontSize: 14, fontWeight: '900', marginTop: 3, textAlign: 'center' },
});
