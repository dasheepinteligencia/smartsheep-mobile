import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type Language = 'pt-BR' | 'en-US' | 'es-ES';

export const DEFAULT_THEME: Theme = 'dark';
export const DEFAULT_LANGUAGE: Language = 'pt-BR';
export const DEFAULT_ACCENT_COLOR = '#FF7A00';

interface SettingsState {
  theme: Theme;
  language: Language;
  accentColor: string;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;

  setLanguage: (language: Language) => void;

  setAccentColor: (color: string) => void;
  resetAccentColor: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
  accentColor: DEFAULT_ACCENT_COLOR,

  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light',
    })),

  setTheme: (theme) => set({ theme }),

  setLanguage: (language) => set({ language }),

  setAccentColor: (accentColor) => set({ accentColor }),

  resetAccentColor: () => set({ accentColor: DEFAULT_ACCENT_COLOR }),
}));
