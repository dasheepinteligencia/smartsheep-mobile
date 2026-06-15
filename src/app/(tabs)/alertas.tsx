import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Modal,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Mail,
  MailOpen,
  CheckCircle2,
  Info,
  Megaphone,
  AlertCircle,
  Filter,
  X,
  RefreshCw,
  ShieldCheck,
  Clock,
  Inbox,
  Trash2,
  ArrowLeft,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { globalSync, addToSyncQueue } from '../../services/syncService';
import { getDBConnection } from '../../database/db';
import { t } from '../../utils/i18n';

type FilterType = 'all' | 'unread' | 'pending';

type AlertItem = {
  id: string;
  titulo: string;
  conteudo: string;
  remetente_nome?: string;
  data_envio?: string;
  prioridade?: 'INFO' | 'ALTA' | 'URGENTE' | string;
  lida?: boolean;
  lida_em?: string | null;
  exige_aceite?: boolean;
  aceita_em?: string | null;
  raw_json?: string;
};

const ACCENT_COLOR = '#FF7A00';

const ALERT_TEXTS = {
  'pt-BR': {
    defaultTitle: 'Comunicado',
    defaultSender: 'Gestão',
    today: 'Hoje',
    priorityUrgent: 'Urgente',
    priorityAttention: 'Atenção',
    priorityInfo: 'Informativo',
    all: 'Todos',
    unread: 'Não lidos',
    pending: 'Pendentes',
    pendingConfirmation: 'Confirmação pendente',
    awareAt: 'Ciente em',
    readMessage: 'Mensagem lida',
    newMessage: 'Nova mensagem',
    open: 'Abrir',
    title: 'Alertas',
    pendingSubtitle: '{{count}} aguardando confirmação',
    unreadSubtitle: '{{count}} comunicação nova',
    allReadSubtitle: 'Tudo lido por aqui',
    inbox: 'Caixa de entrada',
    loading: 'Carregando alertas...',
    emptyTitle: 'Nenhum alerta',
    emptyText: 'Não encontramos comunicações para este filtro.',
    officialCommunication: 'Comunicação oficial',
    acknowledgeDoneAt: 'Ciência confirmada em {{date}}',
    requiresAck: 'Este alerta exige confirmação de leitura.',
    acknowledgeButton: 'Confirmar leitura',
    close: 'Fechar',
    deleteTitle: 'Apagar mensagem?',
    deleteText:
      'A mensagem será removida da sua caixa de entrada e a gestão será informada sobre a exclusão. Mensagens com aceite obrigatório só podem ser apagadas depois de confirmar leitura.',
    cancel: 'Cancelar',
    delete: 'Apagar',
  },
  'en-US': {
    defaultTitle: 'Announcement',
    defaultSender: 'Management',
    today: 'Today',
    priorityUrgent: 'Urgent',
    priorityAttention: 'Attention',
    priorityInfo: 'Informational',
    all: 'All',
    unread: 'Unread',
    pending: 'Pending',
    pendingConfirmation: 'Pending confirmation',
    awareAt: 'Acknowledged at',
    readMessage: 'Message read',
    newMessage: 'New message',
    open: 'Open',
    title: 'Alerts',
    pendingSubtitle: '{{count}} awaiting confirmation',
    unreadSubtitle: '{{count}} new communication',
    allReadSubtitle: 'Everything is read here',
    inbox: 'Inbox',
    loading: 'Loading alerts...',
    emptyTitle: 'No alerts',
    emptyText: 'No communications found for this filter.',
    officialCommunication: 'Official communication',
    acknowledgeDoneAt: 'Acknowledged at {{date}}',
    requiresAck: 'This alert requires reading confirmation.',
    acknowledgeButton: 'Confirm reading',
    close: 'Close',
    deleteTitle: 'Delete message?',
    deleteText:
      'The message will be removed from your inbox and management will be informed about the deletion. Messages with mandatory acknowledgment can only be deleted after confirming reading.',
    cancel: 'Cancel',
    delete: 'Delete',
  },
  'es-ES': {
    defaultTitle: 'Comunicado',
    defaultSender: 'Gestión',
    today: 'Hoy',
    priorityUrgent: 'Urgente',
    priorityAttention: 'Atención',
    priorityInfo: 'Informativo',
    all: 'Todos',
    unread: 'No leídos',
    pending: 'Pendientes',
    pendingConfirmation: 'Confirmación pendiente',
    awareAt: 'Confirmado en',
    readMessage: 'Mensaje leído',
    newMessage: 'Nuevo mensaje',
    open: 'Abrir',
    title: 'Alertas',
    pendingSubtitle: '{{count}} esperando confirmación',
    unreadSubtitle: '{{count}} comunicación nueva',
    allReadSubtitle: 'Todo leído por aquí',
    inbox: 'Bandeja de entrada',
    loading: 'Cargando alertas...',
    emptyTitle: 'Ninguna alerta',
    emptyText: 'No encontramos comunicaciones para este filtro.',
    officialCommunication: 'Comunicación oficial',
    acknowledgeDoneAt: 'Confirmación realizada en {{date}}',
    requiresAck: 'Esta alerta requiere confirmación de lectura.',
    acknowledgeButton: 'Confirmar lectura',
    close: 'Cerrar',
    deleteTitle: '¿Borrar mensaje?',
    deleteText:
      'El mensaje será eliminado de tu bandeja de entrada y la gestión será informada sobre la exclusión. Los mensajes con aceptación obligatoria solo pueden borrarse después de confirmar la lectura.',
    cancel: 'Cancelar',
    delete: 'Borrar',
  },
} as const;

type AlertTextKey = keyof typeof ALERT_TEXTS['pt-BR'];

const alertText = (key: AlertTextKey, language: string, params?: Record<string, string | number>) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  let value = ALERT_TEXTS[lang][key];

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(`{{${paramKey}}}`, String(paramValue));
    });
  }

  return value;
};


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

const getAlertLocale = (language: string) => {
  if (language === 'en-US') return 'en-US';
  if (language === 'es-ES') return 'es-ES';
  return 'pt-BR';
};

const safeParseJson = (value: any, fallback: any = {}) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
};

const getMainProjectId = (user: any) => {
  return (
    user?.allowed_project_ids?.[0] ||
    user?.projectId ||
    user?.projeto_id ||
    user?.project_id ||
    null
  );
};

const normalizeBoolean = (value: any) => {
  if (value === true || value === 1) return true;

  const s = String(value || '').toLowerCase();

  return s === 'true' || s === '1' || s === 'yes' || s === 'sim';
};

const normalizeAlert = (item: any, language = 'pt-BR'): AlertItem => {
  const raw = safeParseJson(item?.raw_json, item || {});

  const id = String(item?.id || raw?.id || raw?.messageId || raw?.alertaId || '');

  return {
    id,
    titulo: String(item?.titulo || raw?.titulo || raw?.title || alertText('defaultTitle', language)),
    conteudo: String(item?.conteudo || raw?.conteudo || raw?.content || raw?.mensagem || ''),
    remetente_nome: String(
      item?.remetente_nome ||
        raw?.remetente_nome ||
        raw?.remetente?.nome ||
        raw?.autor?.nome ||
        raw?.senderName ||
        alertText('defaultSender', language)
    ),
    data_envio: String(
      item?.data_envio ||
        raw?.data_envio ||
        raw?.dataEnvio ||
        raw?.created_at ||
        raw?.criado_em ||
        raw?.data_publicacao ||
        new Date().toISOString()
    ),
    prioridade: String(item?.prioridade || raw?.prioridade || raw?.priority || 'INFO').toUpperCase(),
    lida: normalizeBoolean(item?.lida ?? raw?.lida ?? raw?.read),
    lida_em: item?.lida_em || raw?.lida_em || raw?.read_at || null,
    exige_aceite: normalizeBoolean(
      item?.exige_aceite ?? raw?.exige_aceite ?? raw?.exigeAceite ?? raw?.requiresAck
    ),
    aceita_em: item?.aceita_em || raw?.aceita_em || raw?.accepted_at || raw?.ack_at || null,
    raw_json: item?.raw_json || JSON.stringify(raw || item || {}),
  };
};

const stripHtml = (value: string) => {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const formatDate = (dateString?: string | null, language = 'pt-BR') => {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) return '';

    const today = new Date();
    const sameDay =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    if (sameDay) {
      return `${alertText('today', language)}, ${date.toLocaleTimeString(getAlertLocale(language), {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    return date.toLocaleDateString(getAlertLocale(language), {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return '';
  }
};

const getPriorityConfig = (priority: string, isDark: boolean, language = 'pt-BR') => {
  const p = String(priority || 'INFO').toUpperCase();

  if (p === 'URGENTE' || p === 'CRITICA' || p === 'CRÍTICA') {
    return {
      label: alertText('priorityUrgent', language),
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.10)',
      Icon: AlertCircle,
    };
  }

  if (p === 'ALTA' || p === 'ATENCAO' || p === 'ATENÇÃO') {
    return {
      label: alertText('priorityAttention', language),
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.10)',
      Icon: AlertCircle,
    };
  }

  return {
    label: alertText('priorityInfo', language),
    color: '#3B82F6',
    bg: isDark ? 'rgba(59, 130, 246, 0.18)' : 'rgba(59, 130, 246, 0.10)',
    Icon: Info,
  };
};

const ensureAlertsTable = async (db: any) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      titulo TEXT,
      conteudo TEXT,
      remetente_nome TEXT,
      data_envio TEXT,
      prioridade TEXT,
      lida INTEGER DEFAULT 0,
      lida_em TEXT,
      exige_aceite INTEGER DEFAULT 0,
      aceita_em TEXT,
      raw_json TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_lida ON alerts(lida);
    CREATE INDEX IF NOT EXISTS idx_alerts_aceita_em ON alerts(aceita_em);
    CREATE INDEX IF NOT EXISTS idx_alerts_data_envio ON alerts(data_envio);
  `);
};

const readAlertsFromDB = async (language = 'pt-BR'): Promise<AlertItem[]> => {
  const db = await getDBConnection();
  await ensureAlertsTable(db);

  const rows = await db.getAllAsync(`
    SELECT * FROM alerts
    ORDER BY 
      CASE WHEN lida = 0 THEN 0 ELSE 1 END,
      datetime(data_envio) DESC
  `);

  return (rows || []).map((row: any) => normalizeAlert(row, language)).filter((item: AlertItem) => !!item.id);
};

const markAlertReadLocal = async (id: string) => {
  const db = await getDBConnection();
  await ensureAlertsTable(db);

  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE alerts SET lida = 1, lida_em = COALESCE(lida_em, ?), updated_at = ? WHERE id = ?`,
    [now, now, id]
  );

  return now;
};

const acknowledgeAlertLocal = async (id: string) => {
  const db = await getDBConnection();
  await ensureAlertsTable(db);

  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE alerts SET lida = 1, lida_em = COALESCE(lida_em, ?), aceita_em = COALESCE(aceita_em, ?), updated_at = ? WHERE id = ?`,
    [now, now, now, id]
  );

  return now;
};

const deleteAlertLocal = async (id: string) => {
  const db = await getDBConnection();
  await ensureAlertsTable(db);

  await db.runAsync(`DELETE FROM alerts WHERE id = ?`, [id]);

  return new Date().toISOString();
};

export default function Alertas() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme, language, accentColor } = useSettingsStore();
  const { user, token } = useAuthStore();
  const { isSyncing } = useSyncStore();

  const isDark = theme === 'dark';

  const bg = isDark ? '#020617' : '#F8FAFC';
  const surface = isDark ? '#0F172A' : '#FFFFFF';
  const surfaceAlt = isDark ? '#111827' : '#F1F5F9';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const border = isDark ? '#1E293B' : '#E2E8F0';
  const accent = accentColor || ACCENT_COLOR;
  const accentText = getReadableTextColor(accent);
  const statusBarBg = bg;
  const statusBarStyle = isDark ? 'light-content' : 'dark-content';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [deleteConfirmAlert, setDeleteConfirmAlert] = useState<AlertItem | null>(null);

  const loadAlerts = async () => {
    try {
      const localAlerts = await readAlertsFromDB(language);
      setAlerts(localAlerts);
    } catch (error) {
      console.log('[Alertas] Erro ao carregar alertas locais:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [language])
  );

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      await globalSync();
      await loadAlerts();
    } finally {
      setRefreshing(false);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      if (activeFilter === 'unread') return !item.lida;
      if (activeFilter === 'pending') return item.exige_aceite && !item.aceita_em;
      return true;
    });
  }, [alerts, activeFilter]);

  const unreadCount = alerts.filter((item) => !item.lida).length;
  const pendingCount = alerts.filter((item) => item.exige_aceite && !item.aceita_em).length;

  const updateLocalState = (id: string, patch: Partial<AlertItem>) => {
    setAlerts((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setSelectedAlert((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  };

  const handleOpenAlert = async (item: AlertItem) => {
    setSelectedAlert(item);

    if (!item.lida) {
      const now = await markAlertReadLocal(item.id).catch(() => new Date().toISOString());

      updateLocalState(item.id, {
        lida: true,
        lida_em: item.lida_em || now,
      });

      const projectId = getMainProjectId(user);

      await addToSyncQueue(
        '/mobile-alertas/read',
        {
          alertaId: item.id,
          alert_id: item.id,
          usuario_id: user?.id,
          userId: user?.id,
          projectId,
          lida_em: now,
        },
        'POST',
        token || undefined
      ).catch(() => {});
    }
  };

  const handleAcknowledge = async (item: AlertItem) => {
    const now = await acknowledgeAlertLocal(item.id).catch(() => new Date().toISOString());

    updateLocalState(item.id, {
      lida: true,
      lida_em: item.lida_em || now,
      aceita_em: item.aceita_em || now,
    });

    const projectId = getMainProjectId(user);

    await addToSyncQueue(
      `/message/${item.id}/acknowledge`,
      {
        alertaId: item.id,
        alert_id: item.id,
        usuario_id: user?.id,
        userId: user?.id,
        projectId,
        aceita_em: now,
        lida_em: item.lida_em || now,
      },
      'PATCH',
      token || undefined
    ).catch(() => {});
  };

  const handleDeleteAlert = async (item: AlertItem) => {
    if (item.exige_aceite && !item.aceita_em) {
      setDeleteConfirmAlert(null);
      setSelectedAlert(item);
      return;
    }

    const deletedAt = await deleteAlertLocal(item.id).catch(() => new Date().toISOString());
    const projectId = getMainProjectId(user);

    setAlerts((prev) => prev.filter((alert) => alert.id !== item.id));
    setSelectedAlert((prev) => (prev?.id === item.id ? null : prev));
    setDeleteConfirmAlert(null);

    await addToSyncQueue(
      `/message/${item.id}/hide`,
      {
        alertaId: item.id,
        alert_id: item.id,
        usuario_id: user?.id,
        userId: user?.id,
        projectId,
        apagada_em: deletedAt,
        deleted_at: deletedAt,
        titulo: item.titulo,
      },
      'PATCH',
      token || undefined
    ).catch(() => {});
  };

  const renderFilterChip = (key: FilterType, label: string, count?: number) => {
    const active = activeFilter === key;

    return (
      <TouchableOpacity
        style={[
          styles.filterChip,
          {
            backgroundColor: active ? accent : surfaceAlt,
            borderColor: active ? accent : border,
          },
        ]}
        onPress={() => setActiveFilter(key)}
      >
        <Text style={[styles.filterText, { color: active ? accentText : textSecondary }]}> 
          {label}{typeof count === 'number' && count > 0 ? ` ${count}` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAlertCard = ({ item }: { item: AlertItem }) => {
    const isUnread = !item.lida;
    const needsAck = item.exige_aceite && !item.aceita_em;
    const priority = getPriorityConfig(String(item.prioridade || 'INFO'), isDark, language);
    const PriorityIcon = priority.Icon;

    return (
      <TouchableOpacity
        activeOpacity={0.86}
        onPress={() => handleOpenAlert(item)}
        style={[
          styles.card,
          {
            backgroundColor: surface,
            borderColor: isUnread ? priority.color : border,
            borderLeftColor: priority.color,
          },
          isUnread && styles.cardUnread,
        ]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.senderContainer}>
            <View style={[styles.avatarBox, { backgroundColor: priority.bg }]}> 
              <Megaphone size={18} color={priority.color} />
            </View>

            <View style={styles.senderInfo}>
              <Text style={[styles.senderName, { color: textPrimary }]} numberOfLines={1}>
                {item.remetente_nome || alertText('defaultSender', language)}
              </Text>
              <View style={styles.dateRow}>
                <Clock size={11} color={textSecondary} />
                <Text style={[styles.dateText, { color: textSecondary }]}> 
                  {formatDate(item.data_envio, language)}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardRight}>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: priority.color }]} />}
            <View style={[styles.priorityPill, { backgroundColor: priority.bg }]}> 
              <PriorityIcon size={12} color={priority.color} />
              <Text style={[styles.priorityText, { color: priority.color }]}> 
                {priority.label}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.title, { color: textPrimary }]} numberOfLines={2}>
          {item.titulo}
        </Text>

        <View style={[styles.contentPreview, { backgroundColor: surfaceAlt, borderColor: border }]}> 
          <Text style={[styles.contentText, { color: textSecondary }]} numberOfLines={3}>
            {stripHtml(item.conteudo)}
          </Text>
        </View>

        <View style={[styles.footerRow, { borderTopColor: border }]}> 
          {needsAck ? (
            <View style={styles.statusLabel}>
              <AlertCircle size={15} color="#EF4444" />
              <Text style={[styles.statusText, { color: '#EF4444' }]}>{alertText('pendingConfirmation', language)}</Text>
            </View>
          ) : item.aceita_em ? (
            <View style={styles.statusLabel}>
              <ShieldCheck size={15} color="#10B981" />
              <Text style={[styles.statusText, { color: '#10B981' }]}> 
                {alertText('awareAt', language)} {formatDate(item.aceita_em, language)}
              </Text>
            </View>
          ) : item.lida ? (
            <View style={styles.statusLabel}>
              <MailOpen size={15} color={textSecondary} />
              <Text style={[styles.statusText, { color: textSecondary }]}>{alertText('readMessage', language)}</Text>
            </View>
          ) : (
            <View style={styles.statusLabel}>
              <Mail size={15} color={priority.color} />
              <Text style={[styles.statusText, { color: priority.color }]}>{alertText('newMessage', language)}</Text>
            </View>
          )}

          <View style={styles.cardFooterActions}>
            {item.lida && (!item.exige_aceite || item.aceita_em) ? (
              <TouchableOpacity
                style={[styles.deleteTinyButton, { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.08)' }]}
                onPress={(event) => {
                  event.stopPropagation();
                  setDeleteConfirmAlert(item);
                }}
              >
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
            ) : null}

            <Text style={[styles.openText, { color: accent }]}>{alertText('open', language)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      <View style={[styles.headerBackground, { backgroundColor: bg, borderBottomColor: border }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={[styles.headerIconBg, { backgroundColor: surface, borderColor: border }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <ArrowLeft size={22} color={textPrimary} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{alertText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {pendingCount > 0
                ? alertText('pendingSubtitle', language, { count: pendingCount })
                : unreadCount > 0
                  ? alertText('unreadSubtitle', language, { count: unreadCount })
                  : alertText('allReadSubtitle', language)}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.headerIconBg, { backgroundColor: surface, borderColor: border }]}
            onPress={onRefresh}
            disabled={refreshing || isSyncing}
            activeOpacity={0.85}
          >
            {refreshing || isSyncing ? (
              <ActivityIndicator color={accent} size="small" />
            ) : (
              <RefreshCw size={21} color={textPrimary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.topCardWrapper}>
        <View style={[styles.filterCard, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.filtersContainer}>
            {renderFilterChip('all', alertText('all', language), alerts.length)}
            {renderFilterChip('unread', alertText('unread', language), unreadCount)}
            {renderFilterChip('pending', alertText('pending', language), pendingCount)}
          </View>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Filter size={16} color={textSecondary} />
        <Text style={[styles.sectionTitle, { color: textSecondary }]}>{alertText('inbox', language)}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>{alertText('loading', language)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertCard}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isSyncing}
            onRefresh={onRefresh}
            progressViewOffset={Math.max(insets.top, 0) + 80}
            colors={[accent]}
            tintColor={accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: surface, borderColor: border }]}> 
              <Inbox size={38} color={textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textPrimary }]}>{alertText('emptyTitle', language)}</Text>
            <Text style={[styles.emptyText, { color: textSecondary }]}> 
              {alertText('emptyText', language)}
            </Text>
          </View>
        }
      />

      <Modal
        visible={!!selectedAlert}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: surface,
                paddingTop: Math.max(insets.top + 18, 40),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: border }]}> 
              <View style={styles.modalHeaderLeft}>
                <Megaphone size={20} color={accent} />
                <Text style={[styles.modalHeaderLabel, { color: accent }]}> 
                  {alertText('officialCommunication', language)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: surfaceAlt }]}
                onPress={() => setSelectedAlert(null)}
              >
                <X size={22} color={textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedAlert && (
              <>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalContent}
                >
                  {(() => {
                    const priority = getPriorityConfig(String(selectedAlert.prioridade || 'INFO'), isDark, language);
                    const PriorityIcon = priority.Icon;

                    return (
                      <View style={[styles.modalPriority, { backgroundColor: priority.bg }]}> 
                        <PriorityIcon size={15} color={priority.color} />
                        <Text style={[styles.modalPriorityText, { color: priority.color }]}> 
                          {priority.label}
                        </Text>
                      </View>
                    );
                  })()}

                  <Text style={[styles.modalTitle, { color: textPrimary }]}>{selectedAlert.titulo}</Text>

                  <View style={styles.modalMetaRow}>
                    <Clock size={13} color={textSecondary} />
                    <Text style={[styles.modalMetaText, { color: textSecondary }]}> 
                      {formatDate(selectedAlert.data_envio, language)}
                    </Text>
                  </View>

                  <View style={[styles.modalBodyBox, { backgroundColor: surfaceAlt, borderColor: border }]}> 
                    <Text style={[styles.modalBodyText, { color: textPrimary }]}> 
                      {stripHtml(selectedAlert.conteudo)}
                    </Text>
                  </View>

                  {selectedAlert.aceita_em ? (
                    <View style={[styles.ackDoneBox, { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)' }]}> 
                      <CheckCircle2 size={18} color="#10B981" />
                      <Text style={styles.ackDoneText}> 
                        {alertText('acknowledgeDoneAt', language, { date: formatDate(selectedAlert.aceita_em, language) })}
                      </Text>
                    </View>
                  ) : selectedAlert.exige_aceite ? (
                    <View style={[styles.ackWarningBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)' }]}> 
                      <AlertCircle size={18} color="#EF4444" />
                      <Text style={styles.ackWarningText}>{alertText('requiresAck', language)}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={[styles.modalFooter, { borderTopColor: border }]}> 
                  {selectedAlert.exige_aceite && !selectedAlert.aceita_em ? (
                    <TouchableOpacity style={[styles.ackButton, { backgroundColor: accent }]} onPress={() => handleAcknowledge(selectedAlert)}>
                      <ShieldCheck size={20} color={accentText} />
                      <Text style={[styles.ackButtonText, { color: accentText }]}>{alertText('acknowledgeButton', language)}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={[styles.closePrimaryButton, { backgroundColor: accent }]} onPress={() => setSelectedAlert(null)}>
                      <Text style={[styles.ackButtonText, { color: accentText }]}>{alertText('close', language)}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteConfirmAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirmAlert(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmCard, { backgroundColor: surface, borderColor: border }]}>
            <View style={[styles.confirmIconWrap, { backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.10)' }]}>
              <Trash2 size={28} color="#EF4444" />
            </View>

            <Text style={[styles.confirmTitle, { color: textPrimary }]}>{alertText('deleteTitle', language)}</Text>
            <Text style={[styles.confirmText, { color: textSecondary }]}>
              {alertText('deleteText', language)}
            </Text>

            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.confirmCancelButton, { borderColor: border, backgroundColor: surfaceAlt }]}
                onPress={() => setDeleteConfirmAlert(null)}
              >
                <Text style={[styles.confirmCancelText, { color: textPrimary }]}>{alertText('cancel', language)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDeleteButton}
                onPress={() => deleteConfirmAlert && handleDeleteAlert(deleteConfirmAlert)}
              >
                <Text style={styles.confirmDeleteText}>{alertText('delete', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  listContent: { paddingBottom: 130 },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 14, fontWeight: '700' },

  headerBackground: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  pageSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  headerIconBg: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  topCardWrapper: {
    paddingTop: 14,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  filterCard: {
    borderRadius: 22,
    padding: 8,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '900',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 22,
    marginBottom: 14,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  card: {
    borderRadius: 24,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderLeftWidth: 5,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  cardUnread: {
    elevation: 2,
    shadowOpacity: 0.06,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  senderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  senderInfo: { flex: 1 },
  senderName: {
    fontSize: 14,
    fontWeight: '900',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  dateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  priorityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  contentPreview: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  contentText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500',
  },
  footerRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
  },
  cardFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteTinyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
    marginTop: 50,
  },
  emptyIconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  modalCard: {
    flex: 1,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 22,
    overflow: 'hidden',
  },
  modalHeader: {
    paddingHorizontal: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeaderLabel: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 22,
    paddingBottom: 36,
  },
  modalPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  modalPriorityText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
    lineHeight: 31,
    marginBottom: 10,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  modalMetaText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBodyBox: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },
  modalBodyText: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '500',
  },
  ackWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
  },
  ackWarningText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
  },
  ackDoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    padding: 14,
    borderRadius: 18,
  },
  ackDoneText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '900',
    flex: 1,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
  },
  modalFooterActions: {
    flexDirection: 'row',
    gap: 12,
  },
  deleteButton: {
    flex: 0.9,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  ackButton: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  closePrimaryButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackButtonText: {
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  confirmCard: {
    width: '100%',
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 22,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '900',
  },
  confirmDeleteButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
