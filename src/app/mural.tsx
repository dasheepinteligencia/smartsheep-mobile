import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
  Dimensions,
  Linking,
  StatusBar,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Megaphone,
  Pin,
  AlertCircle,
  Info,
  Clock,
  CalendarDays,
  X,
  Inbox,
  RefreshCw,
  ShieldCheck,
  Image as ImageIcon,
  FileText,
  Music,
  PlayCircle,
  ExternalLink,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { api } from '../services/api';

const ACCENT_COLOR = '#FF7A00';

const MURAL_TEXTS = {
  'pt-BR': {
    defaultTitle: 'Comunicado',
    defaultAuthor: 'Gestão',
    priorityUrgent: 'Urgente',
    priorityHigh: 'Alta',
    priorityNormal: 'Normal',
    priorityAttention: 'Atenção',
    priorityInfo: 'Informativo',
    loading: 'Carregando mural...',
    title: 'Mural de Avisos',
    subtitle: 'Comunicados oficiais, campanhas internas e orientações da gestão',
    offlineData: 'Exibindo dados salvos offline',
    all: 'Todos',
    urgent: 'Urgentes',
    recent: 'Recentes',
    activeAnnouncements: 'Comunicados ativos',
    expand: 'Ampliar',
    image: 'Imagem',
    new: 'Novo',
    emptyContentAdditional: 'Comunicado sem texto adicional.',
    continueReading: 'Continuar lendo...',
    dateNotInformed: 'Data não informada',
    read: 'Ler',
    emptyTitle: 'Mural vazio',
    emptyText: 'Não há comunicados ativos para este filtro.',
    officialAnnouncement: 'Comunicado oficial',
    published: 'Publicado',
    validity: 'Validade',
    notInformed: 'Não informado',
    noValidity: 'Sem validade',
    emptyContent: 'Comunicado sem conteúdo.',
    fullscreenHint: 'Toque no X para fechar',
  },
  'en-US': {
    defaultTitle: 'Announcement',
    defaultAuthor: 'Management',
    priorityUrgent: 'Urgent',
    priorityHigh: 'High',
    priorityNormal: 'Normal',
    priorityAttention: 'Attention',
    priorityInfo: 'Informational',
    loading: 'Loading notice board...',
    title: 'Notice Board',
    subtitle: 'Official announcements, internal campaigns and management guidance',
    offlineData: 'Showing saved offline data',
    all: 'All',
    urgent: 'Urgent',
    recent: 'Recent',
    activeAnnouncements: 'Active announcements',
    expand: 'Expand',
    image: 'Image',
    new: 'New',
    emptyContentAdditional: 'Announcement without additional text.',
    continueReading: 'Continue reading...',
    dateNotInformed: 'Date not informed',
    read: 'Read',
    emptyTitle: 'Empty notice board',
    emptyText: 'There are no active announcements for this filter.',
    officialAnnouncement: 'Official announcement',
    published: 'Published',
    validity: 'Validity',
    notInformed: 'Not informed',
    noValidity: 'No validity date',
    emptyContent: 'Announcement without content.',
    fullscreenHint: 'Tap X to close',
  },
  'es-ES': {
    defaultTitle: 'Comunicado',
    defaultAuthor: 'Gestión',
    priorityUrgent: 'Urgente',
    priorityHigh: 'Alta',
    priorityNormal: 'Normal',
    priorityAttention: 'Atención',
    priorityInfo: 'Informativo',
    loading: 'Cargando mural...',
    title: 'Mural de Avisos',
    subtitle: 'Comunicados oficiales, campañas internas y orientaciones de la gestión',
    offlineData: 'Mostrando datos guardados offline',
    all: 'Todos',
    urgent: 'Urgentes',
    recent: 'Recientes',
    activeAnnouncements: 'Comunicados activos',
    expand: 'Ampliar',
    image: 'Imagen',
    new: 'Nuevo',
    emptyContentAdditional: 'Comunicado sin texto adicional.',
    continueReading: 'Seguir leyendo...',
    dateNotInformed: 'Fecha no informada',
    read: 'Leer',
    emptyTitle: 'Mural vacío',
    emptyText: 'No hay comunicados activos para este filtro.',
    officialAnnouncement: 'Comunicado oficial',
    published: 'Publicado',
    validity: 'Validez',
    notInformed: 'No informado',
    noValidity: 'Sin validez',
    emptyContent: 'Comunicado sin contenido.',
    fullscreenHint: 'Toca la X para cerrar',
  },
} as const;

type MuralTextKey = keyof typeof MURAL_TEXTS['pt-BR'];

const muralText = (key: MuralTextKey, language: string) => {
  const lang = language === 'en-US' || language === 'es-ES' ? language : 'pt-BR';
  return MURAL_TEXTS[lang][key];
};

const getLocaleByLanguage = (language: string) => {
  if (language === 'en-US') return 'en-US';
  if (language === 'es-ES') return 'es-ES';
  return 'pt-BR';
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

const DEFAULT_ASSET_HOST = 'https://smartsheep.com.br';
const SCREEN_WIDTH = Dimensions.get('window').width;

type MuralItem = {
  id: string;
  titulo: string;
  conteudo: string;
  prioridade: string;
  data_publicacao?: string | null;
  data_validade?: string | null;
  autor_nome?: string;
  ativo?: boolean;
  imagem_url?: string | null;
  raw?: any;
};

type FilterType = 'all' | 'urgent' | 'recent';

type RichBlock = {
  type:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'quote'
    | 'ul'
    | 'ol'
    | 'check'
    | 'divider'
    | 'code'
    | 'table'
    | 'image'
    | 'video'
    | 'audio'
    | 'file'
    | 'link'
    | 'p';
  text: string;
  checked?: boolean;
  rows?: string[][];
  url?: string;
};

const safeParseJson = (value: any, fallback: any = null) => {
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

const resolveAssetUrl = (value?: string | null) => {
  if (!value) return null;

  const raw = String(value).trim();

  if (!raw) return null;
  if (raw.startsWith('data:image')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('/')) return `${DEFAULT_ASSET_HOST}${raw}`;

  return `${DEFAULT_ASSET_HOST}/${raw}`;
};

const getUrlWithoutQuery = (url: string) => String(url || '').split('?')[0].split('#')[0];

const getUrlFileName = (url: string) => {
  const clean = decodeURIComponent(getUrlWithoutQuery(url));
  const name = clean.split('/').filter(Boolean).pop() || 'arquivo';
  const withoutUuidPrefix = name
    .replace(/^[0-9a-f]{8,}[-_]/i, '')
    .replace(/^\d{8,}[-_]/, '')
    .replace(/^file[-_]?/i, '')
    .trim();

  return withoutUuidPrefix || name || 'arquivo';
};

const isGenericFileLabel = (value?: string) => {
  const text = cleanInlineHtml(value || '').trim().toLowerCase();

  if (!text) return true;

  return (
    text === 'arquivo' ||
    text === 'file' ||
    text === 'download' ||
    text === 'anexo' ||
    text === 'attachment' ||
    text === 'abrir arquivo' ||
    text === 'clique aqui' ||
    text.startsWith('http://') ||
    text.startsWith('https://') ||
    /^[0-9a-f]{16,}/i.test(text)
  );
};

const getFriendlyAttachmentName = (url: string, label?: string) => {
  const cleanLabel = cleanInlineHtml(label || '').trim();

  if (!isGenericFileLabel(cleanLabel)) return cleanLabel;

  const fileName = getUrlFileName(url);
  const lower = fileName.toLowerCase();

  if (
    lower === 'arquivo' ||
    lower === 'file' ||
    lower === 'download' ||
    /^[0-9a-f]{16,}(\.[a-z0-9]+)?$/i.test(fileName)
  ) {
    const kind = getMediaKindFromUrl(url);

    if (kind === 'image') return 'Imagem anexada';
    if (kind === 'video') return 'Vídeo anexado';
    if (kind === 'audio') return 'Áudio anexado';
    if (kind === 'file') return 'Arquivo anexado';

    return 'Link anexado';
  }

  return fileName;
};

const getMediaKindFromUrl = (url: string): 'image' | 'video' | 'audio' | 'file' | 'link' => {
  const clean = getUrlWithoutQuery(url).toLowerCase();

  if (/\.(png|jpe?g|webp|gif|bmp|heic|heif|svg)$/.test(clean)) return 'image';
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/.test(clean)) return 'video';
  if (/\.(mp3|m4a|aac|wav|ogg|opus)$/.test(clean)) return 'audio';
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)$/.test(clean)) return 'file';

  return 'link';
};

const makeAttachmentBlock = (url: string, label?: string): RichBlock => {
  const resolvedUrl = resolveAssetUrl(url) || String(url || '');
  const kind = getMediaKindFromUrl(resolvedUrl);
  const friendlyName = getFriendlyAttachmentName(resolvedUrl, label);

  return {
    type: kind,
    text: friendlyName,
    url: resolvedUrl,
  };
};

const openExternalUrl = async (url?: string) => {
  if (!url) return;

  try {
    const normalized = resolveAssetUrl(url) || url;
    const canOpen = await Linking.canOpenURL(normalized);

    if (canOpen) await Linking.openURL(normalized);
  } catch {}
};

const extractImageFromHtml = (value: string) => {
  const html = String(value || '');

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  if (imgMatch?.[1]) return resolveAssetUrl(imgMatch[1]);

  const directImageMatch = html.match(/https?:\/\/[^\s"'<>]+\.(png|jpe?g|webp|gif)(\?[^\s"'<>]+)?/i);
  if (directImageMatch?.[0]) return resolveAssetUrl(directImageMatch[0]);

  return null;
};

const stripHtml = (value: string) => {
  return String(value || '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};


const decodeEntities = (value: string) => {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

const normalizeContentValue = (value: any) => {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value || '');
  }
};

const extractTextFromRichContent = (content: any): string => {
  if (content === null || content === undefined) return '';

  if (typeof content === 'string') return decodeEntities(content);

  if (Array.isArray(content)) {
    return content
      .map((item) => extractTextFromRichContent(item))
      .filter(Boolean)
      .join(' ');
  }

  if (typeof content === 'object') {
    if (typeof content.text === 'string') return decodeEntities(content.text);
    if (typeof content.value === 'string') return decodeEntities(content.value);
    if (typeof content.href === 'string' && content.content) return extractTextFromRichContent(content.content);
    if (content.content) return extractTextFromRichContent(content.content);
    if (content.children) return extractTextFromRichContent(content.children);
    if (content.props?.text) return extractTextFromRichContent(content.props.text);
  }

  return '';
};

const normalizeBlockType = (type: any) => {
  const normalized = String(type || '').trim().toLowerCase();

  if (normalized.includes('bullet')) return 'ul';
  if (normalized.includes('number') || normalized.includes('ordered')) return 'ol';
  if (normalized.includes('check') || normalized.includes('todo')) return 'check';
  if (normalized === 'heading' || normalized === 'h1') return 'h1';
  if (normalized === 'h2') return 'h2';
  if (normalized === 'h3') return 'h3';
  if (normalized.includes('quote')) return 'quote';
  if (normalized.includes('code')) return 'code';
  if (normalized.includes('divider')) return 'divider';

  return 'p';
};

const parseStructuredRichBlocks = (value: any): RichBlock[] => {
  const parsed = safeParseJson(value, null);
  const source = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.blocks)
      ? parsed.blocks
      : Array.isArray(parsed?.content)
        ? parsed.content
        : Array.isArray(parsed?.document)
          ? parsed.document
          : null;

  if (!Array.isArray(source)) return [];

  const blocks: RichBlock[] = [];

  const getChildren = (block: any) => {
    if (Array.isArray(block?.content)) return block.content;
    if (Array.isArray(block?.children)) return block.children;
    if (Array.isArray(block?.items)) return block.items;
    return [];
  };

  const pushTextBlock = (type: RichBlock['type'], block: any, forcedText?: string) => {
    const text = cleanInlineHtml(
      forcedText ??
        extractTextFromRichContent(
          block?.contentText ??
            block?.content ??
            block?.text ??
            block?.value ??
            block?.children ??
            block?.props?.text
        )
    );

    if (type === 'divider') {
      blocks.push({ type: 'divider', text: '' });
      return;
    }

    if (!text) return;

    if (type === 'check') {
      blocks.push({
        type: 'check',
        text,
        checked: block?.props?.checked === true || block?.checked === true,
      });
      return;
    }

    blocks.push({ type, text });
  };

  const pushListItems = (block: any, listType: 'ul' | 'ol' | 'check') => {
    const children = getChildren(block);

    if (children.length === 0) {
      pushTextBlock(listType, block);
      return;
    }

    children.forEach((child: any) => {
      const childType = String(child?.type || child?.kind || child?.blockType || '').toLowerCase();

      if (childType.includes('list') || childType.includes('item') || childType.includes('bullet') || childType.includes('number')) {
        pushTextBlock(listType, child);

        const nested = getChildren(child).filter((nestedChild: any) => {
          const nestedType = String(nestedChild?.type || nestedChild?.kind || nestedChild?.blockType || '').toLowerCase();
          return nestedType.includes('bullet') || nestedType.includes('number') || nestedType.includes('ordered') || nestedType.includes('list');
        });

        nested.forEach((nestedChild: any) => pushListItems(nestedChild, normalizeBlockType(nestedChild?.type) === 'ol' ? 'ol' : listType));
        return;
      }

      pushBlock(child, listType);
    });
  };

  const pushBlock = (block: any, inheritedListType?: 'ul' | 'ol' | 'check') => {
    if (!block || typeof block !== 'object') return;

    const rawType = String(block.type || block.kind || block.blockType || '').trim().toLowerCase();
    const type = inheritedListType || normalizeBlockType(rawType);

    if (
      rawType === 'bulletlist' ||
      rawType === 'bullet_list' ||
      rawType === 'bullet-list' ||
      rawType === 'orderedlist' ||
      rawType === 'ordered_list' ||
      rawType === 'ordered-list' ||
      rawType === 'numberedlist' ||
      rawType.includes('bulletlist') ||
      rawType.includes('orderedlist') ||
      rawType.includes('numberedlist')
    ) {
      pushListItems(block, rawType.includes('order') || rawType.includes('number') ? 'ol' : 'ul');
      return;
    }

    if (rawType.includes('listitem') || rawType.includes('list_item') || rawType === 'li') {
      pushTextBlock(inheritedListType || 'ul', block);
      return;
    }

    if (type === 'ul' || type === 'ol' || type === 'check') {
      pushListItems(block, type);
      return;
    }

    pushTextBlock(type as RichBlock['type'], block);

    getChildren(block).forEach((child: any) => pushBlock(child));
  };

  source.forEach((block) => pushBlock(block));

  return blocks;
};

const parsePlainTextListBlocks = (value: string): RichBlock[] => {
  const raw = String(value || '').trim();

  if (!raw || /<[^>]+>/.test(raw)) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const hasList = lines.some((line) => /^([-*•])\s+/.test(line) || /^\d+[\.)]\s+/.test(line));

  if (!hasList) return [];

  return lines.map((line) => {
    const ordered = line.match(/^\d+[\.)]\s+(.+)$/);
    if (ordered) return { type: 'ol', text: cleanInlineHtml(ordered[1]) };

    const unordered = line.match(/^[-*•]\s+(.+)$/);
    if (unordered) return { type: 'ul', text: cleanInlineHtml(unordered[1]) };

    return { type: 'p', text: cleanInlineHtml(line) };
  });
};

const cleanInlineHtml = (value: string) => {
  return decodeEntities(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
        const cleanLabel = String(label || '').replace(/<[^>]*>/g, '').trim();
        return cleanLabel ? `${cleanLabel} (${href})` : href;
      })
      .replace(/<strong[^>]*>|<b[^>]*>/gi, '**')
      .replace(/<\/strong>|<\/b>/gi, '**')
      .replace(/<em[^>]*>|<i[^>]*>/gi, '*')
      .replace(/<\/em>|<\/i>/gi, '*')
      .replace(/<u[^>]*>/gi, '__')
      .replace(/<\/u>/gi, '__')
      .replace(/<s[^>]*>|<del[^>]*>|<strike[^>]*>/gi, '~~')
      .replace(/<\/s>|<\/del>|<\/strike>/gi, '~~')
      .replace(/<code[^>]*>/gi, '`')
      .replace(/<\/code>/gi, '`')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const extractTagBlocks = (source: string, tag: string) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
  const blocks: string[] = [];
  let match;

  while ((match = regex.exec(source)) !== null) {
    blocks.push(match[1] || '');
  }

  return blocks;
};

const extractDirectHtmlListBlocks = (source: string): RichBlock[] => {
  const blocks: RichBlock[] = [];
  const decoded = decodeEntities(String(source || ''));

  const parseList = (tag: 'ul' | 'ol') => {
    const listRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'gi');
    let listMatch;

    while ((listMatch = listRegex.exec(decoded)) !== null) {
      extractTagBlocks(listMatch[1] || '', 'li').forEach((liHtml) => {
        const content = cleanInlineHtml(liHtml);
        if (content) blocks.push({ type: tag, text: content });
      });
    }
  };

  parseList('ul');
  parseList('ol');

  if (blocks.length === 0) {
    extractTagBlocks(decoded, 'li').forEach((liHtml) => {
      const content = cleanInlineHtml(liHtml);
      if (content) blocks.push({ type: 'ul', text: content });
    });
  }

  return blocks;
};

const parseTableRows = (tableHtml: string) => {
  return extractTagBlocks(tableHtml, 'tr')
    .map((rowHtml) => {
      const cells = [
        ...extractTagBlocks(rowHtml, 'th'),
        ...extractTagBlocks(rowHtml, 'td'),
      ].map((cell) => cleanInlineHtml(cell));

      return cells.filter(Boolean);
    })
    .filter((row) => row.length > 0);
};

const parseRichBlocks = (html: string): RichBlock[] => {
  const structuredBlocks = parseStructuredRichBlocks(html);
  if (structuredBlocks.length > 0) return structuredBlocks;

  const plainListBlocks = parsePlainTextListBlocks(html);
  if (plainListBlocks.length > 0) return plainListBlocks;

  let source = decodeEntities(String(html || ''))
    .replace(/\r/g, '');

  const blocks: RichBlock[] = [];

  const pushParagraphs = (raw: string) => {
    const normalized = raw
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');

    normalized
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const htmlLinks = [...part.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];

        if (htmlLinks.length > 0) {
          let cursor = 0;

          htmlLinks.forEach((linkMatch) => {
            const before = cleanInlineHtml(part.slice(cursor, linkMatch.index || 0));
            if (before) blocks.push({ type: 'p', text: before });

            blocks.push(makeAttachmentBlock(linkMatch[1], cleanInlineHtml(linkMatch[2])));
            cursor = (linkMatch.index || 0) + linkMatch[0].length;
          });

          const after = cleanInlineHtml(part.slice(cursor));
          if (after) blocks.push({ type: 'p', text: after });
          return;
        }

        const clean = cleanInlineHtml(part);
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
        const matches = [...clean.matchAll(urlRegex)];

        if (matches.length === 0) {
          if (clean) blocks.push({ type: 'p', text: clean });
          return;
        }

        let cursor = 0;

        matches.forEach((urlMatch) => {
          const before = clean.slice(cursor, urlMatch.index || 0).trim();
          if (before) blocks.push({ type: 'p', text: before });

          blocks.push(makeAttachmentBlock(urlMatch[1]));
          cursor = (urlMatch.index || 0) + urlMatch[0].length;
        });

        const after = clean.slice(cursor).trim();
        if (after) blocks.push({ type: 'p', text: after });
      });
  };

  const tokenRegex =
    /<h1[^>]*>([\s\S]*?)<\/h1>|<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<blockquote[^>]*>([\s\S]*?)<\/blockquote>|<pre[^>]*>([\s\S]*?)<\/pre>|<table[^>]*>([\s\S]*?)<\/table>|<ul[^>]*>([\s\S]*?)<\/ul>|<ol[^>]*>([\s\S]*?)<\/ol>|<img[^>]+src=["']([^"']+)["'][^>]*>|<video[^>]*(?:src=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/video>|<audio[^>]*(?:src=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/audio>|<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>|<hr\s*\/?>/gi;

  const looseLiItems = extractTagBlocks(source, 'li').map((item) => cleanInlineHtml(item)).filter(Boolean);
  const hasListWrapper = /<\/?(?:ul|ol)[^>]*>/i.test(source);

  if (looseLiItems.length > 0 && !hasListWrapper) {
    looseLiItems.forEach((item) => blocks.push({ type: 'ul', text: item }));
    source = source.replace(/<li[^>]*>[\s\S]*?<\/li>/gi, '');
  }

  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(source)) !== null) {
    pushParagraphs(source.slice(lastIndex, match.index));

    if (match[1]) {
      const content = cleanInlineHtml(match[1]);
      if (content) blocks.push({ type: 'h1', text: content });
    } else if (match[2]) {
      const content = cleanInlineHtml(match[2]);
      if (content) blocks.push({ type: 'h2', text: content });
    } else if (match[3]) {
      const content = cleanInlineHtml(match[3]);
      if (content) blocks.push({ type: 'h3', text: content });
    } else if (match[4]) {
      const content = cleanInlineHtml(match[4]);
      if (content) blocks.push({ type: 'quote', text: content });
    } else if (match[5]) {
      const code = decodeEntities(
        String(match[5])
          .replace(/<code[^>]*>/gi, '')
          .replace(/<\/code>/gi, '')
          .replace(/<[^>]*>/g, '')
      ).trim();
      if (code) blocks.push({ type: 'code', text: code });
    } else if (match[6]) {
      const rows = parseTableRows(match[6]);
      if (rows.length > 0) blocks.push({ type: 'table', text: '', rows });
    } else if (match[7]) {
      extractTagBlocks(match[7], 'li').forEach((liHtml) => {
        const checkedAttr =
          /data-checked=["']true["']/i.test(liHtml) ||
          /aria-checked=["']true["']/i.test(liHtml) ||
          /checked/i.test(liHtml);
        const uncheckedAttr =
          /data-checked=["']false["']/i.test(liHtml) ||
          /aria-checked=["']false["']/i.test(liHtml);

        const content = cleanInlineHtml(liHtml);
        if (!content) return;

        if (checkedAttr || uncheckedAttr || /type=["']checkbox["']/i.test(liHtml)) {
          blocks.push({ type: 'check', text: content, checked: checkedAttr });
        } else {
          blocks.push({ type: 'ul', text: content });
        }
      });
    } else if (match[8]) {
      extractTagBlocks(match[8], 'li').forEach((liHtml) => {
        const content = cleanInlineHtml(liHtml);
        if (content) blocks.push({ type: 'ol', text: content });
      });
    } else if (match[9]) {
      const src = resolveAssetUrl(match[9]);
      if (src) blocks.push({ type: 'image', text: getUrlFileName(src), url: src });
    } else if (match[10] || match[11]) {
      const videoSrc = match[10] || (String(match[11] || '').match(/<source[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1]);
      if (videoSrc) blocks.push(makeAttachmentBlock(videoSrc, cleanInlineHtml(match[11] || '') || 'Vídeo'));
    } else if (match[12] || match[13]) {
      const audioSrc = match[12] || (String(match[13] || '').match(/<source[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1]);
      if (audioSrc) blocks.push(makeAttachmentBlock(audioSrc, cleanInlineHtml(match[13] || '') || 'Áudio'));
    } else if (match[14]) {
      blocks.push(makeAttachmentBlock(match[14], cleanInlineHtml(match[15] || '')));
    } else {
      blocks.push({ type: 'divider', text: '' });
    }

    lastIndex = tokenRegex.lastIndex;
  }

  pushParagraphs(source.slice(lastIndex));

  const directListBlocks = extractDirectHtmlListBlocks(html);
  const hasParsedList = blocks.some((block) => block.type === 'ul' || block.type === 'ol' || block.type === 'check');

  if (directListBlocks.length > 0 && !hasParsedList) {
    const firstListIndex = blocks.findIndex((block) =>
      block.text && directListBlocks.some((listBlock) => block.text.includes(listBlock.text))
    );

    if (firstListIndex >= 0) {
      blocks.splice(firstListIndex, 1, ...directListBlocks);
    } else {
      blocks.push(...directListBlocks);
    }
  }

  if (blocks.length === 0) {
    const plain = stripHtml(html);
    if (plain) blocks.push({ type: 'p', text: plain });
  }

  return blocks;
};

const renderInlineText = (value: string, baseStyle: any, strongStyle: any, italicStyle: any, extraStyles?: any) => {
  const tokens = String(value || '')
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|~~[^~]+~~|`[^`]+`)/g)
    .filter(Boolean);

  return (
    <Text style={baseStyle}>
      {tokens.map((token, index) => {
        if (token.startsWith('**') && token.endsWith('**')) {
          return (
            <Text key={index} style={strongStyle}>
              {token.slice(2, -2)}
            </Text>
          );
        }

        if (token.startsWith('*') && token.endsWith('*')) {
          return (
            <Text key={index} style={italicStyle}>
              {token.slice(1, -1)}
            </Text>
          );
        }

        if (token.startsWith('__') && token.endsWith('__')) {
          return (
            <Text key={index} style={extraStyles?.underline}>
              {token.slice(2, -2)}
            </Text>
          );
        }

        if (token.startsWith('~~') && token.endsWith('~~')) {
          return (
            <Text key={index} style={extraStyles?.strike}>
              {token.slice(2, -2)}
            </Text>
          );
        }

        if (token.startsWith('`') && token.endsWith('`')) {
          return (
            <Text key={index} style={extraStyles?.inlineCode}>
              {token.slice(1, -1)}
            </Text>
          );
        }

        return <Text key={index}>{token}</Text>;
      })}
    </Text>
  );
};


const normalizeMuralItem = (item: any, language = 'pt-BR'): MuralItem | null => {
  if (!item || typeof item !== 'object') return null;

  const id = String(item.id || item.avisoId || item.noticeId || '').trim();
  if (!id) return null;

  const conteudo = normalizeContentValue(item.conteudo || item.content || item.mensagem || item.blocks || item.body || '');
  const imagemUrl =
    item.imagem_url ||
    item.imagemUrl ||
    item.image_url ||
    item.imageUrl ||
    item.banner_url ||
    item.bannerUrl ||
    item.capa_url ||
    item.capaUrl ||
    null;

  return {
    id,
    titulo: String(item.titulo || item.title || item.assunto || muralText('defaultTitle', language)),
    conteudo,
    prioridade: String(item.prioridade || item.priority || 'NORMAL').toUpperCase(),
    data_publicacao:
      item.data_publicacao ||
      item.dataPublicacao ||
      item.created_at ||
      item.criado_em ||
      item.published_at ||
      null,
    data_validade: item.data_validade || item.dataValidade || item.valid_until || null,
    autor_nome: item.autor?.nome || item.autor_nome || item.authorName || muralText('defaultAuthor', language),
    ativo: item.ativo !== false,
    imagem_url: resolveAssetUrl(imagemUrl),
    raw: item,
  };
};

const formatDate = (value?: string | null, language = 'pt-BR') => {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleDateString(getLocaleByLanguage(language), {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const formatDateTime = (value?: string | null, language = 'pt-BR') => {
  if (!value) return '';

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';

    return date.toLocaleString(getLocaleByLanguage(language), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
};

const isRecent = (value?: string | null) => {
  if (!value) return false;

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return false;

    const diffMs = Date.now() - date.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays <= 7;
  } catch {
    return false;
  }
};

const getPriorityConfig = (priority: string, isDark: boolean, language = 'pt-BR') => {
  const p = String(priority || 'NORMAL').toUpperCase();

  if (['URGENTE', 'ALTA', 'CRITICA', 'CRÍTICA'].includes(p)) {
    return {
      label: p === 'URGENTE' ? muralText('priorityUrgent', language) : muralText('priorityHigh', language),
      color: '#EF4444',
      bg: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.10)',
      Icon: AlertCircle,
    };
  }

  if (['MEDIA', 'MÉDIA', 'ATENCAO', 'ATENÇÃO', 'NORMAL'].includes(p)) {
    return {
      label: p === 'NORMAL' ? muralText('priorityNormal', language) : muralText('priorityAttention', language),
      color: '#F59E0B',
      bg: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.10)',
      Icon: Pin,
    };
  }

  return {
    label: muralText('priorityInfo', language),
    color: '#3B82F6',
    bg: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)',
    Icon: Info,
  };
};

export default function MuralScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { user } = useAuthStore();
  const { theme, language, accentColor } = useSettingsStore();

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
  const [filter, setFilter] = useState<FilterType>('all');
  const [items, setItems] = useState<MuralItem[]>([]);
  const [selected, setSelected] = useState<MuralItem | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const projectId = getMainProjectId(user);
  const cacheKey = projectId ? `MuralCache_${projectId}` : 'MuralCache_default';
  const readKey = projectId ? `MuralReadIds_${projectId}` : 'MuralReadIds_default';

  const DEBUG_MURAL_MEDIA = false;

  const mediaSpy = (step: string, payload: any) => {
    if (!__DEV__ || !DEBUG_MURAL_MEDIA) return;

    try {
      console.log(`[MURAL MEDIA SPY][${step}]`, JSON.stringify(payload, null, 2));
    } catch {
      console.log(`[MURAL MEDIA SPY][${step}]`, payload);
    }
  };

  const loadReadIds = async () => {
    const raw = await SecureStore.getItemAsync(readKey).catch(() => null);
    const parsed = safeParseJson(raw, []);

    setReadIds(new Set(Array.isArray(parsed) ? parsed.map(String) : []));
  };

  const markAsRead = async (item: MuralItem) => {
    const id = String(item?.id || '').trim();

    if (!id) return;

    setReadIds((current) => {
      const next = new Set(current);
      next.add(id);
      SecureStore.setItemAsync(readKey, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  const loadFromCache = async () => {
    try {
      const cached = await SecureStore.getItemAsync(cacheKey);
      const parsed = safeParseJson(cached, []);

      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => normalizeMuralItem(item, language)).filter(Boolean) as MuralItem[];
        setItems(normalized);
      }
    } catch {}
  };

  const fetchMural = async (silent = false) => {
    if (!projectId) {
      await loadFromCache();
      setLoading(false);
      return;
    }

    if (!silent) setLoading(true);

    try {
      const response = await api(`/mural/${encodeURIComponent(String(projectId))}?apenasAtivos=true&t=${Date.now()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const list = Array.isArray(data) ? data : data.avisos || data.items || data.data || [];
      const normalized = list.map((item: any) => normalizeMuralItem(item, language)).filter(Boolean) as MuralItem[];

      mediaSpy('fetch-response', {
        total: normalized.length,
        firstItem: normalized[0]
          ? {
              id: normalized[0].id,
              titulo: normalized[0].titulo,
              imagem_url: normalized[0].imagem_url,
              conteudo: normalized[0].conteudo,
              rawKeys: Object.keys(normalized[0].raw || {}),
              raw: normalized[0].raw,
            }
          : null,
      });

      setItems(normalized);
      setOfflineMode(false);

      // Não salvamos o conteúdo completo no SecureStore porque comunicados com HTML/anexos passam de 2048 bytes.
    } catch (error) {
      await loadFromCache();
      setOfflineMode(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadReadIds();
      fetchMural();
    }, [projectId, language])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMural(true);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'urgent') {
        return ['URGENTE', 'ALTA', 'CRITICA', 'CRÍTICA'].includes(String(item.prioridade).toUpperCase());
      }

      if (filter === 'recent') {
        return isRecent(item.data_publicacao);
      }

      return true;
    });
  }, [items, filter]);

  const urgentCount = items.filter((item) =>
    ['URGENTE', 'ALTA', 'CRITICA', 'CRÍTICA'].includes(String(item.prioridade).toUpperCase())
  ).length;

  const recentCount = items.filter((item) => isRecent(item.data_publicacao)).length;

  const renderFilter = (key: FilterType, label: string, count?: number) => {
    const active = filter === key;

    return (
      <TouchableOpacity
        style={[
          styles.filterChip,
          {
            backgroundColor: active ? accent : surface,
            borderColor: active ? accent : border,
          },
        ]}
        onPress={() => setFilter(key)}
      >
        <Text style={[styles.filterText, { color: active ? accentText : textSecondary }]}>
          {label}
          {typeof count === 'number' && count > 0 ? ` ${count}` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      <View style={[styles.hero, { backgroundColor: bg, borderBottomColor: border }]}>
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: surface, borderColor: border }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <ArrowLeft size={22} color={textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconButton, { backgroundColor: surface, borderColor: border }]}
            onPress={onRefresh}
            disabled={refreshing}
            activeOpacity={0.85}
          >
            {refreshing ? (
              <ActivityIndicator color={accent} size="small" />
            ) : (
              <RefreshCw size={21} color={textPrimary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroTitleRow}>
          <View style={[styles.heroIcon, { backgroundColor: accent }]}>
            <Megaphone size={28} color={accentText} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.pageTitle, { color: textPrimary }]}>{muralText('title', language)}</Text>
            <Text style={[styles.pageSubtitle, { color: textSecondary }]}>
              {muralText('subtitle', language)}
            </Text>
          </View>
        </View>

        {offlineMode ? (
          <View style={[styles.offlinePill, { backgroundColor: surfaceAlt, borderColor: border }]}>
            <Info size={13} color={textSecondary} />
            <Text style={[styles.offlineText, { color: textSecondary }]}>{muralText('offlineData', language)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.filtersWrapper}>
        <View style={[styles.filtersCard, { backgroundColor: surface, borderColor: border }]}>
          {renderFilter('all', muralText('all', language), items.length)}
          {renderFilter('urgent', muralText('urgent', language), urgentCount)}
          {renderFilter('recent', muralText('recent', language), recentCount)}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <ShieldCheck size={16} color={textSecondary} />
        <Text style={[styles.sectionTitle, { color: textSecondary }]}>{muralText('activeAnnouncements', language)}</Text>
      </View>
    </View>
  );

  const renderImage = (item: MuralItem, mode: 'card' | 'modal') => {
    if (!item.imagem_url || imageErrors[item.id]) return null;

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => setFullScreenImage(item.imagem_url || null)}
        style={[mode === 'card' ? styles.cardImageWrap : styles.modalImageWrap, { backgroundColor: surfaceAlt }]}
      >
        <Image
          source={{ uri: item.imagem_url }}
          style={mode === 'card' ? styles.cardImage : styles.modalImage}
          resizeMode="contain"
          onError={() => setImageErrors((prev) => ({ ...prev, [item.id]: true }))}
        />

        <View style={styles.expandImagePill}>
          <ImageIcon size={13} color="#FFFFFF" />
          <Text style={styles.expandImageText}>{muralText('expand', language)}</Text>
        </View>
      </TouchableOpacity>
    );
  };


  const renderRichContent = (html: string, mode: 'card' | 'modal') => {
    const blocks = parseRichBlocks(html);

    if (__DEV__ && mode === 'modal') {
      mediaSpy('parsed-blocks', blocks.map((block) => ({
        type: block.type,
        text: block.text,
        url: block.url,
      })));
    }

    const previewBlocks = mode === 'card' ? blocks.slice(0, 7) : blocks;
    let orderedIndex = 0;

    const inlineExtraStyles = {
      underline: styles.richUnderline,
      strike: styles.richStrike,
      inlineCode: [
        styles.richInlineCode,
        {
          color: textPrimary,
          backgroundColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.08)',
        },
      ],
    };

    return (
      <View style={mode === 'card' ? styles.richPreview : styles.richContent}>
        {previewBlocks.map((block, index) => {
          if (block.type === 'divider') {
            return <View key={index} style={[styles.richDivider, { backgroundColor: border }]} />;
          }

          if (block.type === 'image') {
            const imageUrl = block.url || block.text;

            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.92}
                onPress={() => setFullScreenImage(imageUrl || null)}
                style={[mode === 'card' ? styles.inlineImageWrapCard : styles.inlineImageWrapModal, { backgroundColor: surfaceAlt }]}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.inlineImage}
                  resizeMode="contain"
                  onError={() => {}}
                />

                <View style={styles.expandImagePill}>
                  <ImageIcon size={13} color="#FFFFFF" />
                  <Text style={styles.expandImageText}>{muralText('expand', language)}</Text>
                </View>
              </TouchableOpacity>
            );
          }

          if (block.type === 'file' || block.type === 'link' || block.type === 'video' || block.type === 'audio') {
            const isVideo = block.type === 'video';
            const isAudio = block.type === 'audio';
            const AttachmentIcon = isVideo ? PlayCircle : isAudio ? Music : block.type === 'file' ? FileText : ExternalLink;

            return (
              <TouchableOpacity
                key={index}
                style={[styles.attachmentCard, { backgroundColor: surfaceAlt, borderColor: border }]}
                activeOpacity={0.85}
                onPress={() => openExternalUrl(block.url)}
              >
                <View style={[styles.attachmentIcon, { backgroundColor: `${accent}18` }]}>
                  <AttachmentIcon size={18} color={accent} />
                </View>

                <View style={styles.attachmentTextBox}>
                  <Text style={[styles.attachmentTitle, { color: textPrimary }]} numberOfLines={1}>
                    {block.text || getUrlFileName(block.url || '')}
                  </Text>
                  <Text style={[styles.attachmentSubtitle, { color: textSecondary }]} numberOfLines={1}>
                    {isVideo ? 'Abrir vídeo' : isAudio ? 'Abrir áudio' : block.type === 'file' ? 'Abrir arquivo' : 'Abrir link'}
                  </Text>
                </View>

                <ExternalLink size={16} color={textSecondary} />
              </TouchableOpacity>
            );
          }

          if (block.type === 'h1') {
            return (
              <Text key={index} style={[styles.richH1, { color: textPrimary }]} numberOfLines={mode === 'card' ? 2 : undefined}>
                {block.text}
              </Text>
            );
          }

          if (block.type === 'h2') {
            return (
              <Text key={index} style={[styles.richH2, { color: textPrimary }]} numberOfLines={mode === 'card' ? 2 : undefined}>
                {block.text}
              </Text>
            );
          }

          if (block.type === 'h3') {
            return (
              <Text key={index} style={[styles.richH3, { color: textPrimary }]} numberOfLines={mode === 'card' ? 2 : undefined}>
                {block.text}
              </Text>
            );
          }

          if (block.type === 'quote') {
            return (
              <View key={index} style={[styles.richQuote, { backgroundColor: surfaceAlt, borderLeftColor: accent }]}>
                {renderInlineText(
                  block.text,
                  [styles.richQuoteText, { color: textPrimary }],
                  styles.richStrong,
                  styles.richItalic,
                  inlineExtraStyles
                )}
              </View>
            );
          }

          if (block.type === 'code') {
            return (
              <View key={index} style={styles.richCodeBlock}>
                <Text style={styles.richCodeText}>{block.text}</Text>
              </View>
            );
          }

          if (block.type === 'table') {
            return (
              <ScrollView key={index} horizontal showsHorizontalScrollIndicator={false} style={styles.richTableScroll}>
                <View style={[styles.richTable, { borderColor: border }]}>
                  {(block.rows || []).map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.richTableRow}>
                      {row.map((cell, cellIndex) => (
                        <View
                          key={cellIndex}
                          style={[
                            styles.richTableCell,
                            {
                              borderColor: border,
                              backgroundColor:
                                rowIndex === 0
                                  ? isDark
                                    ? 'rgba(148,163,184,0.16)'
                                    : 'rgba(15,23,42,0.06)'
                                  : 'transparent',
                            },
                          ]}
                        >
                          <Text style={[styles.richTableText, { color: textPrimary, fontWeight: rowIndex === 0 ? '900' : '600' }]}>
                            {cell}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          }

          if (block.type === 'ul' || block.type === 'ol' || block.type === 'check') {
            if (block.type === 'ol') orderedIndex += 1;

            const marker = block.type === 'check' ? (block.checked ? '✓' : '□') : block.type === 'ol' ? `${orderedIndex}.` : '•';

            return (
              <View key={index} style={styles.richListItem}>
                <Text style={[styles.richBullet, { color: block.type === 'check' && block.checked ? '#10B981' : accent }]}>
                  {marker}
                </Text>

                <Text style={[styles.richListText, { color: mode === 'card' ? textSecondary : textPrimary }]}>
                  {block.text}
                </Text>
              </View>
            );
          }

          return (
            <View key={index} style={styles.richParagraphWrap}>
              {renderInlineText(
                block.text,
                [styles.richParagraph, { color: mode === 'card' ? textSecondary : textPrimary }],
                styles.richStrong,
                styles.richItalic,
                inlineExtraStyles
              )}
            </View>
          );
        })}

        {mode === 'card' && blocks.length > previewBlocks.length ? (
          <Text style={[styles.richMoreText, { color: accent }]}>{muralText('continueReading', language)}</Text>
        ) : null}
      </View>
    );
  };

  const renderItem = ({ item }: { item: MuralItem }) => {
    const priority = getPriorityConfig(item.prioridade, isDark, language);
    const PriorityIcon = priority.Icon;
    const content = stripHtml(item.conteudo);

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: surface, borderColor: border, borderLeftColor: priority.color }]}
        activeOpacity={0.86}
        onPress={() => {
          mediaSpy('open-item', {
            id: item.id,
            titulo: item.titulo,
            imagem_url: item.imagem_url,
            conteudo: item.conteudo,
            rawKeys: Object.keys(item.raw || {}),
            raw: item.raw,
          });

          markAsRead(item);
          setSelected(item);
        }}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: priority.bg }]}>
            <PriorityIcon size={13} color={priority.color} />
            <Text style={[styles.priorityText, { color: priority.color }]}>{priority.label}</Text>
          </View>

          {item.imagem_url && !imageErrors[item.id] ? (
            <View style={[styles.imageBadge, { backgroundColor: surfaceAlt, borderColor: border }]}>
              <ImageIcon size={13} color={textSecondary} />
              <Text style={[styles.imageBadgeText, { color: textSecondary }]}>{muralText('image', language)}</Text>
            </View>
          ) : !readIds.has(item.id) ? (
            <View style={[styles.newBadge, { backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.10)' }]}>
              <Text style={styles.newBadgeText}>{muralText('new', language)}</Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.cardTitle, { color: textPrimary }]} numberOfLines={2}>
          {item.titulo}
        </Text>

        {content ? (
          renderRichContent(item.conteudo, 'card')
        ) : (
          <Text style={[styles.cardContent, { color: textSecondary }]}>
            {muralText('emptyContentAdditional', language)}
          </Text>
        )}

        <View style={[styles.cardFooter, { borderTopColor: border }]}>
          <View style={styles.metaItem}>
            <Clock size={13} color={textSecondary} />
            <Text style={[styles.metaText, { color: textSecondary }]}>
              {formatDateTime(item.data_publicacao, language) || muralText('dateNotInformed', language)}
            </Text>
          </View>

          <Text style={[styles.openText, { color: accent }]}>{muralText('read', language)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const selectedPriority = selected ? getPriorityConfig(selected.prioridade, isDark, language) : null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
        <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={[styles.loadingText, { color: textSecondary }]}>{muralText('loading', language)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={statusBarStyle} backgroundColor={statusBarBg} translucent={false} />
      <View style={[styles.statusBarBoundary, { height: Math.max(insets.top, 0), backgroundColor: statusBarBg }]} />

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={Math.max(insets.top, 0) + 80}
            colors={[accent]}
            tintColor={accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={[styles.emptyIcon, { backgroundColor: surface, borderColor: border }]}>
              <Inbox size={38} color={textSecondary} />
            </View>
            <Text style={[styles.emptyTitle, { color: textPrimary }]}>{muralText('emptyTitle', language)}</Text>
            <Text style={[styles.emptyText, { color: textSecondary }]}>
              {muralText('emptyText', language)}
            </Text>
          </View>
        }
      />

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: surface,
                paddingTop: Math.max(insets.top + 18, 44),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: border }]}>
              <View style={styles.modalHeaderLeft}>
                <Megaphone size={20} color={accent} />
                <Text style={[styles.modalHeaderLabel, { color: accent }]}>{muralText('officialAnnouncement', language)}</Text>
              </View>

              <TouchableOpacity style={[styles.closeButton, { backgroundColor: surfaceAlt }]} onPress={() => setSelected(null)}>
                <X size={22} color={textSecondary} />
              </TouchableOpacity>
            </View>

            {selected && (
              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                {selectedPriority ? (
                  <View style={[styles.modalPriority, { backgroundColor: selectedPriority.bg }]}>
                    <selectedPriority.Icon size={15} color={selectedPriority.color} />
                    <Text style={[styles.modalPriorityText, { color: selectedPriority.color }]}>
                      {selectedPriority.label}
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.modalTitle, { color: textPrimary }]}>{selected.titulo}</Text>

                  <View style={styles.modalMetaGrid}>
                  <View style={[styles.modalMetaBox, { backgroundColor: surfaceAlt, borderColor: border }]}>
                    <Clock size={15} color={textSecondary} />
                    <Text style={[styles.modalMetaLabel, { color: textSecondary }]}>{muralText('published', language)}</Text>
                    <Text style={[styles.modalMetaValue, { color: textPrimary }]}>
                      {formatDate(selected.data_publicacao, language) || muralText('notInformed', language)}
                    </Text>
                  </View>

                  <View style={[styles.modalMetaBox, { backgroundColor: surfaceAlt, borderColor: border }]}>
                    <CalendarDays size={15} color={textSecondary} />
                    <Text style={[styles.modalMetaLabel, { color: textSecondary }]}>{muralText('validity', language)}</Text>
                    <Text style={[styles.modalMetaValue, { color: textPrimary }]}>
                      {formatDate(selected.data_validade, language) || muralText('noValidity', language)}
                    </Text>
                  </View>
                </View>

                <View style={[styles.bodyBox, { backgroundColor: surfaceAlt, borderColor: border }]}>
                  {stripHtml(selected.conteudo) ? (
                    renderRichContent(selected.conteudo, 'modal')
                  ) : (
                    <Text style={[styles.bodyText, { color: textPrimary }]}>
                      {muralText('emptyContent', language)}
                    </Text>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!fullScreenImage}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenImage(null)}
      >
        <View style={styles.fullscreenOverlay}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullScreenImage(null)}
            activeOpacity={0.8}
          >
            <X size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {fullScreenImage ? (
            <Image
              source={{ uri: fullScreenImage }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}

          <Text style={styles.fullscreenHint}>{muralText('fullscreenHint', language)}</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBarBoundary: { width: '100%' },
  listContent: { paddingBottom: 120 },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 14, fontSize: 14, fontWeight: '700' },

  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, borderBottomWidth: 1 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerIconButton: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center' },
  heroIcon: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  pageTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.7 },
  pageSubtitle: { fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  offlinePill: { marginTop: 18, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  offlineText: { fontSize: 11, fontWeight: '800' },

  filtersWrapper: { paddingHorizontal: 20, paddingTop: 14, zIndex: 10 },
  filtersCard: { flexDirection: 'row', gap: 8, padding: 8, borderWidth: 1, borderRadius: 22, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },
  filterChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderRadius: 16 },
  filterText: { fontSize: 12, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, marginTop: 28, marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.1, textTransform: 'uppercase' },

  card: { marginHorizontal: 20, marginBottom: 16, borderRadius: 24, borderWidth: 1, borderLeftWidth: 5, padding: 18, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  priorityBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  priorityText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  imageBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  imageBadgeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  newBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  newBadgeText: { color: '#10B981', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },

  cardImageWrap: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  modalImageWrap: {
    width: '100%',
    height: Math.min(SCREEN_WIDTH * 1.12, 430),
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  inlineImageWrapCard: {
    width: '100%',
    height: Math.min(SCREEN_WIDTH * 0.52, 260),
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineImageWrapModal: {
    width: '100%',
    height: Math.min(SCREEN_WIDTH * 1.05, 420),
    borderRadius: 22,
    overflow: 'hidden',
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineImage: {
    width: '100%',
    height: '100%',
  },
  attachmentCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachmentIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentTextBox: {
    flex: 1,
    minWidth: 0,
  },
  attachmentTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  attachmentSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  expandImagePill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  expandImageText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  cardTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.4, marginBottom: 9 },
  cardContent: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  cardFooter: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  metaText: { fontSize: 12, fontWeight: '800' },
  openText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },

  emptyBox: { alignItems: 'center', paddingHorizontal: 42, marginTop: 55 },
  emptyIcon: { width: 82, height: 82, borderRadius: 41, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginBottom: 6 },
  emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 21 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.44)' },
  modalCard: { flex: 1, marginTop: 22, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  modalHeader: { paddingHorizontal: 22, paddingBottom: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalHeaderLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  closeButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: 22, paddingBottom: 44 },
  modalPriority: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginBottom: 14 },
  modalPriorityText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  modalTitle: { fontSize: 27, fontWeight: '900', lineHeight: 32, letterSpacing: -0.6, marginBottom: 18 },
  modalMetaGrid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  modalMetaBox: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 13 },
  modalMetaLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginTop: 8 },
  modalMetaValue: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  bodyBox: { borderWidth: 1, borderRadius: 22, padding: 18 },
  bodyText: { fontSize: 16, lineHeight: 25, fontWeight: '500' },

  richPreview: { gap: 7 },
  richContent: { gap: 10 },
  richH1: { fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: -0.6, marginBottom: 4 },
  richH2: { fontSize: 21, lineHeight: 27, fontWeight: '900', letterSpacing: -0.4, marginBottom: 2 },
  richH3: { fontSize: 17, lineHeight: 23, fontWeight: '900', marginBottom: 1 },
  richParagraphWrap: { marginBottom: 2 },
  richParagraph: { fontSize: 15, lineHeight: 23, fontWeight: '500' },
  richStrong: { fontWeight: '900' },
  richItalic: { fontStyle: 'italic' },
  richUnderline: { textDecorationLine: 'underline' },
  richStrike: { textDecorationLine: 'line-through' },
  richInlineCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  richQuote: { borderLeftWidth: 4, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, marginVertical: 4 },
  richQuoteText: { fontSize: 15, lineHeight: 23, fontWeight: '700', fontStyle: 'italic' },
  richListItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 4, paddingRight: 2 },
  richBullet: { minWidth: 22, fontSize: 16, lineHeight: 23, fontWeight: '900', textAlign: 'center' },
  richListText: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 23, fontWeight: '500' },
  richCheckBox: {
    width: 19,
    height: 19,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  richCheckMark: { fontSize: 12, fontWeight: '900', lineHeight: 14 },
  richDivider: { height: 1, width: '100%', marginVertical: 10 },
  richMoreText: { marginTop: 4, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  richCodeBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
  },
  richCodeText: {
    color: '#E2E8F0',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  richTableScroll: { marginVertical: 8 },
  richTable: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  richTableRow: { flexDirection: 'row' },
  richTableCell: {
    minWidth: 120,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  richTableText: { fontSize: 12, lineHeight: 17 },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  fullscreenClose: {
    position: 'absolute',
    top: 54,
    right: 22,
    zIndex: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '82%',
  },
  fullscreenHint: {
    position: 'absolute',
    bottom: 34,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
  },
});
