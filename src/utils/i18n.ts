import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { useSettingsStore } from '../store/useSettingsStore';
import { ptBR } from './lang/pt';
import { enUS } from './lang/en';
import { esES } from './lang/es';

export type SupportedLanguage = 'pt-BR' | 'en-US' | 'es-ES';

const translations = {
  'pt-BR': ptBR,
  pt: ptBR,
  'en-US': enUS,
  en: enUS,
  'es-ES': esES,
  es: esES,
};

export const i18n = new I18n(translations);

const getDeviceLocale = (): SupportedLanguage => {
  const deviceLocale = getLocales()?.[0]?.languageTag || 'pt-BR';
  const normalized = deviceLocale.toLowerCase();

  if (normalized.startsWith('en')) return 'en-US';
  if (normalized.startsWith('es')) return 'es-ES';

  return 'pt-BR';
};

export const normalizeLanguage = (language?: string | null): SupportedLanguage => {
  const normalized = String(language || '').toLowerCase();

  if (normalized.startsWith('en')) return 'en-US';
  if (normalized.startsWith('es')) return 'es-ES';

  return 'pt-BR';
};

export const setI18nLocale = (language: SupportedLanguage) => {
  i18n.locale = normalizeLanguage(language);
};

i18n.enableFallback = true;
i18n.defaultLocale = 'pt-BR';

// Valor inicial: usa o idioma salvo no store; se não existir, cai para o idioma do aparelho.
setI18nLocale(useSettingsStore.getState().language || getDeviceLocale());

// Mantém o i18n-js sincronizado quando o usuário muda idioma em Configurações.
useSettingsStore.subscribe((state) => {
  setI18nLocale(state.language);
});

type Params = Record<string, string | number | null | undefined>;

export const t = (key: string, params?: Params) => {
  return i18n.t(key, params || {});
};

export const getCurrentLanguage = () => normalizeLanguage(i18n.locale);
