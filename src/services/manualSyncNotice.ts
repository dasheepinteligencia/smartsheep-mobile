import * as Network from 'expo-network';

import { AppAlert } from '../components/AppAlert';
import {
  getDiamondSyncHealth,
} from './syncService';
import {
  i18n,
  normalizeLanguage,
} from '../utils/i18n';

// OMNI_MANUAL_SYNC_NOTICE_I18N_135
export async function notifyManualSyncResult(
  result: any,
  language: string,
  error?: unknown
): Promise<void> {
  if (result?.ok === true && !error) {
    return;
  }

  const locale = normalizeLanguage(language);

  const translate = (key: string, count?: number) =>
    String(i18n.t(key, { locale, count }));

  let health: any = result?.health || null;

  if (!health) {
    try {
      health = await getDiamondSyncHealth();
    } catch {
      health = null;
    }
  }

  const pending = Math.max(0, Number(health?.pending || 0));
  const retry = Math.max(0, Number(health?.retry || 0));
  const total = pending + retry;

  const conflicts =
    Math.max(0, Number(health?.conflict || 0)) +
    Math.max(0, Number(health?.unresolvedConflicts || 0)) +
    Math.max(0, Number(health?.collectionsConflict || 0));

  const status = String(result?.status || '').toUpperCase();

  let offline = status === 'OFFLINE';

  try {
    const network = await Network.getNetworkStateAsync();

    if (
      network.isConnected === false ||
      network.isInternetReachable === false
    ) {
      offline = true;
    }
  } catch {
    // O diagnóstico da rede não pode apagar nem alterar dados.
  }

  let titleKey = 'manualSyncInterruptedTitle';
  let messageKey = 'manualSyncInterruptedMessage';

  if (offline) {
    titleKey = 'manualSyncOfflineTitle';
    messageKey = total > 0
      ? 'manualSyncOfflineWithCount'
      : 'manualSyncOfflineEmpty';
  } else if (status.startsWith('SKIPPED')) {
    titleKey = 'manualSyncBusyTitle';
    messageKey = 'manualSyncBusyMessage';
  } else if (conflicts > 0) {
    titleKey = 'manualSyncConflictTitle';
    messageKey = 'manualSyncConflictMessage';
  } else if (total > 0) {
    titleKey = 'manualSyncWaitingTitle';
    messageKey = 'manualSyncWaitingWithCount';
  } else if (
    String(result?.error || '').includes('API não confirmou') ||
    String(result?.error || '').includes('Confirmação remota')
  ) {
    titleKey = 'manualSyncAckTitle';
    messageKey = 'manualSyncAckMessage';
  } else if (!error && status === 'PARTIAL') {
    titleKey = 'manualSyncWaitingTitle';
    messageKey = 'manualSyncWaitingEmpty';
  }

  // Aviso operacional compacto, sem códigos HTTP, SQL ou logs.
  // Esses detalhes permanecem em Ajuda/Suporte.
  AppAlert.alert(
    translate(titleKey),
    translate(messageKey, total),
    undefined,
    {
      tone: 'warning',
      compact: true,
    }
  );
}
