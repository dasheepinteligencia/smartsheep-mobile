import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  ActivityIndicator,
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

import {
  useFocusEffect,
  useRouter
} from 'expo-router';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  MapPinned,
  RotateCcw,
  Search,
  Store,
  Trophy,
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
  fetchSupervisorCommand,
  getFieldTeamMembers,
  SupervisorCommandData,
  SupervisorMember
} from '../../services/supervisorCommandService';

import {
  fetchSupervisorMemberHistory,
  SupervisorHistoryDetail
} from '../../services/supervisorPhase2Service';

const TEXTS = {
  'pt-BR': {
    eyebrow:
      'GESTÃO DE CAMPO',

    title:
      'Minha Equipe',

    subtitle:
      'Execução individual, Perfect Store e Performance.',

    search:
      'Buscar promotor...',

    visits:
      'Visitas',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points:
      'pts',

    lastVisit:
      'Última visita',

    noVisit:
      'Nenhuma visita hoje',

    visitDate: 'Data/hora',
    checkin: 'Check-in',
    checkout: 'Check-out',
    openMap: 'Ver no mapa',

    planned:
      'planejadas',

    done:
      'realizadas',

    progress:
      'em andamento',

    pending:
      'pendentes',

    audits:
      'auditorias · 30 dias',

    detail:
      'Cockpit do Promotor',

    close:
      'Fechar',

    empty:
      'Nenhum promotor encontrado.',

    unavailable:
      'Não foi possível atualizar a equipe agora.',

    retry:
      'Tentar novamente',

    psHistory: 'Histórico Perfect Store',
    performanceHistory: 'Histórico Performance',
    loadingHistory: 'Carregando histórico...',
    noHistory: 'Sem registros no período.',
    fullHistory: 'Ver histórico detalhado',
    campaignHistory: 'Campanhas e extrato completo'
  },

  'en-US': {
    eyebrow:
      'FIELD MANAGEMENT',

    title:
      'My Team',

    subtitle:
      'Individual execution, Perfect Store and Performance.',

    search:
      'Search promoter...',

    visits:
      'Visits',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points:
      'pts',

    lastVisit:
      'Last visit',

    noVisit:
      'No visits today',

    visitDate: 'Date/time',
    checkin: 'Check-in',
    checkout: 'Check-out',
    openMap: 'View on map',

    planned:
      'planned',

    done:
      'completed',

    progress:
      'in progress',

    pending:
      'pending',

    audits:
      'audits · 30 days',

    detail:
      'Promoter Cockpit',

    close:
      'Close',

    empty:
      'No promoters found.',

    unavailable:
      'Unable to update the team right now.',

    retry:
      'Try again',

    psHistory: 'Perfect Store history',
    performanceHistory: 'Performance history',
    loadingHistory: 'Loading history...',
    noHistory: 'No records in the period.',
    fullHistory: 'View detailed history',
    campaignHistory: 'Campaigns and full statement'
  },

  'es-ES': {
    eyebrow:
      'GESTIÓN DE CAMPO',

    title:
      'Mi Equipo',

    subtitle:
      'Ejecución individual, Perfect Store y Performance.',

    search:
      'Buscar promotor...',

    visits:
      'Visitas',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points:
      'pts',

    lastVisit:
      'Última visita',

    noVisit:
      'Sin visitas hoy',

    visitDate: 'Fecha/hora',
    checkin: 'Check-in',
    checkout: 'Check-out',
    openMap: 'Ver en el mapa',

    planned:
      'planificadas',

    done:
      'realizadas',

    progress:
      'en curso',

    pending:
      'pendientes',

    audits:
      'auditorías · 30 días',

    detail:
      'Cockpit del Promotor',

    close:
      'Cerrar',

    empty:
      'No se encontraron promotores.',

    unavailable:
      'No fue posible actualizar el equipo ahora.',

    retry:
      'Intentar de nuevo',

    psHistory: 'Historial Perfect Store',
    performanceHistory: 'Historial Performance',
    loadingHistory: 'Cargando historial...',
    noHistory: 'Sin registros en el período.',
    fullHistory: 'Ver historial detallado',
    campaignHistory: 'Campañas y extracto completo'
  }
} as const;

const texts = (
  language: string
) =>
  TEXTS[
    language === 'en-US' ||
    language === 'es-ES'
      ? language
      : 'pt-BR'
  ];

export default function SupervisorTeam() {
  const router =
    useRouter();

  const insets =
    useSafeAreaInsets();

  const {
    user
  } =
    useAuthStore();

  const {
    theme,
    language,
    accentColor
  } =
    useSettingsStore();

  const t =
    texts(language);

  const dark =
    theme === 'dark';

  const accent =
    accentColor ||
    '#FF7A00';

  const bg =
    dark
      ? '#020617'
      : '#F8FAFC';

  const surface =
    dark
      ? '#111827'
      : '#FFFFFF';

  const surfaceAlt =
    dark
      ? '#172033'
      : '#F1F5F9';

  const border =
    dark
      ? '#253047'
      : '#E2E8F0';

  const primary =
    dark
      ? '#F8FAFC'
      : '#0F172A';

  const secondary =
    dark
      ? '#94A3B8'
      : '#64748B';

  const [
    data,
    setData
  ] =
    useState<SupervisorCommandData | null>(
      null
    );

  const [
    loading,
    setLoading
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing
  ] =
    useState(false);

  const [
    query,
    setQuery
  ] =
    useState('');

  const [
    selected,
    setSelected
  ] =
    useState<SupervisorMember | null>(
      null
    );

  const [
    error,
    setError
  ] =
    useState('');

  const [
    history,
    setHistory
  ] =
    useState<SupervisorHistoryDetail>({
      perfectStore: [],
      performance: []
    });

  const [
    historyLoading,
    setHistoryLoading
  ] =
    useState(false);

  // SUPERVISOR_TEAM_REFRESH_FIX_V2
  // Evita chamadas concorrentes por foco + pull-to-refresh.
  const requestInFlight =
    useRef(false);

  const load =
    useCallback(
      async (
        refresh = false
      ) => {
        if (
          requestInFlight.current
        ) {
          return;
        }

        requestInFlight.current =
          true;

        if (refresh) {
          setRefreshing(
            true
          );
        }

        try {
          const result =
            await fetchSupervisorCommand(
              user,
              {
                allowCacheFallback:
                  true
              }
            );

          setData(result);
          setError('');
        } catch (
          e: any
        ) {
          setError(
            String(
              e?.message ||
              t.unavailable
            )
          );
        } finally {
          requestInFlight.current =
            false;

          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [
        user,
        t.unavailable
      ]
    );

  useFocusEffect(
    useCallback(
      () => {
        load(false);
      },
      [load]
    )
  );

  const team =
    useMemo(
      () => {
        const all =
          getFieldTeamMembers(
            data,
            user?.id
          );

        const normalized =
          query
            .normalize('NFD')
            .replace(
              /[\u0300-\u036f]/g,
              ''
            )
            .toLowerCase()
            .trim();

        if (!normalized) {
          return all;
        }

        return all.filter(
          member =>
            [
              member.nome,
              member.cargo,
              member.email
            ]
              .filter(Boolean)
              .join(' ')
              .normalize('NFD')
              .replace(
                /[\u0300-\u036f]/g,
                ''
              )
              .toLowerCase()
              .includes(
                normalized
              )
        );
      },
      [
        data,
        user?.id,
        query
      ]
    );

  useEffect(
    () => {
      if (
        !selected?.id
      ) {
        return;
      }

      const fresh =
        getFieldTeamMembers(
          data,
          user?.id
        ).find(
          member =>
            String(member.id) ===
            String(selected.id)
        );

      if (fresh) {
        setSelected(fresh);
      } else {
        setSelected(null);
      }
    },
    [
      data,
      user?.id,
      selected?.id
    ]
  );

  useEffect(
    () => {
      let active = true;

      if (!selected?.id) {
        setHistory({ perfectStore: [], performance: [] });
        setHistoryLoading(false);
        return () => { active = false; };
      }

      setHistoryLoading(true);

      fetchSupervisorMemberHistory(
        user,
        String(selected.id)
      )
        .then(result => {
          if (active) setHistory(result);
        })
        .catch(() => {
          if (active) {
            setHistory({ perfectStore: [], performance: [] });
          }
        })
        .finally(() => {
          if (active) setHistoryLoading(false);
        });

      return () => {
        active = false;
      };
    },
    [selected?.id, user]
  );

  const formatHistoryDate = (value: any, includeTime = false) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return includeTime
      ? date.toLocaleString([], {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : date.toLocaleDateString();
  };

  const psColor =
    (
      value: any
    ) => {
      const n =
        Number(
          value ||
          0
        );

      if (n >= 80) {
        return '#10B981';
      }

      if (n >= 60) {
        return '#F59E0B';
      }

      return '#EF4444';
    };

  if (
    loading &&
    !data
  ) {
    return (
      <View
        style={[
          styles.center,
          {
            backgroundColor:
              bg
          }
        ]}
      >
        <ActivityIndicator
          size="large"
          color={accent}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            bg
        }
      ]}
    >
      <StatusBar
        barStyle={
          dark
            ? 'light-content'
            : 'dark-content'
        }
        backgroundColor={
          bg
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop:
            insets.top + 14,

          paddingHorizontal:
            20,

          paddingBottom:
            116
        }}
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={() =>
              load(true)
            }
            tintColor={
              accent
            }
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        <Text
          style={[
            styles.eyebrow,
            {
              color:
                accent
            }
          ]}
        >
          {t.eyebrow}
        </Text>

        <Text
          style={[
            styles.title,
            {
              color:
                primary
            }
          ]}
        >
          {t.title}
        </Text>

        <Text
          style={[
            styles.subtitle,
            {
              color:
                secondary
            }
          ]}
        >
          {t.subtitle}
        </Text>

        {error ? (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor:
                  dark
                    ? '#3F1D24'
                    : '#FEF2F2',

                borderColor:
                  dark
                    ? '#7F1D1D'
                    : '#FECACA'
              }
            ]}
          >
            <AlertTriangle
              size={18}
              color="#EF4444"
            />

            <Text
              style={[
                styles.errorText,
                {
                  color:
                    dark
                      ? '#FECACA'
                      : '#991B1B'
                }
              ]}
            >
              {t.unavailable}
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() =>
                load(true)
              }
              style={
                styles.retryButton
              }
            >
              <RotateCcw
                size={15}
                color={accent}
              />

              <Text
                style={[
                  styles.retryText,
                  {
                    color:
                      accent
                  }
                ]}
              >
                {t.retry}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View
          style={[
            styles.search,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          <Search
            size={18}
            color={
              secondary
            }
          />

          <TextInput
            value={query}
            onChangeText={
              setQuery
            }
            placeholder={
              t.search
            }
            placeholderTextColor={
              secondary
            }
            style={[
              styles.searchInput,
              {
                color:
                  primary
              }
            ]}
          />
        </View>

        <View
          style={
            styles.list
          }
        >
          {team.length ===
          0 ? (
            <Text
              style={[
                styles.empty,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.empty}
            </Text>
          ) : (
            team.map(
              member => {
                const visits =
                  member.visits ||
                  {};

                const ps =
                  member
                    ?.perfectStore
                    ?.average;

                return (
                  <TouchableOpacity
                    key={
                      member.id
                    }
                    activeOpacity={
                      0.82
                    }
                    onPress={() =>
                      setSelected(
                        member
                      )
                    }
                    style={[
                      styles.memberCard,
                      {
                        backgroundColor:
                          surface,

                        borderColor:
                          border
                      }
                    ]}
                  >
                    <View
                      style={
                        styles.memberHeader
                      }
                    >
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor:
                              `${accent}16`
                          }
                        ]}
                      >
                        <Text
                          style={[
                            styles.avatarText,
                            {
                              color:
                                accent
                            }
                          ]}
                        >
                          {String(
                            member.nome ||
                            '?'
                          )
                            .charAt(0)
                            .toUpperCase()}
                        </Text>
                      </View>

                      <View
                        style={{
                          flex: 1
                        }}
                      >
                        <Text
                          style={[
                            styles.memberName,
                            {
                              color:
                                primary
                            }
                          ]}
                        >
                          {member.nome}
                        </Text>

                        <Text
                          style={[
                            styles.memberRole,
                            {
                              color:
                                secondary
                            }
                          ]}
                        >
                          {member.cargo ||
                            member.roleName ||
                            ''}
                        </Text>
                      </View>

                      <ChevronRight
                        size={20}
                        color={
                          secondary
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.stats
                      }
                    >
                      <View
                        style={[
                          styles.stat,
                          {
                            backgroundColor:
                              surfaceAlt
                          }
                        ]}
                      >
                        <CircleGauge
                          size={15}
                          color="#3B82F6"
                        />

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                primary
                            }
                          ]}
                        >
                          {Number(
                            visits.done ||
                            0
                          )}
                          /
                          {Number(
                            visits.total ||
                            0
                          )}
                        </Text>

                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                secondary
                            }
                          ]}
                        >
                          {t.visits}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.stat,
                          {
                            backgroundColor:
                              surfaceAlt
                          }
                        ]}
                      >
                        <Store
                          size={15}
                          color={
                            psColor(
                              ps
                            )
                          }
                        />

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                primary
                            }
                          ]}
                        >
                          {ps ??
                            '—'}%
                        </Text>

                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                secondary
                            }
                          ]}
                        >
                          PS
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.stat,
                          {
                            backgroundColor:
                              surfaceAlt
                          }
                        ]}
                      >
                        <Trophy
                          size={15}
                          color="#F59E0B"
                        />

                        <Text
                          style={[
                            styles.statValue,
                            {
                              color:
                                primary
                            }
                          ]}
                        >
                          {Number(
                            member
                              ?.performance
                              ?.points30d ||
                            0
                          )}
                        </Text>

                        <Text
                          style={[
                            styles.statLabel,
                            {
                              color:
                                secondary
                            }
                          ]}
                        >
                          {t.points}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.progressTrack,
                        {
                          backgroundColor:
                            surfaceAlt
                        }
                      ]}
                    >
                      <View
                        style={{
                          width:
                            `${Math.min(
                              100,
                              Math.max(
                                0,
                                Number(
                                  visits.percent ||
                                  0
                                )
                              )
                            )}%`,

                          height:
                            '100%',

                          borderRadius:
                            99,

                          backgroundColor:
                            Number(
                              visits.percent ||
                              0
                            ) >= 80
                              ? '#10B981'
                              : Number(
                                    visits.percent ||
                                    0
                                  ) >= 50
                                ? '#F59E0B'
                                : '#EF4444'
                        }}
                      />
                    </View>
                  </TouchableOpacity>
                );
              }
            )
          )}
        </View>
      </ScrollView>

      <Modal
        visible={
          Boolean(
            selected
          )
        }
        animationType="slide"
        transparent
        onRequestClose={() =>
          setSelected(null)
        }
      >
        <View
          style={
            styles.modalOverlay
          }
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  surface
              }
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                {
                  borderBottomColor:
                    border
                }
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.modalEyebrow,
                    {
                      color:
                        accent
                    }
                  ]}
                >
                  {t.detail}
                </Text>

                <Text
                  style={[
                    styles.modalTitle,
                    {
                      color:
                        primary
                    }
                  ]}
                >
                  {selected?.nome}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.closeButton,
                  {
                    backgroundColor:
                      surfaceAlt
                  }
                ]}
                onPress={() =>
                  setSelected(
                    null
                  )
                }
              >
                <X
                  size={20}
                  color={
                    primary
                  }
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={
                styles.modalContent
              }
            >
              <View
                style={
                  styles.bigMetricRow
                }
              >
                <View
                  style={[
                    styles.bigMetric,
                    {
                      backgroundColor:
                        surfaceAlt
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.bigValue,
                      {
                        color:
                          primary
                      }
                    ]}
                  >
                    {Number(
                      selected
                        ?.visits
                        ?.percent ||
                      0
                    )}%
                  </Text>

                  <Text
                    style={[
                      styles.bigLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.visits}
                  </Text>
                </View>

                <View
                  style={[
                    styles.bigMetric,
                    {
                      backgroundColor:
                        surfaceAlt
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.bigValue,
                      {
                        color:
                          psColor(
                            selected
                              ?.perfectStore
                              ?.average
                          )
                      }
                    ]}
                  >
                    {selected
                      ?.perfectStore
                      ?.average ??
                      '—'}%
                  </Text>

                  <Text
                    style={[
                      styles.bigLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.perfect}
                  </Text>
                </View>

                <View
                  style={[
                    styles.bigMetric,
                    {
                      backgroundColor:
                        surfaceAlt
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.bigValue,
                      {
                        color:
                          '#F59E0B'
                      }
                    ]}
                  >
                    {Number(
                      selected
                        ?.performance
                        ?.points30d ||
                      0
                    )}
                  </Text>

                  <Text
                    style={[
                      styles.bigLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.performance}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.detailBox,
                  {
                    borderColor:
                      border
                  }
                ]}
              >
                <View
                  style={
                    styles.detailRow
                  }
                >
                  <CheckCircle2
                    size={17}
                    color="#10B981"
                  />

                  <Text
                    style={[
                      styles.detailLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.done}
                  </Text>

                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          primary
                      }
                    ]}
                  >
                    {Number(
                      selected
                        ?.visits
                        ?.done ||
                      0
                    )}
                  </Text>
                </View>

                <View
                  style={
                    styles.detailRow
                  }
                >
                  <CircleGauge
                    size={17}
                    color="#3B82F6"
                  />

                  <Text
                    style={[
                      styles.detailLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.progress}
                  </Text>

                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          primary
                      }
                    ]}
                  >
                    {Number(
                      selected
                        ?.visits
                        ?.inProgress ||
                      0
                    )}
                  </Text>
                </View>

                <View
                  style={
                    styles.detailRow
                  }
                >
                  <Clock3
                    size={17}
                    color="#F59E0B"
                  />

                  <Text
                    style={[
                      styles.detailLabel,
                      {
                        color:
                          secondary
                      }
                    ]}
                  >
                    {t.pending}
                  </Text>

                  <Text
                    style={[
                      styles.detailValue,
                      {
                        color:
                          primary
                      }
                    ]}
                  >
                    {Number(
                      selected
                        ?.visits
                        ?.pending ||
                      0
                    )}
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  styles.blockTitle,
                  {
                    color:
                      primary
                  }
                ]}
              >
                {t.lastVisit}
              </Text>

              <View
                style={[
                  styles.lastVisit,
                  {
                    backgroundColor:
                      surfaceAlt
                  }
                ]}
              >
                <View style={styles.lastVisitTopRow}>
                  <Store
                    size={20}
                    color={accent}
                  />

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.lastVisitName, { color: primary }]}
                      numberOfLines={2}
                    >
                      {selected?.lastVisit?.storeName || t.noVisit}
                    </Text>

                    {selected?.lastVisit?.status ? (
                      <Text style={[styles.lastVisitStatus, { color: secondary }]}>
                        {selected.lastVisit.status}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {selected?.lastVisit ? (
                  <>
                    <View style={styles.lastVisitDetails}>
                      {selected.lastVisit.checkinAt ? (
                        <View style={styles.lastVisitDetailRow}>
                          <Clock3 size={14} color={secondary} />
                          <Text style={[styles.lastVisitDetailText, { color: secondary }]}>
                            {t.checkin}: {formatHistoryDate(selected.lastVisit.checkinAt, true)}
                          </Text>
                        </View>
                      ) : null}

                      {selected.lastVisit.checkoutAt ? (
                        <View style={styles.lastVisitDetailRow}>
                          <CheckCircle2 size={14} color={secondary} />
                          <Text style={[styles.lastVisitDetailText, { color: secondary }]}>
                            {t.checkout}: {formatHistoryDate(selected.lastVisit.checkoutAt, true)}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.82}
                      onPress={() => {
                        if (!selected?.id) return;
                        router.push({
                          pathname: '/(supervisor)/mapa' as any,
                          params: {
                            userId: String(selected.id),
                            visitId: String(selected.lastVisit?.id || '')
                          }
                        });
                      }}
                      style={[styles.mapVisitButton, { backgroundColor: `${accent}14` }]}
                    >
                      <MapPinned size={16} color={accent} />
                      <Text style={[styles.mapVisitButtonText, { color: accent }]}>
                        {t.openMap}
                      </Text>
                      <ChevronRight size={15} color={accent} />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>

              <Text
                style={[
                  styles.auditHint,
                  {
                    color:
                      secondary
                  }
                ]}
              >
                {Number(
                  selected
                    ?.perfectStore
                    ?.audits30d ||
                  0
                )}{' '}
                {t.audits}
              </Text>

              <View style={styles.historySectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockTitle, { color: primary, marginBottom: 2 }]}>
                    {t.psHistory}
                  </Text>
                  <Text style={[styles.historySectionHint, { color: secondary }]}>
                    {t.campaignHistory}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    if (!selected?.id) return;
                    router.push({
                      pathname: '/(supervisor)/historico-equipe' as any,
                      params: {
                        userId: String(selected.id),
                        userName: String(selected.nome || ''),
                        section: 'perfectStore'
                      }
                    });
                  }}
                  style={[styles.fullHistoryButton, { backgroundColor: `${accent}14` }]}
                >
                  <Text style={[styles.fullHistoryButtonText, { color: accent }]}>
                    {t.fullHistory}
                  </Text>
                  <ChevronRight size={16} color={accent} />
                </TouchableOpacity>
              </View>

              {historyLoading ? (
                <Text style={[styles.historyEmpty, { color: secondary }]}>
                  {t.loadingHistory}
                </Text>
              ) : history.perfectStore.length === 0 ? (
                <Text style={[styles.historyEmpty, { color: secondary }]}>
                  {t.noHistory}
                </Text>
              ) : (
                history.perfectStore.slice(0, 5).map((item: any, index: number) => (
                  <View key={item?.id || index} style={[styles.historyRow, { borderColor: border }]}>
                    <Store size={16} color={accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTitle, { color: primary }]} numberOfLines={1}>
                        {item?.lojaNome || item?.loja_nome || item?.storeName || item?.store_name || item?.loja?.nome || item?.nome || 'Perfect Store'}
                      </Text>
                      <Text style={[styles.historyMeta, { color: secondary }]} numberOfLines={1}>
                        {[
                          item?.scorePercent != null ? `${Math.round(Number(item.scorePercent))}%` : null,
                          item?.percentual != null ? `${Math.round(Number(item.percentual))}%` : null,
                          item?.scoreAtual != null ? `${Math.round(Number(item.scoreAtual))}%` : null,
                          item?.scoreAtingido != null && item?.scoreMaximo
                            ? `${Math.round((Number(item.scoreAtingido) / Math.max(1, Number(item.scoreMaximo))) * 100)}%`
                            : null,
                          item?.nivel || item?.level || null,
                          formatHistoryDate(item?.data || item?.dataAvaliacao || item?.criado_em || item?.createdAt)
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              <View style={[styles.historySectionHeader, { marginTop: 20 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockTitle, { color: primary, marginBottom: 2 }]}>
                    {t.performanceHistory}
                  </Text>
                  <Text style={[styles.historySectionHint, { color: secondary }]}>
                    {t.campaignHistory}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => {
                    if (!selected?.id) return;
                    router.push({
                      pathname: '/(supervisor)/historico-equipe' as any,
                      params: {
                        userId: String(selected.id),
                        userName: String(selected.nome || ''),
                        section: 'performance'
                      }
                    });
                  }}
                  style={[styles.fullHistoryButton, { backgroundColor: '#F59E0B14' }]}
                >
                  <Text style={[styles.fullHistoryButtonText, { color: '#F59E0B' }]}>
                    {t.fullHistory}
                  </Text>
                  <ChevronRight size={16} color="#F59E0B" />
                </TouchableOpacity>
              </View>

              {historyLoading ? (
                <Text style={[styles.historyEmpty, { color: secondary }]}>
                  {t.loadingHistory}
                </Text>
              ) : history.performance.length === 0 ? (
                <Text style={[styles.historyEmpty, { color: secondary }]}>
                  {t.noHistory}
                </Text>
              ) : (
                history.performance.slice(0, 8).map((item: any, index: number) => (
                  <View key={item?.id || index} style={[styles.historyRow, { borderColor: border }]}>
                    <Trophy size={16} color="#F59E0B" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyTitle, { color: primary }]} numberOfLines={1}>
                        {item?.descricao || item?.description || item?.regra_nome || item?.ruleName || item?.campanhaNome || item?.campaignName || item?.origem || 'Performance'}
                      </Text>
                      <Text style={[styles.historyMeta, { color: secondary }]} numberOfLines={1}>
                        {[
                          item?.pontos != null ? `${Number(item.pontos)} pts` : null,
                          item?.points != null ? `${Number(item.points)} pts` : null,
                          item?.score != null ? `${Number(item.score)} pts` : null,
                          item?.lojaNome || item?.loja_nome || item?.storeName || null,
                          formatHistoryDate(item?.data || item?.dataEvento || item?.criado_em || item?.createdAt)
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1
    },

    center: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    eyebrow: {
      fontSize: 10,

      fontWeight:
        '900',

      letterSpacing:
        1.7
    },

    title: {
      marginTop: 5,

      fontSize: 27,

      fontWeight:
        '900',

      letterSpacing:
        -0.8
    },

    subtitle: {
      marginTop: 5,

      fontSize: 13,

      lineHeight: 19,

      fontWeight:
        '600'
    },

    search: {
      height: 52,

      marginTop: 20,

      borderWidth: 1,

      borderRadius:
        18,

      paddingHorizontal:
        15,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 10
    },

    searchInput: {
      flex: 1,

      fontSize: 14,

      fontWeight:
        '600'
    },

    list: {
      marginTop: 14,

      gap: 12
    },

    errorCard: {
      marginTop: 16,

      borderWidth: 1,

      borderRadius: 16,

      padding: 12,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 10
    },

    errorText: {
      flex: 1,

      fontSize: 11,

      fontWeight:
        '700',

      lineHeight: 16
    },

    retryButton: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 5
    },

    retryText: {
      fontSize: 10,

      fontWeight:
        '900'
    },

    empty: {
      textAlign:
        'center',

      marginTop: 30,

      fontWeight:
        '600'
    },

    memberCard: {
      borderWidth: 1,

      borderRadius:
        23,

      padding: 15
    },

    memberHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 11
    },

    avatar: {
      width: 44,

      height: 44,

      borderRadius:
        15,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    avatarText: {
      fontSize: 18,

      fontWeight:
        '900'
    },

    memberName: {
      fontSize: 15,

      fontWeight:
        '900'
    },

    memberRole: {
      marginTop: 2,

      fontSize: 11,

      fontWeight:
        '600'
    },

    stats: {
      marginTop: 14,

      flexDirection:
        'row',

      gap: 8
    },

    stat: {
      flex: 1,

      minHeight: 76,

      borderRadius:
        16,

      padding: 10,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    statValue: {
      marginTop: 4,

      fontSize: 16,

      fontWeight:
        '900'
    },

    statLabel: {
      marginTop: 1,

      fontSize: 9,

      fontWeight:
        '800'
    },

    progressTrack: {
      marginTop: 13,

      height: 5,

      borderRadius:
        99,

      overflow:
        'hidden'
    },

    historySectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10
    },

    historySectionHint: {
      fontSize: 10,
      fontWeight: '600'
    },

    fullHistoryButton: {
      minHeight: 36,
      borderRadius: 12,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5
    },

    fullHistoryButtonText: {
      fontSize: 9,
      fontWeight: '900'
    },

    historyRow: {
      minHeight: 58,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10
    },

    historyTitle: {
      fontSize: 12,
      fontWeight: '900'
    },

    historyMeta: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '600'
    },

    historyEmpty: {
      fontSize: 11,
      fontWeight: '600',
      paddingVertical: 12
    },

    modalOverlay: {
      flex: 1,

      backgroundColor:
        'rgba(0,0,0,0.55)',

      justifyContent:
        'flex-end'
    },

    modalCard: {
      maxHeight:
        '88%',

      borderTopLeftRadius:
        30,

      borderTopRightRadius:
        30
    },

    modalHeader: {
      padding: 20,

      borderBottomWidth:
        StyleSheet
          .hairlineWidth,

      flexDirection:
        'row',

      justifyContent:
        'space-between',

      alignItems:
        'center'
    },

    modalEyebrow: {
      fontSize: 9,

      fontWeight:
        '900',

      letterSpacing:
        1.3
    },

    modalTitle: {
      marginTop: 4,

      fontSize: 22,

      fontWeight:
        '900'
    },

    closeButton: {
      width: 40,

      height: 40,

      borderRadius:
        14,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    modalContent: {
      padding: 20,

      paddingBottom:
        42
    },

    bigMetricRow: {
      flexDirection:
        'row',

      gap: 8
    },

    bigMetric: {
      flex: 1,

      minHeight: 94,

      borderRadius:
        18,

      padding: 11,

      justifyContent:
        'center',

      alignItems:
        'center'
    },

    bigValue: {
      fontSize: 22,

      fontWeight:
        '900'
    },

    bigLabel: {
      marginTop: 4,

      fontSize: 9,

      fontWeight:
        '800',

      textAlign:
        'center'
    },

    detailBox: {
      marginTop: 16,

      borderWidth: 1,

      borderRadius:
        20,

      paddingHorizontal:
        15
    },

    detailRow: {
      minHeight: 49,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 10
    },

    detailLabel: {
      flex: 1,

      fontSize: 12,

      fontWeight:
        '700'
    },

    detailValue: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    blockTitle: {
      marginTop: 20,

      marginBottom: 9,

      fontSize: 11,

      fontWeight:
        '900',

      letterSpacing:
        1
    },

    lastVisit: {
      borderRadius: 18,
      padding: 14,
      gap: 10
    },

    lastVisitTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11
    },

    lastVisitDetails: {
      marginTop: 2,
      gap: 6
    },

    lastVisitDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7
    },

    lastVisitDetailText: {
      flex: 1,
      fontSize: 10,
      fontWeight: '700'
    },

    mapVisitButton: {
      marginTop: 4,
      minHeight: 38,
      borderRadius: 13,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7
    },

    mapVisitButtonText: {
      flex: 1,
      fontSize: 11,
      fontWeight: '900',
      textAlign: 'center'
    },

    lastVisitName: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    lastVisitStatus: {
      marginTop: 3,

      fontSize: 10,

      fontWeight:
        '700'
    },

    auditHint: {
      marginTop: 11,

      textAlign:
        'center',

      fontSize: 10,

      fontWeight:
        '600'
    }
  });
