import * as Location from 'expo-location';

export interface LocationResult {
    latitude?: number;
    longitude?: number;
    isFallback?: boolean;
    timestamp?: number;
    error?: string | null;
}

/**
 * 📍 Calcula a distância em metros entre dois pontos de GPS usando a Fórmula de Haversine
 */
export const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c); // Retorna em metros inteiros
};

/**
 * 🚀 Tenta pegar o GPS de alta precisão. Se demorar mais de 10s, usa o último conhecido.
 */
export const getSmartLocation = async (): Promise<LocationResult> => {
    try {
        // 1. Checagem de Permissão
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            return { error: 'PERMISSION_DENIED' };
        }

        // 2. Corrida contra o tempo (10 segundos)
        const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 10000)
        );

        try {
            // Espera quem terminar primeiro: a busca do GPS ou o relógio de 10s
            const location: any = await Promise.race([locationPromise, timeoutPromise]);
            
            // 🚨 Trava de Segurança: Fake GPS Detectado
            if (location.mocked) {
                return { error: 'FAKE_GPS' }; 
            }

            return {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                isFallback: false,
                timestamp: location.timestamp
            };

        } catch (err: any) {
            // 3. Fallback: Se deu Timeout (falta de sinal no teto de metal)
            if (err.message === 'TIMEOUT') {
                const lastKnown = await Location.getLastKnownPositionAsync({
                    maxAge: 1000 * 60 * 30 // Aceita posições de até 30 minutos atrás
                });

                if (lastKnown) {
                    if (lastKnown.mocked) return { error: 'FAKE_GPS' };
                    
                    return {
                        latitude: lastKnown.coords.latitude,
                        longitude: lastKnown.coords.longitude,
                        isFallback: true, // Flag para a UI saber e avisar a Maria
                        timestamp: lastKnown.timestamp
                    };
                }
                
                return { error: 'NO_SIGNAL' };
            }
            
            throw err;
        }

    } catch (error) {
        console.error("❌ [GPS Engine] Erro fatal:", error);
        return { error: 'FATAL_ERROR' };
    }
};