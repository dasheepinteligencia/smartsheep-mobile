import React from 'react';

import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import {
  useRouter
} from 'expo-router';

import {
  ChevronRight,
  CircleUserRound,
  Headphones,
  LogOut,
  Settings,
  ShieldCheck
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

const TEXTS = {
  'pt-BR': {
    eyebrow:
      'SUPERVISOR',

    title:
      'Menu',

    profile:
      'Meu Perfil',

    settings:
      'Configurações',

    support:
      'Ajuda e Suporte',

    logout:
      'Sair',

    command:
      'Acesso de gestão ativo',

    commandHint:
      'Você está usando a experiência Omni Field Supervisor.'
  },

  'en-US': {
    eyebrow:
      'SUPERVISOR',

    title:
      'Menu',

    profile:
      'My Profile',

    settings:
      'Settings',

    support:
      'Help & Support',

    logout:
      'Sign out',

    command:
      'Management access active',

    commandHint:
      'You are using the Omni Field Supervisor experience.'
  },

  'es-ES': {
    eyebrow:
      'SUPERVISOR',

    title:
      'Menú',

    profile:
      'Mi Perfil',

    settings:
      'Configuración',

    support:
      'Ayuda y Soporte',

    logout:
      'Salir',

    command:
      'Acceso de gestión activo',

    commandHint:
      'Estás usando la experiencia Omni Field Supervisor.'
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

export default function SupervisorMenu() {
  const router =
    useRouter();

  const insets =
    useSafeAreaInsets();

  const {
    user,
    logout
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

  const items = [
    {
      label:
        t.profile,

      Icon:
        CircleUserRound,

      route:
        '/perfil'
    },

    {
      label:
        t.settings,

      Icon:
        Settings,

      route:
        '/configuracoes'
    },

    {
      label:
        t.support,

      Icon:
        Headphones,

      route:
        '/suporte'
    }
  ];

  const handleLogout =
    async () => {
      await logout();

      router.replace(
        '/login' as any
      );
    };

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

        <View
          style={[
            styles.identity,
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
                user?.nome ||
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
                styles.name,
                {
                  color:
                    primary
                }
              ]}
            >
              {user?.nome}
            </Text>

            <Text
              style={[
                styles.role,
                {
                  color:
                    secondary
                }
              ]}
            >
              {user?.cargo ||
                user?.roleName ||
                'Supervisor'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.commandCard,
            {
              backgroundColor:
                `${accent}12`,

              borderColor:
                `${accent}30`
            }
          ]}
        >
          <ShieldCheck
            size={24}
            color={accent}
          />

          <View
            style={{
              flex: 1
            }}
          >
            <Text
              style={[
                styles.commandTitle,
                {
                  color:
                    accent
                }
              ]}
            >
              {t.command}
            </Text>

            <Text
              style={[
                styles.commandHint,
                {
                  color:
                    secondary
                }
              ]}
            >
              {t.commandHint}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.menuCard,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
        >
          {items.map(
            (
              item,
              index
            ) => (
              <TouchableOpacity
                key={
                  item.route
                }
                activeOpacity={
                  0.8
                }
                onPress={() =>
                  router.push(
                    item.route as any
                  )
                }
                style={[
                  styles.menuRow,

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
                    styles.menuIcon,
                    {
                      backgroundColor:
                        `${accent}12`
                    }
                  ]}
                >
                  <item.Icon
                    size={19}
                    color={accent}
                  />
                </View>

                <Text
                  style={[
                    styles.menuText,
                    {
                      color:
                        primary
                    }
                  ]}
                >
                  {item.label}
                </Text>

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

        <TouchableOpacity
          activeOpacity={
            0.8
          }
          onPress={
            handleLogout
          }
          style={[
            styles.logout,
            {
              borderColor:
                '#EF444440'
            }
          ]}
        >
          <LogOut
            size={19}
            color="#EF4444"
          />

          <Text
            style={
              styles.logoutText
            }
          >
            {t.logout}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1
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
        '900'
    },

    identity: {
      marginTop: 20,

      borderWidth: 1,

      borderRadius:
        23,

      padding: 15,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 12
    },

    avatar: {
      width: 48,

      height: 48,

      borderRadius:
        17,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    avatarText: {
      fontSize: 20,

      fontWeight:
        '900'
    },

    name: {
      fontSize: 15,

      fontWeight:
        '900'
    },

    role: {
      marginTop: 3,

      fontSize: 11,

      fontWeight:
        '600'
    },

    commandCard: {
      marginTop: 14,

      borderWidth: 1,

      borderRadius:
        20,

      padding: 15,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 12
    },

    commandTitle: {
      fontSize: 13,

      fontWeight:
        '900'
    },

    commandHint: {
      marginTop: 3,

      fontSize: 11,

      lineHeight: 16,

      fontWeight:
        '600'
    },

    menuCard: {
      marginTop: 18,

      borderWidth: 1,

      borderRadius:
        23,

      paddingHorizontal:
        15
    },

    menuRow: {
      minHeight: 64,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap: 11
    },

    menuIcon: {
      width: 38,

      height: 38,

      borderRadius:
        13,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    menuText: {
      flex: 1,

      fontSize: 13,

      fontWeight:
        '800'
    },

    logout: {
      marginTop: 16,

      height: 54,

      borderRadius:
        18,

      borderWidth: 1,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      gap: 8
    },

    logoutText: {
      color:
        '#EF4444',

      fontSize: 13,

      fontWeight:
        '900'
    }
  });
