import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  HelpCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react-native';

import {
  useFocusEffect,
  useRouter,
} from 'expo-router';

import {
  getDiamondSyncDiagnostics,
  globalSync,
  type DiamondPendingOperationItem,
  type DiamondSyncConflictItem,
  type DiamondSyncHealth,
} from '../services/syncService';

import { useSettingsStore } from '../store/useSettingsStore';
import { useSyncStore } from '../store/useSyncStore';

const ACCENT_COLOR = '#FF7A00';

/*
 * ============================================================
 * MOBILE_DIAMOND_SYNC_CENTER_V1
 * ============================================================
 */

const getReadableTextColor = (
  hexColor?: string
) => {

  const fallback =
    '#FFFFFF';

  const hex =
    String(
      hexColor ||
      ''
    )
      .replace(
        '#',
        ''
      )
      .trim();

  if (
    !/^[0-9A-Fa-f]{6}$/.test(
      hex
    )
  ) {
    return fallback;
  }

  const r =
    parseInt(
      hex.substring(
        0,
        2
      ),
      16
    );

  const g =
    parseInt(
      hex.substring(
        2,
        4
      ),
      16
    );

  const b =
    parseInt(
      hex.substring(
        4,
        6
      ),
      16
    );

  const luminance =
    (
      0.299 * r +
      0.587 * g +
      0.114 * b
    ) / 255;

  return luminance > 0.62
    ? '#0F172A'
    : '#FFFFFF';
};


const formatDateTime =
  (
    value: any,
    language: string
  ) => {

    if (
      !value
    ) {
      return '—';
    }

    try {

      const date =
        value instanceof Date
          ? value
          : new Date(
              value
            );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return '—';
      }

      const locale =
        language ===
        'en-US'
          ? 'en-US'
          : language ===
            'es-ES'
            ? 'es-ES'
            : 'pt-BR';

      return date.toLocaleString(
        locale,
        {
          day:
            '2-digit',

          month:
            '2-digit',

          year:
            'numeric',

          hour:
            '2-digit',

          minute:
            '2-digit'
        }
      );

    } catch {

      return '—';
    }
  };


const getConflictLabel =
  (
    code: string | null,
    language: string
  ) => {

    const normalized =
      String(
        code ||
        ''
      )
        .trim()
        .toUpperCase();

    const labels: Record<
      string,
      {
        pt: string;
        en: string;
        es: string;
      }
    > = {

      STATE_CONFLICT_SERVER_NEWER: {
        pt:
          'Servidor possui alteração mais recente',

        en:
          'Server has a newer change',

        es:
          'El servidor tiene un cambio más reciente'
      },

      IDEMPOTENCY_OUTCOME_UNKNOWN: {
        pt:
          'Resultado da operação precisa ser reconciliado',

        en:
          'Operation result requires reconciliation',

        es:
          'El resultado de la operación requiere conciliación'
      },

      IDEMPOTENCY_KEY_REUSE_MISMATCH: {
        pt:
          'Identificador da operação foi reutilizado de forma incompatível',

        en:
          'Operation identifier was reused incompatibly',

        es:
          'El identificador de operación fue reutilizado de forma incompatible'
      }
    };

    const item =
      labels[
        normalized
      ];

    if (
      !item
    ) {
      return normalized ||
        (
          language ===
          'en-US'
            ? 'Synchronization conflict'
            : language ===
              'es-ES'
              ? 'Conflicto de sincronización'
              : 'Conflito de sincronização'
        );
    }

    if (
      language ===
      'en-US'
    ) {
      return item.en;
    }

    if (
      language ===
      'es-ES'
    ) {
      return item.es;
    }

    return item.pt;
  };


export default function SincronizacaoScreen() {

  const router =
    useRouter();

  const {
    theme,
    language,
    accentColor
  } =
    useSettingsStore();

  const {
    isSyncing,
    lastSync
  } =
    useSyncStore();

  const isDark =
    theme ===
    'dark';

  const bg =
    isDark
      ? '#020617'
      : '#F8FAFC';

  const surface =
    isDark
      ? '#0F172A'
      : '#FFFFFF';

  const surfaceAlt =
    isDark
      ? '#111827'
      : '#F1F5F9';

  const textPrimary =
    isDark
      ? '#F8FAFC'
      : '#0F172A';

  const textSecondary =
    isDark
      ? '#94A3B8'
      : '#64748B';

  const border =
    isDark
      ? '#1E293B'
      : '#E2E8F0';

  const accent =
    accentColor ||
    ACCENT_COLOR;

  const accentText =
    getReadableTextColor(
      accent
    );

  const [health, setHealth] =
    useState<DiamondSyncHealth | null>(
      null
    );

  const [conflicts, setConflicts] =
    useState<DiamondSyncConflictItem[]>(
      []
    );

  const [recentConflicts, setRecentConflicts] =
    useState<DiamondSyncConflictItem[]>(
      []
    );

  const [pendingOperations, setPendingOperations] =
    useState<DiamondPendingOperationItem[]>(
      []
    );

  const [loading, setLoading] =
    useState(
      true
    );

  const [refreshing, setRefreshing] =
    useState(
      false
    );

  const [syncingNow, setSyncingNow] =
    useState(
      false
    );

  const [selectedConflict, setSelectedConflict] =
    useState<DiamondSyncConflictItem | null>(
      null
    );


  const tr =
    useCallback(
      (
        pt: string,
        en: string,
        es: string
      ) => {

        if (
          language ===
          'en-US'
        ) {
          return en;
        }

        if (
          language ===
          'es-ES'
        ) {
          return es;
        }

        return pt;
      },
      [
        language
      ]
    );


  const loadDiagnostics =
    useCallback(
      async (
        silent =
          false
      ) => {

        if (
          !silent
        ) {
          setLoading(
            true
          );
        }

        try {

          const diagnostics =
            await getDiamondSyncDiagnostics();

          setHealth(
            diagnostics?.health ||
            null
          );

          setConflicts(
            Array.isArray(
              diagnostics
                ?.unresolvedConflicts
            )
              ? diagnostics
                  .unresolvedConflicts
              : []
          );

          setRecentConflicts(
            Array.isArray(
              diagnostics
                ?.recentConflicts
            )
              ? diagnostics
                  .recentConflicts
              : []
          );

          setPendingOperations(
            Array.isArray(
              diagnostics
                ?.pendingOperations
            )
              ? diagnostics
                  .pendingOperations
              : []
          );

        } catch (
          error
        ) {

          console.warn(
            '[SyncCenter] Falha ao carregar diagnóstico:',
            error
          );

        } finally {

          if (
            !silent
          ) {
            setLoading(
              false
            );
          }
        }
      },
      []
    );


  useFocusEffect(
    useCallback(
      () => {

        loadDiagnostics();

        return undefined;
      },
      [
        loadDiagnostics
      ]
    )
  );


  const onRefresh =
    useCallback(
      async () => {

        setRefreshing(
          true
        );

        try {

          await loadDiagnostics(
            true
          );

        } finally {

          setRefreshing(
            false
          );
        }
      },
      [
        loadDiagnostics
      ]
    );


  const handleSyncNow =
    useCallback(
      async () => {

        if (
          syncingNow ||
          isSyncing
        ) {
          return;
        }

        setSyncingNow(
          true
        );

        try {

          /*
           * globalSync é conservador:
           * falhas ficam preservadas no Outbox/Conflict Ledger.
           */
          const result =
            await globalSync();

          if (
            result &&
            result.ok === false
          ) {
            console.warn(
              '[SyncCenter] Sincronização não concluída:',
              result
            );
          }

          await loadDiagnostics(
            true
          );

        } finally {

          setSyncingNow(
            false
          );
        }
      },
      [
        syncingNow,
        isSyncing,
        loadDiagnostics
      ]
    );


  const unresolvedConflicts =
    Number(
      health
        ?.unresolvedConflicts ||
      0
    );

  const pending =
    Number(
      health
        ?.pending ||
      0
    );

  const retry =
    Number(
      health
        ?.retry ||
      0
    );

  const queueConflict =
    Number(
      health
        ?.conflict ||
      0
    );

  const collectionsPending =
    Number(
      health
        ?.collectionsPending ||
      0
    );

  const collectionsConflict =
    Number(
      health
        ?.collectionsConflict ||
      0
    );

  const visitsPending =
    Number(
      health
        ?.visitsPending ||
      0
    );

  const orphanVisitsPending =
    Number(
      health
        ?.orphanVisitsPending ||
      0
    );

  const orphanServerEvidence =
    Number(
      health
        ?.orphanServerEvidence ||
      0
    );

  const configurationPending =
    Number(
      health
        ?.configurationPending ||
      0
    );

  const manifestReason =
    String(
      health
        ?.manifestReason ||
      ''
    )
      .trim()
      .toUpperCase();

  const diagnosticsOk =
    health
      ?.diagnosticsOk ===
    true;

  const lastServerPullAt =
    health
      ?.lastServerPullAt ||
    null;

  const lastGlobalSyncStatus =
    String(
      health
        ?.lastGlobalSyncStatus ||
      ''
    )
      .trim()
      .toUpperCase();

  const lastGlobalSyncError =
    health
      ?.lastGlobalSyncError ||
    health
      ?.lastServerPullError ||
    health
      ?.diagnosticError ||
    null;


  const overallState =
    useMemo(
      () => {

        if (!health) {
          return {
            label:
              tr(
                'Verificando sincronização',
                'Checking synchronization',
                'Verificando sincronización'
              ),
            description:
              tr(
                'O estado ainda não foi confirmado neste dispositivo.',
                'The state has not yet been confirmed on this device.',
                'El estado aún no ha sido confirmado en este dispositivo.'
              ),
            color: '#64748B',
            Icon: Clock3
          };
        }

        if (
          !diagnosticsOk ||
          lastGlobalSyncStatus === 'FAILED'
        ) {
          return {
            label:
              tr(
                'Sincronização não confirmada',
                'Synchronization not confirmed',
                'Sincronización no confirmada'
              ),
            description:
              lastGlobalSyncError ||
              tr(
                'A última tentativa não pôde comprovar push, pull e estado local. Os dados não serão apresentados como totalmente sincronizados.',
                'The last attempt could not prove push, pull, and local state. Data will not be shown as fully synchronized.',
                'El último intento no pudo comprobar push, pull y estado local. Los datos no se mostrarán como totalmente sincronizados.'
              ),
            color: '#DC2626',
            Icon: AlertTriangle
          };
        }

        if (
          unresolvedConflicts > 0 ||
          queueConflict > 0 ||
          collectionsConflict > 0 ||
          orphanServerEvidence > 0
        ) {

          return {
            label:
              tr(
                'Dados protegidos',
                'Protected data',
                'Datos protegidos'
              ),

            description:
              tr(
                'Há um item técnico preservado. O app continua protegendo os dados; se persistir, o suporte pode analisar o diagnóstico.',
                'A technical item is preserved. The app keeps the data protected; if it persists, support can review the diagnostic.',
                'Hay un elemento técnico preservado. La app mantiene los datos protegidos; si persiste, soporte puede revisar el diagnóstico.'
              ),

            color:
              '#D97706',

            Icon:
              ShieldCheck
          };
        }

        /*
         * MOBILE_DIAMOND_SYNC_CENTER_MANIFEST_V2
         *
         * Central e Menu usam o MESMO DiamondSyncHealth.
         */
        if (
          configurationPending > 0
        ) {
          const reconciliationPending =
            manifestReason ===
            'LOCAL_TASK_RECONCILIATION_PENDING';

          return {
            label:
              reconciliationPending
                ? tr(
                    'Reconciliação offline pendente',
                    'Offline reconciliation pending',
                    'Conciliación offline pendiente'
                  )
                : tr(
                    'Configuração offline pendente',
                    'Offline configuration pending',
                    'Configuración offline pendiente'
                  ),

            description:
              reconciliationPending
                ? tr(
                    'Existe trabalho de campo protegido neste aparelho aguardando confirmação inequívoca do servidor.',
                    'Protected field work on this device is awaiting unequivocal server confirmation.',
                    'Hay trabajo de campo protegido en este dispositivo esperando confirmación inequívoca del servidor.'
                  )
                : tr(
                    'O manifesto e a carteira offline ainda não foram confirmados como o mesmo snapshot. Sincronize com internet antes de operar offline.',
                    'The offline manifest and portfolio are not yet confirmed as the same snapshot. Sync while online before working offline.',
                    'El manifiesto y la cartera offline aún no fueron confirmados como el mismo snapshot. Sincroniza con internet antes de trabajar offline.'
                  ),

            color: '#D97706',
            Icon: ShieldCheck
          };
        }

        if (
          pending > 0 ||
          retry > 0 ||
          collectionsPending > 0 ||
          visitsPending > 0 ||
          orphanVisitsPending > 0 ||
          lastGlobalSyncStatus === 'PARTIAL'
        ) {

          return {
            label:
              tr(
                'Sincronização pendente',
                'Synchronization pending',
                'Sincronización pendiente'
              ),

            description:
              tr(
                'Os dados estão protegidos localmente e serão enviados automaticamente.',
                'Data is protected locally and will be sent automatically.',
                'Los datos están protegidos localmente y se enviarán automáticamente.'
              ),

            color:
              '#D97706',

            Icon:
              Clock3
          };
        }

        if (!lastServerPullAt) {
          return {
            label:
              tr(
                'Sincronização ainda não confirmada',
                'Synchronization not yet confirmed',
                'Sincronización aún no confirmada'
              ),
            description:
              tr(
                'Ainda não existe um pull completo confirmado do servidor neste dispositivo.',
                'There is not yet a confirmed complete server pull on this device.',
                'Todavía no existe un pull completo confirmado del servidor en este dispositivo.'
              ),
            color: '#64748B',
            Icon: Clock3
          };
        }

        return {
          label:
            tr(
              'Tudo sincronizado',
              'Everything synchronized',
              'Todo sincronizado'
            ),

          description:
            tr(
              'Não existem pendências ou conflitos conhecidos neste dispositivo.',
              'There are no known pending operations or conflicts on this device.',
              'No hay operaciones pendientes ni conflictos conocidos en este dispositivo.'
            ),

          color:
            '#059669',

          Icon:
            CheckCircle2
        };
      },
      [
        health,
        diagnosticsOk,
        lastGlobalSyncStatus,
        lastGlobalSyncError,
        lastServerPullAt,
        unresolvedConflicts,
        queueConflict,
        collectionsConflict,
        orphanServerEvidence,
        configurationPending,
        manifestReason,
        pending,
        retry,
        collectionsPending,
        visitsPending,
        orphanVisitsPending,
        tr
      ]
    );


  const OverallIcon =
    overallState.Icon;

  const pendingKindLabel = useCallback(
    (item: DiamondPendingOperationItem) => {
      if (item.kind === 'COLLECTION') {
        return tr('Coleta', 'Collection', 'Coleta');
      }
      if (item.kind === 'VISIT_CHECKIN') {
        return tr('Check-in', 'Check-in', 'Check-in');
      }
      if (item.kind === 'VISIT_CHECKOUT') {
        return tr('Check-out', 'Check-out', 'Check-out');
      }
      if (item.kind === 'VISIT_JUSTIFICATION') {
        return tr('Justificativa', 'Justification', 'Justificación');
      }
      if (item.kind === 'ALERT') {
        return tr('Alerta', 'Alert', 'Alerta');
      }
      return tr('Operação', 'Operation', 'Operación');
    },
    [tr]
  );

  const pendingStatusLabel = useCallback(
    (status: string) => {
      const normalized = String(status || '').toUpperCase();
      if (normalized === 'RETRY') return tr('Aguardando nova tentativa', 'Waiting for retry', 'Esperando reintento');
      if (normalized === 'CONFLICT') return tr('Conflito preservado', 'Preserved conflict', 'Conflicto preservado');
      return tr('Aguardando envio', 'Waiting to send', 'Esperando envío');
    },
    [tr]
  );


  const StatCard =
    ({
      label,
      value,
      Icon,
      danger =
        false
    }: any) => (

      <View
        style={[
          styles.statCard,
          {
            backgroundColor:
              surface,

            borderColor:
              danger
                ? '#DC262655'
                : border
          }
        ]}
      >

        <View
          style={[
            styles.statIcon,
            {
              backgroundColor:
                danger
                  ? '#DC26261A'
                  : `${accent}18`
            }
          ]}
        >

          <Icon
            size={18}
            color={
              danger
                ? '#DC2626'
                : accent
            }
          />

        </View>

        <Text
          style={[
            styles.statValue,
            {
              color:
                danger
                  ? '#DC2626'
                  : textPrimary
            }
          ]}
        >
          {value}
        </Text>

        <Text
          style={[
            styles.statLabel,
            {
              color:
                textSecondary
            }
          ]}
        >
          {label}
        </Text>

      </View>
    );


  return (

    <View
      style={[
        styles.container,
        {
          backgroundColor:
            bg
        }
      ]}
    >

      <View
        style={[
          styles.header,
          {
            borderBottomColor:
              border,

            backgroundColor:
              bg
          }
        ]}
      >

        <TouchableOpacity
          style={[
            styles.backButton,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
          onPress={
            () =>
              router.back()
          }
        >
          <ArrowLeft
            size={20}
            color={textPrimary}
          />
        </TouchableOpacity>

        <View
          style={{
            flex:
              1
          }}
        >

          <Text
            style={[
              styles.headerTitle,
              {
                color:
                  textPrimary
              }
            ]}
          >
            {tr(
              'Sincronização',
              'Synchronization',
              'Sincronización'
            )}
          </Text>

          <Text
            style={[
              styles.headerSubtitle,
              {
                color:
                  textSecondary
              }
            ]}
          >
            {tr(
              'Central de integridade dos dados offline',
              'Offline data integrity center',
              'Centro de integridad de datos offline'
            )}
          </Text>

        </View>

        <TouchableOpacity
          style={[
            styles.refreshIconButton,
            {
              backgroundColor:
                surface,

              borderColor:
                border
            }
          ]}
          onPress={
            onRefresh
          }
        >
          <RefreshCw
            size={19}
            color={accent}
          />
        </TouchableOpacity>

      </View>


      <ScrollView
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
        refreshControl={
          <RefreshControl
            refreshing={
              refreshing
            }
            onRefresh={
              onRefresh
            }
            tintColor={
              accent
            }
          />
        }
      >

        {loading ? (

          <View
            style={
              styles.loading
            }
          >
            <ActivityIndicator
              color={accent}
            />

            <Text
              style={[
                styles.loadingText,
                {
                  color:
                    textSecondary
                }
              ]}
            >
              {tr(
                'Verificando integridade local...',
                'Checking local integrity...',
                'Verificando integridad local...'
              )}
            </Text>
          </View>

        ) : (
          <>

            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor:
                    surface,

                  borderColor:
                    `${overallState.color}55`
                }
              ]}
            >

              <View
                style={[
                  styles.heroIcon,
                  {
                    backgroundColor:
                      `${overallState.color}18`
                  }
                ]}
              >
                <OverallIcon
                  size={26}
                  color={
                    overallState.color
                  }
                />
              </View>

              <View
                style={{
                  flex:
                    1
                }}
              >

                <Text
                  style={[
                    styles.heroTitle,
                    {
                      color:
                        overallState.color
                    }
                  ]}
                >
                  {
                    overallState.label
                  }
                </Text>

                <Text
                  style={[
                    styles.heroDescription,
                    {
                      color:
                        textSecondary
                    }
                  ]}
                >
                  {
                    overallState.description
                  }
                </Text>

              </View>

            </View>


            <View
              style={
                styles.lastSyncRow
              }
            >

              <Clock3
                size={15}
                color={textSecondary}
              />

              <Text
                style={[
                  styles.lastSyncText,
                  {
                    color:
                      textSecondary
                  }
                ]}
              >
                {tr(
                  'Última sincronização',
                  'Last synchronization',
                  'Última sincronización'
                )}: {' '}
                {
                  formatDateTime(
                    lastSync,
                    language
                  )
                }
              </Text>

            </View>


            <View
              style={
                styles.statsGrid
              }
            >

              <StatCard
                label={
                  tr(
                    'Pendentes',
                    'Pending',
                    'Pendientes'
                  )
                }
                value={pending}
                Icon={Database}
              />

              <StatCard
                label={
                  tr(
                    'Retries',
                    'Retries',
                    'Reintentos'
                  )
                }
                value={retry}
                Icon={RotateCcw}
              />

              <StatCard
                label={
                  tr(
                    'Visitas pendentes',
                    'Pending visits',
                    'Visitas pendientes'
                  )
                }
                value={visitsPending}
                Icon={Clock3}
              />

              <StatCard
                label={
                  tr(
                    'Coletas pendentes',
                    'Pending collections',
                    'Coletas pendientes'
                  )
                }
                value={
                  collectionsPending
                }
                Icon={Wifi}
              />

            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: textPrimary }]}>
                  {tr('O que está pendente', 'What is pending', 'Qué está pendiente')}
                </Text>
                <Text style={[styles.sectionSubtitle, { color: textSecondary }]}>
                  {tr(
                    'Fila local preservada neste aparelho',
                    'Local queue preserved on this device',
                    'Cola local preservada en este dispositivo'
                  )}
                </Text>
              </View>

              {pendingOperations.length > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: `${accent}18` }]}>
                  <Text style={[styles.countBadgeText, { color: accent }]}>
                    {pendingOperations.length}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.pendingListCard,
                { backgroundColor: surface, borderColor: border }
              ]}
            >
              {pendingOperations.length === 0 ? (
                <Text style={[styles.pendingEmpty, { color: textSecondary }]}>
                  {tr(
                    'Nenhuma operação aguardando envio.',
                    'No operations waiting to be sent.',
                    'No hay operaciones esperando envío.'
                  )}
                </Text>
              ) : (
                pendingOperations.slice(0, 20).map((item, index) => {
                  const title =
                    item.surveyName ||
                    item.storeName ||
                    pendingKindLabel(item);

                  const context = [
                    pendingKindLabel(item),
                    item.storeName && item.storeName !== title ? item.storeName : null,
                    pendingStatusLabel(item.status),
                    item.attempts > 0
                      ? tr(
                          `${item.attempts} tentativa(s)`,
                          `${item.attempts} attempt(s)`,
                          `${item.attempts} intento(s)`
                        )
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <View
                      key={`pending-${item.queueId}`}
                      style={[
                        styles.pendingRow,
                        index > 0 && { borderTopColor: border, borderTopWidth: StyleSheet.hairlineWidth }
                      ]}
                    >
                      <View style={[styles.pendingIcon, { backgroundColor: `${accent}14` }]}>
                        <Database size={17} color={accent} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pendingTitle, { color: textPrimary }]} numberOfLines={2}>
                          {title}
                        </Text>
                        <Text style={[styles.pendingMeta, { color: textSecondary }]} numberOfLines={2}>
                          {context}
                        </Text>
                        {String(item.status || '').toUpperCase() === 'RETRY' ? (
                          <Text style={[styles.pendingError, { color: '#D97706' }]} numberOfLines={2}>
                            {tr(
                              'Não foi possível enviar ainda. O app tentará novamente automaticamente.',
                              'It could not be sent yet. The app will try again automatically.',
                              'Aún no se pudo enviar. La app volverá a intentarlo automáticamente.'
                            )}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>


            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor:
                    surface,

                  borderColor:
                    border
                }
              ]}
            >

              <View
                style={
                  styles.infoHeader
                }
              >

                <ShieldCheck
                  size={21}
                  color={accent}
                />

                <Text
                  style={[
                    styles.infoTitle,
                    {
                      color:
                        textPrimary
                    }
                  ]}
                >
                  {tr(
                    'Proteção offline',
                    'Offline protection',
                    'Protección offline'
                  )}
                </Text>

              </View>

              <Text
                style={[
                  styles.infoText,
                  {
                    color:
                      textSecondary
                  }
                ]}
              >
                {tr(
                  'Operações realizadas sem conexão permanecem registradas no dispositivo até que o servidor confirme o resultado. Conflitos não são descartados automaticamente.',
                  'Operations performed without connectivity remain stored on the device until the server confirms the result. Conflicts are never silently discarded.',
                  'Las operaciones realizadas sin conexión permanecen registradas en el dispositivo hasta que el servidor confirme el resultado. Los conflictos nunca se descartan silenciosamente.'
                )}
              </Text>

            </View>


            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  backgroundColor:
                    accent
                }
              ]}
              activeOpacity={0.85}
              disabled={
                syncingNow ||
                isSyncing
              }
              onPress={
                handleSyncNow
              }
            >

              {
                syncingNow ||
                isSyncing
                  ? (
                    <ActivityIndicator
                      size="small"
                      color={
                        accentText
                      }
                    />
                  )
                  : (
                    <RefreshCw
                      size={19}
                      color={
                        accentText
                      }
                    />
                  )
              }

              <Text
                style={[
                  styles.primaryButtonText,
                  {
                    color:
                      accentText
                  }
                ]}
              >
                {
                  syncingNow ||
                  isSyncing
                    ? tr(
                        'Sincronizando...',
                        'Synchronizing...',
                        'Sincronizando...'
                      )
                    : tr(
                        'Sincronizar agora',
                        'Synchronize now',
                        'Sincronizar ahora'
                      )
                }
              </Text>

            </TouchableOpacity>


            {/* MOBILE_USER_SYNC_CENTER_ACTIONABLE_ONLY_V1 */}
            {unresolvedConflicts > 0 ? (
              <TouchableOpacity
                style={[
                  styles.supportButton,
                  {
                    borderColor: '#D9770644',
                    backgroundColor: surfaceAlt,
                  }
                ]}
                onPress={() => router.push('/suporte' as any)}
                activeOpacity={0.85}
              >
                <ShieldCheck size={20} color="#D97706" />

                <View style={{ flex: 1 }}>
                  <Text style={[styles.supportTitle, { color: textPrimary }]}>
                    {tr(
                      'Item técnico protegido',
                      'Protected technical item',
                      'Elemento técnico protegido'
                    )}
                  </Text>
                  <Text style={[styles.supportText, { color: textSecondary }]}>
                    {tr(
                      'Não há uma ação segura necessária aqui. O histórico técnico fica em Suporte e Diagnóstico para análise se esta atenção persistir.',
                      'No safe action is required here. Technical history is kept in Support & Diagnostics for review if this attention persists.',
                      'No se requiere una acción segura aquí. El historial técnico queda en Soporte y Diagnóstico para revisión si esta atención persiste.'
                    )}
                  </Text>
                </View>

                <ChevronRight size={18} color={textSecondary} />
              </TouchableOpacity>
            ) : null}


            <View
              style={{
                height:
                  40
              }}
            />

          </>
        )}

      </ScrollView>


      <Modal
        visible={
          Boolean(
            selectedConflict
          )
        }
        transparent
        animationType="fade"
        onRequestClose={
          () =>
            setSelectedConflict(
              null
            )
        }
      >

        <View
          style={
            styles.modalBackdrop
          }
        >

          <View
            style={[
              styles.modalCard,
              {
                backgroundColor:
                  surface,

                borderColor:
                  border
              }
            ]}
          >

            <View
              style={
                styles.modalHeader
              }
            >

              <View
                style={{
                  flex:
                    1
                }}
              >

                <Text
                  style={[
                    styles.modalTitle,
                    {
                      color:
                        textPrimary
                    }
                  ]}
                >
                  {tr(
                    'Detalhes do conflito',
                    'Conflict details',
                    'Detalles del conflicto'
                  )}
                </Text>

              </View>

              <TouchableOpacity
                style={[
                  styles.modalClose,
                  {
                    backgroundColor:
                      surfaceAlt
                  }
                ]}
                onPress={
                  () =>
                    setSelectedConflict(
                      null
                    )
                }
              >
                <X
                  size={18}
                  color={textPrimary}
                />
              </TouchableOpacity>

            </View>


            <ScrollView
              style={{
                maxHeight:
                  480
              }}
              showsVerticalScrollIndicator={
                false
              }
            >

              <DetailRow
                label={
                  tr(
                    'Situação',
                    'Status',
                    'Estado'
                  )
                }
                value={
                  selectedConflict?.resolvedAt
                    ? tr(
                        'Resolvido',
                        'Resolved',
                        'Resuelto'
                      )
                    : tr(
                        'Pendente',
                        'Pending',
                        'Pendiente'
                      )
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              <DetailRow
                label="Código"
                value={
                  selectedConflict
                    ?.conflictCode ||
                  '—'
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              <DetailRow
                label="Endpoint"
                value={
                  selectedConflict
                    ?.endpoint ||
                  '—'
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              <DetailRow
                label={
                  tr(
                    'Método',
                    'Method',
                    'Método'
                  )
                }
                value={
                  selectedConflict
                    ?.method ||
                  '—'
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              <DetailRow
                label={
                  tr(
                    'Tentativas',
                    'Attempts',
                    'Intentos'
                  )
                }
                value={
                  String(
                    selectedConflict
                      ?.queueAttempts ||
                    0
                  )
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              <DetailRow
                label={
                  tr(
                    'Criado em',
                    'Created at',
                    'Creado el'
                  )
                }
                value={
                  formatDateTime(
                    selectedConflict
                      ?.createdAt,
                    language
                  )
                }
                textPrimary={
                  textPrimary
                }
                textSecondary={
                  textSecondary
                }
              />

              {
                selectedConflict
                  ?.resolution
                  ? (
                    <DetailRow
                      label={
                        tr(
                          'Resolução',
                          'Resolution',
                          'Resolución'
                        )
                      }
                      value={
                        selectedConflict
                          .resolution
                      }
                      textPrimary={
                        textPrimary
                      }
                      textSecondary={
                        textSecondary
                      }
                    />
                  )
                  : null
              }

              {
                selectedConflict
                  ?.lastError
                  ? (
                    <DetailRow
                      label={
                        tr(
                          'Último erro',
                          'Last error',
                          'Último error'
                        )
                      }
                      value={
                        selectedConflict
                          .lastError
                      }
                      textPrimary={
                        textPrimary
                      }
                      textSecondary={
                        textSecondary
                      }
                    />
                  )
                  : null
              }

              <View
                style={[
                  styles.modalSafety,
                  {
                    backgroundColor:
                      '#05966912',

                    borderColor:
                      '#05966933'
                  }
                ]}
              >

                <ShieldCheck
                  size={18}
                  color="#059669"
                />

                <Text
                  style={[
                    styles.modalSafetyText,
                    {
                      color:
                        textSecondary
                    }
                  ]}
                >
                  {tr(
                    'A operação original continua preservada. Esta tela não força reenvio nem apaga evidências.',
                    'The original operation remains preserved. This screen does not force replay or delete evidence.',
                    'La operación original permanece preservada. Esta pantalla no fuerza reenvíos ni elimina evidencias.'
                  )}
                </Text>

              </View>

            </ScrollView>

          </View>

        </View>

      </Modal>

    </View>
  );
}


const DetailRow =
  ({
    label,
    value,
    textPrimary,
    textSecondary
  }: any) => (

    <View
      style={
        styles.detailRow
      }
    >

      <Text
        style={[
          styles.detailLabel,
          {
            color:
              textSecondary
          }
        ]}
      >
        {label}
      </Text>

      <Text
        style={[
          styles.detailValue,
          {
            color:
              textPrimary
          }
        ]}
        selectable
      >
        {value}
      </Text>

    </View>
  );


const styles =
  StyleSheet.create({

    container: {
      flex:
        1
    },

    header: {
      paddingTop:
        56,

      paddingHorizontal:
        20,

      paddingBottom:
        16,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        12,

      borderBottomWidth:
        1
    },

    backButton: {
      width:
        42,

      height:
        42,

      borderRadius:
        15,

      borderWidth:
        1,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    refreshIconButton: {
      width:
        42,

      height:
        42,

      borderRadius:
        15,

      borderWidth:
        1,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    headerTitle: {
      fontSize:
        21,

      fontWeight:
        '900'
    },

    headerSubtitle: {
      fontSize:
        11,

      fontWeight:
        '600',

      marginTop:
        2
    },

    content: {
      padding:
        20
    },

    loading: {
      minHeight:
        300,

      justifyContent:
        'center',

      alignItems:
        'center',

      gap:
        14
    },

    loadingText: {
      fontSize:
        13,

      fontWeight:
        '600'
    },

    heroCard: {
      borderRadius:
        22,

      borderWidth:
        1,

      padding:
        18,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        14
    },

    heroIcon: {
      width:
        52,

      height:
        52,

      borderRadius:
        18,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    heroTitle: {
      fontSize:
        17,

      fontWeight:
        '900'
    },

    heroDescription: {
      fontSize:
        12,

      lineHeight:
        17,

      marginTop:
        4,

      fontWeight:
        '500'
    },

    lastSyncRow: {
      marginTop:
        12,

      marginBottom:
        18,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      gap:
        7
    },

    lastSyncText: {
      fontSize:
        11,

      fontWeight:
        '600'
    },

    statsGrid: {
      flexDirection:
        'row',

      flexWrap:
        'wrap',

      justifyContent:
        'space-between',

      gap:
        10
    },

    statCard: {
      width:
        '48.5%',

      borderRadius:
        18,

      borderWidth:
        1,

      padding:
        14
    },

    statIcon: {
      width:
        34,

      height:
        34,

      borderRadius:
        12,

      alignItems:
        'center',

      justifyContent:
        'center',

      marginBottom:
        12
    },

    statValue: {
      fontSize:
        24,

      fontWeight:
        '900'
    },

    statLabel: {
      marginTop:
        3,

      fontSize:
        11,

      fontWeight:
        '700'
    },

    infoCard: {
      marginTop:
        18,

      borderRadius:
        20,

      borderWidth:
        1,

      padding:
        16
    },

    infoHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        9
    },

    infoTitle: {
      fontSize:
        14,

      fontWeight:
        '900'
    },

    infoText: {
      marginTop:
        10,

      fontSize:
        12,

      lineHeight:
        18,

      fontWeight:
        '500'
    },

    primaryButton: {
      height:
        54,

      borderRadius:
        18,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'center',

      gap:
        9,

      marginTop:
        16
    },

    primaryButtonText: {
      fontSize:
        14,

      fontWeight:
        '900'
    },

    sectionHeader: {
      marginTop:
        28,

      marginBottom:
        12,

      flexDirection:
        'row',

      alignItems:
        'center',

      justifyContent:
        'space-between'
    },

    sectionTitle: {
      fontSize:
        15,

      fontWeight:
        '900'
    },

    sectionSubtitle: {
      fontSize:
        11,

      fontWeight:
        '600',

      marginTop:
        3
    },

    dangerBadge: {
      minWidth:
        30,

      height:
        30,

      paddingHorizontal:
        8,

      borderRadius:
        15,

      backgroundColor:
        '#DC2626',

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    dangerBadgeText: {
      color:
        '#FFFFFF',

      fontWeight:
        '900',

      fontSize:
        12
    },

    emptyCard: {
      borderWidth:
        1,

      borderRadius:
        20,

      padding:
        22,

      alignItems:
        'center'
    },

    emptyTitle: {
      marginTop:
        10,

      fontSize:
        14,

      fontWeight:
        '900'
    },

    emptyText: {
      marginTop:
        5,

      textAlign:
        'center',

      fontSize:
        11,

      lineHeight:
        16
    },

    conflictCard: {
      borderWidth:
        1,

      borderRadius:
        18,

      padding:
        14,

      marginBottom:
        9,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        12
    },

    conflictIcon: {
      width:
        38,

      height:
        38,

      borderRadius:
        13,

      backgroundColor:
        '#DC262618',

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    conflictTitle: {
      fontSize:
        12,

      lineHeight:
        16,

      fontWeight:
        '800'
    },

    conflictMeta: {
      marginTop:
        3,

      fontSize:
        10,

      fontWeight:
        '600'
    },

    noHistoryText: {
      fontSize:
        12,

      lineHeight:
        17
    },

    historyRow: {
      minHeight:
        58,

      paddingVertical:
        11,

      flexDirection:
        'row',

      alignItems:
        'center',

      borderBottomWidth:
        1
    },

    historyTitle: {
      fontSize:
        12,

      fontWeight:
        '800'
    },

    historyMeta: {
      marginTop:
        3,

      fontSize:
        10
    },

    statusPill: {
      paddingHorizontal:
        9,

      paddingVertical:
        5,

      borderRadius:
        999
    },

    statusPillText: {
      fontSize:
        10,

      fontWeight:
        '900'
    },

    supportButton: {
      marginTop:
        20,

      borderWidth:
        1,

      borderRadius:
        18,

      padding:
        15,

      flexDirection:
        'row',

      alignItems:
        'center',

      gap:
        12
    },

    supportTitle: {
      fontSize:
        12,

      fontWeight:
        '900'
    },

    supportText: {
      marginTop:
        3,

      fontSize:
        10,

      lineHeight:
        14
    },

    modalBackdrop: {
      flex:
        1,

      backgroundColor:
        'rgba(2, 6, 23, 0.72)',

      justifyContent:
        'center',

      padding:
        20
    },

    modalCard: {
      maxHeight:
        '82%',

      borderRadius:
        24,

      borderWidth:
        1,

      padding:
        18
    },

    modalHeader: {
      flexDirection:
        'row',

      alignItems:
        'center',

      marginBottom:
        12
    },

    modalTitle: {
      fontSize:
        16,

      fontWeight:
        '900'
    },

    modalClose: {
      width:
        36,

      height:
        36,

      borderRadius:
        12,

      alignItems:
        'center',

      justifyContent:
        'center'
    },

    detailRow: {
      paddingVertical:
        10
    },

    detailLabel: {
      fontSize:
        10,

      textTransform:
        'uppercase',

      letterSpacing:
        0.5,

      fontWeight:
        '800'
    },

    detailValue: {
      marginTop:
        4,

      fontSize:
        12,

      lineHeight:
        18,

      fontWeight:
        '600'
    },

    modalSafety: {
      marginTop:
        12,

      padding:
        14,

      borderRadius:
        16,

      borderWidth:
        1,

      flexDirection:
        'row',

      gap:
        10,

      alignItems:
        'flex-start'
    },

    modalSafetyText: {
      flex:
        1,

      fontSize:
        11,

      lineHeight:
        16
    },

    pendingListCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  pendingRow: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  pendingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  pendingMeta: {
    marginTop: 3,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 15,
  },
  pendingError: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '700',
    color: '#DC2626',
    lineHeight: 13,
  },
  pendingEmpty: {
    padding: 18,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
});
