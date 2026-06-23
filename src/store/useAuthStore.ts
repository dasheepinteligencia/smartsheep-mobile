import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface User {
  id: string;
  nome: string;
  email: string;
  roleName?: string;
  perfil?: string;

  // Campos de projeto para suportar a arquitetura do backend
  allowed_project_ids?: string[];
  projectId?: string;
  projeto_id?: string;
  project_id?: string;

  custom_data?: {
    mobile_access?: boolean;
    perfect_store_score?: number;
    [key: string]: any;
  };

  customData?: {
    mobile_access?: boolean;
    perfect_store_score?: number;
    [key: string]: any;
  };

  [key: string]: any;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  loadStorageData: () => Promise<void>;
}

// ============================================================================
// 🔐 Chaves de armazenamento
// ============================================================================
// Mantemos compatibilidade com os nomes antigos usados no app/API.
const STORAGE_KEYS = {
  TOKEN: 'DasheepToken',
  USER: 'DasheepUser',

  // Marca local criada por esta versão do app.
  // Se não existir, tratamos como primeira abertura da nova build e limpamos sessão antiga.
  INSTALL_MARKER: 'DasheepInstallMarker_v1',

  // Legado / compatibilidade com api.ts antigo
  LEGACY_TOKEN: 'ColetaToken',
  LEGACY_USER: 'ColetaUser',
};

const safeParseJson = (value: any): any => {
  if (!value) return {};
  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return {};
};

const normalizeUser = (user: User): User => {
  const parsedCustomData = safeParseJson(user?.custom_data ?? user?.customData);

  return {
    ...user,
    custom_data: parsedCustomData,
    customData: parsedCustomData,
  };
};

const clearStoredAuthData = async () => {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(STORAGE_KEYS.TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_TOKEN),
    SecureStore.deleteItemAsync(STORAGE_KEYS.USER),
    SecureStore.deleteItemAsync(STORAGE_KEYS.LEGACY_USER),
    AsyncStorage.removeItem(STORAGE_KEYS.USER),
    AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_USER),
  ]);
};

const getStoredToken = async (): Promise<string | null> => {
  const mainToken = await SecureStore.getItemAsync(STORAGE_KEYS.TOKEN);

  if (mainToken && mainToken !== 'null' && mainToken !== 'undefined') {
    return mainToken;
  }

  const legacyToken = await SecureStore.getItemAsync(STORAGE_KEYS.LEGACY_TOKEN);

  if (legacyToken && legacyToken !== 'null' && legacyToken !== 'undefined') {
    return legacyToken;
  }

  return null;
};

const getStoredUser = async (): Promise<User | null> => {
  const mainUser = await AsyncStorage.getItem(STORAGE_KEYS.USER);
  const legacyUser = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_USER);
  const userJson = mainUser || legacyUser;

  if (!userJson || userJson === 'null' || userJson === 'undefined') {
    return null;
  }

  try {
    return normalizeUser(JSON.parse(userJson));
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,

  login: async (token, user) => {
    const normalizedUser = normalizeUser(user);

    // Salva no padrão novo
    await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(normalizedUser));

    // Salva também no padrão legado, porque o api.ts e alguns services antigos
    // podem buscar por estas chaves.
    await SecureStore.setItemAsync(STORAGE_KEYS.LEGACY_TOKEN, token);
    await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_USER, JSON.stringify(normalizedUser));

    set({ token, user: normalizedUser });
  },

  logout: async () => {
    await clearStoredAuthData();

    set({ token: null, user: null });
  },

  loadStorageData: async () => {
    const installMarker = await AsyncStorage.getItem(STORAGE_KEYS.INSTALL_MARKER);

    if (!installMarker) {
      await clearStoredAuthData();
      await AsyncStorage.setItem(STORAGE_KEYS.INSTALL_MARKER, String(Date.now()));
      set({ token: null, user: null });
      return;
    }

    const [token, user] = await Promise.all([
      getStoredToken(),
      getStoredUser(),
    ]);

    if (token && user) {
      // Regrava nos dois padrões para auto-curar instalações antigas.
      await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      await SecureStore.setItemAsync(STORAGE_KEYS.LEGACY_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_USER, JSON.stringify(user));

      set({ token, user });
    } else {
      set({ token: null, user: null });
    }
  },
}));
