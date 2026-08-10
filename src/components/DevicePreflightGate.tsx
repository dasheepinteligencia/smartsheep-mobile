import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import * as Location from 'expo-location';

import {
  SafeAreaView,
} from 'react-native-safe-area-context';

import {
  t,
} from '../utils/i18n';

import {
  evaluateDevicePreflight,
  requestForegroundLocationPermission,
  type DevicePreflightCheck,
  type DevicePreflightResult,
} from '../services/devicePreflightService';

type Props = {
  children: React.ReactNode;
};

/*
 * ===========================================================
 * REGRA DE SESSÃO
 * ===========================================================
 *
 * Depois que o preflight passa uma vez,
 * o aplicativo permanece liberado durante
 * TODA a vida deste processo JavaScript.
 *
 * Navegação, câmera, background/foreground,
 * configurações etc. NÃO reabrem o gate.
 *
 * Quando o app for realmente encerrado e
 * iniciado novamente, este valor volta a false.
 * ===========================================================
 */
let preflightPassedForCurrentSession = false;

type ThemePalette = {
  background: string;
  card: string;
  cardBorder: string;
  text: string;
  textSoft: string;
  line: string;
  primary: string;
  secondaryButton: string;
  secondaryButtonBorder: string;
  ok: string;
  warning: string;
  error: string;
};

function getPalette(
  isDark: boolean
): ThemePalette {
  if (isDark) {
    return {
      background:
        '#07152c',

      card:
        'rgba(19, 34, 65, 0.92)',

      cardBorder:
        'rgba(140, 164, 206, 0.20)',

      text:
        '#f5f7fb',

      textSoft:
        '#bdd0ea',

      line:
        'rgba(255,255,255,0.08)',

      primary:
        '#ff7a00',

      secondaryButton:
        '#1a2950',

      secondaryButtonBorder:
        'rgba(170, 192, 230, 0.20)',

      ok:
        '#33d17a',

      warning:
        '#ffcc33',

      error:
        '#ff6b5f',
    };
  }

  return {
    background:
      '#eef2f7',

    card:
      'rgba(255, 255, 255, 0.96)',

    cardBorder:
      'rgba(29, 53, 87, 0.12)',

    text:
      '#1d3557',

    textSoft:
      '#58708c',

    line:
      'rgba(29,53,87,0.08)',

    primary:
      '#ff7a00',

    secondaryButton:
      '#ffffff',

    secondaryButtonBorder:
      'rgba(29,53,87,0.14)',

    ok:
      '#16a34a',

    warning:
      '#d4a000',

    error:
      '#e34d42',
  };
}

function getStatusColor(
  status: DevicePreflightCheck['status'],
  palette: ThemePalette
) {
  if (
    status === 'ok'
  ) {
    return palette.ok;
  }

  if (
    status === 'warning'
  ) {
    return palette.warning;
  }

  return palette.error;
}

function getStatusSymbol(
  status: DevicePreflightCheck['status']
) {
  if (
    status === 'ok'
  ) {
    return '✓';
  }

  if (
    status === 'warning'
  ) {
    return '!';
  }

  return '×';
}

export function DevicePreflightGate({
  children,
}: Props) {
  const colorScheme =
    useColorScheme();

  const isDark =
    colorScheme !== 'light';

  const palette =
    useMemo(
      () =>
        getPalette(isDark),
      [isDark]
    );

  /*
   * Se o componente for remontado pelo router,
   * mas o preflight já passou nessa sessão,
   * começa diretamente desbloqueado.
   */
  const [
    unlocked,
    setUnlocked,
  ] =
    useState(
      preflightPassedForCurrentSession
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      !preflightPassedForCurrentSession
    );

  const [
    busyAction,
    setBusyAction,
  ] =
    useState(false);

  const [
    result,
    setResult,
  ] =
    useState<DevicePreflightResult | null>(
      null
    );

  const runCheck =
    useCallback(
      async () => {
        /*
         * Regra crítica:
         * depois de liberado, não revalida.
         */
        if (
          preflightPassedForCurrentSession
        ) {
          setUnlocked(true);
          setLoading(false);
          return;
        }

        setLoading(true);

        try {
          const next =
            await evaluateDevicePreflight();

          setResult(next);

          if (
            !next.hasBlockingIssues
          ) {
            preflightPassedForCurrentSession =
              true;

            setUnlocked(true);
          }
        } catch (error) {
          console.log(
            '[PreflightGate] Erro:',
            error
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  /*
   * =========================================================
   * PRIMEIRA VERIFICAÇÃO
   * =========================================================
   *
   * Executa somente enquanto esta sessão ainda
   * não tiver sido aprovada.
   */
  useEffect(() => {
    if (
      preflightPassedForCurrentSession
    ) {
      setUnlocked(true);
      setLoading(false);
      return;
    }

    void runCheck();
  }, [runCheck]);

  /*
   * =========================================================
   * RETORNO DAS CONFIGURAÇÕES
   * =========================================================
   *
   * Só escuta AppState ENQUANTO O APP ESTÁ BLOQUEADO.
   *
   * Assim, se o usuário abrir Configurações para
   * conceder GPS/permissão, o gate revalida ao voltar.
   *
   * Depois que passa, este listener deixa de existir.
   */
  useEffect(() => {
    if (
      unlocked ||
      preflightPassedForCurrentSession ||
      !result?.hasBlockingIssues
    ) {
      return;
    }

    const subscription =
      AppState.addEventListener(
        'change',
        (state) => {
          if (
            state === 'active' &&
            !preflightPassedForCurrentSession
          ) {
            void runCheck();
          }
        }
      );

    return () => {
      subscription.remove();
    };
  }, [
    result?.hasBlockingIssues,
    runCheck,
    unlocked,
  ]);

  const handlePrimaryAction =
    useCallback(
      async () => {
        setBusyAction(true);

        try {
          const permission =
            await Location
              .getForegroundPermissionsAsync()
              .catch(
                () => null
              );

          if (
            !permission?.granted &&
            permission?.canAskAgain !== false
          ) {
            await requestForegroundLocationPermission();

            /*
             * Depois do diálogo nativo,
             * revalida imediatamente.
             */
            await runCheck();

            return;
          }

          /*
           * GPS desligado ou permissão
           * bloqueada permanentemente.
           */
          await Linking.openSettings();
        } catch (error) {
          console.log(
            '[PreflightGate] Ação:',
            error
          );
        } finally {
          setBusyAction(false);
        }
      },
      [runCheck]
    );

  const handleRetry =
    useCallback(
      async () => {
        setBusyAction(true);

        try {
          await runCheck();
        } finally {
          setBusyAction(false);
        }
      },
      [runCheck]
    );

  /*
   * =========================================================
   * APP LIBERADO
   * =========================================================
   */
  if (
    unlocked ||
    preflightPassedForCurrentSession
  ) {
    return <>{children}</>;
  }

  const permissionCheck =
    result?.checks.find(
      (item) =>
        item.key ===
        'locationPermission'
    );

  const deviceLocationCheck =
    result?.checks.find(
      (item) =>
        item.key ===
        'deviceLocation'
    );

  const shouldAskPermission =
    permissionCheck?.status ===
    'error';

  const gpsDisabled =
    deviceLocationCheck?.status ===
    'error';

  const primaryButtonLabel =
    shouldAskPermission
      ? t(
          'preflightGrantLocationAccess'
        )
      : t(
          'preflightOpenSettings'
        );





  if (
    loading &&
    !result
  ) {
    return (
      <SafeAreaView
        style={[
          styles.safe,
          {
            backgroundColor:
              palette.background,
          },
        ]}
      >
        <View
          style={
            styles.loadingContainer
          }
        >
          <ActivityIndicator
            size="large"
            color={
              palette.primary
            }
          />

          <Text
            style={[
              styles.loadingText,
              {
                color:
                  palette.text,
              },
            ]}
          >
            {t(
              'preflightChecking'
            )}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safe,
        {
          backgroundColor:
            palette.background,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={
          styles.scrollContent
        }
      >
        <View
          style={
            styles.wrapper
          }
        >
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  `${palette.primary}22`,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeIcon,
                {
                  color:
                    palette.primary,
                },
              ]}
            >
              ⌖
            </Text>
          </View>

          <Text
            style={[
              styles.title,
              {
                color:
                  palette.text,
              },
            ]}
          >
            {t(
              'preflightTitle'
            )}
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                color:
                  palette.textSoft,
              },
            ]}
          >
            {t(
              'preflightSubtitle'
            )}
          </Text>

          <View
            style={[
              styles.card,
              {
                backgroundColor:
                  palette.card,

                borderColor:
                  palette.cardBorder,
              },
            ]}
          >
            {(
              result?.checks || []
            ).map(
              (
                item,
                index,
                array
              ) => {
                const statusColor =
                  getStatusColor(
                    item.status,
                    palette
                  );

                return (
                  <View
                    key={
                      item.key
                    }
                  >
                    <View
                      style={
                        styles.row
                      }
                    >
                      <View
                        style={[
                          styles.statusCircle,
                          {
                            backgroundColor:
                              `${statusColor}22`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusCircleText,
                            {
                              color:
                                statusColor,
                            },
                          ]}
                        >
                          {getStatusSymbol(
                            item.status
                          )}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.rowText
                        }
                      >
                        <Text
                          style={[
                            styles.rowTitle,
                            {
                              color:
                                palette.text,
                            },
                          ]}
                        >
                          {t(
                            item.titleKey
                          )}
                        </Text>

                        <Text
                          style={[
                            styles.rowDetail,
                            {
                              color:
                                statusColor,
                            },
                          ]}
                        >
                          {t(
                            item.detailKey
                          )}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.rowStatus,
                          {
                            color:
                              statusColor,
                          },
                        ]}
                      >
                        {getStatusSymbol(
                          item.status
                        )}
                      </Text>
                    </View>

                    {index <
                    array.length - 1 ? (
                      <View
                        style={[
                          styles.separator,
                          {
                            backgroundColor:
                              palette.line,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                );
              }
            )}
          </View>

          <Pressable
            onPress={
              handlePrimaryAction
            }
            style={[
              styles.primaryButton,
              {
                backgroundColor:
                  palette.primary,
              },
            ]}
            disabled={
              busyAction
            }
          >
            {busyAction ? (
              <ActivityIndicator
                color="#ffffff"
              />
            ) : (
              <Text
                style={
                  styles.primaryButtonText
                }
              >
                {
                  primaryButtonLabel
                }
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={
              handleRetry
            }
            style={[
              styles.secondaryButton,
              {
                backgroundColor:
                  palette.secondaryButton,

                borderColor:
                  palette.secondaryButtonBorder,
              },
            ]}
            disabled={
              busyAction
            }
          >
            <Text
              style={[
                styles.secondaryButtonText,
                {
                  color:
                    palette.text,
                },
              ]}
            >
              {t(
                'preflightRetryCheck'
              )}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default DevicePreflightGate;

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
    },

    scrollContent: {
      flexGrow: 1,
    },

    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      padding: 30,
    },

    loadingText: {
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },

    wrapper: {
      flexGrow: 1,
      paddingHorizontal: 22,
      paddingVertical: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },

    badge: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },

    badgeIcon: {
      fontSize: 28,
      fontWeight: '800',
    },

    title: {
      fontSize: 28,
      fontWeight: '900',
      textAlign: 'center',
      marginBottom: 10,
    },

    subtitle: {
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 360,
      marginBottom: 24,
      fontWeight: '600',
    },

    card: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 24,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 24,
    },

    row: {
      minHeight: 84,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 10,
    },

    statusCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },

    statusCircleText: {
      fontSize: 20,
      fontWeight: '900',
    },

    rowText: {
      flex: 1,
    },

    rowTitle: {
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 4,
    },

    rowDetail: {
      fontSize: 14,
      fontWeight: '700',
    },

    rowStatus: {
      fontSize: 22,
      fontWeight: '900',
      width: 24,
      textAlign: 'center',
    },

    separator: {
      height: 1,
      width: '100%',
    },

    primaryButton: {
      width: '100%',
      maxWidth: 420,
      minHeight: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      marginBottom: 14,
    },

    primaryButtonText: {
      color: '#ffffff',
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 0.2,
      textAlign: 'center',
    },

    secondaryButton: {
      width: '100%',
      maxWidth: 420,
      minHeight: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderWidth: 1,
    },

    secondaryButtonText: {
      fontSize: 17,
      fontWeight: '800',
    },
  });
