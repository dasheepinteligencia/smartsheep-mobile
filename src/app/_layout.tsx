import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

import { initializeDatabase } from '../database/db';
import { useAuthStore } from '../store/useAuthStore';
import { globalSync } from '../services/syncService';

const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      console.log('Sync em segundo plano iniciado...');
      await globalSync();

      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('Erro no background sync:', error);

      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

const registerBackgroundSync = async () => {
  try {
    const status = await BackgroundFetch.getStatusAsync();

    if (
      status === BackgroundFetch.BackgroundFetchStatus.Denied ||
      status === BackgroundFetch.BackgroundFetchStatus.Restricted
    ) {
      console.log('⚠️ Background Sync indisponível neste dispositivo:', status);
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

    if (isRegistered) {
      console.log('✅ Background Sync já estava registrado.');
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log('✅ Background Sync registrado com sucesso.');
  } catch (error) {
    console.log('❌ Falha ao registrar Background Sync:', error);
  }
};

export default function RootLayout() {
  const { loadStorageData, hasHydrated, token, user } = useAuthStore();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await initializeDatabase();

        if (!mounted) return;

        await loadStorageData();

        if (!mounted) return;

        await registerBackgroundSync();
      } catch (error) {
        console.log('❌ Falha ao inicializar o app:', error);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [loadStorageData]);

  useEffect(() => {
    if (!hasHydrated) return;

    const firstSegment = String(segments?.[0] || '');
    const isLoginRoute = firstSegment === 'login';
    const hasValidSession = Boolean(token && user?.id);

    if (!hasValidSession && !isLoginRoute) {
      router.replace('/login' as any);
      return;
    }

    if (hasValidSession && isLoginRoute) {
      router.replace('/(tabs)' as any);
    }
  }, [hasHydrated, token, user?.id, segments, router]);

  if (!hasHydrated) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 220,
        contentStyle: {
          backgroundColor: 'transparent',
        },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />

      <Stack.Screen name="mural" options={{ headerShown: false }} />
      <Stack.Screen name="performance" options={{ headerShown: false }} />
      <Stack.Screen name="perfectstore" options={{ headerShown: false }} />
      <Stack.Screen name="historico" options={{ headerShown: false }} />
      <Stack.Screen name="perfil" options={{ headerShown: false }} />
      <Stack.Screen name="suporte" options={{ headerShown: false }} />
      <Stack.Screen name="configuracoes" options={{ headerShown: false }} />

      <Stack.Screen name="pesquisa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="pesquisa_avulsa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="visita/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
