import { useMemo } from 'react';

import {
  DEFAULT_ACCENT_COLOR,
  Theme,
  useSettingsStore,
} from '../store/useSettingsStore';

export const getContrastTextColor = (hex: string) => {
  const clean = String(hex || '').replace('#', '');

  if (clean.length !== 6) return '#ffffff';

  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  // YIQ: fundo claro recebe texto escuro; fundo escuro recebe texto claro.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  return yiq >= 150 ? '#0f172a' : '#ffffff';
};

export const normalizeAccentColor = (color?: string | null) => {
  const value = String(color || '').trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;

  return DEFAULT_ACCENT_COLOR;
};

export const appColorOptions = [
  { id: 'orange', label: 'Laranja', value: '#FF7A00' },
  { id: 'blue', label: 'Azul', value: '#2563EB' },
  { id: 'green', label: 'Verde', value: '#16A34A' },
  { id: 'purple', label: 'Roxo', value: '#7C3AED' },
  { id: 'pink', label: 'Rosa', value: '#DB2777' },
  { id: 'red', label: 'Vermelho', value: '#DC2626' },
  { id: 'cyan', label: 'Ciano', value: '#0891B2' },
  { id: 'graphite', label: 'Grafite', value: '#334155' },
  { id: 'yellow', label: 'Amarelo', value: '#FACC15' },
];

export const getAppTheme = (mode: Theme = 'dark', accentColor: string = DEFAULT_ACCENT_COLOR) => {
  const isDark = mode === 'dark';
  const primary = normalizeAccentColor(accentColor);
  const primaryText = getContrastTextColor(primary);

  return {
    colors: {
      primary,
      primaryText,

      secondary: isDark ? '#0f172a' : '#0f172a',
      background: isDark ? '#020617' : '#f8fafc',
      surface: isDark ? '#0f172a' : '#ffffff',
      surfaceAlt: isDark ? '#111827' : '#f1f5f9',

      text: {
        main: isDark ? '#f8fafc' : '#0f172a',
        light: isDark ? '#94a3b8' : '#64748b',
        muted: isDark ? '#64748b' : '#94a3b8',
        white: '#ffffff',
        onPrimary: primaryText,
      },

      status: {
        online: '#10b981',
        success: '#22c55e',
        offline: '#f59e0b',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
      },

      border: isDark ? '#1e293b' : '#e2e8f0',
      overlay: 'rgba(2,6,23,0.68)',
    },

    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      xxl: 40,
    },

    radius: {
      sm: 8,
      md: 12,
      lg: 20,
      xl: 32,
      full: 999,
    },
  };
};

// Compatibilidade com telas antigas que importam { theme }.
// Mantém a exportação original, mas agora usa a cor padrão.
export const theme = getAppTheme('light', DEFAULT_ACCENT_COLOR);

// Hook novo para telas migradas.
// Use assim:
// const appTheme = useTheme();
// appTheme.colors.primary
export const useTheme = () => {
  const mode = useSettingsStore((state) => state.theme);
  const accentColor = useSettingsStore((state) => state.accentColor);

  return useMemo(() => getAppTheme(mode, accentColor), [mode, accentColor]);
};
