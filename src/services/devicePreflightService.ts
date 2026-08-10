import { Platform } from 'react-native';

import * as Location from 'expo-location';
import * as Network from 'expo-network';

export type DevicePreflightStatus =
  | 'ok'
  | 'warning'
  | 'error';

export type DevicePreflightCheck = {
  key:
    | 'locationPermission'
    | 'deviceLocation'
    | 'internet'
    | 'locationIntegrity';

  status: DevicePreflightStatus;
  blocking: boolean;

  titleKey: string;
  detailKey: string;
};

export type DevicePreflightResult = {
  checks: DevicePreflightCheck[];
  hasBlockingIssues: boolean;
};

const MOCK_TIMEOUT_MS = 3000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,

      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(
              'LOCATION_PROBE_TIMEOUT'
            )
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const isExplicitlyMocked = (
  location: any
): boolean => {
  return location?.mocked === true;
};

const evaluateMockLocation = async (
  hasPermission: boolean,
  servicesEnabled: boolean
): Promise<
  Pick<
    DevicePreflightCheck,
    'status' | 'blocking' | 'detailKey'
  >
> => {
  /*
   * A propriedade "mocked" do expo-location
   * é disponibilizada pelo Android.
   *
   * No iOS NÃO vamos bloquear por ausência
   * desse indicador.
   */
  if (Platform.OS !== 'android') {
    return {
      status: 'ok',
      blocking: false,
      detailKey:
        'preflightNoMockIndicators',
    };
  }

  /*
   * Sem permissão/GPS ainda não existe
   * condição para testar Fake GPS.
   *
   * Essas duas condições já são bloqueadas
   * pelos checks próprios.
   */
  if (
    !hasPermission ||
    !servicesEnabled
  ) {
    return {
      status: 'ok',
      blocking: false,
      detailKey:
        'preflightMockCheckWaiting',
    };
  }

  try {
    /*
     * Primeiro testa a última posição conhecida.
     * É rápido e pode detectar imediatamente
     * uma localização simulada.
     */
    const lastKnown =
      await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
      });

    if (
      isExplicitlyMocked(lastKnown)
    ) {
      return {
        status: 'error',
        blocking: true,
        detailKey:
          'preflightLocationMocked',
      };
    }

    /*
     * Faz uma amostra atual.
     *
     * IMPORTANTE:
     * timeout, falta temporária de sinal GPS ou
     * erro de leitura NÃO são fraude.
     */
    try {
      const current =
        await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy:
              Location.Accuracy.Balanced,
          }),
          MOCK_TIMEOUT_MS
        );

      if (
        isExplicitlyMocked(current)
      ) {
        return {
          status: 'error',
          blocking: true,
          detailKey:
            'preflightLocationMocked',
        };
      }

      return {
        status: 'ok',
        blocking: false,
        detailKey:
          'preflightNoMockIndicators',
      };
    } catch (error) {
      console.log(
        '[Preflight] Amostra de localização indisponível:',
        error
      );

      /*
       * Não foi encontrada evidência de mock.
       * Portanto NÃO bloqueia.
       */
      return {
        status: 'ok',
        blocking: false,
        detailKey:
          'preflightNoMockIndicators',
      };
    }
  } catch (error) {
    console.log(
      '[Preflight] Validação de mock indisponível:',
      error
    );

    /*
     * Erro técnico nunca será convertido
     * automaticamente em suspeita de Fake GPS.
     */
    return {
      status: 'ok',
      blocking: false,
      detailKey:
        'preflightNoMockIndicators',
    };
  }
};

export async function evaluateDevicePreflight():
Promise<DevicePreflightResult> {
  const checks: DevicePreflightCheck[] = [];

  /*
   * =========================================================
   * LOCALIZAÇÃO — PERMISSÃO
   * =========================================================
   */

  const permission =
    await Location
      .getForegroundPermissionsAsync()
      .catch(() => null);

  const hasPermission =
    permission?.granted === true;

  checks.push({
    key:
      'locationPermission',

    status:
      hasPermission
        ? 'ok'
        : 'error',

    blocking:
      !hasPermission,

    titleKey:
      'preflightLocationPermission',

    detailKey:
      hasPermission
        ? 'preflightGranted'
        : 'preflightAccessRequired',
  });

  /*
   * =========================================================
   * GPS / SERVIÇO DE LOCALIZAÇÃO
   * =========================================================
   */

  const servicesEnabled =
    await Location
      .hasServicesEnabledAsync()
      .catch(() => false);

  checks.push({
    key:
      'deviceLocation',

    status:
      servicesEnabled
        ? 'ok'
        : 'error',

    blocking:
      !servicesEnabled,

    titleKey:
      'preflightDeviceLocation',

    detailKey:
      servicesEnabled
        ? 'preflightEnabled'
        : 'preflightDisabled',
  });

  /*
   * =========================================================
   * INTERNET
   *
   * Não bloqueia o Omni Field.
   * =========================================================
   */

  const network =
    await Network
      .getNetworkStateAsync()
      .catch(() => null);

  const connected =
    network?.isConnected === true;

  const reachable =
    network?.isInternetReachable;

  const internetAvailable =
    connected &&
    reachable !== false;

  checks.push({
    key:
      'internet',

    status:
      internetAvailable
        ? 'ok'
        : 'warning',

    blocking:
      false,

    titleKey:
      'preflightInternet',

    detailKey:
      internetAvailable
        ? 'preflightConnected'
        : 'preflightOffline',
  });

  /*
   * =========================================================
   * FAKE GPS / LOCALIZAÇÃO SIMULADA
   *
   * Só bloqueia quando há evidência POSITIVA:
   * mocked === true
   * =========================================================
   */

  const mockResult =
    await evaluateMockLocation(
      hasPermission,
      servicesEnabled
    );

  checks.push({
    key:
      'locationIntegrity',

    status:
      mockResult.status,

    blocking:
      mockResult.blocking,

    titleKey:
      'preflightLocationIntegrity',

    detailKey:
      mockResult.detailKey,
  });

  return {
    checks,

    hasBlockingIssues:
      checks.some(
        (item) =>
          item.blocking &&
          item.status === 'error'
      ),
  };
}

export async function
requestForegroundLocationPermission() {
  return Location
    .requestForegroundPermissionsAsync();
}
