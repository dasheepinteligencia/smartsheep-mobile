import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Tabs } from 'expo-router';
import { Bell, Home, Map, Menu as MenuIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getContrastTextColor, useTheme } from '../../theme';
import { useSettingsStore } from '../../store/useSettingsStore';
import { t } from '../../utils/i18n';
import { getDBConnection } from '../../database/db';
import { useAuthStore } from '../../store/useAuthStore';
import { api } from '../../services/api';

const { width } = Dimensions.get('window');

const TAB_ROUTES = ['index', 'roteiro', 'alertas', 'menu'] as const;
type TabRouteName = typeof TAB_ROUTES[number];

const getSafeTranslation = (key: string, fallback: string) => {
  const translated = t(key);
  return translated && translated !== key ? translated : fallback;
};

const getTabConfig = (routeName: string) => {
  const rName = routeName.toLowerCase();

  if (rName === 'roteiro') {
    return {
      Icon: Map,
      label: getSafeTranslation('myRoute', 'Roteiro'),
    };
  }

  if (rName === 'alertas') {
    return {
      Icon: Bell,
      label: getSafeTranslation('alerts', 'Alertas'),
    };
  }

  if (rName === 'menu') {
    return {
      Icon: MenuIcon,
      label: getSafeTranslation('menu', 'Menu'),
    };
  }

  return {
    Icon: Home,
    label: getSafeTranslation('home', 'Início'),
  };
};

type TabBadgeCounts = Partial<Record<TabRouteName, number>>;

const getNumericValue = (row: any, fallback = 0) => {
  const value = row?.total ?? row?.count ?? row?.COUNT ?? row?.['COUNT(*)'] ?? fallback;
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
};

const getMainProjectId = (user: any) =>
  user?.allowed_project_ids?.[0] ||
  user?.allowedProjectIds?.[0] ||
  user?.projectId ||
  user?.project_id ||
  user?.projeto_id ||
  null;

const getMuralItemId = (item: any) =>
  String(
    item?.id ||
      item?._id ||
      item?.avisoId ||
      item?.aviso_id ||
      item?.comunicadoId ||
      item?.comunicado_id ||
      item?.slug ||
      item?.titulo ||
      ''
  ).trim();

const getMuralUnreadCount = async (projectId: string | null) => {
  if (!projectId) return 0;

  const readKey = `MuralReadIds_${projectId}`;

  let list: any[] = [];

  try {
    const response = await api(`/mural/${encodeURIComponent(String(projectId))}?apenasAtivos=true&t=${Date.now()}`, {
      method: 'GET',
    });

    if (response?.ok) {
      const data = await response.json();
      list = Array.isArray(data) ? data : data?.avisos || data?.items || data?.data || [];

      // Não salvar a lista completa no SecureStore: comunicados com HTML/anexos passam de 2048 bytes.
    }
  } catch {}

  const readRaw = await SecureStore.getItemAsync(readKey).catch(() => null);
  const readIds = new Set(Array.isArray(JSON.parse(readRaw || '[]')) ? JSON.parse(readRaw || '[]').map(String) : []);

  return list.filter((item) => {
    const id = getMuralItemId(item);
    return id && !readIds.has(id);
  }).length;
};

const useTabBadgeCounts = () => {
  const [badges, setBadges] = useState<TabBadgeCounts>({});
  const { user } = useAuthStore();
  const projectId = getMainProjectId(user);

  const refreshBadges = useCallback(async () => {
    try {
      const db = await getDBConnection();

      const alertRows = await db.getAllAsync(`
        SELECT COUNT(*) as total
        FROM alerts
        WHERE
          COALESCE(lida, 0) = 0
          OR (
            COALESCE(exige_aceite, 0) = 1
            AND (aceita_em IS NULL OR aceita_em = '')
          )
      `);

      const unreadAlerts = getNumericValue(alertRows?.[0]);

      const unreadMural = await getMuralUnreadCount(projectId);

      setBadges({
        alertas: unreadAlerts,
        menu: unreadMural > 0 ? 1 : 0,
      });
    } catch {
      setBadges({});
    }
  }, [projectId]);

  useEffect(() => {
    refreshBadges();

    const interval = setInterval(refreshBadges, 10000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBadges();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshBadges]);

  return { badges, refreshBadges };
};

const EnterpriseTab = ({
  isFocused,
  onPress,
  onLongPress,
  icon: Icon,
  label,
  colors,
  activeIconColor,
  badgeCount = 0,
  badgeVariant = 'number',
}: any) => {
  const focusAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(focusAnim, {
      toValue: isFocused ? 1 : 0,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [focusAnim, isFocused]);

  const iconTranslateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -22],
  });

  const bubbleScale = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 1],
  });

  const bubbleOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const labelOpacity = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const labelTranslateY = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <TouchableOpacity
      style={styles.tabContainer}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.9}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            transform: [{ translateY: iconTranslateY }],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.activeBubble,
            {
              backgroundColor: colors.primary,
              borderColor: colors.surface,
              opacity: bubbleOpacity,
              transform: [{ scale: bubbleScale }],
            },
          ]}
        />

        <Icon
          size={24}
          color={isFocused ? activeIconColor : colors.text.light}
          strokeWidth={isFocused ? 2.5 : 2}
        />

        {badgeCount > 0 ? (
          badgeVariant === 'dot' ? (
            <View
              style={[
                styles.dotBadge,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.surface,
                },
              ]}
            />
          ) : (
            <View style={[styles.numberBadge, { borderColor: colors.surface }]}>
              <Text style={styles.numberBadgeText}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          )
        ) : null}
      </Animated.View>

      <Animated.View
        style={[
          styles.labelContainer,
          {
            opacity: labelOpacity,
            transform: [{ translateY: labelTranslateY }],
          },
        ]}
      >
        <Text style={[styles.labelText, { color: colors.primary }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

function EnterpriseTabBar({ state, descriptors, navigation }: any) {
  const appTheme = useTheme();
  const { colors } = appTheme;
  const { language, theme, accentColor } = useSettingsStore();
  const insets = useSafeAreaInsets();

  const isDark = theme === 'dark';
  const activeIconColor = useMemo(
    () => getContrastTextColor(accentColor || colors.primary),
    [accentColor, colors.primary]
  );

  const { badges, refreshBadges } = useTabBadgeCounts();

  const bottomOffset = Math.max(insets.bottom, 10);
  const tabWidth = Math.min(width - 32, 520);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.tabBarOuter,
        {
          bottom: bottomOffset,
        },
      ]}
    >
      <View
        style={[
          styles.tabBarWrapper,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            width: tabWidth,
            shadowOpacity: isDark ? 0.32 : 0.10,
          },
        ]}
      >
        {state.routes.map((route: any, index: number) => {
          const rName = route.name.toLowerCase() as TabRouteName;

          if (!TAB_ROUTES.includes(rName)) return null;

          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const { Icon, label } = getTabConfig(rName);
          const badgeCount = badges[rName] || 0;
          const badgeVariant = rName === 'menu' ? 'dot' : 'number';

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }

            setTimeout(refreshBadges, 350);
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <EnterpriseTab
              key={`${route.key}-${language}-${colors.primary}`}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              icon={Icon}
              label={options.tabBarLabel || options.title || label}
              colors={colors}
              activeIconColor={activeIconColor}
              badgeCount={badgeCount}
              badgeVariant={badgeVariant}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { language } = useSettingsStore();

  return (
    <Tabs
      key={`tabs-${language}`}
      tabBar={(props) => <EnterpriseTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: getSafeTranslation('home', 'Início') }} />
      <Tabs.Screen name="roteiro" options={{ title: getSafeTranslation('myRoute', 'Roteiro') }} />
      <Tabs.Screen name="alertas" options={{ title: getSafeTranslation('alerts', 'Alertas') }} />
      <Tabs.Screen name="menu" options={{ title: getSafeTranslation('menu', 'Menu') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    overflow: 'visible',
  },
  tabBarWrapper: {
    flexDirection: 'row',
    height: 68,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: Platform.OS === 'android' ? 8 : 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    overflow: 'visible',
  },
  tabContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minWidth: 0,
    overflow: 'visible',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 54,
    height: 54,
    zIndex: 2,
    overflow: 'visible',
  },
  activeBubble: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 5,
  },
  numberBadge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderWidth: 2,
    zIndex: 5,
  },
  numberBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  dotBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 2,
    zIndex: 5,
  },
  labelContainer: {
    position: 'absolute',
    bottom: 10,
    alignItems: 'center',
    zIndex: 1,
    maxWidth: 82,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});
