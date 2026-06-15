import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as Application from 'expo-application';
import * as Location from 'expo-location';

import { api } from './api';

const TELEMETRY_DEBUG = false;

const telemetryDebug = (...args: any[]) => {
  if (__DEV__ && TELEMETRY_DEBUG) {
    console.log(...args);
  }
};

export const collectAndSendTelemetry = async (userId: string) => {
  try {
    // 1. Bateria
    let batteryLevel: number | undefined = undefined;
    let isCharging = false;

    try {
      const level = await Battery.getBatteryLevelAsync();

      if (level !== null && level >= 0) {
        batteryLevel = Math.round(level * 100);
      }

      const batteryState = await Battery.getBatteryStateAsync();
      isCharging =
        batteryState === Battery.BatteryState.CHARGING ||
        batteryState === Battery.BatteryState.FULL;
    } catch (error) {
      telemetryDebug('⚠️ [Telemetria] Falha ao ler bateria:', error);
    }

    // 2. Rede
    let networkType = 'UNKNOWN';

    try {
      const networkState = await Network.getNetworkStateAsync();
      networkType = networkState.type?.toString() || 'UNKNOWN';
    } catch (error) {
      telemetryDebug('⚠️ [Telemetria] Falha ao ler rede:', error);
    }

    // 3. GPS silencioso
    let gpsEnabled = false;
    let lat: number | undefined = undefined;
    let lon: number | undefined = undefined;

    try {
      gpsEnabled = await Location.hasServicesEnabledAsync();

      if (gpsEnabled) {
        const loc = await Location.getLastKnownPositionAsync();

        if (loc) {
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        }
      }
    } catch (error) {
      telemetryDebug('⚠️ [Telemetria] GPS bloqueado ou falhou na leitura:', error);
    }

    // 4. Monta pacote
    const payload: any = {
      usuario_id: userId,
      device_model: Device.modelName || 'Dispositivo Desconhecido',
      os_version: `${Device.osName || 'OS'} ${Device.osVersion || ''}`.trim(),
      app_version: Application.nativeApplicationVersion || '1.0.0',
      is_charging: isCharging,
      gps_enabled: gpsEnabled,
      network_type: networkType,
      location_time: new Date().toISOString(),
    };

    if (batteryLevel !== undefined) payload.battery_level = batteryLevel;
    if (lat !== undefined) payload.lat = lat;
    if (lon !== undefined) payload.lon = lon;

    // 5. Envia para o backend
    const response = await api('/telemetry', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response || !response.ok) {
      console.warn(`[Telemetria] Servidor recusou. Status: ${response?.status || 'unknown'}`);
    }
  } catch (error) {
    console.warn('[Telemetria] Falha crítica no motor:', error);
  }
};
