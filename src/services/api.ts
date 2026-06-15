import * as SecureStore from 'expo-secure-store';
import { DeviceEventEmitter } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { router } from 'expo-router'; 

// 🌐 Fallback de Servidores (Alta Disponibilidade)
const SERVERS = [
  'https://smartsheep.com.br',
  'http://129.121.49.172:4000', 
  'http://5.189.132.99:4000'    
];

export const readApiErrorBody = async (response: Response | null) => {
  if (!response) return {};

  try {
    const cloned = response.clone();
    const text = await cloned.text();

    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return {
        message: text,
        error: text,
        raw: text,
      };
    }
  } catch {
    return {};
  }
};

export const buildApiErrorMessage = (errorData: any, fallback = 'Erro na requisição') => {
  if (!errorData) return fallback;

  if (typeof errorData === 'string') return errorData || fallback;

  return (
    errorData.message ||
    errorData.error ||
    errorData.details ||
    errorData.detail ||
    errorData.raw ||
    fallback
  );
};

export const isStockInsufficientErrorData = (errorData: any) => {
  const raw = [
    errorData?.code,
    errorData?.message,
    errorData?.error,
    errorData?.details,
    errorData?.raw,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return raw.includes('stock_insufficient') || raw.includes('saldo insuficiente');
};

export const api = async (endpoint: string, options: RequestInit = {}) => {
  let cleanEndpoint = endpoint;
  if (!cleanEndpoint.startsWith('/')) cleanEndpoint = `/${cleanEndpoint}`;
  if (!cleanEndpoint.startsWith('/api')) cleanEndpoint = `/api${cleanEndpoint}`;

  const isLoginRoute = cleanEndpoint.includes('/login');

  // 🧠 ARQUITETURA ENTERPRISE: Leitura na velocidade da luz (Memória RAM via Zustand)
  // Isso garante que o globalSync() após o login nunca falhe por atraso de disco.
  const { token: memoryToken, user: memoryUser } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // 🛡️ Injeção de Segurança (Apenas se não for a rota de login)
  if (!isLoginRoute) {
      // Tenta pegar da memória primeiro. Se por algum motivo o app recarregou e a memória limpou,
      // buscamos do SecureStore de forma síncrona/esperada como fallback absoluto.
      const activeToken = memoryToken || await SecureStore.getItemAsync('ColetaToken');

      if (activeToken && activeToken !== 'null' && activeToken !== 'undefined') {
          headers['Authorization'] = `Bearer ${activeToken}`;
          // Enviamos também como sessionToken caso o backend antigo exija esse padrão
          headers['sessionToken'] = activeToken; 
      }

      const activeUserId = memoryUser?.id || (await getUserIdFromStorage());
      if (activeUserId) {
          headers['x-user-id'] = activeUserId;
      }
  }

  // 📡 Gestão Inteligente de Rotas (Smart Routing)
  const lastActiveServer = await SecureStore.getItemAsync('ActiveAPI');
  let serversToTry = [...SERVERS];

  if (lastActiveServer && serversToTry.includes(lastActiveServer)) {
      // Coloca o último servidor que funcionou no topo da fila
      serversToTry = [lastActiveServer, ...serversToTry.filter(s => s !== lastActiveServer)];
  }

  let lastError: any = null;

  for (const server of serversToTry) {
    const url = `${server}${cleanEndpoint}`;
    try {
      // ⏱️ Timeout de segurança: 15 segundos máximo por requisição
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, { 
          ...options, 
          headers, 
          signal: controller.signal as any 
      });

      clearTimeout(timeoutId);

      // Se achou um servidor que responde, salva ele como favorito para a próxima
      if (lastActiveServer !== server) {
        await SecureStore.setItemAsync('ActiveAPI', server);
      }

      // 🚫 Interceptador de Sessão Expirada (Proteção Total)
      if (response.status === 401 && !isLoginRoute) {
        console.warn(`🚫 [API] 401 em ${cleanEndpoint}. Disparando logout forçado de segurança.`);

        // 1. Limpa a memória RAM imediatamente
        useAuthStore.setState({ user: null, token: null });

        // 2. Apaga as credenciais do disco rígido do celular
        SecureStore.deleteItemAsync('ColetaToken').catch(() => {});
        SecureStore.deleteItemAsync('ColetaUser').catch(() => {});

        // 3. Emite o evento caso algum Toast/Modal queira mostrar "Sessão expirada"
        DeviceEventEmitter.emit('EXPIRED_SESSION');

        // 4. Chute na porta: força a rota de login por cima de tudo
        if (router && router.replace) {
            router.replace('/login');
        }
      }

      // Importante:
      // Mantemos o contrato antigo: a função continua retornando Response,
      // inclusive em 400/500, porque syncService lê status/body diretamente.
      // Mas anexamos metadados úteis no objeto para callers que queiram usar.
      if (!response.ok) {
        const errorData = await readApiErrorBody(response);
        (response as any).errorData = errorData;
        (response as any).errorMessage = buildApiErrorMessage(errorData);
        (response as any).errorCode = errorData?.code || null;
        (response as any).isStockInsufficient = isStockInsufficientErrorData(errorData);
      }

      return response;
    } catch (error: any) {
      lastError = error;
      // Se der erro de rede (caiu o 4G), ele tenta o próximo servidor do array
    }
  }

  // Se esgotou todas as tentativas e servidores, estouramos o erro para a fila offline gerenciar
  throw new Error(`Servidores indisponíveis. Último erro: ${lastError?.message}`);
};

// Função auxiliar para fallback de usuário do disco
const getUserIdFromStorage = async (): Promise<string | null> => {
    try {
        const storageUser = await SecureStore.getItemAsync('ColetaUser');
        if (storageUser) {
            const parsed = JSON.parse(storageUser);
            return parsed?.id || null;
        }
    } catch (e) {
        return null;
    }
    return null;
};
