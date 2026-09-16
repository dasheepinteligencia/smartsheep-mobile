import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import MapView, {
  Marker,
  Polyline
} from 'react-native-maps';

import {
  useFocusEffect,
  useLocalSearchParams
} from 'expo-router';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  LocateFixed,
  MapPin,
  MapPinned,
  Navigation,
  RotateCcw,
  Search,
  Store,
  Users,
  X
} from 'lucide-react-native';

import {
  useSafeAreaInsets
} from 'react-native-safe-area-context';

import {
  useAuthStore
} from '../../store/useAuthStore';

import {
  useSettingsStore
} from '../../store/useSettingsStore';

import {
  fetchSupervisorPhase2,
  formatSupervisorDate,
  getPhase2FieldMembers,
  getSupervisorDateKey,
  shiftSupervisorDateKey,
  SupervisorJourneyItem,
  SupervisorPhase2Data,
  SupervisorPhase2Member
} from '../../services/supervisorPhase2Service';

const TEXTS = {
  'pt-BR': {
    eyebrow: 'OPERAÇÃO AO VIVO',
    title: 'Mapa Operacional',
    subtitle: 'Lojas planejadas, execução real e última posição GPS da equipe.',
    allPromoters: 'Todos os promotores',
    selectPromoter: 'Selecionar promotor',
    search: 'Buscar promotor...',
    today: 'Hoje',
    gps: 'GPS atual',
    store: 'Loja',
    checkin: 'Check-in',
    checkout: 'Check-out',
    route: 'Jornada',
    done: 'Realizada',
    inProgress: 'Em atendimento',
    upcoming: 'Próxima',
    overdue: 'Atrasada',
    justified: 'Justificada',
    noJourney: 'Nenhuma visita para esta data.',
    noPosition: 'Sem posição GPS',
    visible: 'pontos no mapa',
    unavailable: 'Não foi possível atualizar o mapa agora.',
    retry: 'Tentar novamente',
    finished: 'Finalizado',
    inField: 'Em campo',
    active: 'Ativo',
    delayed: 'Atrasado',
    notStarted: 'Não iniciou',
    legend: 'Legenda',
    selectedVisit: 'Visita selecionada',
    planned: 'Planejado',
    executed: 'Executado',
    source: 'Origem',
    freePortfolio: 'Carteira Livre',
    tapHint: 'Toque em uma atividade para localizar a loja e abrir os pontos de execução no mapa.',
    storeCoordinatesMissing: 'Loja sem coordenada cadastrada; exibindo o ponto real da execução quando disponível.'
  },
  'en-US': {
    eyebrow: 'LIVE OPERATION',
    title: 'Operational Map',
    subtitle: 'Planned stores, real execution and latest team GPS position.',
    allPromoters: 'All promoters',
    selectPromoter: 'Select promoter',
    search: 'Search promoter...',
    today: 'Today',
    gps: 'Current GPS',
    store: 'Store',
    checkin: 'Check-in',
    checkout: 'Check-out',
    route: 'Journey',
    done: 'Done',
    inProgress: 'In progress',
    upcoming: 'Upcoming',
    overdue: 'Overdue',
    justified: 'Justified',
    noJourney: 'No visits for this date.',
    noPosition: 'No GPS position',
    visible: 'points on map',
    unavailable: 'Unable to update the map right now.',
    retry: 'Try again',
    finished: 'Finished',
    inField: 'In field',
    active: 'Active',
    delayed: 'Delayed',
    notStarted: 'Not started',
    legend: 'Legend',
    selectedVisit: 'Selected visit',
    planned: 'Planned',
    executed: 'Executed',
    source: 'Source',
    freePortfolio: 'Free Portfolio',
    tapHint: 'Tap an activity to locate the store and open execution points on the map.',
    storeCoordinatesMissing: 'Store has no registered coordinates; showing the real execution point when available.'
  },
  'es-ES': {
    eyebrow: 'OPERACIÓN EN VIVO',
    title: 'Mapa Operativo',
    subtitle: 'Tiendas planificadas, ejecución real y última posición GPS del equipo.',
    allPromoters: 'Todos los promotores',
    selectPromoter: 'Seleccionar promotor',
    search: 'Buscar promotor...',
    today: 'Hoy',
    gps: 'GPS actual',
    store: 'Tienda',
    checkin: 'Check-in',
    checkout: 'Check-out',
    route: 'Jornada',
    done: 'Realizada',
    inProgress: 'En atención',
    upcoming: 'Próxima',
    overdue: 'Atrasada',
    justified: 'Justificada',
    noJourney: 'Sin visitas para esta fecha.',
    noPosition: 'Sin posición GPS',
    visible: 'puntos en el mapa',
    unavailable: 'No fue posible actualizar el mapa ahora.',
    retry: 'Intentar de nuevo',
    finished: 'Finalizado',
    inField: 'En campo',
    active: 'Activo',
    delayed: 'Atrasado',
    notStarted: 'No inició',
    legend: 'Leyenda',
    selectedVisit: 'Visita seleccionada',
    planned: 'Planificado',
    executed: 'Ejecutado',
    source: 'Origen',
    freePortfolio: 'Cartera Libre',
    tapHint: 'Toca una actividad para localizar la tienda y abrir los puntos de ejecución en el mapa.',
    storeCoordinatesMissing: 'Tienda sin coordenada registrada; mostrando el punto real de ejecución cuando esté disponible.'
  }
} as const;

const texts = (language: string) =>
  TEXTS[
    language === 'en-US' || language === 'es-ES'
      ? language
      : 'pt-BR'
  ];

const usableCoordinate = (latitude: any, longitude: any) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  );
};

const normalizeSearch = (value: any) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatTime = (value: any) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const samePoint = (
  aLat: any,
  aLon: any,
  bLat: any,
  bLon: any
) => {
  if (!usableCoordinate(aLat, aLon) || !usableCoordinate(bLat, bLon)) {
    return false;
  }

  return (
    Math.abs(Number(aLat) - Number(bLat)) < 0.00002 &&
    Math.abs(Number(aLon) - Number(bLon)) < 0.00002
  );
};

type MapPoint = {
  key: string;
  type: 'GPS' | 'STORE' | 'EXECUTION';
  member: SupervisorPhase2Member;
  item?: SupervisorJourneyItem;
  latitude: number;
  longitude: number;
};

export default function SupervisorMap() {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string; visitId?: string }>();
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

  const [data, setData] = useState<SupervisorPhase2Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [dateKey, setDateKey] = useState(getSupervisorDateKey());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedJourneyKey, setSelectedJourneyKey] = useState<string | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState('');

  // SUPERVISOR_MAP_PHASE2_REFRESH_V2
  const requestInFlight = useRef(false);
  const deepLinkAppliedRef = useRef('');

  const load = useCallback(
    async (refresh = false) => {
      if (requestInFlight.current) return;
      requestInFlight.current = true;

      if (refresh) setRefreshing(true);

      try {
        const result = await fetchSupervisorPhase2(
          user,
          dateKey,
          { allowCacheFallback: true }
        );

        setData(result);
        setError('');
      } catch (e: any) {
        setError(String(e?.message || t.unavailable));
      } finally {
        requestInFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, dateKey, t.unavailable]
  );

  useFocusEffect(
    useCallback(() => {
      load(false);

      const timer = setInterval(() => load(false), 45000);
      return () => clearInterval(timer);
    }, [load])
  );

  useEffect(() => {
    load(false);
    setSelectedJourneyKey(null);
  }, [dateKey, load]);

  const team = useMemo(
    () => getPhase2FieldMembers(data, user?.id),
    [data, user?.id]
  );

  useEffect(() => {
    if (
      selectedUserId &&
      !team.some(member => String(member.userId) === String(selectedUserId))
    ) {
      setSelectedUserId(null);
      setSelectedJourneyKey(null);
    }
  }, [team, selectedUserId]);

  const selectedMember = useMemo(
    () =>
      selectedUserId
        ? team.find(member => String(member.userId) === String(selectedUserId)) || null
        : null,
    [team, selectedUserId]
  );

  const visibleMembers = useMemo(
    () => (selectedMember ? [selectedMember] : team),
    [selectedMember, team]
  );

  const filteredSelector = useMemo(() => {
    const q = normalizeSearch(search);
    if (!q) return team;

    return team.filter(member =>
      normalizeSearch(`${member.name} ${member.roleName || ''}`).includes(q)
    );
  }, [team, search]);

  const journeyColor = (status?: string) => {
    switch (status) {
      case 'DONE':
        return '#10B981';
      case 'IN_PROGRESS':
        return '#3B82F6';
      case 'OVERDUE':
        return '#EF4444';
      case 'JUSTIFIED':
        return '#8B5CF6';
      default:
        return '#F59E0B';
    }
  };

  const journeyText = (status?: string) => {
    switch (status) {
      case 'DONE':
        return t.done;
      case 'IN_PROGRESS':
        return t.inProgress;
      case 'OVERDUE':
        return t.overdue;
      case 'JUSTIFIED':
        return t.justified;
      default:
        return t.upcoming;
    }
  };

  const memberStatusText = (status?: string) => {
    switch (status) {
      case 'IN_FIELD':
        return t.inField;
      case 'ACTIVE':
        return t.active;
      case 'FINISHED':
        return t.finished;
      case 'DELAYED':
        return t.delayed;
      default:
        return t.notStarted;
    }
  };

  const sourceText = (source?: string | null) => {
    const raw = String(source || '').toUpperCase();
    if (raw.includes('CARTEIRA') || raw.includes('PORTFOLIO')) return t.freePortfolio;
    return source || '';
  };

  const storePoints = useMemo(() => {
    const points: MapPoint[] = [];

    visibleMembers.forEach(member => {
      (member.journey || []).forEach((item, index) => {
        if (usableCoordinate(item.storeLatitude, item.storeLongitude)) {
          points.push({
            key: `store-${member.userId}-${item.id || index}`,
            type: 'STORE',
            member,
            item,
            latitude: Number(item.storeLatitude),
            longitude: Number(item.storeLongitude)
          });
          return;
        }

        const fallbackLat = item.actualCheckinLatitude ?? item.latitude;
        const fallbackLon = item.actualCheckinLongitude ?? item.longitude;

        if (usableCoordinate(fallbackLat, fallbackLon)) {
          points.push({
            key: `execution-${member.userId}-${item.id || index}`,
            type: 'EXECUTION',
            member,
            item,
            latitude: Number(fallbackLat),
            longitude: Number(fallbackLon)
          });
        }
      });
    });

    return points;
  }, [visibleMembers]);

  const gpsPoints = useMemo(() => {
    return visibleMembers
      .filter(member =>
        member.currentPosition &&
        usableCoordinate(
          member.currentPosition.latitude,
          member.currentPosition.longitude
        )
      )
      .map(member => ({
        key: `gps-${member.userId}`,
        type: 'GPS' as const,
        member,
        latitude: Number(member.currentPosition!.latitude),
        longitude: Number(member.currentPosition!.longitude)
      }));
  }, [visibleMembers]);

  const mapPoints = useMemo(
    () => [...storePoints, ...gpsPoints],
    [storePoints, gpsPoints]
  );

  const selectedJourney = useMemo(() => {
    if (!selectedJourneyKey) return null;

    for (const member of visibleMembers) {
      const item = (member.journey || []).find((journey, index) => {
        const key = `${member.userId}:${journey.id || index}`;
        return key === selectedJourneyKey;
      });

      if (item) return { member, item };
    }

    return null;
  }, [selectedJourneyKey, visibleMembers]);

  const routeCoordinates = useMemo(() => {
    if (!selectedMember) return [];

    return [...(selectedMember.journey || [])]
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
      .map(item => {
        if (usableCoordinate(item.storeLatitude, item.storeLongitude)) {
          return {
            latitude: Number(item.storeLatitude),
            longitude: Number(item.storeLongitude)
          };
        }

        if (usableCoordinate(item.actualCheckinLatitude, item.actualCheckinLongitude)) {
          return {
            latitude: Number(item.actualCheckinLatitude),
            longitude: Number(item.actualCheckinLongitude)
          };
        }

        return null;
      })
      .filter(Boolean) as Array<{ latitude: number; longitude: number }>;
  }, [selectedMember]);

  // SUPERVISOR_MAP_PHASE2_FIT_V2
  useEffect(() => {
    if (!mapRef.current || mapPoints.length === 0 || selectedJourney) return;

    const coordinates = mapPoints.map(point => ({
      latitude: point.latitude,
      longitude: point.longitude
    }));

    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      if (coordinates.length === 1) {
        mapRef.current.animateToRegion(
          {
            ...coordinates[0],
            latitudeDelta: 0.035,
            longitudeDelta: 0.035
          },
          400
        );
        return;
      }

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: {
          top: 70,
          right: 50,
          bottom: 70,
          left: 50
        },
        animated: true
      });
    }, 220);

    return () => clearTimeout(timer);
  }, [mapPoints, selectedJourney]);

  const focusJourney = useCallback(
    (member: SupervisorPhase2Member, item: SupervisorJourneyItem, index: number) => {
      const key = `${member.userId}:${item.id || index}`;
      setSelectedJourneyKey(key);

      const storeValid = usableCoordinate(item.storeLatitude, item.storeLongitude);
      const checkinValid = usableCoordinate(
        item.actualCheckinLatitude ?? item.latitude,
        item.actualCheckinLongitude ?? item.longitude
      );

      const latitude = storeValid
        ? Number(item.storeLatitude)
        : checkinValid
          ? Number(item.actualCheckinLatitude ?? item.latitude)
          : null;

      const longitude = storeValid
        ? Number(item.storeLongitude)
        : checkinValid
          ? Number(item.actualCheckinLongitude ?? item.longitude)
          : null;

      if (latitude != null && longitude != null) {
        mapRef.current?.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012
          },
          420
        );
      }
    },
    []
  );


  /*
   * SUPERVISOR_MAP_DEEP_LINK_V1
   *
   * Permite que o cockpit da equipe abra diretamente o promotor e, quando
   * possível, a visita específica no mapa operacional.
   */
  useEffect(() => {
    const requestedUserId = String(params.userId || '').trim();
    const requestedVisitId = String(params.visitId || '').trim();

    if (!requestedUserId || team.length === 0) return;

    const signature = `${dateKey}:${requestedUserId}:${requestedVisitId}`;
    if (deepLinkAppliedRef.current === signature) return;

    const member = team.find(item => String(item.userId) === requestedUserId);
    if (!member) return;

    setSelectedUserId(String(member.userId));

    if (requestedVisitId) {
      const index = (member.journey || []).findIndex(item =>
        [item?.id, item?.actualVisitId, item?.scheduledVisitId]
          .map(value => String(value || '').trim())
          .filter(Boolean)
          .includes(requestedVisitId)
      );

      if (index >= 0) {
        const journey = (member.journey || [])[index];
        if (journey) focusJourney(member, journey, index);
      }
    }

    deepLinkAppliedRef.current = signature;
  }, [params.userId, params.visitId, team, dateKey, focusJourney]);

  const selectedExecutionPoints = useMemo(() => {
    if (!selectedJourney) return [];

    const { member, item } = selectedJourney;
    const result: Array<{
      key: string;
      kind: 'CHECKIN' | 'CHECKOUT';
      latitude: number;
      longitude: number;
      member: SupervisorPhase2Member;
      item: SupervisorJourneyItem;
    }> = [];

    const checkinLat = item.actualCheckinLatitude ?? item.latitude;
    const checkinLon = item.actualCheckinLongitude ?? item.longitude;

    if (usableCoordinate(checkinLat, checkinLon)) {
      result.push({
        key: `checkin-${member.userId}-${item.id}`,
        kind: 'CHECKIN',
        latitude: Number(checkinLat),
        longitude: Number(checkinLon),
        member,
        item
      });
    }

    if (
      usableCoordinate(item.actualCheckoutLatitude, item.actualCheckoutLongitude) &&
      !samePoint(
        checkinLat,
        checkinLon,
        item.actualCheckoutLatitude,
        item.actualCheckoutLongitude
      )
    ) {
      result.push({
        key: `checkout-${member.userId}-${item.id}`,
        kind: 'CHECKOUT',
        latitude: Number(item.actualCheckoutLatitude),
        longitude: Number(item.actualCheckoutLongitude),
        member,
        item
      });
    }

    return result;
  }, [selectedJourney]);

  const initial = mapPoints[0] || {
    latitude: -23.5505,
    longitude: -46.6333
  };

  if (loading && !data) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator color={accent} size="large" />
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
          paddingTop: insets.top + 14,
          paddingBottom: 116
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
          <Text style={[styles.eyebrow, { color: accent }]}>
            {t.eyebrow}
          </Text>
          <Text style={[styles.title, { color: primary }]}>
            {t.title}
          </Text>
          <Text style={[styles.subtitle, { color: secondary }]}>
            {t.subtitle}
          </Text>
        </View>

        {error ? (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: dark ? '#3F1D24' : '#FEF2F2',
                borderColor: dark ? '#7F1D1D' : '#FECACA'
              }
            ]}
          >
            <AlertTriangle size={18} color="#EF4444" />
            <Text style={[styles.errorText, { color: dark ? '#FECACA' : '#991B1B' }]}>
              {t.unavailable}
            </Text>
            <TouchableOpacity onPress={() => load(true)} style={styles.retryButton}>
              <RotateCcw size={15} color={accent} />
              <Text style={[styles.retryText, { color: accent }]}>{t.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.controls}>
          <View style={[styles.dateControl, { backgroundColor: surface, borderColor: border }]}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setDateKey(current => shiftSupervisorDateKey(current, -1))}
            >
              <ChevronLeft size={19} color={primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateCenter}
              onPress={() => setDateKey(getSupervisorDateKey())}
            >
              <Text style={[styles.dateText, { color: primary }]}>
                {formatSupervisorDate(dateKey, language)}
              </Text>
              <Text style={[styles.todayText, { color: accent }]}>
                {dateKey === getSupervisorDateKey() ? t.today : dateKey}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setDateKey(current => shiftSupervisorDateKey(current, 1))}
            >
              <ChevronRight size={19} color={primary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSelectorOpen(true)}
            style={[
              styles.selector,
              { backgroundColor: surface, borderColor: border }
            ]}
          >
            <Users size={18} color={accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.selectorLabel, { color: secondary }]}>
                {t.selectPromoter}
              </Text>
              <Text style={[styles.selectorValue, { color: primary }]} numberOfLines={1}>
                {selectedMember?.name || t.allPromoters}
              </Text>
            </View>
            <ChevronDown size={18} color={secondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.counterRow}>
          <View style={[styles.counter, { backgroundColor: `${accent}14` }]}>
            <MapPinned size={14} color={accent} />
            <Text style={[styles.counterText, { color: accent }]}>
              {mapPoints.length + selectedExecutionPoints.length} {t.visible}
            </Text>
          </View>
          <View style={[styles.counter, { backgroundColor: surface }]}>
            <Users size={14} color={secondary} />
            <Text style={[styles.counterText, { color: secondary }]}>
              {visibleMembers.length}/{team.length}
            </Text>
          </View>
        </View>

        <View style={[styles.mapCard, { backgroundColor: surface, borderColor: border }]}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: Number(initial.latitude),
              longitude: Number(initial.longitude),
              latitudeDelta: 0.08,
              longitudeDelta: 0.08
            }}
          >
            {selectedMember && routeCoordinates.length > 1 ? (
              <Polyline
                coordinates={routeCoordinates}
                strokeColor={accent}
                strokeWidth={3}
                lineDashPattern={[8, 6]}
              />
            ) : null}

            {storePoints.map(point => (
              <Marker
                key={point.key}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={point.item?.storeName || point.member.name}
                description={
                  point.type === 'STORE'
                    ? `${t.store} · ${journeyText(point.item?.status)}`
                    : `${t.checkin} · ${journeyText(point.item?.status)}`
                }
                onPress={() => {
                  const journey = point.item;
                  if (!journey) return;
                  const index = (point.member.journey || []).findIndex(x => x === journey);
                  focusJourney(point.member, journey, Math.max(index, 0));
                }}
              >
                <View
                  style={[
                    styles.storeMarker,
                    {
                      backgroundColor: journeyColor(point.item?.status),
                      borderColor: '#FFFFFF'
                    }
                  ]}
                >
                  {point.type === 'STORE' ? (
                    <Store size={15} color="#FFFFFF" />
                  ) : (
                    <MapPin size={15} color="#FFFFFF" />
                  )}
                </View>
              </Marker>
            ))}

            {gpsPoints.map(point => (
              <Marker
                key={point.key}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={`${point.member.name} · ${t.gps}`}
                description={memberStatusText(point.member.operationalStatus)}
              >
                <View style={styles.gpsMarker}>
                  <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </Marker>
            ))}

            {selectedExecutionPoints.map(point => (
              <Marker
                key={point.key}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={`${point.item.storeName || point.member.name} · ${point.kind === 'CHECKIN' ? t.checkin : t.checkout}`}
                description={
                  point.kind === 'CHECKIN'
                    ? formatTime(point.item.checkinAt)
                    : formatTime(point.item.checkoutAt)
                }
              >
                <View
                  style={[
                    styles.executionMarker,
                    {
                      backgroundColor:
                        point.kind === 'CHECKIN'
                          ? '#2563EB'
                          : '#0F172A'
                    }
                  ]}
                >
                  {point.kind === 'CHECKIN' ? (
                    <LocateFixed size={13} color="#FFFFFF" />
                  ) : (
                    <Check size={13} color="#FFFFFF" />
                  )}
                </View>
              </Marker>
            ))}
          </MapView>

          {mapPoints.length === 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.mapEmpty,
                {
                  backgroundColor: dark
                    ? 'rgba(2,6,23,0.82)'
                    : 'rgba(255,255,255,0.88)'
                }
              ]}
            >
              <MapPinned size={34} color={secondary} />
              <Text style={[styles.mapEmptyTitle, { color: primary }]}>
                {t.noJourney}
              </Text>
              <Text style={[styles.mapEmptyText, { color: secondary }]}>
                {t.noPosition}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.legendCard, { backgroundColor: surface, borderColor: border }]}>
          <Text style={[styles.legendTitle, { color: primary }]}>{t.legend}</Text>
          <View style={styles.legendWrap}>
            <Legend icon="store" color="#10B981" text={`${t.store} · ${t.done}`} />
            <Legend icon="gps" color="#2563EB" text={t.gps} />
            <Legend icon="checkin" color="#2563EB" text={t.checkin} />
            <Legend icon="checkout" color="#0F172A" text={t.checkout} />
          </View>
        </View>

        <Text style={[styles.tapHint, { color: secondary }]}>
          {t.tapHint}
        </Text>

        {visibleMembers.map(member => (
          <View key={member.userId} style={styles.memberBlock}>
            <View style={styles.memberHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.memberName, { color: primary }]}>{member.name}</Text>
                <Text style={[styles.memberStatus, { color: secondary }]}>
                  {memberStatusText(member.operationalStatus)}
                </Text>
              </View>

              {member.currentPosition ? (
                <View style={[styles.gpsBadge, { backgroundColor: '#2563EB14' }]}>
                  <Navigation size={13} color="#2563EB" />
                  <Text style={styles.gpsBadgeText}>{t.gps}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.countRow}>
              <Count value={member.counts?.done || 0} label={t.done} color="#10B981" />
              <Count value={member.counts?.inProgress || 0} label={t.inProgress} color="#3B82F6" />
              <Count value={member.counts?.upcoming || 0} label={t.upcoming} color="#F59E0B" />
              <Count value={member.counts?.overdue || 0} label={t.overdue} color="#EF4444" />
            </View>

            <Text style={[styles.routeTitle, { color: primary }]}>{t.route}</Text>

            {(member.journey || []).length === 0 ? (
              <View style={[styles.emptyJourney, { backgroundColor: surface, borderColor: border }]}>
                <Text style={[styles.emptyJourneyText, { color: secondary }]}>
                  {t.noJourney}
                </Text>
              </View>
            ) : (
              [...(member.journey || [])]
                .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
                .map((item, index) => {
                  const itemKey = `${member.userId}:${item.id || index}`;
                  const selected = itemKey === selectedJourneyKey;
                  const hasStore = usableCoordinate(item.storeLatitude, item.storeLongitude);
                  const color = journeyColor(item.status);

                  return (
                    <TouchableOpacity
                      key={itemKey}
                      activeOpacity={0.82}
                      onPress={() => focusJourney(member, item, index)}
                      style={[
                        styles.journeyCard,
                        {
                          backgroundColor: selected ? `${color}12` : surface,
                          borderColor: selected ? color : border
                        }
                      ]}
                    >
                      <View style={[styles.sequenceCircle, { backgroundColor: `${color}18` }]}>
                        <Text style={[styles.sequenceText, { color }]}>
                          {Number(item.sequence || index + 1)}
                        </Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.journeyStore, { color: primary }]} numberOfLines={1}>
                          {item.storeName || t.store}
                        </Text>

                        <View style={styles.journeyMetaRow}>
                          <CircleDot size={10} color={color} />
                          <Text style={[styles.journeyStatus, { color }]}>
                            {journeyText(item.status)}
                          </Text>
                          {sourceText(item.source) ? (
                            <Text style={[styles.sourceText, { color: secondary }]}>
                              · {sourceText(item.source)}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.timeRow}>
                          {item.scheduledStart ? (
                            <Text style={[styles.timeText, { color: secondary }]}>
                              {t.planned}: {item.scheduledStart}
                            </Text>
                          ) : null}

                          {item.checkinAt ? (
                            <Text style={[styles.timeText, { color: secondary }]}>
                              {t.checkin}: {formatTime(item.checkinAt)}
                            </Text>
                          ) : null}

                          {item.checkoutAt ? (
                            <Text style={[styles.timeText, { color: secondary }]}>
                              {t.checkout}: {formatTime(item.checkoutAt)}
                            </Text>
                          ) : null}
                        </View>

                        {!hasStore && selected ? (
                          <Text style={[styles.coordinateHint, { color: '#F59E0B' }]}>
                            {t.storeCoordinatesMissing}
                          </Text>
                        ) : null}
                      </View>

                      <MapPin size={18} color={selected ? color : secondary} />
                    </TouchableOpacity>
                  );
                })
            )}
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={selectorOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectorOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectorOpen(false)}
          />

          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: surface,
                paddingBottom: Math.max(insets.bottom, 16)
              }
            ]}
          >
            <View style={[styles.modalHeader, { borderColor: border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalEyebrow, { color: accent }]}>
                  {t.selectPromoter}
                </Text>
                <Text style={[styles.modalTitle, { color: primary }]}>
                  {selectedMember?.name || t.allPromoters}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setSelectorOpen(false)}>
                <X size={21} color={primary} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBox, { backgroundColor: surfaceAlt, borderColor: border }]}>
              <Search size={17} color={secondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t.search}
                placeholderTextColor={secondary}
                style={[styles.searchInput, { color: primary }]}
              />
            </View>

            <TouchableOpacity
              style={[styles.selectorRow, { borderColor: border }]}
              onPress={() => {
                setSelectedUserId(null);
                setSelectedJourneyKey(null);
                setSelectorOpen(false);
                setSearch('');
              }}
            >
              <View style={[styles.selectorAvatar, { backgroundColor: `${accent}14` }]}>
                <Users size={18} color={accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.selectorRowName, { color: primary }]}>{t.allPromoters}</Text>
              </View>
              {!selectedUserId ? <CheckCircle2 size={19} color={accent} /> : null}
            </TouchableOpacity>

            <FlatList
              data={filteredSelector}
              keyExtractor={item => String(item.userId)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = String(item.userId) === String(selectedUserId);

                return (
                  <TouchableOpacity
                    style={[styles.selectorRow, { borderColor: border }]}
                    onPress={() => {
                      setSelectedUserId(String(item.userId));
                      setSelectedJourneyKey(null);
                      setSelectorOpen(false);
                      setSearch('');
                    }}
                  >
                    <View style={[styles.selectorAvatar, { backgroundColor: `${accent}14` }]}>
                      <Text style={[styles.selectorInitial, { color: accent }]}>
                        {String(item.name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.selectorRowName, { color: primary }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={[styles.selectorRowMeta, { color: secondary }]}>
                        {memberStatusText(item.operationalStatus)}
                      </Text>
                    </View>
                    {selected ? <CheckCircle2 size={19} color={accent} /> : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Legend({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]}>
        {icon === 'store' ? <Store size={10} color="#FFFFFF" /> : null}
        {icon === 'gps' ? <Navigation size={10} color="#FFFFFF" /> : null}
        {icon === 'checkin' ? <LocateFixed size={10} color="#FFFFFF" /> : null}
        {icon === 'checkout' ? <Check size={10} color="#FFFFFF" /> : null}
      </View>
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function Count({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.countItem}>
      <Text style={[styles.countValue, { color }]}>{Number(value || 0)}</Text>
      <Text style={styles.countLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { marginTop: 5, fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { marginTop: 5, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  errorCard: { marginHorizontal: 20, marginTop: 16, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  retryButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  retryText: { fontSize: 10, fontWeight: '900' },
  controls: { paddingHorizontal: 20, marginTop: 16, gap: 10 },
  dateControl: { minHeight: 58, borderWidth: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 52, minHeight: 58, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  dateText: { fontSize: 14, fontWeight: '900', textTransform: 'capitalize' },
  todayText: { marginTop: 2, fontSize: 10, fontWeight: '900' },
  selector: { minHeight: 64, borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 },
  selectorLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  selectorValue: { marginTop: 3, fontSize: 14, fontWeight: '900' },
  counterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 14, marginBottom: 10 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  counterText: { fontSize: 10, fontWeight: '900' },
  mapCard: { marginHorizontal: 20, height: 390, borderWidth: 1, borderRadius: 24, overflow: 'hidden' },
  map: { flex: 1 },
  mapEmpty: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  mapEmptyTitle: { marginTop: 12, fontSize: 16, fontWeight: '900', textAlign: 'center' },
  mapEmptyText: { marginTop: 5, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  storeMarker: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, elevation: 4 },
  gpsMarker: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', borderWidth: 3, borderColor: '#FFFFFF', elevation: 5 },
  executionMarker: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', elevation: 5 },
  legendCard: { marginHorizontal: 20, marginTop: 10, borderWidth: 1, borderRadius: 18, padding: 12 },
  legendTitle: { fontSize: 11, fontWeight: '900', marginBottom: 8 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 20, height: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  legendText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  tapHint: { paddingHorizontal: 22, marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  memberBlock: { paddingHorizontal: 20, marginTop: 22 },
  memberHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontSize: 18, fontWeight: '900' },
  memberStatus: { marginTop: 3, fontSize: 11, fontWeight: '700' },
  gpsBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  gpsBadgeText: { color: '#2563EB', fontSize: 9, fontWeight: '900' },
  countRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  countItem: { flex: 1, minWidth: 0, alignItems: 'center' },
  countValue: { fontSize: 17, fontWeight: '900' },
  countLabel: { marginTop: 2, fontSize: 8, fontWeight: '800', color: '#64748B' },
  routeTitle: { marginTop: 18, marginBottom: 9, fontSize: 13, fontWeight: '900' },
  emptyJourney: { borderWidth: 1, borderRadius: 18, padding: 18 },
  emptyJourneyText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  journeyCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  sequenceCircle: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sequenceText: { fontSize: 11, fontWeight: '900' },
  journeyStore: { fontSize: 13, fontWeight: '900' },
  journeyMetaRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  journeyStatus: { fontSize: 10, fontWeight: '900' },
  sourceText: { fontSize: 9, fontWeight: '700' },
  timeRow: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeText: { fontSize: 9, fontWeight: '700' },
  coordinateHint: { marginTop: 7, fontSize: 9, lineHeight: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.55)' },
  modalCard: { maxHeight: '78%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  modalHeader: { minHeight: 80, borderBottomWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  modalEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  modalTitle: { marginTop: 4, fontSize: 21, fontWeight: '900' },
  closeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  searchBox: { margin: 16, height: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  selectorRow: { minHeight: 64, marginHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 11 },
  selectorAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  selectorInitial: { fontSize: 15, fontWeight: '900' },
  selectorRowName: { fontSize: 14, fontWeight: '900' },
  selectorRowMeta: { marginTop: 2, fontSize: 10, fontWeight: '700' }
});
