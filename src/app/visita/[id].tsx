import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { persistVisitPhotoLocally } from '../../services/mobileAwsUploadService';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  MapPin,
  ArrowLeft,
  Clock,
  AlertTriangle,
  LogIn,
  ClipboardCheck,
  ChevronRight,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Navigation,
} from 'lucide-react-native';
import MapView, { Marker } from 'react-native-maps';
import { addAppLog, getDBConnection } from '../../database/db';
import { getSmartLocation, getDistanceInMeters } from '../../services/locationService';
import { getStatusColors } from '../../utils/statusUtils';
import { useSettingsStore } from '../../store/useSettingsStore';
import { i18n } from '../../utils/i18n';
import { addToSyncQueue } from '../../services/syncService';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';

// ============================================================================
// 🎯 MOTOR DE ESTILO DE STORE INSIGHTS
// ============================================================================
const priorityMapping: Record<string, any> = {
  ALTA: { color: '#EF4444', icon: AlertCircle, label: i18n.t('priorityHigh') },
  MEDIA: { color: '#F59E0B', icon: AlertCircle, label: i18n.t('priorityMedium') },
  BAIXA: { color: '#3B82F6', icon: AlertCircle, label: i18n.t('priorityLow') },
};

const hasGoogleMapsApiKey = () => {
  const extra = (Constants?.expoConfig?.extra || Constants?.manifest?.extra || {}) as any;
  return Boolean(extra?.googleMapsAndroidApiKey || extra?.googleMapsApiKey);
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



const parseAddressGpsConfig = (endereco: any) => {
  const rawAddress = String(endereco || '');
  const cfgMatch = rawAddress.match(/\|CFG:(.*?)\|/);

  if (!cfgMatch?.[1]) {
    return {
      hasAddressConfig: false,
      enderecoVisivel: rawAddress,
      lojaLatConfig: null as number | null,
      lojaLngConfig: null as number | null,
      gpsRadius: null as number | null,
      checkinPolicy: null as string | null,
      forceLiveCamera: false,
      watermarkPhotos: false,
      reqPhotoCheckin: false,
      reqPhotoCheckout: false,
      reqPhotoJustify: false,
    };
  }

  const parts = cfgMatch[1].split(',');
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  const radius = parseInt(parts[2], 10);

  return {
    hasAddressConfig: true,
    enderecoVisivel: rawAddress.split(' |CFG:')[0].replace(/\|$/, '').trim(),
    lojaLatConfig: Number.isFinite(lat) ? lat : null,
    lojaLngConfig: Number.isFinite(lng) ? lng : null,
    gpsRadius: Number.isFinite(radius) && radius > 0 ? radius : 50,
    checkinPolicy: String(parts[3] || 'warning').trim().toLowerCase(),
    forceLiveCamera: parts[4] === '1',
    watermarkPhotos: parts[5] === '1',
    reqPhotoCheckin: parts[6] === '1',
    reqPhotoCheckout: parts[7] === '1',
    reqPhotoJustify: parts[8] === '1',
  };
};

const firstFilled = (...values: any[]) => {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return null;
};


const DEBUG_GPS_CHECKIN = false;

const gpsDebug = (step: string, payload?: any) => {
  if (!DEBUG_GPS_CHECKIN || !__DEV__) return;

  try {
    console.log(`[GPS CHECKIN][${step}]`, payload ?? '');
  } catch {
    console.log(`[GPS CHECKIN][${step}]`);
  }
};

const getBackendGpsPolicy = (visit: any, config: any) => {
  // Compatibilidade com o app antigo:
  // a rota/snapshot mobile embute a configuração GPS no endereço como:
  // |CFG:lat,lng,raio,politicaGps,forceCamera,watermark,reqCheckin,reqCheckout,reqJustify|
  const addressConfig = parseAddressGpsConfig(visit?.endereco);

  const rawPolicy = String(
    firstFilled(
      addressConfig.checkinPolicy,
      config?.checkinPolicy,
      config?.project?.checkinPolicy,
      config?.perfil_mobile?.project?.checkinPolicy,
      visit?.checkinPolicy,
      config?.checkin_policy,
      config?.project?.checkin_policy,
      config?.perfil_mobile?.project?.checkin_policy,
      visit?.checkin_policy,
      'warning'
    )
  )
    .trim()
    .toLowerCase();

  const radiusValue = Number(
    firstFilled(
      addressConfig.gpsRadius,
      config?.gpsRadius,
      config?.project?.gpsRadius,
      config?.perfil_mobile?.project?.gpsRadius,
      visit?.gpsRadius,
      config?.gps_radius,
      config?.project?.gps_radius,
      config?.perfil_mobile?.project?.gps_radius,
      visit?.gps_radius,
      50
    )
  );

  const gpsRadius = Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : 50;

  const resolvedPolicy = {
    checkinPolicy: rawPolicy,
    gpsRadius,
    shouldValidate: rawPolicy !== 'none',
    shouldBlock: rawPolicy === 'strict' || rawPolicy === 'block',
    shouldWarn: rawPolicy === 'warning' || rawPolicy === 'aviso',
    addressConfig,
  };

  gpsDebug('policy-resolved', {
    rawPolicy,
    gpsRadius,
    resolvedPolicy,
    addressHasConfig: addressConfig.hasAddressConfig,
    addressCheckinPolicy: addressConfig.checkinPolicy,
    addressGpsRadius: addressConfig.gpsRadius,
    addressLojaLatConfig: addressConfig.lojaLatConfig,
    addressLojaLngConfig: addressConfig.lojaLngConfig,
    configCheckinPolicy: config?.checkinPolicy,
    configGpsRadius: config?.gpsRadius,
    configProjectCheckinPolicy: config?.project?.checkinPolicy,
    configProjectGpsRadius: config?.project?.gpsRadius,
    perfilMobileProjectCheckinPolicy: config?.perfil_mobile?.project?.checkinPolicy,
    perfilMobileProjectGpsRadius: config?.perfil_mobile?.project?.gpsRadius,
    visitCheckinPolicy: visit?.checkinPolicy,
    visitGpsRadius: visit?.gpsRadius,
    legacyConfigCheckinPolicy: config?.checkin_policy,
    legacyConfigGpsRadius: config?.gps_radius,
    legacyVisitCheckinPolicy: visit?.checkin_policy,
    legacyVisitGpsRadius: visit?.gps_radius,
  });

  return resolvedPolicy;
};

type VisitAction = 'CHECKIN' | 'CHECKOUT' | 'JUSTIFICAR';

const truthyConfig = (value: any) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return value === true || value === 1 || normalized === '1' || normalized === 'true' || normalized === 'sim' || normalized === 'yes' || normalized === 'required';
};

const falseyConfig = (value: any) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return value === false || value === 0 || normalized === '0' || normalized === 'false' || normalized === 'nao' || normalized === 'não' || normalized === 'no' || normalized === 'disabled';
};

const normalizePhotoOrientation = (value: any) => {
  const normalized = String(value || 'ANY').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (['HORIZONTAL', 'LANDSCAPE', 'PAISAGEM'].includes(normalized)) return 'HORIZONTAL';
  if (['VERTICAL', 'PORTRAIT', 'RETRATO'].includes(normalized)) return 'VERTICAL';
  return 'ANY';
};

const getPhotoRequirementPolicy = (visit: any, config: any, action: VisitAction) => {
  const addressConfig = parseAddressGpsConfig(visit?.endereco);
  const project = config?.project || {};
  const perfilProject = config?.perfil_mobile?.project || {};
  const actionLower = action.toLowerCase();

  const requirePhoto = action === 'CHECKIN'
    ? truthyConfig(firstFilled(addressConfig.reqPhotoCheckin, config?.reqPhotoCheckin, config?.requirePhotoCheckin, config?.checkinPhotoRequired, config?.exigirFotoEntrada, project?.reqPhotoCheckin, project?.requirePhotoCheckin, perfilProject?.reqPhotoCheckin, perfilProject?.requirePhotoCheckin, visit?.reqPhotoCheckin, visit?.requirePhotoCheckin))
    : action === 'CHECKOUT'
      ? truthyConfig(firstFilled(addressConfig.reqPhotoCheckout, config?.reqPhotoCheckout, config?.requirePhotoCheckout, config?.checkoutPhotoRequired, config?.exigirFotoSaida, project?.reqPhotoCheckout, project?.requirePhotoCheckout, perfilProject?.reqPhotoCheckout, perfilProject?.requirePhotoCheckout, visit?.reqPhotoCheckout, visit?.requirePhotoCheckout))
      : truthyConfig(firstFilled(addressConfig.reqPhotoJustify, config?.reqPhotoJustify, config?.requirePhotoJustify, config?.justifyPhotoRequired, config?.exigirFotoJustificativa, project?.reqPhotoJustify, project?.requirePhotoJustify, perfilProject?.reqPhotoJustify, perfilProject?.requirePhotoJustify, visit?.reqPhotoJustify, visit?.requirePhotoJustify));

  const forceLiveCamera = truthyConfig(firstFilled(addressConfig.forceLiveCamera, config?.forceLiveCamera, config?.force_live_camera, config?.blockGallery, config?.disableGallery, config?.bloquearGaleria, project?.forceLiveCamera, project?.blockGallery, project?.disableGallery, perfilProject?.forceLiveCamera, perfilProject?.blockGallery, perfilProject?.disableGallery, visit?.forceLiveCamera, visit?.blockGallery, visit?.disableGallery));

  const explicitAllowGallery = firstFilled(config?.allowGallery, config?.allow_gallery, config?.permitirGaleria, project?.allowGallery, project?.allow_gallery, perfilProject?.allowGallery, perfilProject?.allow_gallery, visit?.allowGallery, visit?.allow_gallery);
  const allowGallery = forceLiveCamera ? false : explicitAllowGallery === null ? true : !falseyConfig(explicitAllowGallery);

  const orientation = normalizePhotoOrientation(firstFilled(config?.[`${actionLower}PhotoOrientation`], config?.[`${actionLower}_photo_orientation`], config?.photoOrientation, config?.photo_orientation, project?.[`${actionLower}PhotoOrientation`], project?.photoOrientation, perfilProject?.[`${actionLower}PhotoOrientation`], perfilProject?.photoOrientation, visit?.[`${actionLower}PhotoOrientation`], visit?.photoOrientation));

  return { requirePhoto, allowGallery, forceLiveCamera, orientation, addressConfig };
};

const getPhotoFieldByAction = (action: VisitAction) => {
  if (action === 'CHECKIN') return 'foto_checkin_url';
  if (action === 'CHECKOUT') return 'foto_checkout_url';
  return 'foto_justificativa_url';
};

const getPhotoLabelByAction = (action: VisitAction) => {
  if (action === 'CHECKIN') return 'entrada';
  if (action === 'CHECKOUT') return 'saída';
  return 'justificativa';
};

const validatePhotoOrientation = (asset: any, expected: string) => {
  if (!asset?.width || !asset?.height || expected === 'ANY') return true;
  if (expected === 'HORIZONTAL') return Number(asset.width) >= Number(asset.height);
  if (expected === 'VERTICAL') return Number(asset.height) >= Number(asset.width);
  return true;
};

const normalizeStatus = (status: any) => {
  const s = String(status || 'PENDENTE').toUpperCase();

  if (s === 'AGENDADA') return 'PENDENTE';
  if (s === 'COMPLETA' || s === 'CONCLUIDA' || s === 'VISITADA') return 'REALIZADA';

  return s;
};

const isDoneStatus = (status: any) => {
  return ['REALIZADA', 'COMPLETA', 'CONCLUIDA', 'VISITADA', 'JUSTIFICADA'].includes(
    String(status || '').toUpperCase()
  );
};

const getLocalISO = () => {
  // Mantém ISO para backend, mas gerado uma única vez por ação.
  return new Date().toISOString();
};

const limparEndereco = (rawVal: any) => {
  if (!rawVal || rawVal === 'undefined' || rawVal === 'null') return 'Endereço não informado';

  const parsed = parseAddressGpsConfig(rawVal);
  if (parsed.hasAddressConfig && parsed.enderecoVisivel) return parsed.enderecoVisivel;

  let str = String(rawVal).trim();

  if (str.includes('|CFG')) str = str.split('|CFG')[0];

  return str.replace(/\|$/, '').trim();
};

const formatTime = (dateValue?: string | null) => {
  if (!dateValue) return '--:--';

  try {
    const d = new Date(dateValue);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
};

const buildOperationId = (visitId: string, action: string) => {
  return `${action.toLowerCase()}_${visitId}_${Date.now()}`;
};

const tableExists = async (db: any, tableName: string) => {
  try {
    const result: any = await db.getFirstAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      [tableName]
    );
    return !!result;
  } catch {
    return false;
  }
};

const getVisitIdentifierCandidates = (visit: any) => {
  const candidates = [
    visit?.id,
    visit?.visita_id,
    visit?.visitaId,
    visit?.visita_agendada_id,
    visit?.visitaAgendadaId,
    visit?.visita_id_json,
    visit?.visitaIdJson,
    visit?.registro_visita_id,
    visit?.registroVisitaId,
    visit?.registro_id,
    visit?.registroId,
  ];

  return Array.from(new Set(
    candidates
      .map((value) => String(value ?? '').trim())
      .filter((value) => value && value !== 'null' && value !== 'undefined')
  ));
};

const getSurveyIdFromAnyPayload = (payload: any) => firstFilled(
  payload?.pesquisa_id,
  payload?.pesquisaId,
  payload?.surveyId,
  payload?.survey_id,
  payload?.formularioId,
  payload?.formulario_id,
  payload?.id
);

const hasExplicitSurveyCompletionState = (survey: any) => (
  survey && (
    survey.concluida !== undefined ||
    survey.concluido !== undefined ||
    survey.completed !== undefined ||
    survey.realizada !== undefined ||
    survey.respondida !== undefined ||
    survey.respondidaOnline !== undefined ||
    survey.hasColeta !== undefined ||
    survey.has_collection !== undefined ||
    survey.statusOnline !== undefined ||
    survey.coletaId !== undefined ||
    survey.coleta_id !== undefined
  )
);

const getSurveyCompletedFlag = (survey: any) => truthyConfig(
  firstFilled(
    survey?.concluida,
    survey?.concluido,
    survey?.completed,
    survey?.realizada,
    survey?.respondida,
    survey?.respondidaOnline,
    survey?.hasColeta,
    survey?.has_collection
  )
);

const getSurveyServerStateUpdatedAt = (survey: any, visit: any) => firstFilled(
  survey?.serverStateUpdatedAt,
  survey?.server_state_updated_at,
  survey?.coletaUpdatedAt,
  survey?.coleta_updated_at,
  survey?.updated_at,
  survey?.updatedAt,
  // Importante: NÃO usar visit.updated_at aqui.
  // visits.updated_at muda quando a coleta é finalizada localmente.
  // Se esse timestamp for tratado como estado do servidor, a pesquisa recém-concluída
  // pode ser considerada pendente de novo.
  visit?.coletas_sync_updated_at,
  visit?.coletasSyncUpdatedAt
);

const toTimestamp = (value: any) => {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const getLocalCollectionTimestamp = (row: any) => {
  const raw = safeParseJson(row?.raw_json, {});
  return toTimestamp(firstFilled(row?.data_fim, row?.data_inicio, row?.updated_at, row?.updatedAt, raw?.data_fim, raw?.data_inicio, raw?.updated_at, raw?.updatedAt));
};

const getCompletedSurveyIdsForVisit = async (db: any, visit: any) => {
  const completed = new Set<string>();
  const serverStates = new Map<string, { explicit: boolean; completed: boolean; updatedAt: number }>();

  const parsedSurveyPayload = safeParseJson(visit?.pesquisa_json || visit?.pesquisaJson || visit?.pesquisas, []);
  if (Array.isArray(parsedSurveyPayload)) {
    parsedSurveyPayload.forEach((survey: any) => {
      const surveyId = getSurveyIdFromAnyPayload(survey);
      if (!surveyId) return;

      const explicit = hasExplicitSurveyCompletionState(survey);
      const isCompleted = explicit ? getSurveyCompletedFlag(survey) : false;
      const updatedAt = toTimestamp(getSurveyServerStateUpdatedAt(survey, visit));

      if (explicit) {
        serverStates.set(String(surveyId), { explicit, completed: isCompleted, updatedAt });
        if (isCompleted) completed.add(String(surveyId));
      }
    });
  }

  // Compatibilidade com payloads antigos: só usa coletas embutidas se a pesquisa
  // ainda não tiver um estado autoritativo vindo do servidor. Se o backend já disse
  // que ela está pendente, uma coleta antiga em cache não pode marcar como concluída.
  const parsedVisitCollections = safeParseJson(visit?.coletas || visit?.coletas_json || visit?.collections, []);
  if (Array.isArray(parsedVisitCollections)) {
    parsedVisitCollections.forEach((collection: any) => {
      const surveyId = getSurveyIdFromAnyPayload(collection);
      if (!surveyId || serverStates.has(String(surveyId))) return;
      completed.add(String(surveyId));
    });
  }

  try {
    if (!(await tableExists(db, 'coletas'))) return completed;

    const visitIds = getVisitIdentifierCandidates(visit);
    if (visitIds.length === 0) return completed;

    const placeholders = visitIds.map(() => '?').join(',');

    // Só consideramos coletas locais ainda pendentes de sync.
    // Se o servidor já mandou um estado pendente mais recente, ele vence e a coleta local antiga é ignorada.
    const rows = await db.getAllAsync<any>(
      `SELECT pesquisa_id, raw_json, status, pending_sync, data_inicio, data_fim, updated_at FROM coletas WHERE visita_id IN (${placeholders}) AND COALESCE(pending_sync, 0) = 1`,
      visitIds
    );

    (rows || []).forEach((row: any) => {
      const raw = safeParseJson(row?.raw_json, {});
      const surveyId = String(getSurveyIdFromAnyPayload(row) || getSurveyIdFromAnyPayload(raw) || '');
      if (!surveyId) return;

      const serverState = serverStates.get(surveyId);
      const localUpdatedAt = getLocalCollectionTimestamp(row);

      if (serverState?.explicit && !serverState.completed && serverState.updatedAt >= localUpdatedAt) {
        completed.delete(surveyId);
        return;
      }

      completed.add(surveyId);
    });
  } catch {}

  return completed;
};

const getOpenVisitDifferentFromCurrent = async (db: any, currentVisitId: string) => {
  try {
    const openVisit: any = await db.getFirstAsync(
      `
        SELECT id, loja_nome, status, checkin_at
        FROM visits
        WHERE id <> ?
        AND UPPER(COALESCE(status, '')) IN ('EM_ANDAMENTO', 'INICIADA')
        AND checkin_at IS NOT NULL
        AND checkout_at IS NULL
        ORDER BY datetime(checkin_at) DESC
        LIMIT 1
      `,
      [String(currentVisitId)]
    );

    return openVisit || null;
  } catch {
    return null;
  }
};

type JustificativaOption = {
  id: string;
  descricao: string;
};

export default function VisitaDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { theme } = useSettingsStore();
  const { user, token } = useAuthStore();
  const { isSyncing, lastSync } = useSyncStore();

  const isDark = theme === 'dark';
  const canRenderMap = hasGoogleMapsApiKey();

  const [visita, setVisita] = useState<any>(null);
  const [tarefasRenderizadas, setTarefasRenderizadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [justifyLoading, setJustifyLoading] = useState(false);
  const [justifyModalVisible, setJustifyModalVisible] = useState(false);
  const [justificativas, setJustificativas] = useState<JustificativaOption[]>([]);
  const [selectedJustificativaId, setSelectedJustificativaId] = useState<string | null>(null);
  const [detalheJustificativa, setDetalheJustificativa] = useState('');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // =========================================================================
  // 🎯 SISTEMA DE MODAL CUSTOMIZADO
  // =========================================================================
  const [customAlert, setCustomAlert] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'warning' | 'error' | 'info',
    primaryText: 'OK',
    primaryAction: null as any,
    secondaryText: '',
    secondaryAction: null as any,
  });

  const showCustomAlert = (
    title: string,
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info',
    primaryText = 'OK',
    primaryAction: any = null,
    secondaryText = '',
    secondaryAction: any = null
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
      primaryText,
      primaryAction,
      secondaryText,
      secondaryAction,
    });
  };

  const hideCustomAlert = () => setCustomAlert((prev) => ({ ...prev, visible: false }));

  const bg = isDark ? '#0B0F19' : '#F4F7FC';
  const cardBg = isDark ? '#151A27' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#1E293B';
  const textSecondary = isDark ? '#8F9BB3' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';

  const colorCheckin = '#10B981';
  const colorJustify = '#F59E0B';
  const colorCheckout = '#EF4444';

  useFocusEffect(
    useCallback(() => {
      carregarDadosCompletos();
      carregarJustificativas();
      obterLocalizacaoInicial();
    }, [id])
  );

  useEffect(() => {
    // Quando a sincronização atualiza o SQLite, a tela aberta não perde foco.
    // Sem este reload, os cards de tarefas continuam usando o estado antigo em memória
    // até fechar/reabrir a tela ou reiniciar o app.
    if (!id || loading || isSyncing) return;

    carregarDadosCompletos();
  }, [id, isSyncing, lastSync]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let running = false;

      const reloadFromLocalDb = async () => {
        if (cancelled || running || !id || checkinLoading || checkoutLoading || justifyLoading) return;
        running = true;
        try {
          await carregarDadosCompletos();
        } finally {
          running = false;
        }
      };

      const timer = setInterval(reloadFromLocalDb, 2500);

      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [id, checkinLoading, checkoutLoading, justifyLoading])
  );

  useEffect(() => {
    if (visita && userLocation && mapRef.current) {
      const config = safeParseJson(visita.project_config_json, {});
      const addressConfig = parseAddressGpsConfig(visita.endereco);
      const lojaLat = parseFloat(String(addressConfig.lojaLatConfig ?? config.loja_lat ?? visita.latitude ?? 0));
      const lojaLng = parseFloat(String(addressConfig.lojaLngConfig ?? config.loja_lng ?? visita.longitude ?? 0));

      if (lojaLat !== 0 && lojaLng !== 0) {
        setTimeout(() => {
          ajustarZoomMapa(lojaLat, lojaLng);
        }, 600);
      }
    }
  }, [userLocation, visita]);

  const carregarJustificativas = async () => {
    try {
      const db = await getDBConnection();

      const possibleTables = ['justificativas', 'absence_justifications', 'justificativas_ausencia'];
      let rows: any[] = [];

      for (const table of possibleTables) {
        if (await tableExists(db, table)) {
          try {
            rows = await db.getAllAsync(`SELECT * FROM ${table}`);
            if (rows.length > 0) break;
          } catch {}
        }
      }

      const mapped = rows
        .map((row: any) => ({
          id: String(row.id || row.codigo || row.descricao || row.description),
          descricao: String(row.descricao || row.description || row.nome || row.name || ''),
        }))
        .filter((item) => item.id && item.descricao);

      if (mapped.length > 0) {
        setJustificativas(mapped);
        return;
      }
    } catch {}

    // Fallback para não deixar o promotor travado caso o sync ainda não baixe as justificativas.
    setJustificativas([
      { id: 'loja_fechada', descricao: 'Loja Fechada' },
      { id: 'demandas_extras', descricao: 'Demandas Extras' },
      { id: 'outro', descricao: 'Outro (Justifique)' },
    ]);
  };

  const carregarDadosCompletos = async () => {
    try {
      const db = await getDBConnection();
      let tarefasConsolidadas: any[] = [];
      let completedSurveyIds = new Set<string>();

      const resultVisita = await db.getFirstAsync<any>(`SELECT * FROM visits WHERE id = ?`, [
        String(id),
      ]);

      if (resultVisita) {
        const parsedConfigDebug = safeParseJson(resultVisita.project_config_json, {});

        gpsDebug('visit-loaded-from-sqlite', {
          visitId: resultVisita.id,
          lojaId: resultVisita.loja_id,
          lojaNome: resultVisita.loja_nome,
          status: resultVisita.status,
          latitude: resultVisita.latitude,
          longitude: resultVisita.longitude,
          gpsRadius: resultVisita.gpsRadius,
          checkinPolicy: resultVisita.checkinPolicy,
          gps_radius: resultVisita.gps_radius,
          checkin_policy: resultVisita.checkin_policy,
          projectConfigKeys: Object.keys(parsedConfigDebug || {}),
          projectConfigGpsRadius: parsedConfigDebug?.gpsRadius,
          projectConfigCheckinPolicy: parsedConfigDebug?.checkinPolicy,
          projectConfigProjectGpsRadius: parsedConfigDebug?.project?.gpsRadius,
          projectConfigProjectCheckinPolicy: parsedConfigDebug?.project?.checkinPolicy,
          perfilMobileProjectGpsRadius: parsedConfigDebug?.perfil_mobile?.project?.gpsRadius,
          perfilMobileProjectCheckinPolicy: parsedConfigDebug?.perfil_mobile?.project?.checkinPolicy,
          addressConfig: parseAddressGpsConfig(resultVisita.endereco),
          projectConfigRaw: parsedConfigDebug,
        });

        completedSurveyIds = await getCompletedSurveyIdsForVisit(db, resultVisita);

        setVisita({
          ...resultVisita,
          status: normalizeStatus(resultVisita.status),
        });

        const surveysMap = new Map<string, { id: string; titulo: string; qtdPerguntas: number; concluida: boolean }>();

        const parsedPesquisaJson = safeParseJson(resultVisita.pesquisa_json, []);

        if (Array.isArray(parsedPesquisaJson)) {
          parsedPesquisaJson.forEach((item: any, index: number) => {
            // Formato novo vindo da meuRoteiro:
            // [
            //   { id, titulo, perguntas: [...] },
            //   { id, titulo, perguntas: [...] }
            // ]
            const directSurveyId =
              item?.id ||
              item?.pesquisaId ||
              item?.pesquisa_id ||
              item?.formularioId ||
              item?.formulario_id ||
              item?.surveyId ||
              item?.survey_id;

            const directQuestions =
              item?.perguntas ||
              item?.questoes ||
              item?.questions ||
              item?.campos ||
              [];

            const looksLikeSurvey =
              directSurveyId &&
              (
                Array.isArray(directQuestions) ||
                item?.titulo ||
                item?.nome ||
                item?.surveyTitle ||
                item?.survey_title
              );

            if (looksLikeSurvey) {
              const surveyId = String(directSurveyId);
              surveysMap.set(surveyId, {
                id: surveyId,
                titulo:
                  item?.titulo ||
                  item?.nome ||
                  item?.surveyTitle ||
                  item?.survey_title ||
                  'Pesquisa da visita',
                qtdPerguntas: Array.isArray(directQuestions) ? directQuestions.length : 0,
                concluida: completedSurveyIds.has(surveyId) || truthyConfig(firstFilled(item?.concluida, item?.completed, item?.realizada, item?.respondida, item?.hasColeta)),
              });
              return;
            }

            // Formato antigo:
            // [
            //   { pergunta, pesquisaId },
            //   { pergunta, pesquisaId }
            // ]
            const questionSurveyId =
              item?.pesquisaId ||
              item?.pesquisa_id ||
              item?.formularioId ||
              item?.formulario_id ||
              item?.surveyId ||
              item?.survey_id ||
              resultVisita?.pesquisa_id ||
              resultVisita?.pesquisaId ||
              `visit_survey_${index}`;

            const surveyId = String(questionSurveyId);
            const current = surveysMap.get(surveyId);

            surveysMap.set(surveyId, {
              id: surveyId,
              titulo:
                current?.titulo ||
                item?.pesquisaTitulo ||
                item?.pesquisa_titulo ||
                item?.formularioTitulo ||
                item?.formulario_titulo ||
                item?.surveyTitle ||
                item?.survey_title ||
                item?.tituloPesquisa ||
                item?.titulo_pesquisa ||
                'Pesquisa da visita',
              qtdPerguntas: (current?.qtdPerguntas || 0) + 1,
              concluida: Boolean(current?.concluida) || completedSurveyIds.has(surveyId) || truthyConfig(firstFilled(item?.concluida, item?.completed, item?.realizada, item?.respondida, item?.hasColeta)),
            });
          });
        }

        for (const survey of Array.from(surveysMap.values())) {
          let row: any = await db.getFirstAsync(`SELECT titulo as nome FROM other_tasks WHERE id = ?`, [
            survey.id,
          ]);

          if (!row) {
            row = await db.getFirstAsync(`SELECT nome FROM pesquisas WHERE id = ?`, [survey.id]);
          }

          const nomeFinal = row?.nome || survey.titulo || 'Pesquisa da visita';

          tarefasConsolidadas.push({
            id: survey.id,
            titulo: nomeFinal,
            qtdPerguntas: survey.qtdPerguntas || 0,
            tipo: 'VISITA',
            concluida: completedSurveyIds.has(String(survey.id)) || Boolean(survey.concluida),
          });
        }
      }

      try {
        const allTasks = await db.getAllAsync<any>(`SELECT * FROM other_tasks`);

        const outrasTarefas = (allTasks || [])
          .filter((t: any) => {
            const jaProcessada = tarefasConsolidadas.some((tc) => tc.titulo === t.titulo);
            if (jaProcessada) return false;

            const raw = safeParseJson(t.task_raw_json, {});
            const freq = String(t.frequencia || raw.frequencia || '').toUpperCase();

            return freq.includes('POR_VISITA');
          })
          .map((t: any) => {
            const raw = safeParseJson(t.task_raw_json, {});
            const perguntas = raw.perguntas || raw.questoes || raw.questions || [];

            return {
              id: t.id,
              titulo: t.titulo || raw.titulo || raw.nome || 'Tarefa Adicional',
              qtdPerguntas: Array.isArray(perguntas) ? perguntas.length : 0,
              tipo: 'AVULSA_VISITA',
              concluida: completedSurveyIds.has(String(t.id)),
            };
          });

        tarefasConsolidadas = [...tarefasConsolidadas, ...outrasTarefas];
      } catch (e) {}

      setTarefasRenderizadas(tarefasConsolidadas);
    } catch (error) {
      console.error('❌ Erro ao buscar dados:', error);
      showCustomAlert('Erro', 'Não foi possível carregar os dados da visita.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const obterLocalizacaoInicial = async () => {
    try {
      const loc = await getSmartLocation();

      if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
        setUserLocation({ latitude: loc.latitude, longitude: loc.longitude });
      }
    } catch (e) {}
  };

  const ajustarZoomMapa = (lojaLat: number, lojaLng: number) => {
    if (mapRef.current && userLocation) {
      mapRef.current.fitToCoordinates(
        [
          { latitude: lojaLat, longitude: lojaLng },
          { latitude: userLocation.latitude, longitude: userLocation.longitude },
        ],
        {
          edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
          animated: true,
        }
      );
    }
  };

  const buildVisitPayload = (
    lat: number,
    lng: number,
    acao: 'CHECKIN' | 'CHECKOUT' | 'JUSTIFICAR',
    now: string,
    operationId: string,
    justificativa?: JustificativaOption | null,
    detalhe?: string,
    fotoUri?: string | null
  ) => {
    const config = safeParseJson(visita?.project_config_json, {});
    const rawProjectId =
      config.projectId ||
      config.project_id ||
      visita?.projectId ||
      visita?.project_id ||
      user?.allowed_project_ids?.[0] ||
      user?.projectId ||
      user?.projeto_id ||
      user?.project_id;

    return {
      projectId: rawProjectId,
      roteiroId: visita?.roteiro_id,
      roteiro_id: visita?.roteiro_id,
      visitaIdJson: visita?.visita_id_json,
      visita_id_json: visita?.visita_id_json,
      visitaId: visita?.id,
      visita_id: visita?.id,
      promotorId: user?.id,
      promotor_id: user?.id,
      usuario_id: user?.id,
      lojaId: visita?.loja_id,
      loja_id: visita?.loja_id,
      dataProgramada: visita?.data_programada,
      data_programada: visita?.data_programada,
      latitude: lat,
      longitude: lng,
      data_hora: now,
      checkin_at: acao === 'CHECKIN' ? now : visita?.checkin_at,
      checkout_at: acao === 'CHECKOUT' ? now : visita?.checkout_at,
      status:
        acao === 'CHECKIN'
          ? 'EM_ANDAMENTO'
          : acao === 'CHECKOUT'
            ? 'REALIZADA'
            : 'JUSTIFICADA',
      origem: 'MOBILE_OFFLINE',
      acao,
      gpsRadius: getBackendGpsPolicy(visita, config).gpsRadius,
      checkinPolicy: getBackendGpsPolicy(visita, config).checkinPolicy,
      client_operation_id: operationId,
      offline_id: visita?.id,
      justificativa_id: justificativa?.id || null,
      justificativa: justificativa?.descricao || null,
      motivo: justificativa?.descricao || null,
      detalhe_justificativa: detalhe || '',
      observacao: detalhe || '',
      foto_checkin_url: acao === 'CHECKIN' ? fotoUri || null : visita?.foto_checkin_url || null,
      foto_checkout_url: acao === 'CHECKOUT' ? fotoUri || null : visita?.foto_checkout_url || null,
      foto_justificativa_url: acao === 'JUSTIFICAR' ? fotoUri || null : visita?.foto_justificativa_url || null,
      foto_uri: fotoUri || null,
      photo_uri: fotoUri || null,
    };
  };

  const escolherOrigemFoto = (allowGallery: boolean): Promise<'camera' | 'gallery' | null> => {
    if (!allowGallery) return Promise.resolve('camera');

    return new Promise((resolve) => {
      showCustomAlert(
        'Foto obrigatória',
        'Escolha como deseja anexar a foto para continuar.',
        'info',
        'Câmera',
        () => {
          hideCustomAlert();
          resolve('camera');
        },
        'Galeria',
        () => {
          hideCustomAlert();
          resolve('gallery');
        }
      );
    });
  };

  const capturarOuSelecionarFotoObrigatoria = async (acao: VisitAction): Promise<string | null> => {
    const config = safeParseJson(visita?.project_config_json, {});
    const photoPolicy = getPhotoRequirementPolicy(visita, config, acao);

    if (!photoPolicy.requirePhoto) return null;

    const source = await escolherOrigemFoto(photoPolicy.allowGallery);
    if (!source) return null;

    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showCustomAlert(
        'Permissão necessária',
        source === 'camera'
          ? 'A câmera precisa estar liberada para registrar a foto obrigatória.'
          : 'A galeria precisa estar liberada para selecionar a foto obrigatória.',
        'error'
      );
      return null;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.75,
          allowsEditing: false,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.75,
          allowsEditing: false,
          exif: true,
        });

    if (result.canceled || !result.assets?.[0]?.uri) {
      showCustomAlert(
        'Foto obrigatória',
        `Para continuar, é necessário anexar a foto de ${getPhotoLabelByAction(acao)}.`,
        'warning'
      );
      return null;
    }

    const asset = result.assets[0];

    if (!validatePhotoOrientation(asset, photoPolicy.orientation)) {
      showCustomAlert(
        'Orientação inválida',
        photoPolicy.orientation === 'HORIZONTAL'
          ? 'A configuração exige foto na horizontal. Tire a foto novamente com o celular deitado.'
          : 'A configuração exige foto na vertical. Tire a foto novamente com o celular em pé.',
        'warning'
      );
      return null;
    }

    return await persistVisitPhotoLocally(asset.uri, String(visita?.id || 'visita'), acao);
  };

  const registrarAcaoComFotoObrigatoria = async (
    lat: number,
    lng: number,
    acao: VisitAction,
    justificativa?: JustificativaOption | null,
    detalhe?: string
  ) => {
    const fotoUri = await capturarOuSelecionarFotoObrigatoria(acao);
    const config = safeParseJson(visita?.project_config_json, {});
    const photoPolicy = getPhotoRequirementPolicy(visita, config, acao);

    if (photoPolicy.requirePhoto && !fotoUri) {
      setCheckinLoading(false);
      setCheckoutLoading(false);
      setJustifyLoading(false);
      return;
    }

    await registrarAcaoBanco(lat, lng, acao, justificativa, detalhe, fotoUri);
  };

  const handleCheckin = async () => {
    if (!visita) return;
    setCheckinLoading(true);

    try {
      const db = await getDBConnection();
      const outraVisitaAberta = await getOpenVisitDifferentFromCurrent(db, String(visita.id));

      if (outraVisitaAberta) {
        setCheckinLoading(false);
        showCustomAlert(
          'Existe uma visita em andamento',
          `Finalize primeiro a visita aberta em ${outraVisitaAberta.loja_nome || 'outra loja'} antes de iniciar um novo check-in.`,
          'warning'
        );
        return;
      }

      const config = safeParseJson(visita.project_config_json, {});
      const addressConfig = parseAddressGpsConfig(visita.endereco);
      const lojaLat = parseFloat(String(addressConfig.lojaLatConfig ?? config.loja_lat ?? visita.latitude ?? 0));
      const lojaLng = parseFloat(String(addressConfig.lojaLngConfig ?? config.loja_lng ?? visita.longitude ?? 0));
      const gpsPolicy = getBackendGpsPolicy(visita, config);

      gpsDebug('checkin-start', {
        visitId: visita.id,
        lojaNome: visita.loja_nome,
        lojaLat,
        lojaLng,
        addressHasConfig: addressConfig.hasAddressConfig,
        addressCheckinPolicy: addressConfig.checkinPolicy,
        addressGpsRadius: addressConfig.gpsRadius,
        gpsPolicy,
        configCheckinPolicy: config?.checkinPolicy,
        configGpsRadius: config?.gpsRadius,
        perfilMobileProjectCheckinPolicy: config?.perfil_mobile?.project?.checkinPolicy,
        perfilMobileProjectGpsRadius: config?.perfil_mobile?.project?.gpsRadius,
        visitCheckinPolicy: visita?.checkinPolicy,
        visitGpsRadius: visita?.gpsRadius,
      });

      const myLocation = await getSmartLocation();

      if (
        myLocation.error ||
        typeof myLocation.latitude !== 'number' ||
        typeof myLocation.longitude !== 'number'
      ) {
        setCheckinLoading(false);
        showCustomAlert(
          'Erro de GPS',
          'Não foi possível obter sua localização com precisão para liberar o check-in.',
          'error'
        );
        return;
      }

      const myLat = myLocation.latitude;
      const myLng = myLocation.longitude;

      gpsDebug('location-read', {
        myLat,
        myLng,
        rawLocation: myLocation,
      });

      setUserLocation({ latitude: myLat, longitude: myLng });

      if (lojaLat !== 0 && lojaLng !== 0 && gpsPolicy.shouldValidate) {
        const distanciaMetros = Math.round(getDistanceInMeters(myLat, myLng, lojaLat, lojaLng));

        gpsDebug('distance-calculated', {
          distanciaMetros,
          gpsRadius: gpsPolicy.gpsRadius,
          foraDoRaio: distanciaMetros > gpsPolicy.gpsRadius,
          checkinPolicy: gpsPolicy.checkinPolicy,
          shouldBlock: gpsPolicy.shouldBlock,
          shouldWarn: gpsPolicy.shouldWarn,
          shouldValidate: gpsPolicy.shouldValidate,
        });

        if (distanciaMetros > gpsPolicy.gpsRadius) {
          if (gpsPolicy.shouldBlock) {
            gpsDebug('decision-block', {
              reason: 'outside-radius-and-policy-block-or-strict',
              checkinPolicy: gpsPolicy.checkinPolicy,
              distanciaMetros,
              gpsRadius: gpsPolicy.gpsRadius,
            });

            setCheckinLoading(false);
            showCustomAlert(
              'Check-in bloqueado',
              `Você está a ${distanciaMetros}m da loja. O limite configurado para este projeto é ${gpsPolicy.gpsRadius}m.`,
              'error'
            );
            return;
          }

          if (gpsPolicy.shouldWarn) {
            gpsDebug('decision-warning', {
              reason: 'outside-radius-and-policy-warning',
              checkinPolicy: gpsPolicy.checkinPolicy,
              distanciaMetros,
              gpsRadius: gpsPolicy.gpsRadius,
            });

            showCustomAlert(
              'Fora do raio da loja',
              `Você está a ${distanciaMetros}m da loja. O limite configurado para este projeto é ${gpsPolicy.gpsRadius}m.\n\nDeseja registrar a entrada assim mesmo?`,
              'warning',
              'Continuar',
              async () => {
                hideCustomAlert();
                gpsDebug('decision-warning-confirmed-by-user', {
                  distanciaMetros,
                  gpsRadius: gpsPolicy.gpsRadius,
                  checkinPolicy: gpsPolicy.checkinPolicy,
                });

                await registrarAcaoComFotoObrigatoria(myLat, myLng, 'CHECKIN');
              },
              'Cancelar',
              () => {
                hideCustomAlert();
                setCheckinLoading(false);
              }
            );
            return;
          }
        }
      }

      gpsDebug('decision-allow-direct', {
        reason: 'inside-radius-or-policy-none-or-no-store-coordinates',
        lojaLat,
        lojaLng,
        gpsPolicy,
      });

      await registrarAcaoComFotoObrigatoria(myLat, myLng, 'CHECKIN');
    } catch (error) {
      setCheckinLoading(false);
      showCustomAlert('Erro', 'Falha ao processar Check-in.', 'error');
    }
  };

  const handleCheckout = async () => {
    const tarefasPendentes = tarefasRenderizadas.filter((tarefa: any) => tarefa?.concluida !== true);

    if (tarefasPendentes.length > 0) {
      const listaPendencias = tarefasPendentes
        .map((tarefa: any, index: number) => `${index + 1}. ${String(tarefa?.titulo || 'Pesquisa/Tarefa sem nome')}`)
        .join('\n');

      showCustomAlert(
        'Saída Bloqueada',
        `Você ainda precisa finalizar ${tarefasPendentes.length} formulário(s)/tarefa(s) desta visita:\n\n${listaPendencias}`,
        'warning'
      );
      return;
    }

    setCheckoutLoading(true);

    try {
      const myLocation = await getSmartLocation();

      if (
        myLocation.error ||
        typeof myLocation.latitude !== 'number' ||
        typeof myLocation.longitude !== 'number'
      ) {
        setCheckoutLoading(false);
        showCustomAlert(
          'Erro de GPS',
          'Não foi possível registrar seu check-out pois o sinal de GPS está indisponível.',
          'error'
        );
        return;
      }

      await registrarAcaoComFotoObrigatoria(myLocation.latitude, myLocation.longitude, 'CHECKOUT');
    } catch (error) {
      setCheckoutLoading(false);
      showCustomAlert('Erro', 'Falha inesperada ao processar o Check-out.', 'error');
    }
  };

  const handleJustificar = async () => {
    if (!visita) return;

    setSelectedJustificativaId(null);
    setDetalheJustificativa('');
    setJustifyModalVisible(true);
  };

  const confirmarJustificativa = async () => {
    if (!selectedJustificativaId) {
      showCustomAlert(
        'Justificativa obrigatória',
        'Selecione o motivo da ausência antes de continuar.',
        'warning'
      );
      return;
    }

    const selected = justificativas.find((item) => item.id === selectedJustificativaId) || null;
    const selectedText = String(selected?.descricao || '').toLowerCase();

    if ((selectedText.includes('outro') || selectedText.includes('justifique')) && !detalheJustificativa.trim()) {
      showCustomAlert(
        'Detalhe obrigatório',
        'Informe o detalhe da justificativa para o motivo selecionado.',
        'warning'
      );
      return;
    }

    setJustifyModalVisible(false);
    setJustifyLoading(true);

    try {
      const loc = await getSmartLocation().catch(() => ({ latitude: 0, longitude: 0 }));
      const lat = typeof loc.latitude === 'number' ? loc.latitude : 0;
      const lng = typeof loc.longitude === 'number' ? loc.longitude : 0;

      await registrarAcaoComFotoObrigatoria(
        lat,
        lng,
        'JUSTIFICAR',
        selected,
        detalheJustificativa.trim()
      );
    } finally {
      setJustifyLoading(false);
    }
  };

  const registrarAcaoBanco = async (
    lat: number,
    lng: number,
    acao: 'CHECKIN' | 'CHECKOUT' | 'JUSTIFICAR',
    justificativa?: JustificativaOption | null,
    detalhe?: string,
    fotoUri?: string | null
  ) => {
    try {
      gpsDebug('registrarAcaoBanco-called', {
        acao,
        lat,
        lng,
        visitId: visita?.id,
        currentStatus: visita?.status,
      });

      const db = await getDBConnection();
      const now = getLocalISO();

      const novoStatus =
        acao === 'CHECKIN' ? 'EM_ANDAMENTO' : acao === 'CHECKOUT' ? 'REALIZADA' : 'JUSTIFICADA';

      const campoData = acao === 'CHECKIN' ? 'checkin_at' : acao === 'CHECKOUT' ? 'checkout_at' : null;
      const operationId = buildOperationId(String(visita.id), acao);

      if (campoData) {
        await db.runAsync(
          `UPDATE visits SET status = ?, ${campoData} = ?, latitude = ?, longitude = ?, pending_sync = 1, client_operation_id = ?, updated_at = ? WHERE id = ?`,
          [novoStatus, now, lat, lng, operationId, now, visita.id]
        );
      } else {
        await db.runAsync(
          `UPDATE visits SET status = ?, latitude = ?, longitude = ?, pending_sync = 1, client_operation_id = ?, updated_at = ? WHERE id = ?`,
          [novoStatus, lat, lng, operationId, now, visita.id]
        );
      }

      if (fotoUri) {
        const fotoField = getPhotoFieldByAction(acao);

        await db
          .runAsync(`UPDATE visits SET ${fotoField} = ?, pending_sync = 1, updated_at = ? WHERE id = ?`, [
            fotoUri,
            now,
            visita.id,
          ])
          .catch(() => {});
      }

      const endpoint =
        acao === 'CHECKIN'
          ? '/visitas/checkin'
          : acao === 'CHECKOUT'
            ? '/visitas/checkout'
            : '/visitas/justificar';

      const payload = buildVisitPayload(lat, lng, acao, now, operationId, justificativa, detalhe, fotoUri);

      const updatedVisit = {
        ...visita,
        status: novoStatus,
        ...(campoData ? { [campoData]: now } : {}),
        latitude: lat,
        longitude: lng,
        pending_sync: 1,
        client_operation_id: operationId,
        justificativa_id: justificativa?.id || null,
        justificativa: justificativa?.descricao || null,
        detalhe_justificativa: detalhe || '',
        ...(fotoUri ? { [getPhotoFieldByAction(acao)]: fotoUri } : {}),
      };

      // Além do pending_sync da tabela visits, deixamos a operação explícita na fila.
      // Isso aumenta a segurança para checkout/justificativa, que não eram enviados pelo sync antigo.
      try {
        await addToSyncQueue(endpoint, payload, 'POST', token || undefined);
      } catch (queueError: any) {
        await addAppLog({
          level: 'ERROR',
          module: 'VISITA',
          action: `SYNC_QUEUE_${acao}`,
          message: 'Falha ao enfileirar ação crítica de visita.',
          metadata: {
            endpoint,
            visitId: visita?.id,
            action: acao,
            clientOperationId: operationId,
            error: queueError?.message || String(queueError),
          },
        });

        setVisita(updatedVisit);
        setCheckinLoading(false);
        setCheckoutLoading(false);
        setJustifyLoading(false);
        showCustomAlert(
          'Ação salva sem sincronização',
          'A ação foi preservada no celular, mas não entrou na fila de sincronização. Tente sincronizar novamente mais tarde ou avise o suporte antes de apagar dados do app.',
          'error'
        );
        return;
      }

      setVisita(updatedVisit);

      if (acao === 'CHECKIN') {
        setCheckinLoading(false);
        showCustomAlert(
          'Entrada Registrada',
          'O seu check-in na loja foi salvo no celular e será sincronizado automaticamente.',
          'success'
        );
      } else if (acao === 'CHECKOUT') {
        setCheckoutLoading(false);
        showCustomAlert(
          'Atendimento Finalizado',
          'Seu check-out foi salvo com sucesso. Bom trabalho!',
          'success',
          'Concluir',
          () => {
            hideCustomAlert();
            router.back();
          }
        );
      } else {
        setJustifyLoading(false);
        showCustomAlert(
          'Visita Justificada',
          'A justificativa foi salva no celular e será sincronizada automaticamente.',
          'success',
          'Concluir',
          () => {
            hideCustomAlert();
            router.back();
          }
        );
      }
    } catch (e) {
      setCheckinLoading(false);
      setCheckoutLoading(false);
      setJustifyLoading(false);
      showCustomAlert('Erro no Banco', 'Não foi possível salvar a ação na memória do celular.', 'error');
    }
  };

  if (loading) {
    return (
      <View testID="visit-loading" accessibilityLabel="visit-loading" style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={colorCheckin} />
      </View>
    );
  }

  if (!visita) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text testID="visit-not-found" accessibilityLabel="visit-not-found" style={{ color: textPrimary }}>Visita não encontrada.</Text>
      </View>
    );
  }

  const normalizedStatus = normalizeStatus(visita.status);
  const colors = getStatusColors(normalizedStatus);

  const isAndamento = normalizedStatus === 'EM_ANDAMENTO' || normalizedStatus === 'INICIADA';
  const isPendente = normalizedStatus === 'PENDENTE' || normalizedStatus === 'AGENDADA';
  const isRealizada = isDoneStatus(normalizedStatus);

  let displayTime = '--:--';
  let timeLabel = 'Previsão:';
  const hasCheckin = visita.checkin_at != null;

  if (hasCheckin) {
    displayTime = formatTime(visita.checkin_at);
    timeLabel = 'Entrada:';
  } else if (visita.hora_entrada_prevista && visita.hora_entrada_prevista !== 'undefined') {
    displayTime = String(visita.hora_entrada_prevista).substring(0, 5);
  }

  // =========================================================================
  // 🕒 MOTOR DE COMPARAÇÃO DE HORÁRIO DE CHECK-IN
  // =========================================================================
  let delayBadge = null;

  if (hasCheckin && visita.hora_entrada_prevista && visita.hora_entrada_prevista !== 'undefined') {
    try {
      const checkinD = new Date(visita.checkin_at);
      const checkinMins = checkinD.getHours() * 60 + checkinD.getMinutes();
      const [fHour, fMin] = String(visita.hora_entrada_prevista).substring(0, 5).split(':').map(Number);
      const forecastMins = fHour * 60 + fMin;

      if (!isNaN(forecastMins) && !isNaN(checkinMins)) {
        const diff = checkinMins - forecastMins;
        const absDiff = Math.abs(diff);

        const diffStr =
          absDiff < 60
            ? `${absDiff}m`
            : `${Math.floor(absDiff / 60)}h ${absDiff % 60 > 0 ? `${absDiff % 60}m` : ''}`.trim();

        const config = safeParseJson(visita.project_config_json, {});
        const tolerance = Number(config.delayTolerance || config.delay_tolerance || 15);

        if (diff > tolerance) {
          delayBadge = {
            text: `Atraso ${diffStr}`,
            color: '#EF4444',
            bg: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.1)',
          };
        } else if (diff < -tolerance) {
          delayBadge = {
            text: `Adiantado ${diffStr}`,
            color: '#3B82F6',
            bg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
          };
        } else {
          delayBadge = {
            text: 'No Horário',
            color: '#10B981',
            bg: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.1)',
          };
        }
      }
    } catch (e) {}
  }

  const config = safeParseJson(visita.project_config_json, {});
  const addressConfig = parseAddressGpsConfig(visita.endereco);
  const lojaLat = parseFloat(String(addressConfig.lojaLatConfig ?? config.loja_lat ?? visita.latitude ?? 0));
  const lojaLng = parseFloat(String(addressConfig.lojaLngConfig ?? config.loja_lng ?? visita.longitude ?? 0));

  let insightToDisplay = null;

  try {
    if (visita.store_insights_json && visita.store_insights_json !== '[]') {
      const insights = JSON.parse(visita.store_insights_json);

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

  // =========================================================================
  // 🎯 HELPERS PARA O MODAL UI
  // =========================================================================
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
      <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: border }]}>
        <TouchableOpacity
              testID="visit-back-button"
              accessibilityLabel="visit-back-button" onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
            testID="visit-screen-title"
            accessibilityLabel="visit-screen-title"
            style={[styles.headerTitle, { color: textPrimary }]}
          >
            Detalhes da Visita
          </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.cardWrapper,
            { backgroundColor: cardBg, borderLeftColor: colors.text, borderColor: border },
          ]}
        >
          <View style={styles.cardMainRow}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                <Text style={[styles.badgeText, { color: colors.text }]}>{normalizedStatus}</Text>
              </View>

              <View style={styles.timeRowContainer}>
                <View style={styles.timeRow}>
                  <Clock size={14} color={hasCheckin ? colorCheckin : textSecondary} />
                  <Text style={[styles.timeText, { color: hasCheckin ? textPrimary : textSecondary }]}>
                    {timeLabel} {displayTime}
                  </Text>
                </View>

                {delayBadge && (
                  <View style={[styles.delayBadge, { backgroundColor: delayBadge.bg }]}>
                    <Text style={[styles.delayText, { color: delayBadge.color }]}>{delayBadge.text}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text testID="visit-screen" accessibilityLabel="visit-screen" style={[styles.storeName, { color: textPrimary }]}>{visita.loja_nome}</Text>

            <View style={styles.addressRow}>
              <MapPin size={16} color={textSecondary} style={{ marginTop: 2 }} />
              <Text style={[styles.addressText, { color: textSecondary }]}>
                {limparEndereco(visita.endereco)}
              </Text>
            </View>
          </View>

          {insightToDisplay && (() => {
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
          })()}
        </View>

        <View style={[styles.mapContainer, { borderColor: border }]}>
          {canRenderMap ? (
            <>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={{
                  latitude: lojaLat || -23.55,
                  longitude: lojaLng || -46.63,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
              >
                {lojaLat !== 0 && lojaLng !== 0 && (
                  <Marker coordinate={{ latitude: lojaLat, longitude: lojaLng }} pinColor="red" />
                )}
                {userLocation && <Marker coordinate={userLocation} pinColor="blue" />}
              </MapView>

              {lojaLat !== 0 && lojaLng !== 0 && userLocation && (
                <View style={styles.distanceBadge}>
                  <Navigation size={12} color="#FFFFFF" />
                  <Text style={styles.distanceBadgeText}>
                    {Math.round(getDistanceInMeters(userLocation.latitude, userLocation.longitude, lojaLat, lojaLng))}m
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.mapFallback, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
              <MapPin size={24} color={textSecondary} />
              <Text style={[styles.mapFallbackTitle, { color: textPrimary }]}>Mapa indisponível</Text>
              <Text style={[styles.mapFallbackText, { color: textSecondary }]}>
                A chave do Google Maps não está configurada neste build. A visita pode ser executada normalmente.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.tasksSection}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Tarefas desta visita</Text>

          {tarefasRenderizadas.length > 0 ? (
            tarefasRenderizadas.map((tarefa: any, index: number) => {
              const tarefaConcluida = tarefa?.concluida === true;

              return (
              <TouchableOpacity
                key={`${tarefa.id || index}`}
                  testID={index === 0 ? "visit-first-task-card" : `visit-task-card-${tarefa.id || index}`}
                  accessibilityLabel={index === 0 ? "visit-first-task-card" : `visit-task-card-${tarefa.id || index}`}
                style={[
                  styles.taskCard,
                  { backgroundColor: cardBg, borderColor: tarefaConcluida ? colorCheckin : border },
                ]}
                onPress={() =>
                  isAndamento
                    ? router.push(`../pesquisa/${visita.id}?pesquisaId=${encodeURIComponent(String(tarefa.id || ''))}` as any)
                    : showCustomAlert(
                        'Aviso',
                        'Realize o check-in na loja primeiro para liberar a execução das tarefas.',
                        'warning'
                      )
                }
                activeOpacity={isAndamento ? 0.7 : 1}
              >
                <View
                  style={[
                    styles.taskIconBg,
                    { backgroundColor: tarefaConcluida ? colorCheckin : 'rgba(16, 185, 129, 0.1)' },
                  ]}
                >
                  {tarefaConcluida ? (
                    <CheckCircle2 size={22} color="#FFF" />
                  ) : (
                    <ClipboardCheck size={22} color={colorCheckin} />
                  )}
                </View>
                <View style={styles.taskInfo}>
                  <Text
                      testID={index === 0 ? "visit-first-task-title" : `visit-task-title-${tarefa.id || index}`}
                      accessibilityLabel={index === 0 ? "visit-first-task-title" : `visit-task-title-${tarefa.id || index}`}
                      style={[styles.taskTitle, { color: textPrimary }]}
                    >
                      {tarefa.titulo}
                    </Text>
                  <Text style={[styles.taskSubtitle, { color: tarefaConcluida ? colorCheckin : textSecondary }]}>
                    {tarefaConcluida
                      ? 'Tarefa Concluída'
                      : `${tarefa.qtdPerguntas} ${tarefa.qtdPerguntas === 1 ? 'pergunta' : 'perguntas'}`}
                  </Text>
                </View>
                <ChevronRight size={18} color={tarefaConcluida ? colorCheckin : border} />
              </TouchableOpacity>
              );
            })
          ) : (
            <View style={[styles.emptyTaskCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={{ color: textSecondary }}>Nenhuma pesquisa encontrada para esta visita.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: cardBg, borderTopColor: border }]}>
        {isPendente ? (
          <>
            <TouchableOpacity
              testID="visit-justify-button"
              accessibilityLabel="visit-justify-button"
              style={[
                styles.btnAction,
                { backgroundColor: colorJustify, marginRight: 12, opacity: justifyLoading ? 0.7 : 1 },
              ]}
              activeOpacity={0.8}
              onPress={handleJustificar}
              disabled={justifyLoading}
            >
              {justifyLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <AlertTriangle size={20} color="#FFF" style={styles.btnIcon} />
                  <Text style={styles.btnActionText}>Justificar</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              testID="visit-checkin-button"
              accessibilityLabel="visit-checkin-button"
              style={[styles.btnAction, { backgroundColor: colorCheckin, flex: 1.5, opacity: checkinLoading ? 0.7 : 1 }]}
              onPress={handleCheckin}
              disabled={checkinLoading}
            >
              {checkinLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <LogIn size={20} color="#FFF" style={styles.btnIcon} />
                  <Text style={styles.btnActionText}>Check-in</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : isAndamento ? (
          <>
            <TouchableOpacity
              style={[styles.btnAction, { backgroundColor: '#3B82F6', marginRight: 12 }]}
              onPress={() => router.push(`../pesquisa/${visita.id}` as any)}
            >
              <ClipboardCheck size={20} color="#FFF" style={styles.btnIcon} />
              <Text style={styles.btnActionText}>Pesquisar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="visit-checkout-button"
              accessibilityLabel="visit-checkout-button"
              style={[styles.btnAction, { backgroundColor: colorCheckout, flex: 1.5, opacity: checkoutLoading ? 0.7 : 1 }]}
              onPress={handleCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <LogOut size={20} color="#FFF" style={styles.btnIcon} />
                  <Text style={styles.btnActionText}>Check-out</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={[styles.btnAction, { backgroundColor: cardBg, borderWidth: 1, borderColor: border, width: '100%' }]}>
            <CheckCircle2 size={20} color={colorCheckin} style={styles.btnIcon} />
            <Text style={[styles.btnActionText, { color: colorCheckin }]}>
              {isRealizada ? 'Atendimento Finalizado' : 'Visita Encerrada'}
            </Text>
          </View>
        )}
      </View>

      <Modal visible={justifyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: border, alignItems: 'stretch' }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)', alignSelf: 'center' }]}>
              <AlertTriangle size={32} color={colorJustify} />
            </View>

            <Text style={[styles.modalTitle, { color: textPrimary }]}>Justificar ausência</Text>
            <Text style={[styles.modalText, { color: textSecondary }]}>
              Selecione o motivo cadastrado no sistema e informe um detalhe, se necessário.
            </Text>

            <Text style={[styles.fieldLabel, { color: textPrimary }]}>Motivo da justificativa</Text>
            <View style={styles.justificationList}>
              {justificativas.map((item) => {
                const selected = selectedJustificativaId === item.id;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.justificationOption,
                      {
                        borderColor: selected ? colorJustify : border,
                        backgroundColor: selected
                          ? (isDark ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.08)')
                          : 'transparent',
                      },
                    ]}
                    onPress={() => setSelectedJustificativaId(item.id)}
                  >
                    <View
                      style={[
                        styles.radioCircle,
                        { borderColor: selected ? colorJustify : textSecondary },
                      ]}
                    >
                      {selected && <View style={[styles.radioDot, { backgroundColor: colorJustify }]} />}
                    </View>
                    <Text style={[styles.justificationText, { color: textPrimary }]}>{item.descricao}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: textPrimary, marginTop: 14 }]}>Detalhe justificativa</Text>
            <TextInput
              value={detalheJustificativa}
              onChangeText={setDetalheJustificativa}
              placeholder="Descreva o motivo ou detalhe da ausência..."
              placeholderTextColor={textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.justificationInput,
                {
                  color: textPrimary,
                  backgroundColor: isDark ? '#0B0F19' : '#F8FAFC',
                  borderColor: border,
                },
              ]}
            />

            <View style={[styles.modalBtnRow, { marginTop: 18 }]}>
              <TouchableOpacity
                style={[styles.modalBtnSec, { borderColor: border }]}
                onPress={() => {
                  setJustifyModalVisible(false);
                  setSelectedJustificativaId(null);
                  setDetalheJustificativa('');
                }}
              >
                <Text style={[styles.modalBtnSecText, { color: textPrimary }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtnPri, { backgroundColor: colorJustify }]}
                onPress={confirmarJustificativa}
                disabled={justifyLoading}
              >
                {justifyLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.modalBtnPriText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={customAlert.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardBg, borderColor: border }]}>
            <View style={[styles.modalIconWrap, { backgroundColor: modalUI.bg }]}>
              <ModalIcon size={32} color={modalUI.color} />
            </View>
            <Text style={[styles.modalTitle, { color: textPrimary }]}>{customAlert.title}</Text>
            <Text style={[styles.modalText, { color: textSecondary }]}>{customAlert.message}</Text>

            <View style={styles.modalBtnRow}>
              {customAlert.secondaryText ? (
                <TouchableOpacity
                  style={[styles.modalBtnSec, { borderColor: border }]}
                  onPress={() => {
                    if (customAlert.secondaryAction) customAlert.secondaryAction();
                    else hideCustomAlert();
                  }}
                >
                  <Text style={[styles.modalBtnSecText, { color: textPrimary }]}>
                    {customAlert.secondaryText}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={[styles.modalBtnPri, { backgroundColor: modalUI.color }]}
                onPress={() => {
                  if (customAlert.primaryAction) customAlert.primaryAction();
                  else hideCustomAlert();
                }}
              >
                <Text style={styles.modalBtnPriText} numberOfLines={2} adjustsFontSizeToFit>
                  {customAlert.primaryText}
                </Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, borderBottomWidth: 1 },
  backBtn: { padding: 5, marginLeft: -5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 40 },

  cardWrapper: {
    borderRadius: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderLeftWidth: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    overflow: 'hidden',
  },
  cardMainRow: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  insightIntegrated: {
    paddingVertical: 14,
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

  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: 'bold' },

  timeRowContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, marginLeft: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  delayBadge: { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  delayText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

  storeName: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  addressText: { fontSize: 14, flex: 1, marginLeft: 8, lineHeight: 20 },
  mapContainer: { height: 220, borderRadius: 16, overflow: 'hidden', borderWidth: 1 },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  mapFallbackTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  mapFallbackText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  map: { width: '100%', height: '100%' },
  distanceBadge: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(15, 23, 42, 0.82)', borderRadius: 18, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  distanceBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  tasksSection: { marginTop: 32 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, marginLeft: 4 },
  taskCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  taskIconBg: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  taskSubtitle: { fontSize: 13, fontWeight: '500' },
  emptyTaskCard: { padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center', borderStyle: 'dashed' },
  footer: { flexDirection: 'row', padding: 20, paddingBottom: 30, borderTopWidth: 1 },
  btnAction: { flex: 1, flexDirection: 'row', paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnIcon: { marginRight: 8 },
  btnActionText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

  fieldLabel: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  justificationList: { gap: 8 },
  justificationOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  justificationText: { flex: 1, fontSize: 14, fontWeight: '700' },
  justificationInput: { minHeight: 94, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '500', lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', padding: 25, borderRadius: 24, borderWidth: 1, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  modalText: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtnRow: { flexDirection: 'row', width: '100%', gap: 12 },
  modalBtnPri: { flex: 1.15, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  modalBtnPriText: { color: '#FFF', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  modalBtnSec: { flex: 1, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1 },
  modalBtnSecText: { fontSize: 15, fontWeight: 'bold' },
});
