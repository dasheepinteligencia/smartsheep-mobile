import React, {
  useCallback,
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
  useFocusEffect,
  useRouter
} from 'expo-router';

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  MapPinned,
  ShieldAlert,
  Store,
  Trophy,
  Users,
  WifiOff
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
  calculateVisibleTeamSummary,
  fetchSupervisorCommand,
  getFieldTeamMembers,
  SupervisorCommandData
} from '../../services/supervisorCommandService';

const TEXTS = {
  'pt-BR': {
    eyebrow:
      'OMNI FIELD SUPERVISOR',

    hello:
      'Olá',

    title:
      'Command Center',

    subtitle:
      'Sua operação em campo, agora.',

    online:
      'Atualizado agora',

    cached:
      'Visualização offline',

    team:
      'Equipe',

    active:
      'em campo',

    visits:
      'Visitas',

    done:
      'concluídas',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points30:
      'pts · 30 dias',

    radar:
      'RADAR DE PRIORIDADES',

    radarSubtitle:
      'Onde sua atenção gera mais impacto agora',

    critical:
      'LOJAS CRÍTICAS',

    criticalSubtitle:
      'Menor Perfect Store nos últimos 30 dias',

    teamNow:
      'EQUIPE AGORA',

    seeTeam:
      'Ver equipe',

    seeMap:
      'Abrir mapa',

    noPriority:
      'Nenhuma prioridade crítica agora.',

    noCritical:
      'Nenhuma loja crítica no período.',

    notStarted:
      'Não iniciou',

    inField:
      'Em campo',

    activeStatus:
      'Ativo',

    visitsLabel:
      'visitas',

    ps:
      'PS',

    unavailable:
      'Não foi possível carregar o Command Center.',

    retry:
      'Tentar novamente',

    criticalStore:
      'Loja crítica',

    teamAttention:
      'Atenção na equipe'
  },

  'en-US': {
    eyebrow:
      'OMNI FIELD SUPERVISOR',

    hello:
      'Hello',

    title:
      'Command Center',

    subtitle:
      'Your field operation, right now.',

    online:
      'Updated now',

    cached:
      'Offline view',

    team:
      'Team',

    active:
      'in field',

    visits:
      'Visits',

    done:
      'completed',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points30:
      'pts · 30 days',

    radar:
      'PRIORITY RADAR',

    radarSubtitle:
      'Where your attention has the most impact now',

    critical:
      'CRITICAL STORES',

    criticalSubtitle:
      'Lowest Perfect Store in the last 30 days',

    teamNow:
      'TEAM NOW',

    seeTeam:
      'View team',

    seeMap:
      'Open map',

    noPriority:
      'No critical priorities right now.',

    noCritical:
      'No critical stores in the period.',

    notStarted:
      'Not started',

    inField:
      'In field',

    activeStatus:
      'Active',

    visitsLabel:
      'visits',

    ps:
      'PS',

    unavailable:
      'Could not load the Command Center.',

    retry:
      'Try again',

    criticalStore:
      'Critical store',

    teamAttention:
      'Team attention'
  },

  'es-ES': {
    eyebrow:
      'OMNI FIELD SUPERVISOR',

    hello:
      'Hola',

    title:
      'Command Center',

    subtitle:
      'Tu operación en campo, ahora.',

    online:
      'Actualizado ahora',

    cached:
      'Vista sin conexión',

    team:
      'Equipo',

    active:
      'en campo',

    visits:
      'Visitas',

    done:
      'realizadas',

    perfect:
      'Perfect Store',

    performance:
      'Performance',

    points30:
      'pts · 30 días',

    radar:
      'RADAR DE PRIORIDADES',

    radarSubtitle:
      'Dónde tu atención genera más impacto ahora',

    critical:
      'TIENDAS CRÍTICAS',

    criticalSubtitle:
      'Menor Perfect Store en los últimos 30 días',

    teamNow:
      'EQUIPO AHORA',

    seeTeam:
      'Ver equipo',

    seeMap:
      'Abrir mapa',

    noPriority:
      'No hay prioridades críticas ahora.',

    noCritical:
      'No hay tiendas críticas en el período.',

    notStarted:
      'No inició',

    inField:
      'En campo',

    activeStatus:
      'Activo',

    visitsLabel:
      'visitas',

    ps:
      'PS',

    unavailable:
      'No fue posible cargar el Command Center.',

    retry:
      'Intentar de nuevo',

    criticalStore:
      'Tienda crítica',

    teamAttention:
      'Atención en el equipo'
  }
} as const;

const getTexts = (
  language: string
) =>
  TEXTS[
    language === 'en-US' ||
    language === 'es-ES'
      ? language
      : 'pt-BR'
  ];

const clamp =
  (
    value: number,
    min = 0,
    max = 100
  ) =>
    Math.min(
      max,
      Math.max(
        min,
        value
      )
    );

export default function SupervisorHome() {
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
    getTexts(
      language
    );

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
    error,
    setError
  ] =
    useState('');

  const load =
    useCallback(
      async (
        refresh = false
      ) => {
        if (refresh) {
          setRefreshing(
            true
          );
        } else if (!data) {
          setLoading(
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
        data,
        t.unavailable
      ]
    );

  useFocusEffect(
    useCallback(
      () => {
        load(false);

        const timer =
          setInterval(
            () =>
              load(false),
            60000
          );

        return () =>
          clearInterval(
            timer
          );
      },
      [load]
    )
  );

  const team =
    useMemo(
      () =>
        getFieldTeamMembers(
          data,
          user?.id
        ),
      [
        data,
        user?.id
      ]
    );

  const summary =
    useMemo(
      () =>
        calculateVisibleTeamSummary(
          team
        ),
      [team]
    );

  const priorities =
    Array.isArray(
      data?.priorities
    )
      ? data!.priorities!
      : [];

  const criticalStores =
    Array.isArray(
      data?.criticalStores
    )
      ? data!
          .criticalStores!
          .slice(
            0,
            5
          )
      : [];

  const firstName =
    String(
      user?.nome ||
      ''
    )
      .trim()
      .split(/\s+/)[0] ||
    '';

  const statusLabel =
    (
      member: any
    ) => {
      if (
        member
          ?.operationalStatus ===
        'IN_FIELD'
      ) {
        return t.inField;
      }

      if (
        member
          ?.operationalStatus ===
        'ACTIVE'
      ) {
        return t.activeStatus;
      }

      return t.notStarted;
    };

  const statusColor =
    (
      member: any
    ) => {
      if (
        member
          ?.operationalStatus ===
        'IN_FIELD'
      ) {
        return '#3B82F6';
      }

      if (
        member
          ?.operationalStatus ===
        'ACTIVE'
      ) {
        return '#10B981';
      }

      return '#94A3B8';
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

  if (
    !data &&
    error
  ) {
    return (
      <View
        style={[
          styles.center,
          {
            backgroundColor:
              bg,

            paddingHorizontal:
              28
          }
        ]}
      >
        <ShieldAlert
          size={44}
          color="#EF4444"
        />

        <Text
          style={[
            styles.errorTitle,
            {
              color:
                primary
            }
          ]}
        >
          {t.unavailable}
        </Text>

        <Text
          style={[
            styles.errorText,
            {
              color:
                secondary
            }
          ]}
        >
          {error}
        </Text>

        <TouchableOpacity
          style={[
            styles.retry,
            {
              backgroundColor:
                accent
            }
          ]}
          onPress={() =>
            load(true)
          }
        >
          <Text
            style={
              styles.retryText
            }
          >
            {t.retry}
          </Text>
        </TouchableOpacity>
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
        <View
          style={
            styles.topRow
          }
        >
          <View
            style={{
              flex: 1
            }}
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
                styles.hello,
                {
                  color:
                    primary
                }
              ]}
            >
              {t.hello}
              {firstName
                ? `, ${firstName}`
                : ''}
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
          </View>

          <View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  data
                    ?.__cached
                    ? '#F59E0B18'
                    : '#10B98118'
              }
            ]}
          >
            {data?.__cached ? (
              <WifiOff
                size={12}
                color="#F59E0B"
              />
            ) : (
              <CheckCircle2
                size={12}
                color="#10B981"
              />
            )}

            <Text
              style={[
                styles.statusText,
                {
                  color:
                    data
                      ?.__cached
                      ? '#F59E0B'
                      : '#10B981'
                }
              ]}
            >
              {data?.__cached
                ? t.cached
                : t.online}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.metricGrid
          }
        >
          <View
            style={[
              styles.metricCard,
              {
                backgroundColor:
                  surface,

                borderColor:
                  border
              }
            ]}
          >
            <Users
              size={19}
              color="#3B82F6"
            />

            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    primary
                }
              ]}
            >
              {summary.teamTotal}
            </Text>

            <Text
              style={[
                styles.metricTitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.team}
            </Text>

            <Text
              style={[
                styles.metricHint,
                {
                  color:
                    '#10B981'
                }
              ]}
            >
              {summary.activeMembers}{' '}
              {t.active}
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor:
                  surface,

                borderColor:
                  border
              }
            ]}
          >
            <CircleGauge
              size={19}
              color={accent}
            />

            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    primary
                }
              ]}
            >
              {summary.visitsPercent}%
            </Text>

            <Text
              style={[
                styles.metricTitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.visits}
            </Text>

            <Text
              style={[
                styles.metricHint,
                {
                  color:
                    secondary
                }
              ]}
            >
              {summary.visitsDone}/
              {summary.visitsTotal}{' '}
              {t.done}
            </Text>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor:
                  surface,

                borderColor:
                  border
              }
            ]}
          >
            <Store
              size={19}
              color="#8B5CF6"
            />

            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    primary
                }
              ]}
            >
              {summary
                .perfectStoreAverage ??
                '—'}%
            </Text>

            <Text
              style={[
                styles.metricTitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.perfect}
            </Text>

            <View
              style={[
                styles.miniProgress,
                {
                  backgroundColor:
                    surfaceAlt
                }
              ]}
            >
              <View
                style={{
                  width:
                    `${clamp(
                      Number(
                        summary
                          .perfectStoreAverage ||
                        0
                      )
                    )}%`,

                  height:
                    '100%',

                  borderRadius:
                    99,

                  backgroundColor:
                    Number(
                      summary
                        .perfectStoreAverage ||
                      0
                    ) >= 80
                      ? '#10B981'
                      : Number(
                            summary
                              .perfectStoreAverage ||
                            0
                          ) >= 60
                        ? '#F59E0B'
                        : '#EF4444'
                }}
              />
            </View>
          </View>

          <View
            style={[
              styles.metricCard,
              {
                backgroundColor:
                  surface,

                borderColor:
                  border
              }
            ]}
          >
            <Trophy
              size={19}
              color="#F59E0B"
            />

            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    primary
                }
              ]}
            >
              {summary
                .performancePoints30d}
            </Text>

            <Text
              style={[
                styles.metricTitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.performance}
            </Text>

            <Text
              style={[
                styles.metricHint,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.points30}
            </Text>
          </View>
        </View>

        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={[
                styles.sectionEyebrow,
                {
                  color:
                    primary
                }
              ]}
            >
              {t.radar}
            </Text>

            <Text
              style={[
                styles.sectionSubtitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.radarSubtitle}
            </Text>
          </View>

          <AlertTriangle
            size={20}
            color="#F59E0B"
          />
        </View>

        <View
          style={[
            styles.radarBox,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          {priorities.length ===
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
              {t.noPriority}
            </Text>
          ) : (
            priorities
              .slice(
                0,
                5
              )
              .map(
                (
                  item: any,
                  index: number
                ) => {
                  const critical =
                    item.type ===
                    'CRITICAL_STORE';

                  return (
                    <View
                      key={
                        item.storeId ||
                        item.userId ||
                        item.title ||
                        index
                      }
                      style={[
                        styles.priorityRow,

                        index > 0 && {
                          borderTopWidth:
                            StyleSheet
                              .hairlineWidth,

                          borderTopColor:
                            border
                        }
                      ]}
                    >
                      <View
                        style={[
                          styles.priorityRank,
                          {
                            backgroundColor:
                              critical
                                ? '#EF444418'
                                : '#F59E0B18'
                          }
                        ]}
                      >
                        <Text
                          style={[
                            styles.priorityRankText,
                            {
                              color:
                                critical
                                  ? '#EF4444'
                                  : '#F59E0B'
                            }
                          ]}
                        >
                          {index +
                            1}
                        </Text>
                      </View>

                      <View
                        style={{
                          flex: 1
                        }}
                      >
                        <Text
                          style={[
                            styles.priorityType,
                            {
                              color:
                                critical
                                  ? '#EF4444'
                                  : '#F59E0B'
                            }
                          ]}
                        >
                          {critical
                            ? t.criticalStore
                            : t.teamAttention}
                        </Text>

                        <Text
                          style={[
                            styles.priorityTitle,
                            {
                              color:
                                primary
                            }
                          ]}
                          numberOfLines={
                            1
                          }
                        >
                          {item.title}
                        </Text>

                        <Text
                          style={[
                            styles.prioritySubtitle,
                            {
                              color:
                                secondary
                            }
                          ]}
                        >
                          {item.subtitle}
                        </Text>
                      </View>

                      <ArrowUpRight
                        size={18}
                        color={
                          secondary
                        }
                      />
                    </View>
                  );
                }
              )
          )}
        </View>

        <View
          style={
            styles.actionRow
          }
        >
          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  `${accent}14`,

                borderColor:
                  `${accent}30`
              }
            ]}
            onPress={() =>
              router.push(
                '/(supervisor)/mapa' as any
              )
            }
          >
            <MapPinned
              size={19}
              color={accent}
            />

            <Text
              style={[
                styles.actionText,
                {
                  color:
                    accent
                }
              ]}
            >
              {t.seeMap}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              {
                backgroundColor:
                  `${accent}14`,

                borderColor:
                  `${accent}30`
              }
            ]}
            onPress={() =>
              router.push(
                '/(supervisor)/equipe' as any
              )
            }
          >
            <Users
              size={19}
              color={accent}
            />

            <Text
              style={[
                styles.actionText,
                {
                  color:
                    accent
                }
              ]}
            >
              {t.seeTeam}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={
            styles.sectionHeader
          }
        >
          <View>
            <Text
              style={[
                styles.sectionEyebrow,
                {
                  color:
                    primary
                }
              ]}
            >
              {t.critical}
            </Text>

            <Text
              style={[
                styles.sectionSubtitle,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.criticalSubtitle}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.listCard,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          {criticalStores.length ===
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
              {t.noCritical}
            </Text>
          ) : (
            criticalStores.map(
              (
                store: any,
                index: number
              ) => (
                <View
                  key={
                    store.id
                  }
                  style={[
                    styles.storeRow,

                    index > 0 && {
                      borderTopWidth:
                        StyleSheet
                          .hairlineWidth,

                      borderTopColor:
                        border
                    }
                  ]}
                >
                  <View
                    style={[
                      styles.storeIcon,
                      {
                        backgroundColor:
                          '#EF444414'
                      }
                    ]}
                  >
                    <Store
                      size={18}
                      color="#EF4444"
                    />
                  </View>

                  <View
                    style={{
                      flex: 1
                    }}
                  >
                    <Text
                      style={[
                        styles.storeName,
                        {
                          color:
                            primary
                        }
                      ]}
                      numberOfLines={
                        1
                      }
                    >
                      {store.nome}
                    </Text>

                    <Text
                      style={[
                        styles.storeMeta,
                        {
                          color:
                            secondary
                        }
                      ]}
                    >
                      {[
                        store.cidade,
                        store.bandeira
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          ' · '
                        )}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.psValue
                    }
                  >
                    <Text
                      style={
                        styles.psNumber
                      }
                    >
                      {Number(
                        store.perfectStore ||
                        0
                      )}%
                    </Text>

                    <Text
                      style={[
                        styles.psLabel,
                        {
                          color:
                            secondary
                        }
                      ]}
                    >
                      {t.ps}
                    </Text>
                  </View>
                </View>
              )
            )
          )}
        </View>

        <View
          style={
            styles.sectionHeader
          }
        >
          <Text
            style={[
              styles.sectionEyebrow,
              {
                color:
                  primary
              }
            ]}
          >
            {t.teamNow}
          </Text>
        </View>

        <View
          style={[
            styles.listCard,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          {team
            .slice(
              0,
              5
            )
            .map(
              (
                member: any,
                index: number
              ) => (
                <TouchableOpacity
                  key={
                    member.id
                  }
                  activeOpacity={
                    0.8
                  }
                  onPress={() =>
                    router.push(
                      '/(supervisor)/equipe' as any
                    )
                  }
                  style={[
                    styles.teamRow,

                    index > 0 && {
                      borderTopWidth:
                        StyleSheet
                          .hairlineWidth,

                      borderTopColor:
                        border
                    }
                  ]}
                >
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor:
                          `${statusColor(
                            member
                          )}18`
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        {
                          color:
                            statusColor(
                              member
                            )
                        }
                      ]}
                    >
                      {String(
                        member.nome ||
                        '?'
                      )
                        .trim()
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
                      numberOfLines={
                        1
                      }
                    >
                      {member.nome}
                    </Text>

                    <Text
                      style={[
                        styles.memberMeta,
                        {
                          color:
                            statusColor(
                              member
                            )
                        }
                      ]}
                    >
                      {statusLabel(
                        member
                      )}{' '}
                      ·{' '}
                      {Number(
                        member
                          ?.visits
                          ?.done ||
                        0
                      )}
                      /
                      {Number(
                        member
                          ?.visits
                          ?.total ||
                        0
                      )}{' '}
                      {t.visitsLabel}
                    </Text>
                  </View>

                  <ChevronRight
                    size={18}
                    color={
                      secondary
                    }
                  />
                </TouchableOpacity>
              )
            )}
        </View>
      </ScrollView>
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

    topRow: {
      flexDirection:
        'row',

      alignItems:
        'flex-start',

      justifyContent:
        'space-between',

      gap: 12,

      marginBottom:
        22
    },

    eyebrow: {
      fontSize: 10,

      fontWeight:
        '900',

      letterSpacing:
        1.7,

      marginBottom:
        5
    },

    hello: {
      fontSize: 27,

      lineHeight: 32,

      fontWeight:
        '900',

      letterSpacing:
        -0.8
    },

    subtitle: {
      marginTop: 4,

      fontSize: 13,

      fontWeight:
        '600'
    },

    statusPill: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 5,

      paddingHorizontal:
        9,

      paddingVertical:
        7,

      borderRadius:
        999
    },

    statusText: {
      fontSize: 9,

      fontWeight:
        '900'
    },

    metricGrid: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',

      gap: 12,

      marginBottom:
        26
    },

    metricCard: {
      width:
        '48%',

      minHeight:
        140,

      borderRadius:
        22,

      borderWidth: 1,

      padding: 16
    },

    metricValue: {
      marginTop: 14,

      fontSize: 29,

      fontWeight:
        '900',

      letterSpacing:
        -1
    },

    metricTitle: {
      marginTop: 2,

      fontSize: 11,

      fontWeight:
        '800',

      textTransform:
        'uppercase',

      letterSpacing:
        0.5
    },

    metricHint: {
      marginTop: 9,

      fontSize: 11,

      fontWeight:
        '700'
    },

    miniProgress: {
      marginTop: 11,

      height: 5,

      borderRadius:
        99,

      overflow:
        'hidden'
    },

    sectionHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between',

      marginTop: 4,

      marginBottom:
        11
    },

    sectionEyebrow: {
      fontSize: 11,

      fontWeight:
        '900',

      letterSpacing:
        1.15
    },

    sectionSubtitle: {
      marginTop: 3,

      fontSize: 11,

      fontWeight:
        '600'
    },

    radarBox: {
      borderRadius:
        24,

      borderWidth: 1,

      paddingHorizontal:
        16,

      marginBottom:
        14
    },

    priorityRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 12,

      paddingVertical:
        14
    },

    priorityRank: {
      width: 34,

      height: 34,

      borderRadius:
        12,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    priorityRankText: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    priorityType: {
      fontSize: 9,

      fontWeight:
        '900',

      letterSpacing:
        0.8,

      marginBottom: 2
    },

    priorityTitle: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    prioritySubtitle: {
      fontSize: 11,

      fontWeight:
        '600',

      marginTop: 2
    },

    actionRow: {
      flexDirection:
        'row',

      gap: 10,

      marginBottom:
        26
    },

    actionButton: {
      flex: 1,

      minHeight: 48,

      borderWidth: 1,

      borderRadius:
        17,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      gap: 8
    },

    actionText: {
      fontSize: 12,

      fontWeight:
        '900'
    },

    listCard: {
      borderRadius:
        24,

      borderWidth: 1,

      paddingHorizontal:
        16,

      marginBottom:
        26
    },

    storeRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 12,

      paddingVertical:
        14
    },

    storeIcon: {
      width: 40,

      height: 40,

      borderRadius:
        14,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    storeName: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    storeMeta: {
      marginTop: 3,

      fontSize: 11,

      fontWeight:
        '600'
    },

    psValue: {
      alignItems:
        'flex-end'
    },

    psNumber: {
      color:
        '#EF4444',

      fontSize: 18,

      fontWeight:
        '900'
    },

    psLabel: {
      fontSize: 9,

      fontWeight:
        '800'
    },

    teamRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 11,

      paddingVertical:
        13
    },

    avatar: {
      width: 40,

      height: 40,

      borderRadius:
        14,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    avatarText: {
      fontSize: 16,

      fontWeight:
        '900'
    },

    memberName: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    memberMeta: {
      marginTop: 3,

      fontSize: 11,

      fontWeight:
        '700'
    },

    empty: {
      textAlign:
        'center',

      paddingVertical:
        24,

      fontSize: 13,

      fontWeight:
        '600'
    },

    errorTitle: {
      marginTop: 14,

      fontSize: 18,

      fontWeight:
        '900',

      textAlign:
        'center'
    },

    errorText: {
      marginTop: 6,

      fontSize: 12,

      textAlign:
        'center'
    },

    retry: {
      marginTop: 18,

      height: 46,

      paddingHorizontal:
        22,

      borderRadius:
        16,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    retryText: {
      color:
        '#FFFFFF',

      fontSize: 13,

      fontWeight:
        '900'
    }
  });
