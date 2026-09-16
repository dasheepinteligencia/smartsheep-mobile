import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Network from 'expo-network';

import {
  ensureActiveLocalWorkspaceForUser,
  initializeDatabase,
} from '../database/db';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { globalSync } from '../services/syncService';
import { DevicePreflightGate } from '../components/DevicePreflightGate';
import { isSupervisorMobileUser } from '../utils/mobileRole';

import { AppAlertProvider } from '../components/AppAlert';
const BACKGROUND_SYNC_TASK = 'BACKGROUND_SYNC_TASK';

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
      console.log('Sync em segundo plano iniciado...');

      /*
       * MOBILE_BACKGROUND_AUTH_HYDRATION_V1
       *
       * Em execução headless o Zustand pode nascer vazio. Antes do globalSync
       * reidratamos a sessão e confirmamos o workspace do usuário. Sem isso, o
       * BackgroundFetch podia acordar e retornar SKIPPED_NO_SESSION.
       */
      await initializeDatabase();

      const auth = useAuthStore.getState();
      if (!auth.token || !auth.user?.id) {
        await auth.loadStorageData();
      }

      const hydrated = useAuthStore.getState();

      if (!hydrated.token || !hydrated.user?.id) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      await ensureActiveLocalWorkspaceForUser(hydrated.user);

      const result = await globalSync();

      return result?.ok
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
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

  const appStateRef = useRef(AppState.currentState);
  const networkWasOnlineRef = useRef<boolean | null>(null);
  const lastAutoSyncAttemptRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        await initializeDatabase();

        if (!mounted) return;

        await loadStorageData();

        if (!mounted) return;

        const hydratedUser = useAuthStore.getState().user;
        if (hydratedUser?.id) {
          await ensureActiveLocalWorkspaceForUser(hydratedUser);
        }

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

  /*
   * MOBILE_AUTO_SYNC_COORDINATOR_V1
   *
   * O botão manual é redundância, nunca requisito operacional.
   * Gatilhos automáticos:
   * - sessão pronta/login;
   * - retorno ao foreground;
   * - transição offline -> online;
   * - tentativa ao ir para background;
   * - heartbeat em foreground a cada 5 minutos;
   * - BackgroundFetch solicitado ao SO a cada >= 15 minutos.
   */
  useEffect(() => {
    if (!hasHydrated || !token || !user?.id) return;

    let disposed = false;

    /*
     * MOBILE_UI_FIRST_AUTOSYNC_SCHEDULER_V1
     *
     * Login já executa globalSync explicitamente. A raiz não dispara um segundo
     * sync pesado no mesmo frame da navegação. Sessão restaurada continua
     * sincronizando automaticamente após uma curta janela para a UI aparecer.
     */
    const attemptAutoSync = async (reason: string, force = false) => {
      const now = Date.now();
      const lastSyncValue = useSyncStore.getState().lastSync;
      const lastConfirmedSync =
        lastSyncValue instanceof Date
          ? lastSyncValue.getTime()
          : Date.parse(String(lastSyncValue || ''));
      const recentlyConfirmed =
        Number.isFinite(lastConfirmedSync) &&
        now - lastConfirmedSync < 30000;

      if (!force && (recentlyConfirmed || now - lastAutoSyncAttemptRef.current < 30000)) {
        return;
      }

      lastAutoSyncAttemptRef.current = now;

      try {
        const result = await globalSync();
        console.log(`[AUTO SYNC] ${reason}`, result?.status || result?.ok);
      } catch (error) {
        console.log(`[AUTO SYNC] ${reason} falhou:`, error);
      }
    };

    const sessionReadyTimer = setTimeout(() => {
      void attemptAutoSync('SESSION_READY');
    }, 1200);

    const foregroundHeartbeat = setInterval(() => {
      if (AppState.currentState === 'active') {
        void attemptAutoSync('FOREGROUND_HEARTBEAT');
      }
    }, 5 * 60 * 1000);

    const networkPoll = setInterval(async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (disposed) return;

        const online = Boolean(
          state?.isConnected &&
          state?.isInternetReachable !== false
        );

        const wasOnline = networkWasOnlineRef.current;
        networkWasOnlineRef.current = online;

        if (online && wasOnline === false) {
          void attemptAutoSync('NETWORK_RESTORED', true);
        }
      } catch {}
    }, 15000);

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && /inactive|background/.test(previousState)) {
        setTimeout(() => {
          if (!disposed) void attemptAutoSync('FOREGROUND_RESUME');
        }, 250);
        return;
      }

      if (previousState === 'active' && /inactive|background/.test(nextState)) {
        // Best effort: Android/iOS podem suspender o JS logo depois da transição.
        void attemptAutoSync('APP_BACKGROUNDING', true);
      }
    });

    return () => {
      disposed = true;
      clearTimeout(sessionReadyTimer);
      clearInterval(foregroundHeartbeat);
      clearInterval(networkPoll);
      appStateSubscription.remove();
    };
  }, [hasHydrated, token, user?.id]);

  useEffect(() => {
    if (!hasHydrated) return;

    const firstSegment = String(segments?.[0] || '');
    const isLoginRoute = firstSegment === 'login';
    const hasValidSession = Boolean(token && user?.id);

    // OMNI_SUPERVISOR_EXPERIENCE_V1
    const supervisorExperience =
      hasValidSession &&
      isSupervisorMobileUser(user);

    if (!hasValidSession && !isLoginRoute) {
      router.replace('/login' as any);
      return;
    }

    if (
      hasValidSession &&
      isLoginRoute
    ) {
      router.replace(
        (
          supervisorExperience
            ? '/(supervisor)'
            : '/(tabs)'
        ) as any
      );
      return;
    }

    /*
     * O login legado continua enviando para /(tabs).
     * Se for Supervisor, o RootLayout corrige imediatamente
     * para a experiência Command Center sem tocar no login.tsx.
     */
    if (
      supervisorExperience &&
      firstSegment === '(tabs)'
    ) {
      router.replace(
        '/(supervisor)' as any
      );
      return;
    }

    if (
      !supervisorExperience &&
      firstSegment === '(supervisor)'
    ) {
      router.replace(
        '/(tabs)' as any
      );
    }
  }, [hasHydrated, token, user?.id, segments, router]);

  if (!hasHydrated) {
    return null;
  }

  return (
    <DevicePreflightGate>
      {/* MOBILE_GLOBAL_APP_ALERT_PROVIDER_V2 */}
<AppAlertProvider>
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

      {/* OMNI_SUPERVISOR_EXPERIENCE_V1 */}
      <Stack.Screen
        name="(supervisor)"
        options={{
          headerShown: false,
          animation: 'fade'
        }}
      />

      <Stack.Screen name="mural" options={{ headerShown: false }} />
      <Stack.Screen name="performance" options={{ headerShown: false }} />
      <Stack.Screen name="perfectstore" options={{ headerShown: false }} />
      <Stack.Screen name="historico" options={{ headerShown: false }} />

      {/* MOBILE_SUPERVISOR_OWN_ROUTINE_ROUTE_V2 */}
      <Stack.Screen
        name="minha-rotina"
        options={{
          headerShown: false
        }}
      />
      <Stack.Screen name="perfil" options={{ headerShown: false }} />
      <Stack.Screen name="suporte" options={{ headerShown: false }} />
      <Stack.Screen name="configuracoes" options={{ headerShown: false }} />

      {/* MOBILE_DIAMOND_SYNC_CENTER_ROUTE_V1 */}
      <Stack.Screen
        name="sincronizacao"
        options={{
          headerShown: false
        }}
      />

      <Stack.Screen name="pesquisa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="pesquisa_avulsa/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="visita/[id]" options={{ headerShown: false }} />
      </Stack>
</AppAlertProvider>
    </DevicePreflightGate>
  );
}
