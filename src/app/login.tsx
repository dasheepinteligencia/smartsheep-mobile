import React, { useEffect, useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image, StatusBar
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lock, UserRound, Eye, AlertCircle, Sun, Moon } from 'lucide-react-native';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { i18n, setI18nLocale } from '../utils/i18n';
import { api } from '../services/api';
import {
  globalSync,
  pauseGlobalSyncForWorkspaceSwitch,
  resumeGlobalSyncAfterWorkspaceSwitch,
  waitForGlobalSyncIdle,
} from '../services/syncService';
import { activateLocalWorkspaceForUser } from '../database/db';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT_COLOR = '#FF7A00';
const REMEMBERED_LOGIN_KEY = 'OmniFieldRememberedEmail';


const getReadableTextColor = (hexColor?: string) => {
  const fallback = '#FFFFFF';
  const hex = String(hexColor || '').replace('#', '').trim();

  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return fallback;

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.62 ? '#0F172A' : '#FFFFFF';
};

const loginText = (language: string, key: 'mobileDenied' | 'tokenMissing' | 'connectionError') => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';

  const texts = {
    'pt-BR': {
      mobileDenied: 'Acesso negado: perfil sem permissão mobile.',
      tokenMissing: 'Erro de login: token não recebido pelo servidor.',
      connectionError: 'Erro de conexão com os servidores.',
    },
    'en-US': {
      mobileDenied: 'Access denied: profile has no mobile permission.',
      tokenMissing: 'Login error: token was not received from the server.',
      connectionError: 'Unable to connect to the servers.',
    },
    'es-ES': {
      mobileDenied: 'Acceso denegado: perfil sin permiso mobile.',
      tokenMissing: 'Error de login: no se recibió el token del servidor.',
      connectionError: 'Error de conexión con los servidores.',
    },
  } as const;

  return texts[lang][key];
};

const normalizePermission = (value: any): string => {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const safeParseJson = (value: any): any => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
};

const normalizeUserData = (rawUserData: any) => {
  const parsedCustomData = safeParseJson(
    rawUserData?.custom_data ?? rawUserData?.customData
  );

  return {
    ...rawUserData,
    custom_data: parsedCustomData,
    customData: parsedCustomData,
  };
};

const extractPermissions = (userData: any): string[] => {
  const rawPermissions =
    userData?.permissions ||
    userData?.permissoes ||
    userData?.role?.permissions ||
    [];

  if (!Array.isArray(rawPermissions)) return [];

  return rawPermissions
    .map((permission: any) => {
      if (typeof permission === 'string') return permission;

      return (
        permission?.key ||
        permission?.id ||
        permission?.name ||
        permission?.nome ||
        permission?.label ||
        permission?.description ||
        permission?.descricao ||
        ''
      );
    })
    .filter(Boolean)
    .map(normalizePermission);
};

const hasMobilePermission = (userData: any): boolean => {
  const normalizedUser = normalizeUserData(userData);
  const customData = normalizedUser.custom_data || {};

  const roleText = normalizePermission(
    `${normalizedUser?.roleName || ''} ${normalizedUser?.perfil || ''} ${normalizedUser?.cargo || ''}`
  );

  const isAdmin =
    roleText.includes('admin') ||
    roleText.includes('diretor') ||
    roleText.includes('gerente');

  if (isAdmin) return true;

  if (
    customData?.mobile_access === true ||
    customData?.mobileAccess === true ||
    customData?.app_mobile === true ||
    customData?.appMobile === true ||
    customData?.acesso_mobile === true ||
    customData?.acessoMobile === true ||
    String(customData?.mobile_access).toLowerCase() === 'true' ||
    String(customData?.mobileAccess).toLowerCase() === 'true' ||
    String(customData?.app_mobile).toLowerCase() === 'true' ||
    String(customData?.appMobile).toLowerCase() === 'true'
  ) {
    return true;
  }

  const permissions = extractPermissions(normalizedUser);

  const allowedPermissionKeys = [
    'appmobile',
    'mobile',
    'mobileaccess',
    'acessomobile',
    'accessmobile',
    'performcollection',
    'performcollections',
    'realizarcoleta',
    'realizarcoletas',
    'executarcoleta',
    'executarcoletas',
    'viewmobile',
    'usemobile',
    'useappmobile',
  ];

  return permissions.some((permission) =>
    allowedPermissionKeys.some((allowed) => permission.includes(allowed))
  );
};

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuthStore();
  const { theme, language, accentColor, toggleTheme, setLanguage } = useSettingsStore();

  i18n.locale = language;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberLogin, setRememberLogin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusedInput, setFocusedInput] = useState<'identifier' | 'password' | null>(null);

  const isDark = theme === 'dark';

  useEffect(() => {
    let active = true;

    const loadRememberedLogin = async () => {
      try {
        const savedLogin = await AsyncStorage.getItem(REMEMBERED_LOGIN_KEY);

        if (active && savedLogin) {
          setIdentifier(savedLogin);
          setRememberLogin(true);
        }
      } catch (error) {
        console.warn('[Login] Não foi possível carregar o login lembrado:', error);
      }
    };

    loadRememberedLogin();

    return () => {
      active = false;
    };
  }, []);

  const toggleRememberLogin = async () => {
    const nextValue = !rememberLogin;
    setRememberLogin(nextValue);

    if (!nextValue) {
      try {
        await AsyncStorage.removeItem(REMEMBERED_LOGIN_KEY);
      } catch (error) {
        console.warn('[Login] Não foi possível remover o login lembrado:', error);
      }
    }
  };

  const handleLogin = async () => {
    setErrorMessage(null);

    if (!identifier.trim() || !password) {
      setErrorMessage(i18n.t('errorEmpty'));
      return;
    }

    setIsLoading(true);

    try {
      const response = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim(), senha: password })
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.message || data.error || i18n.t('errorInvalid'));
        setIsLoading(false);
        return;
      }

      const rawUserData = data.user || data;
      const userData = normalizeUserData(rawUserData);

      if (!hasMobilePermission(userData)) {
        console.log('[Login] Usuário sem permissão mobile:', {
          roleName: userData?.roleName,
          perfil: userData?.perfil,
          cargo: userData?.cargo,
          custom_data: userData?.custom_data,
          permissions: userData?.permissions,
        });

        setErrorMessage(loginText(language, 'mobileDenied'));
        setIsLoading(false);
        return;
      }

      const mainToken = userData?.sessionToken || data.token || data.access_token;

      if (!mainToken) {
        setErrorMessage(loginText(language, 'tokenMissing'));
        setIsLoading(false);
        return;
      }

      try {
        if (rememberLogin) {
          await AsyncStorage.setItem(REMEMBERED_LOGIN_KEY, identifier.trim());
        } else {
          await AsyncStorage.removeItem(REMEMBERED_LOGIN_KEY);
        }
      } catch (error) {
        console.warn('[Login] Não foi possível atualizar o login lembrado:', error);
      }

      /*
       * MOBILE_MULTIUSER_LOGIN_SWITCH_V2
       *
       * NUNCA limpamos o SQLite ao trocar de usuário. A autenticação remota já
       * foi validada, mas a sessão anterior ainda é a autoridade local. Então:
       * 1. bloqueamos novos globalSync;
       * 2. aguardamos um sync já em execução encerrar;
       * 3. arquivamos/restauramos o workspace transacionalmente;
       * 4. só depois publicamos a nova sessão.
       */
      const previousSessionUser = useAuthStore.getState().user;
      let workspaceActivated = false;

      pauseGlobalSyncForWorkspaceSwitch();

      try {
        const previousSyncIdle = await waitForGlobalSyncIdle(60000);

        if (!previousSyncIdle) {
          throw new Error('LOCAL_WORKSPACE_SYNC_BUSY');
        }

        await activateLocalWorkspaceForUser(userData);
        workspaceActivated = true;
        await login(String(mainToken), userData);
      } catch (workspaceError) {
        // Se a persistência da nova sessão falhar depois do swap, voltamos ao
        // workspace anterior para não deixar autenticação A apontando para B.
        if (workspaceActivated && previousSessionUser?.id) {
          await activateLocalWorkspaceForUser(previousSessionUser).catch(() => {});
        }
        throw workspaceError;
      } finally {
        resumeGlobalSyncAfterWorkspaceSwitch();
      }

      console.log('⏳ [Login] Sessão estabelecida. Baixando roteiro...');
      await globalSync();

      setIsLoading(false);
      router.replace('/(tabs)' as any); 

    } catch (error: any) {
      console.error('[Login] Erro:', error);
      setErrorMessage(loginText(language, 'connectionError'));
      setIsLoading(false);
    }
  };

  const cycleLanguage = () => {
    const langs: ('pt-BR' | 'en-US' | 'es-ES')[] = ['pt-BR', 'en-US', 'es-ES'];
    const next = langs[(langs.indexOf(language) + 1) % langs.length];
    setLanguage(next);
    setI18nLocale(next);
  };

  const flagEmoji = language === 'pt-BR' ? '🇧🇷' : language === 'en-US' ? '🇺🇸' : '🇪🇸';
  const accent = accentColor || ACCENT_COLOR;
  const accentText = getReadableTextColor(accent);
  const appBgColor = isDark ? '#020617' : '#F8FAFC';
  const boxBgColor = isDark ? '#0F172A' : '#FFFFFF';
  const boxAltColor = isDark ? '#111827' : '#F1F5F9';
  const boxTitleColor = isDark ? '#F8FAFC' : '#0F172A';
  const externalTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#1E293B' : '#E2E8F0';
  const inputBgColor = isDark ? '#111827' : '#F1F5F9';
  const inputTextColor = isDark ? '#F8FAFC' : '#0F172A';
  const placeholderColor = isDark ? '#64748B' : '#94A3B8';
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: appBgColor }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={appBgColor} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: appBgColor }]} />

      <View style={[styles.topBar, { top: Math.max(insets.top, 0) + 12 }]}>
        <TouchableOpacity onPress={cycleLanguage} style={[styles.controlButton, { backgroundColor: boxBgColor, borderColor }]} activeOpacity={0.85}>
          <Text style={styles.flagText}>{flagEmoji}</Text>
          <Text style={[styles.langText, { color: externalTextColor }]}>{language.toUpperCase()}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleTheme} style={[styles.controlButton, { backgroundColor: boxBgColor, borderColor }]} activeOpacity={0.85}>
          {isDark ? <Sun color={externalTextColor} size={20} /> : <Moon color={externalTextColor} size={20} />}
        </TouchableOpacity>
      </View>

      <View style={[styles.content, { paddingTop: Math.max(insets.top, 0) + 24, paddingBottom: Math.max(insets.bottom, 0) + 20 }]}>
        <Animated.View
          entering={FadeInDown.delay(200)}
          style={styles.header}
        >
          <Image
            source={
              isDark
                ? require('../../assets/images/smartsheep-login-symbol.png')
                : require('../../assets/images/smartsheep-login-symbol-light.png')
            }
            style={styles.brandIcon}
            resizeMode="contain"
            accessibilityLabel="SmartSheep"
          />

          <Image
            source={require('../../assets/images/smartsheep-logo-text.png')}
            style={styles.mainLogo}
            resizeMode="contain"
            accessibilityLabel="SmartSheep"
          />

          <Text
            style={[
              styles.subtitle,
              { color: externalTextColor }
            ]}
          >
            Omni Field
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400)} style={[styles.form, { backgroundColor: boxBgColor, borderColor }]}>
          <View style={styles.formHeader}>
            <Text style={[styles.formTitle, { color: boxTitleColor }]}>{i18n.t('loginTitle')}</Text>
          </View>

          {errorMessage && (
            <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.08)', borderColor: isDark ? 'rgba(239,68,68,0.24)' : 'rgba(239,68,68,0.16)' }]}>
              <AlertCircle color="#EF4444" size={18} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <View style={[styles.inputContainer, { backgroundColor: inputBgColor, borderColor: focusedInput === 'identifier' ? accent : borderColor }]}>
              <UserRound color={focusedInput === 'identifier' ? accent : placeholderColor} size={20} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: inputTextColor }]}
                testID="login-identifier-input"
                accessibilityLabel="login-identifier-input"
                placeholder={i18n.t('loginIdentifierPlaceholder')}
                placeholderTextColor={placeholderColor}
                autoCapitalize="none"
                keyboardType="default"
                autoCorrect={false}
                value={identifier}
                onChangeText={setIdentifier}
                onFocus={() => setFocusedInput('identifier')}
                onBlur={() => setFocusedInput(null)}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={[styles.inputContainer, { backgroundColor: inputBgColor, borderColor: focusedInput === 'password' ? accent : borderColor }]}>
              <Lock color={focusedInput === 'password' ? accent : placeholderColor} size={20} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: inputTextColor }]}
                testID="login-password-input"
                accessibilityLabel="login-password-input"
                placeholder={i18n.t('passwordLabel')}
                placeholderTextColor={placeholderColor}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Eye color={placeholderColor} size={20} />
              </TouchableOpacity>
            </View>
          </View>

          <Pressable
            testID="login-remember-identifier"
            accessibilityLabel={i18n.t('rememberLoginIdentifier')}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberLogin }}
            onPress={toggleRememberLogin}
            style={styles.rememberRow}
          >
            <View
              style={[
                styles.rememberCheckbox,
                {
                  borderColor: rememberLogin ? accent : borderColor,
                  backgroundColor: rememberLogin ? accent : 'transparent',
                },
              ]}
            >
              {rememberLogin && (
                <Text style={[styles.rememberCheck, { color: accentText }]}>✓</Text>
              )}
            </View>

            <Text style={[styles.rememberText, { color: externalTextColor }]}>
              {i18n.t('rememberLoginIdentifier')}
            </Text>
          </Pressable>

          <Pressable
            testID="login-submit-button"
            accessibilityLabel="login-submit-button"
            onPress={handleLogin}
            disabled={isLoading}
            style={({ pressed }) => [
              styles.loginBtnSafe,
              {
                backgroundColor: isLoading ? `${accent}99` : accent,
                opacity: pressed && !isLoading ? 0.88 : 1,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={accentText} />
            ) : (
              <Text style={[styles.loginBtnText, { color: accentText }]}>{i18n.t('loginButton')}</Text>
            )}
          </Pressable>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={[styles.forgotText, { color: accent }]}>{i18n.t('forgotPassword')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  topBar: { position: 'absolute', right: 20, flexDirection: 'row', gap: 10, zIndex: 10 },
  controlButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 15, borderWidth: 1, gap: 6 },
  flagText: { fontSize: 16 },
  langText: { fontSize: 12, fontWeight: '800' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  header: {
    alignItems: 'center',
    marginBottom: 26,
  },
  brandIcon: {
    width: 86,
    height: 86,
    marginBottom: 16,
  },
  mainLogo: {
    width: 270,
    height: 54,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 5,
    textTransform: 'uppercase',
  },
  form: { padding: 28, borderRadius: 26, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16 },
  formHeader: { marginBottom: 24 },
  formTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  errorBox: { flexDirection: 'row', padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 20, gap: 8 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '700', flex: 1 },
  inputGroup: { marginBottom: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingHorizontal: 16, height: 56, borderWidth: 1.5 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, fontWeight: '500' },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: -2,
    marginBottom: 4,
  },
  rememberCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  rememberCheck: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 17,
  },
  rememberText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loginBtnSafe: {
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  loginBtnText: {
    fontWeight: '900',
    textTransform: 'uppercase',
    includeFontPadding: false,
    textAlignVertical: 'center',
    letterSpacing: 0.2,
  },
  forgotBtn: { marginTop: 10 },
  forgotText: { fontWeight: '800', textAlign: 'center', marginTop: 20 },
});
