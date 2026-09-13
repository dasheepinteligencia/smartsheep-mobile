import React, {
  useCallback,
  useMemo,
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
  useFocusEffect
} from 'expo-router';

import {
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
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
      'Nenhum promotor encontrado.'
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
      'No promoters found.'
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
      'No se encontraron promotores.'
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

  const load =
    useCallback(
      async (
        refresh = false
      ) => {
        if (refresh) {
          setRefreshing(
            true
          );
        }

        try {
          setData(
            await fetchSupervisorCommand(
              user,
              {
                allowCacheFallback:
                  true
              }
            )
          );
        } finally {
          setLoading(
            false
          );

          setRefreshing(
            false
          );
        }
      },
      [user]
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
                <Store
                  size={20}
                  color={
                    accent
                  }
                />

                <View
                  style={{
                    flex: 1
                  }}
                >
                  <Text
                    style={[
                      styles.lastVisitName,
                      {
                        color:
                          primary
                      }
                    ]}
                  >
                    {selected
                      ?.lastVisit
                      ?.storeName ||
                      t.noVisit}
                  </Text>

                  {selected
                    ?.lastVisit
                    ?.status && (
                    <Text
                      style={[
                        styles.lastVisitStatus,
                        {
                          color:
                            secondary
                        }
                      ]}
                    >
                      {selected
                        .lastVisit
                        .status}
                    </Text>
                  )}
                </View>
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
      borderRadius:
        18,

      padding: 14,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 11
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
