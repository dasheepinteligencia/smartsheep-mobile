import React, {
  useCallback,
  useMemo,
  useRef,
  useState
} from 'react';

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from 'react-native';

import MapView, {
  Marker
} from 'react-native-maps';

import {
  useFocusEffect
} from 'expo-router';

import {
  CircleDot,
  Clock3,
  MapPinned,
  Navigation,
  Users
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
  getMemberPosition,
  SupervisorCommandData
} from '../../services/supervisorCommandService';

const TEXTS = {
  'pt-BR': {
    eyebrow:
      'OPERAÇÃO AO VIVO',

    title:
      'Mapa da Equipe',

    subtitle:
      'Última posição disponível dos promotores da sua área.',

    visible:
      'com posição',

    noPosition:
      'Sem posição disponível',

    noPositionHint:
      'O mapa será preenchido conforme a telemetria da equipe for recebida.',

    lastVisit:
      'Última visita',

    noVisit:
      'Nenhuma visita hoje',

    inField:
      'Em campo',

    active:
      'Ativo',

    notStarted:
      'Não iniciou',

    visits:
      'visitas'
  },

  'en-US': {
    eyebrow:
      'LIVE OPERATION',

    title:
      'Team Map',

    subtitle:
      'Latest available position from promoters in your area.',

    visible:
      'with location',

    noPosition:
      'No location available',

    noPositionHint:
      'The map will populate as team telemetry becomes available.',

    lastVisit:
      'Last visit',

    noVisit:
      'No visits today',

    inField:
      'In field',

    active:
      'Active',

    notStarted:
      'Not started',

    visits:
      'visits'
  },

  'es-ES': {
    eyebrow:
      'OPERACIÓN EN VIVO',

    title:
      'Mapa del Equipo',

    subtitle:
      'Última posición disponible de los promotores de tu área.',

    visible:
      'con ubicación',

    noPosition:
      'Sin ubicación disponible',

    noPositionHint:
      'El mapa se completará cuando llegue la telemetría del equipo.',

    lastVisit:
      'Última visita',

    noVisit:
      'Sin visitas hoy',

    inField:
      'En campo',

    active:
      'Activo',

    notStarted:
      'No inició',

    visits:
      'visitas'
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

export default function SupervisorMap() {
  const mapRef =
    useRef<MapView>(
      null
    );

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
          const result =
            await fetchSupervisorCommand(
              user,
              {
                allowCacheFallback:
                  true
              }
            );

          setData(result);
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

        const timer =
          setInterval(
            () =>
              load(false),
            45000
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

  const positioned =
    useMemo(
      () =>
        team
          .map(
            member => ({
              member,
              position:
                getMemberPosition(
                  member
                )
            })
          )
          .filter(
            item =>
              Boolean(
                item.position
              )
          ) as any[],
      [team]
    );

  const noPosition =
    useMemo(
      () =>
        team.filter(
          member =>
            !getMemberPosition(
              member
            )
        ),
      [team]
    );

  const initial =
    positioned[0]
      ?.position || {
      latitude:
        -23.5505,

      longitude:
        -46.6333
    };

  const statusColor =
    (
      status: string
    ) => {
      if (
        status ===
        'IN_FIELD'
      ) {
        return '#3B82F6';
      }

      if (
        status ===
        'ACTIVE'
      ) {
        return '#10B981';
      }

      return '#94A3B8';
    };

  const statusText =
    (
      status: string
    ) => {
      if (
        status ===
        'IN_FIELD'
      ) {
        return t.inField;
      }

      if (
        status ===
        'ACTIVE'
      ) {
        return t.active;
      }

      return t.notStarted;
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
          color={accent}
          size="large"
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
            styles.header
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
        </View>

        <View
          style={
            styles.counterRow
          }
        >
          <View
            style={[
              styles.counter,
              {
                backgroundColor:
                  `${accent}14`
              }
            ]}
          >
            <Navigation
              size={14}
              color={accent}
            />

            <Text
              style={[
                styles.counterText,
                {
                  color:
                    accent
                }
              ]}
            >
              {positioned.length}{' '}
              {t.visible}
            </Text>
          </View>

          <View
            style={[
              styles.counter,
              {
                backgroundColor:
                  surface
              }
            ]}
          >
            <Users
              size={14}
              color={
                secondary
              }
            />

            <Text
              style={[
                styles.counterText,
                {
                  color:
                    secondary
                }
              ]}
            >
              {team.length}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.mapCard,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          <MapView
            ref={mapRef}
            style={
              styles.map
            }
            initialRegion={{
              latitude:
                initial.latitude,

              longitude:
                initial.longitude,

              latitudeDelta:
                positioned.length > 1
                  ? 0.18
                  : 0.04,

              longitudeDelta:
                positioned.length > 1
                  ? 0.18
                  : 0.04
            }}
          >
            {positioned.map(
              ({
                member,
                position
              }: any) => (
                <Marker
                  key={
                    member.id
                  }
                  coordinate={{
                    latitude:
                      position.latitude,

                    longitude:
                      position.longitude
                  }}
                  pinColor={
                    statusColor(
                      member.operationalStatus
                    )
                  }
                  title={
                    member.nome
                  }
                  description={
                    member
                      ?.lastVisit
                      ?.storeName ||
                    statusText(
                      member.operationalStatus
                    )
                  }
                />
              )
            )}
          </MapView>

          {positioned.length ===
            0 && (
            <View
              pointerEvents="none"
              style={[
                styles.mapEmpty,
                {
                  backgroundColor:
                    dark
                      ? 'rgba(2,6,23,0.82)'
                      : 'rgba(255,255,255,0.88)'
                }
              ]}
            >
              <MapPinned
                size={34}
                color={
                  secondary
                }
              />

              <Text
                style={[
                  styles.mapEmptyTitle,
                  {
                    color:
                      primary
                  }
                ]}
              >
                {t.noPosition}
              </Text>

              <Text
                style={[
                  styles.mapEmptyText,
                  {
                    color:
                      secondary
                  }
                ]}
              >
                {t.noPositionHint}
              </Text>
            </View>
          )}
        </View>

        <View
          style={
            styles.memberList
          }
        >
          {team.map(
            member => {
              const position =
                getMemberPosition(
                  member
                );

              const color =
                statusColor(
                  String(
                    member
                      .operationalStatus ||
                    ''
                  )
                );

              return (
                <View
                  key={
                    member.id
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
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          color
                      }
                    ]}
                  />

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
                        styles.memberStatus,
                        {
                          color
                        }
                      ]}
                    >
                      {statusText(
                        String(
                          member
                            .operationalStatus ||
                          ''
                        )
                      )}
                    </Text>

                    <View
                      style={
                        styles.metaRow
                      }
                    >
                      <CircleDot
                        size={11}
                        color={
                          secondary
                        }
                      />

                      <Text
                        style={[
                          styles.meta,
                          {
                            color:
                              secondary
                          }
                        ]}
                      >
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
                        {t.visits}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.metaRow
                      }
                    >
                      <Clock3
                        size={11}
                        color={
                          secondary
                        }
                      />

                      <Text
                        style={[
                          styles.meta,
                          {
                            color:
                              secondary
                          }
                        ]}
                        numberOfLines={
                          1
                        }
                      >
                        {t.lastVisit}:{' '}
                        {member
                          ?.lastVisit
                          ?.storeName ||
                          t.noVisit}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.positionTag,
                      {
                        backgroundColor:
                          position
                            ? '#10B98114'
                            : '#94A3B814'
                      }
                    ]}
                  >
                    <Navigation
                      size={13}
                      color={
                        position
                          ? '#10B981'
                          : '#94A3B8'
                      }
                    />
                  </View>
                </View>
              );
            }
          )}
        </View>

        {noPosition.length >
          0 && (
          <Text
            style={[
              styles.footerHint,
              {
                color:
                  secondary
              }
            ]}
          >
            {noPosition.length}{' '}
            {t.noPosition.toLowerCase()}
          </Text>
        )}
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

    header: {
      paddingHorizontal:
        20
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

    counterRow: {
      flexDirection:
        'row',

      gap: 8,

      paddingHorizontal:
        20,

      marginTop: 15,

      marginBottom:
        12
    },

    counter: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 6,

      paddingHorizontal:
        11,

      paddingVertical:
        7,

      borderRadius:
        999
    },

    counterText: {
      fontSize: 10,

      fontWeight:
        '900'
    },

    mapCard: {
      marginHorizontal:
        20,

      height: 360,

      borderRadius:
        26,

      borderWidth: 1,

      overflow:
        'hidden',

      position:
        'relative'
    },

    map: {
      width:
        '100%',

      height:
        '100%'
    },

    mapEmpty: {
      ...StyleSheet
        .absoluteFillObject,

      alignItems:
        'center',

      justifyContent:
        'center',

      paddingHorizontal:
        38
    },

    mapEmptyTitle: {
      marginTop: 10,

      fontSize: 17,

      fontWeight:
        '900'
    },

    mapEmptyText: {
      marginTop: 5,

      fontSize: 12,

      lineHeight: 18,

      textAlign:
        'center',

      fontWeight:
        '600'
    },

    memberList: {
      paddingHorizontal:
        20,

      marginTop: 16,

      gap: 10
    },

    memberCard: {
      borderWidth: 1,

      borderRadius:
        20,

      padding: 14,

      flexDirection:
        'row',

      gap: 11,

      alignItems:
        'flex-start'
    },

    statusDot: {
      width: 9,

      height: 9,

      borderRadius:
        99,

      marginTop: 6
    },

    memberName: {
      fontSize: 14,

      fontWeight:
        '900'
    },

    memberStatus: {
      marginTop: 2,

      fontSize: 10,

      fontWeight:
        '900',

      textTransform:
        'uppercase'
    },

    metaRow: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 5,

      marginTop: 7
    },

    meta: {
      flex: 1,

      fontSize: 11,

      fontWeight:
        '600'
    },

    positionTag: {
      width: 34,

      height: 34,

      borderRadius:
        12,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    footerHint: {
      marginTop: 14,

      textAlign:
        'center',

      fontSize: 11,

      fontWeight:
        '600'
    }
  });
