import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Languages,
  LockKeyhole,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react-native';

import { useAuthStore } from '../store/useAuthStore';
import { Language, useSettingsStore } from '../store/useSettingsStore';
import { addAppLog } from '../database/db';
import { getContrastTextColor, useTheme } from '../theme';
import { setI18nLocale, t } from '../utils/i18n';

type ModalType = 'info' | 'success' | 'warning' | 'error' | 'language' | 'color';

type ModalState = {
  visible: boolean;
  title: string;
  message: string;
  type: ModalType;
  primaryText?: string;
  primaryAction?: (() => void) | null;
  secondaryText?: string;
  secondaryAction?: (() => void) | null;
};

const LANGUAGE_OPTIONS: Array<{ labelKey: string; value: Language }> = [
  { labelKey: 'languagePtBR', value: 'pt-BR' },
  { labelKey: 'languageEnUS', value: 'en-US' },
  { labelKey: 'languageEsES', value: 'es-ES' },
];

const COLOR_LABEL_KEY_BY_ID: Record<string, string> = {
  orange: 'colorOrange',
  blue: 'colorBlue',
  green: 'colorGreen',
  purple: 'colorPurple',
  pink: 'colorPink',
  red: 'colorRed',
  cyan: 'colorCyan',
  graphite: 'colorGraphite',
  yellow: 'colorYellow',
};

const COLOR_OPTIONS = [
  { id: 'orange', hex: '#FF7A00' },
  { id: 'blue', hex: '#2563EB' },
  { id: 'green', hex: '#16A34A' },
  { id: 'purple', hex: '#7C3AED' },
  { id: 'pink', hex: '#DB2777' },
  { id: 'red', hex: '#DC2626' },
  { id: 'cyan', hex: '#0891B2' },
  { id: 'graphite', hex: '#334155' },
  { id: 'yellow', hex: '#CA8A04' },
];

const getUserLabel = (user: any) => {
  return String(user?.nome || user?.name || user?.email || '');
};

export default function ConfiguracoesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const authStore = useAuthStore() as any;
  const { user, logout } = authStore;

  const {
    theme: currentTheme,
    language,
    accentColor,
    toggleTheme,
    setLanguage,
    setAccentColor,
  } = useSettingsStore();

  const appTheme = useTheme();
  const colors = appTheme.colors;
  const isDark = currentTheme === 'dark';
  const statusBarBg = colors.background;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    primaryText: t('commonOk'),
    primaryAction: null,
    secondaryText: '',
    secondaryAction: null,
  });

  const userLabel = useMemo(() => {
    return getUserLabel(user) || t('commonNotInformed');
  }, [user, language]);

  const languageLabel = useCallback(
    (value: Language) => {
      const option = LANGUAGE_OPTIONS.find((item) => item.value === value);
      return option ? t(option.labelKey) : t('languagePtBR');
    },
    [language]
  );

  const selectedColorLabel = useMemo(() => {
    const selected = COLOR_OPTIONS.find(
      (item) => item.hex.toLowerCase() === String(accentColor).toLowerCase()
    );

    if (!selected) return accentColor;

    return t(COLOR_LABEL_KEY_BY_ID[selected.id]);
  }, [accentColor, language]);

  const closeModal = () => {
    setModal((prev) => ({ ...prev, visible: false }));
  };

  const showModal = ({
    title,
    message,
    type = 'info',
    primaryText = t('commonOk'),
    primaryAction = closeModal,
    secondaryText,
    secondaryAction,
  }: Partial<ModalState> & { title: string; message: string }) => {
    setModal({
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

  const loadSettingsData = async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      await addAppLog({
        level: 'INFO',
        module: 'SETTINGS',
        action: 'OPEN_SETTINGS',
        message: 'Tela de configurações aberta.',
        metadata: {
          theme: currentTheme,
          language,
          accentColor,
        },
      });
    } catch (error) {
      console.log('[Configurações] Log não gravado:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setI18nLocale(language);
      loadSettingsData();
    }, [currentTheme, language, accentColor])
  );

  const refresh = async () => {
    setRefreshing(true);
    await loadSettingsData(true);
  };

  const handleToggleTheme = async () => {
    try {
      toggleTheme();

      await addAppLog({
        level: 'INFO',
        module: 'SETTINGS',
        action: 'CHANGE_THEME',
        message: 'Tema do app alterado pelo usuário.',
        metadata: { previousTheme: currentTheme, nextTheme: isDark ? 'light' : 'dark' },
      });
    } catch {
      showModal({
        title: t('settingsThemeErrorTitle'),
        message: t('settingsThemeErrorMessage'),
        type: 'error',
      });
    }
  };

  const changeLanguage = async (nextLanguage: Language) => {
    closeModal();

    try {
      setLanguage(nextLanguage);
      setI18nLocale(nextLanguage);

      await addAppLog({
        level: 'INFO',
        module: 'SETTINGS',
        action: 'CHANGE_LANGUAGE',
        message: 'Idioma do app alterado pelo usuário.',
        metadata: { language: nextLanguage },
      });

      // Sem popup de confirmação: a alteração aparece imediatamente na tela.
    } catch {
      showModal({
        title: t('settingsLanguageUnavailableTitle'),
        message: t('settingsLanguageUnavailableMessage'),
        type: 'error',
      });
    }
  };

  const chooseLanguage = () => {
    showModal({
      title: t('settingsLanguageTitle'),
      message: t('settingsLanguageMessage'),
      type: 'language',
    });
  };

  const chooseColor = () => {
    showModal({
      title: t('settingsColorTitle'),
      message: t('settingsColorMessage'),
      type: 'color',
    });
  };

  const applyAccentColor = async (color: string) => {
    try {
      closeModal();
      setAccentColor(color);

      await addAppLog({
        level: 'INFO',
        module: 'SETTINGS',
        action: 'CHANGE_ACCENT_COLOR',
        message: 'Cor principal do app alterada pelo usuário.',
        metadata: {
          color,
          contrastText: getContrastTextColor(color),
        },
      });

      // Sem popup de confirmação: a alteração aparece imediatamente na tela.
    } catch {
      showModal({
        title: t('settingsColorErrorTitle'),
        message: t('settingsColorErrorMessage'),
        type: 'error',
      });
    }
  };

  const confirmLogout = () => {
    showModal({
      title: t('settingsLogoutTitle'),
      message: t('settingsLogoutMessage'),
      type: 'warning',
      primaryText: t('settingsLogoutConfirm'),
      primaryAction: async () => {
        closeModal();

        const logoutFn =
          logout ||
          authStore?.signOut ||
          authStore?.clearAuth ||
          authStore?.clearSession ||
          null;

        if (typeof logoutFn !== 'function') {
          showModal({
            title: t('settingsLogoutUnavailableTitle'),
            message: t('settingsLogoutUnavailableMessage'),
            type: 'error',
          });
          return;
        }

        await addAppLog({
          level: 'WARNING',
          module: 'AUTH',
          action: 'LOGOUT_FROM_SETTINGS',
          message: 'Usuário solicitou sair da conta pela tela de configurações.',
        });

        logoutFn();
      },
      secondaryText: t('cancel'),
      secondaryAction: closeModal,
    });
  };

  const modalColor = () => {
    if (modal.type === 'success') return colors.status.success;
    if (modal.type === 'warning') return colors.status.warning;
    if (modal.type === 'error') return colors.status.error;

    return colors.primary;
  };

  const ModalIcon = () => {
    if (modal.type === 'success') return <CheckCircle2 size={28} color={colors.status.success} />;
    if (modal.type === 'warning') return <AlertTriangle size={28} color={colors.status.warning} />;
    if (modal.type === 'error') return <AlertTriangle size={28} color={colors.status.error} />;
    if (modal.type === 'language') return <Languages size={28} color={colors.primary} />;
    if (modal.type === 'color') return <Palette size={28} color={colors.primary} />;
    return <ShieldCheck size={28} color={colors.primary} />;
  };

  const renderSwitchRow = (
    label: string,
    description: string,
    value: boolean,
    Icon: any,
    color: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={[styles.settingRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={19} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text.main }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: colors.text.light }]}>{description}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onPress}
        trackColor={{ false: isDark ? '#334155' : '#CBD5E1', true: `${colors.primary}61` }}
        thumbColor={value ? colors.primary : isDark ? '#94A3B8' : '#F8FAFC'}
      />
    </TouchableOpacity>
  );

  const renderActionRow = (
    label: string,
    description: string,
    value: string | null,
    Icon: any,
    color: string,
    onPress: () => void
  ) => (
    <TouchableOpacity
      style={[styles.actionRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={19} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text.main }]}>{label}</Text>
        <Text style={[styles.rowDescription, { color: colors.text.light }]}>{description}</Text>
      </View>

      {value ? <Text style={[styles.rowValue, { color: colors.text.light }]}>{value}</Text> : null}
      <ChevronRight size={18} color={colors.text.light} />
    </TouchableOpacity>
  );

  const renderReadOnlyRow = (label: string, value: string, Icon: any, color: string) => (
    <View style={[styles.actionRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.infoIcon, { backgroundColor: `${color}18` }]}>
        <Icon size={19} color={color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text.main }]}>{label}</Text>
      </View>

      <Text style={[styles.rowValue, { color: colors.text.light }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderLanguageOptions = () => (
    <View style={{ gap: 10, marginTop: 18 }}>
      {LANGUAGE_OPTIONS.map((item) => {
        const selected = language === item.value;

        return (
          <TouchableOpacity
            key={item.value}
            style={[
              styles.optionRow,
              {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? `${colors.primary}18` : colors.surfaceAlt,
              },
            ]}
            onPress={() => changeLanguage(item.value)}
            activeOpacity={0.88}
          >
            <Text style={[styles.optionText, { color: selected ? colors.primary : colors.text.main }]}>
              {t(item.labelKey)}
            </Text>
            {selected ? <CheckCircle2 size={20} color={colors.primary} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );


  const renderColorOptions = () => (
    <View style={styles.colorList}>
      {COLOR_OPTIONS.map((item) => {
        const selected = item.hex.toLowerCase() === String(accentColor).toLowerCase();
        const labelKey = COLOR_LABEL_KEY_BY_ID[item.id];

        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.colorRow,
              {
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? `${colors.primary}14` : colors.surfaceAlt,
              },
            ]}
            onPress={() => applyAccentColor(item.hex)}
            activeOpacity={0.88}
          >
            <View style={styles.colorRowLeft}>
              <View
                style={[
                  styles.colorDot,
                  {
                    backgroundColor: item.hex,
                    borderColor: selected ? colors.text.main : colors.border,
                  },
                ]}
              />
              <Text style={[styles.colorRowText, { color: colors.text.main }]}>
                {t(labelKey)}
              </Text>
            </View>

            {selected ? (
              <Text style={[styles.colorSelectedText, { color: colors.primary }]}>✓</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.text.light }]}>{t('commonLoading') || t('loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressViewOffset={Math.max(insets.top, 0) + 80}
          />
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <ArrowLeft size={22} color={colors.text.main} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: colors.text.main }]}>{t('settingsTitle')}</Text>
            <Text style={[styles.pageSubtitle, { color: colors.text.light }]}>{t('settingsSubtitle')}</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.main }]}>{t('settingsAppearance')}</Text>

          <View style={{ height: 12 }} />

          {renderSwitchRow(
            t('settingsDarkTheme'),
            isDark ? t('settingsDarkThemeEnabled') : t('settingsLightThemeEnabled'),
            isDark,
            isDark ? Moon : Sun,
            '#8B5CF6',
            handleToggleTheme
          )}

          {renderActionRow(
            t('settingsAccentColor'),
            t('settingsAccentColorDescription'),
            selectedColorLabel,
            Palette,
            colors.primary,
            chooseColor
          )}

          <View style={[styles.previewCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.previewTitle, { color: colors.primaryText }]}>
              {t('settingsAccentPreviewTitle')}
            </Text>
            <Text style={[styles.previewText, { color: colors.primaryText }]}>
              {t('settingsAccentPreviewText')}
            </Text>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.main }]}>{t('settingsPreferences')}</Text>

          <View style={{ height: 12 }} />

          {renderActionRow(
            t('settingsLanguage'),
            t('settingsLanguageDescription'),
            languageLabel(language),
            Languages,
            '#06B6D4',
            chooseLanguage
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text.main }]}>{t('settingsAccount')}</Text>

          <View style={{ height: 12 }} />

          {renderReadOnlyRow(t('settingsConnectedUser'), userLabel, LockKeyhole, colors.status.info)}
          {renderActionRow(
            t('settingsLogout'),
            t('settingsLogoutDescription'),
            null,
            LogOut,
            colors.status.error,
            confirmLogout
          )}
        </View>
      </ScrollView>

      {modal.visible ? (
        <Pressable
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
          onPress={closeModal}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => null}
          >
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: `${modalColor()}18` }]}>
                <ModalIcon />
              </View>

              <TouchableOpacity
                style={[styles.modalClose, { backgroundColor: colors.surfaceAlt }]}
                onPress={closeModal}
                activeOpacity={0.85}
              >
                <X size={18} color={colors.text.light} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTitle, { color: colors.text.main }]}>{modal.title}</Text>
            <Text style={[styles.modalMessage, { color: colors.text.light }]}>{modal.message}</Text>

            {modal.type === 'language' ? renderLanguageOptions() : null}
            {modal.type === 'color' ? renderColorOptions() : null}

            {!['language', 'color'].includes(modal.type) ? (
              <View style={styles.modalActions}>
                {modal.secondaryText ? (
                  <TouchableOpacity
                    style={[styles.modalSecondaryButton, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                    onPress={modal.secondaryAction || closeModal}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.modalSecondaryText, { color: colors.text.main }]}>
                      {modal.secondaryText}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.modalPrimaryButton, { backgroundColor: modalColor() }]}
                  onPress={modal.primaryAction || closeModal}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.modalPrimaryText, { color: getContrastTextColor(modalColor()) }]}>
                    {modal.primaryText}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      ) : null}
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, fontWeight: '900', lineHeight: 19 },
  rowDescription: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 3 },
  rowValue: { fontSize: 12, fontWeight: '900', maxWidth: 112, textAlign: 'right' },
  previewCard: {
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  previewTitle: { fontSize: 14, fontWeight: '900' },
  previewText: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 4, opacity: 0.9 },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginBottom: 8 },
  modalMessage: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalPrimaryText: { fontSize: 14, fontWeight: '900' },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  modalSecondaryText: { fontSize: 14, fontWeight: '900' },
  colorList: {
    gap: 10,
    marginTop: 18,
  },
  colorRow: {
    minHeight: 54,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  colorRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  colorRowText: {
    fontSize: 14,
    fontWeight: '900',
  },
  colorSelectedText: {
    fontSize: 20,
    fontWeight: '900',
  },
  optionRow: {
    minHeight: 54,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 14, fontWeight: '900' },
});
