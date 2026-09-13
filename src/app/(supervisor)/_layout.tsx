import React, {
  useMemo
} from 'react';

import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import {
  Tabs
} from 'expo-router';

import {
  Bell,
  House,
  MapPinned,
  Menu as MenuIcon,
  Users
} from 'lucide-react-native';

import {
  useSafeAreaInsets
} from 'react-native-safe-area-context';

import {
  useSettingsStore
} from '../../store/useSettingsStore';

const TEXTS = {
  'pt-BR': {
    home: 'Comando',
    map: 'Mapa',
    team: 'Equipe',
    alerts: 'Alertas',
    menu: 'Menu'
  },

  'en-US': {
    home: 'Command',
    map: 'Map',
    team: 'Team',
    alerts: 'Alerts',
    menu: 'Menu'
  },

  'es-ES': {
    home: 'Comando',
    map: 'Mapa',
    team: 'Equipo',
    alerts: 'Alertas',
    menu: 'Menú'
  }
} as const;

const getText = (
  language: string
) =>
  TEXTS[
    language === 'en-US' ||
    language === 'es-ES'
      ? language
      : 'pt-BR'
  ];

const CONFIG: Record<
  string,
  {
    key:
      | 'home'
      | 'map'
      | 'team'
      | 'alerts'
      | 'menu';

    Icon: any;
  }
> = {
  index: {
    key: 'home',
    Icon: House
  },

  mapa: {
    key: 'map',
    Icon: MapPinned
  },

  equipe: {
    key: 'team',
    Icon: Users
  },

  alertas: {
    key: 'alerts',
    Icon: Bell
  },

  menu: {
    key: 'menu',
    Icon: MenuIcon
  }
};

function SupervisorTabBar({
  state,
  descriptors,
  navigation
}: any) {
  const insets =
    useSafeAreaInsets();

  const {
    theme,
    language,
    accentColor
  } =
    useSettingsStore();

  const dark =
    theme === 'dark';

  const text =
    getText(language);

  const accent =
    accentColor ||
    '#FF7A00';

  const colors =
    useMemo(
      () => ({
        surface:
          dark
            ? '#111827'
            : '#FFFFFF',

        border:
          dark
            ? '#263244'
            : '#E2E8F0',

        inactive:
          dark
            ? '#94A3B8'
            : '#64748B'
      }),
      [dark]
    );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.outer,
        {
          bottom:
            Math.max(
              insets.bottom,
              10
            )
        }
      ]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor:
              colors.surface,

            borderColor:
              colors.border,

            shadowOpacity:
              dark
                ? 0.34
                : 0.10
          }
        ]}
      >
        {state.routes.map(
          (
            route: any,
            index: number
          ) => {
            const config =
              CONFIG[
                String(
                  route.name
                )
              ];

            if (!config) {
              return null;
            }

            const focused =
              state.index ===
              index;

            const {
              Icon
            } = config;

            const label =
              text[
                config.key
              ];

            const onPress =
              () => {
                const event =
                  navigation.emit({
                    type:
                      'tabPress',

                    target:
                      route.key,

                    canPreventDefault:
                      true
                  });

                if (
                  !focused &&
                  !event.defaultPrevented
                ) {
                  navigation.navigate(
                    route.name
                  );
                }
              };

            return (
              <TouchableOpacity
                key={
                  route.key
                }
                style={
                  styles.tab
                }
                activeOpacity={
                  0.8
                }
                onPress={
                  onPress
                }
                accessibilityRole="button"
                accessibilityState={
                  focused
                    ? {
                        selected:
                          true
                      }
                    : {}
                }
              >
                <View
                  style={[
                    styles.icon,
                    focused && {
                      backgroundColor:
                        `${accent}18`
                    }
                  ]}
                >
                  <Icon
                    size={
                      focused
                        ? 23
                        : 21
                    }
                    strokeWidth={
                      focused
                        ? 2.5
                        : 2
                    }
                    color={
                      focused
                        ? accent
                        : colors.inactive
                    }
                  />
                </View>

                <Text
                  numberOfLines={
                    1
                  }
                  style={[
                    styles.label,
                    {
                      color:
                        focused
                          ? accent
                          : colors.inactive,

                      fontWeight:
                        focused
                          ? '900'
                          : '700'
                    }
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          }
        )}
      </View>
    </View>
  );
}

export default function SupervisorLayout() {
  return (
    <Tabs
      tabBar={
        props => (
          <SupervisorTabBar
            {...props}
          />
        )
      }
      screenOptions={{
        headerShown:
          false,

        tabBarHideOnKeyboard:
          true
      }}
    >
      <Tabs.Screen
        name="index"
      />

      <Tabs.Screen
        name="mapa"
      />

      <Tabs.Screen
        name="equipe"
      />

      <Tabs.Screen
        name="alertas"
      />

      <Tabs.Screen
        name="menu"
      />
    </Tabs>
  );
}

const styles =
  StyleSheet.create({
    outer: {
      position:
        'absolute',

      left: 0,
      right: 0,

      alignItems:
        'center'
    },

    bar: {
      width:
        '92%',

      maxWidth:
        560,

      height: 72,

      borderRadius:
        28,

      borderWidth:
        StyleSheet
          .hairlineWidth,

      flexDirection:
        'row',

      paddingHorizontal:
        6,

      elevation:
        Platform.OS ===
        'android'
          ? 10
          : 0,

      shadowColor:
        '#000',

      shadowOffset: {
        width: 0,
        height: 10
      },

      shadowRadius:
        18
    },

    tab: {
      flex: 1,

      alignItems:
        'center',

      justifyContent:
        'center',

      minWidth: 0
    },

    icon: {
      width: 38,
      height: 34,

      borderRadius:
        14,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    label: {
      marginTop: 2,

      fontSize: 9,

      letterSpacing:
        0.1
    }
  });
