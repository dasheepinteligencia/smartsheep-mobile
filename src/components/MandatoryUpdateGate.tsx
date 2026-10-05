import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';

import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { fastSync } from '../services/syncService';
import { useAuthStore } from '../store/useAuthStore';

const CACHE_KEY =
  'OMNI_FIELD_VERSION_POLICY_V1';

const POLICY_URL =
  'https://app.smartsheep.com.br/api/public/mobile-version';

const POLICY_TIMEOUT_MS = 3000;
const SYNC_TIMEOUT_MS = 6000;

type VersionPolicy = {
  enabled: boolean;
  platform: string;
  minimumVersion: string;
  latestVersion: string;
  storeUrl: string | null;
  message: string | null;
};

type GateState =
  | 'checking'
  | 'allowed'
  | 'syncing'
  | 'blocked';

const normalizeVersion = (
  value: unknown
) =>
  String(value || '')
    .trim()
    .replace(/^v/i, '');

const compareVersion = (
  current: string,
  minimum: string
) => {
  const a =
    normalizeVersion(current)
      .split(/[+-]/)[0]
      .split('.')
      .map(Number);

  const b =
    normalizeVersion(minimum)
      .split(/[+-]/)[0]
      .split('.')
      .map(Number);

  const total =
    Math.max(
      a.length,
      b.length,
      3
    );

  for (
    let index = 0;
    index < total;
    index += 1
  ) {
    const av =
      Number.isFinite(a[index])
        ? a[index]
        : 0;

    const bv =
      Number.isFinite(b[index])
        ? b[index]
        : 0;

    if (av < bv) {
      return -1;
    }

    if (av > bv) {
      return 1;
    }
  }

  return 0;
};

const getCurrentVersion = () =>
  normalizeVersion(
    Constants.expoConfig?.version ||
    Application.nativeApplicationVersion ||
    '0.0.0'
  );

const getPackageName = () =>
  String(
    Constants.expoConfig
      ?.android
      ?.package ||
    Application.applicationId ||
    ''
  ).trim();

const normalizePolicy = (
  payload: any
): VersionPolicy | null => {
  const source =
    payload?.data &&
    typeof payload.data === 'object'
      ? payload.data
      : payload;

  if (
    !source ||
    typeof source !== 'object'
  ) {
    return null;
  }

  const minimumVersion =
    normalizeVersion(
      source.minimumVersion ||
      source.minimum_version
    );

  if (!minimumVersion) {
    return null;
  }

  return {
    enabled:
      source.enabled !== false,

    platform:
      String(
        source.platform ||
        Platform.OS
      )
        .trim()
        .toLowerCase(),

    minimumVersion,

    latestVersion:
      normalizeVersion(
        source.latestVersion ||
        source.latest_version ||
        minimumVersion
      ),

    storeUrl:
      String(
        source.storeUrl ||
        source.store_url ||
        ''
      ).trim() || null,

    message:
      String(
        source.message ||
        ''
      ).trim() || null,
  };
};

const timeoutAfter = <T,>(
  ms: number,
  message: string
) =>
  new Promise<T>(
    (_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(message)
          ),
        ms
      );
    }
  );

const readCachedPolicy =
  async (): Promise<
    VersionPolicy | null
  > => {
    try {
      const raw =
        await SecureStore
          .getItemAsync(
            CACHE_KEY
          );

      if (!raw) {
        return null;
      }

      return normalizePolicy(
        JSON.parse(raw)
      );
    } catch {
      return null;
    }
  };

const saveCachedPolicy =
  async (
    policy: VersionPolicy
  ) => {
    try {
      await SecureStore
        .setItemAsync(
          CACHE_KEY,
          JSON.stringify(policy)
        );
    } catch {}
  };

const loadPolicy =
  async (): Promise<
    VersionPolicy | null
  > => {
    try {
      const response =
        await Promise.race<Response>([
          fetch(
            `${POLICY_URL}?platform=${encodeURIComponent(
              Platform.OS
            )}&_=${Date.now()}`,
            {
              method: 'GET',
              headers: {
                Accept:
                  'application/json',
                'Cache-Control':
                  'no-cache, no-store, must-revalidate',
                Pragma:
                  'no-cache',
              },
            }
          ),

          timeoutAfter<Response>(
            POLICY_TIMEOUT_MS,
            'VERSION_POLICY_TIMEOUT'
          ),
        ]);

      if (!response.ok) {
        throw new Error(
          `VERSION_POLICY_HTTP_${response.status}`
        );
      }

      const payload =
        await response.json();

      const policy =
        normalizePolicy(payload);

      if (!policy) {
        throw new Error(
          'VERSION_POLICY_INVALID'
        );
      }

      await saveCachedPolicy(
        policy
      );

      return policy;
    } catch (error: any) {
      console.log(
        '[MandatoryUpdate] política remota indisponível:',
        error?.message ||
          error
      );

      return (
        await readCachedPolicy()
      );
    }
  };

export function MandatoryUpdateGate({
  children,
}: PropsWithChildren) {
  const {
    token,
    user,
  } =
    useAuthStore();

  const [
    state,
    setState,
  ] =
    useState<GateState>(
      'checking'
    );

  const [
    policy,
    setPolicy,
  ] =
    useState<
      VersionPolicy | null
    >(null);

  const checkingRef =
    useRef(false);

  const initializedRef =
    useRef(false);

  const currentVersion =
    getCurrentVersion();

  const checkVersion =
    useCallback(
      async () => {
        if (
          Platform.OS !==
            'android' &&
          Platform.OS !==
            'ios'
        ) {
          setState(
            'allowed'
          );

          return;
        }

        if (
          checkingRef.current
        ) {
          return;
        }

        checkingRef.current =
          true;

        if (
          !initializedRef.current
        ) {
          setState(
            'checking'
          );
        }

        try {
          const nextPolicy =
            await loadPolicy();

          initializedRef.current =
            true;

          if (
            !nextPolicy ||
            !nextPolicy.enabled
          ) {
            setPolicy(
              nextPolicy
            );

            setState(
              'allowed'
            );

            return;
          }

          if (
            nextPolicy.platform !==
              'all' &&
            nextPolicy.platform !==
              Platform.OS
          ) {
            setState(
              'allowed'
            );

            return;
          }

          const outdated =
            compareVersion(
              currentVersion,
              nextPolicy.minimumVersion
            ) < 0;

          if (!outdated) {
            setPolicy(
              nextPolicy
            );

            setState(
              'allowed'
            );

            return;
          }

          setPolicy(
            nextPolicy
          );

          setState(
            'syncing'
          );

          if (
            token &&
            user?.id
          ) {
            try {
              await Promise.race([
                fastSync(),

                timeoutAfter(
                  SYNC_TIMEOUT_MS,
                  'PRE_UPDATE_SYNC_TIMEOUT'
                ),
              ]);
            } catch (error: any) {
              console.log(
                '[MandatoryUpdate] sync pré-bloqueio:',
                error?.message ||
                  error
              );
            }
          }

          setState(
            'blocked'
          );
        } catch (error: any) {
          console.log(
            '[MandatoryUpdate] erro inesperado:',
            error?.message ||
              error
          );

          initializedRef.current =
            true;

          setState(
            'allowed'
          );
        } finally {
          checkingRef.current =
            false;
        }
      },
      [
        currentVersion,
        token,
        user?.id,
      ]
    );

  useEffect(
    () => {
      void checkVersion();
    },
    [checkVersion]
  );

  useEffect(
    () => {
      const subscription =
        AppState
          .addEventListener(
            'change',
            nextState => {
              if (
                nextState ===
                'active'
              ) {
                void checkVersion();
              }
            }
          );

      return () => {
        subscription.remove();
      };
    },
    [checkVersion]
  );

  const openStore =
    useCallback(
      async () => {
        const urls: string[] =
          [];

        if (
          policy?.storeUrl
        ) {
          urls.push(
            policy.storeUrl
          );
        }

        if (
          Platform.OS ===
          'android'
        ) {
          const packageName =
            getPackageName();

          if (packageName) {
            urls.push(
              `market://details?id=${packageName}`
            );

            urls.push(
              `https://play.google.com/store/apps/details?id=${encodeURIComponent(
                packageName
              )}`
            );
          }
        }

        for (
          const url of urls
        ) {
          try {
            await Linking
              .openURL(url);

            return;
          } catch {}
        }
      },
      [policy]
    );

  if (
    state === 'allowed'
  ) {
    return <>{children}</>;
  }

  if (
    state === 'checking' ||
    state === 'syncing'
  ) {
    return (
      <View
        style={
          styles.container
        }
      >
        <ActivityIndicator
          size="large"
          color="#FF7A00"
        />

        <Text
          style={
            styles.loadingTitle
          }
        >
          {state ===
          'syncing'
            ? 'Preparando atualização'
            : 'Verificando versão'}
        </Text>

        <Text
          style={
            styles.loadingText
          }
        >
          {state ===
          'syncing'
            ? 'Sincronizando dados pendentes antes de continuar.'
            : 'Só um instante...'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={
        styles.container
      }
    >
      <View
        style={
          styles.card
        }
      >
        <View
          style={
            styles.iconCircle
          }
        >
          <Text
            style={
              styles.icon
            }
          >
            ↑
          </Text>
        </View>

        <Text
          style={
            styles.title
          }
        >
          Atualização obrigatória
        </Text>

        <Text
          style={
            styles.description
          }
        >
          {policy?.message ||
            'Uma nova versão do Omni Field precisa ser instalada para continuar usando o aplicativo.'}
        </Text>

        <View
          style={
            styles.versionBox
          }
        >
          <Text
            style={
              styles.label
            }
          >
            Versão instalada
          </Text>

          <Text
            style={
              styles.value
            }
          >
            {currentVersion}
          </Text>

          <View
            style={
              styles.separator
            }
          />

          <Text
            style={
              styles.label
            }
          >
            Versão mínima
          </Text>

          <Text
            style={
              styles.required
            }
          >
            {policy
              ?.minimumVersion}
          </Text>
        </View>

        <Pressable
          style={
            styles.button
          }
          onPress={
            openStore
          }
        >
          <Text
            style={
              styles.buttonText
            }
          >
            Atualizar agora
          </Text>
        </Pressable>

        <Text
          style={
            styles.footer
          }
        >
          Após instalar a atualização, volte ao Omni Field.
        </Text>
      </View>
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#111111',
      alignItems:
        'center',
      justifyContent:
        'center',
      padding: 24,
    },

    loadingTitle: {
      color: '#FFFFFF',
      marginTop: 18,
      fontSize: 20,
      fontWeight: '800',
      textAlign: 'center',
    },

    loadingText: {
      color: '#A3A3A3',
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },

    card: {
      width: '100%',
      maxWidth: 440,
      backgroundColor:
        '#1C1C1C',
      borderWidth: 1,
      borderColor:
        '#333333',
      borderRadius: 24,
      padding: 24,
      alignItems:
        'center',
    },

    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor:
        'rgba(255,122,0,0.14)',
      alignItems:
        'center',
      justifyContent:
        'center',
      marginBottom: 18,
    },

    icon: {
      color: '#FF7A00',
      fontSize: 38,
      fontWeight: '900',
    },

    title: {
      color: '#FFFFFF',
      fontSize: 23,
      fontWeight: '900',
      textAlign: 'center',
    },

    description: {
      color: '#C7C7C7',
      marginTop: 12,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },

    versionBox: {
      width: '100%',
      marginTop: 22,
      backgroundColor:
        '#151515',
      borderWidth: 1,
      borderColor:
        '#2C2C2C',
      borderRadius: 16,
      padding: 16,
    },

    label: {
      color: '#888888',
      fontSize: 12,
      fontWeight: '700',
      textTransform:
        'uppercase',
    },

    value: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '800',
      marginTop: 4,
    },

    required: {
      color: '#FF7A00',
      fontSize: 17,
      fontWeight: '900',
      marginTop: 4,
    },

    separator: {
      height: 1,
      backgroundColor:
        '#292929',
      marginVertical: 13,
    },

    button: {
      width: '100%',
      height: 54,
      marginTop: 22,
      borderRadius: 16,
      backgroundColor:
        '#FF7A00',
      alignItems:
        'center',
      justifyContent:
        'center',
    },

    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '900',
    },

    footer: {
      color: '#777777',
      marginTop: 14,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
