import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import { NativeModules } from 'react-native';

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

    // MOBILE_DEVICE_STORAGE_TELEMETRY_V1
    let freeStorageMb: number | undefined;
    let totalStorageMb: number | undefined;

    try {
      const [freeStorageBytes, totalStorageBytes] =
        await Promise.all([
          FileSystem.getFreeDiskStorageAsync(),
          FileSystem.getTotalDiskCapacityAsync(),
        ]);

      if (
        Number.isFinite(freeStorageBytes) &&
        freeStorageBytes >= 0
      ) {
        freeStorageMb =
          Math.round(
            (freeStorageBytes / 1024 / 1024) * 100
          ) / 100;
      }

      if (
        Number.isFinite(totalStorageBytes) &&
        totalStorageBytes > 0
      ) {
        totalStorageMb =
          Math.round(
            (totalStorageBytes / 1024 / 1024) * 100
          ) / 100;
      }

      telemetryDebug(
        '[Telemetria] Armazenamento:',
        {
          free_storage_mb: freeStorageMb,
          total_storage_mb: totalStorageMb,
        }
      );
    } catch (error) {
      telemetryDebug(
        '[Telemetria] Falha ao ler armazenamento:',
        error
      );
    }


    // MOBILE_DEVICE_MEMORY_TELEMETRY_V1
    let totalMemoryMb: number | undefined;
    let availableMemoryMb: number | undefined;
    let lowMemory: boolean | undefined;
    let appMemoryMb: number | undefined;
    let appJavaHeapUsedMb: number | undefined;
    let appJavaHeapMaxMb: number | undefined;

    const normalizeMemoryMb = (
      value: any
    ): number | undefined => {
      const parsed = Number(value);

      if (
        !Number.isFinite(parsed) ||
        parsed < 0
      ) {
        return undefined;
      }

      return (
        Math.round(parsed * 100) /
        100
      );
    };

    try {
      const totalMemoryBytes =
        Number(Device.totalMemory);

      if (
        Number.isFinite(totalMemoryBytes) &&
        totalMemoryBytes > 0
      ) {
        totalMemoryMb =
          normalizeMemoryMb(
            totalMemoryBytes /
            1024 /
            1024
          );
      }

      const memoryModule =
        NativeModules?.DeviceMemory;

      if (
        memoryModule &&
        typeof memoryModule.getMemoryInfo ===
          'function'
      ) {
        const memoryInfo =
          await memoryModule.getMemoryInfo();

        totalMemoryMb =
          normalizeMemoryMb(
            memoryInfo?.totalMemoryMb
          ) ??
          totalMemoryMb;

        availableMemoryMb =
          normalizeMemoryMb(
            memoryInfo?.availableMemoryMb
          );

        lowMemory =
          typeof memoryInfo?.lowMemory ===
            'boolean'
            ? memoryInfo.lowMemory
            : undefined;

        appMemoryMb =
          normalizeMemoryMb(
            memoryInfo?.appMemoryMb
          );

        appJavaHeapUsedMb =
          normalizeMemoryMb(
            memoryInfo?.appJavaHeapUsedMb
          );

        appJavaHeapMaxMb =
          normalizeMemoryMb(
            memoryInfo?.appJavaHeapMaxMb
          );
      }

      telemetryDebug(
        '[Telemetria] Memoria:',
        {
          total_memory_mb:
            totalMemoryMb,
          available_memory_mb:
            availableMemoryMb,
          low_memory:
            lowMemory,
          app_memory_mb:
            appMemoryMb,
          app_java_heap_used_mb:
            appJavaHeapUsedMb,
          app_java_heap_max_mb:
            appJavaHeapMaxMb,
        }
      );

    } catch (error) {
      telemetryDebug(
        '[Telemetria] Falha ao ler memoria:',
        error
      );
    }

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

    if (freeStorageMb !== undefined) {
      payload.free_storage_mb = freeStorageMb;
    }

    if (totalStorageMb !== undefined) {
      payload.total_storage_mb = totalStorageMb;
    }


    if (totalMemoryMb !== undefined) {
      payload.total_memory_mb =
        totalMemoryMb;
    }

    if (availableMemoryMb !== undefined) {
      payload.available_memory_mb =
        availableMemoryMb;
    }

    if (lowMemory !== undefined) {
      payload.low_memory =
        lowMemory;
    }

    if (appMemoryMb !== undefined) {
      payload.app_memory_mb =
        appMemoryMb;
    }

    if (appJavaHeapUsedMb !== undefined) {
      payload.app_java_heap_used_mb =
        appJavaHeapUsedMb;
    }

    if (appJavaHeapMaxMb !== undefined) {
      payload.app_java_heap_max_mb =
        appJavaHeapMaxMb;
    }

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
