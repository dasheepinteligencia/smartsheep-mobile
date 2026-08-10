import * as Location from 'expo-location';

export interface LocationResult {
    latitude?: number;
    longitude?: number;
    isFallback?: boolean;
    timestamp?: number;
    error?: string | null;
}

export type AppGpsStatus = 'denied' | 'disabled' | 'enabled' | 'unknown';

export const getAppGpsStatus = async (): Promise<AppGpsStatus> => {
    try {
        const permission = await Location.getForegroundPermissionsAsync();

        if (permission.status !== 'granted') {
            return 'denied';
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();

        if (!servicesEnabled) {
            return 'disabled';
        }

        return 'enabled';
    } catch {
        return 'unknown';
    }
};

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

// FAST_PHOTO_LOCATION_V2
//
// GPS específico para evidência fotográfica.
//
// Prioridade:
// 1. última posição válida <= 5 minutos;
// 2. posição atual em alta precisão;
// 3. timeout máximo de 4 segundos.
//
// Fake GPS continua bloqueado.
//
export const getFastPhotoLocation =
    async (): Promise<LocationResult> => {

        const MAX_AGE_MS =
            5 * 60 * 1000;

        const getRecent =
            async (): Promise<LocationResult | null> => {
                try {
                    const lastKnown: any =
                        await Location
                            .getLastKnownPositionAsync({
                                maxAge:
                                    MAX_AGE_MS
                            });

                    if (!lastKnown) {
                        return null;
                    }

                    if (lastKnown.mocked) {
                        return {
                            error:
                                'FAKE_GPS'
                        };
                    }

                    const timestamp =
                        Number(
                            lastKnown.timestamp ||
                            0
                        );

                    if (
                        !timestamp ||
                        Date.now() - timestamp >
                            MAX_AGE_MS
                    ) {
                        return null;
                    }

                    return {
                        latitude:
                            lastKnown.coords.latitude,

                        longitude:
                            lastKnown.coords.longitude,

                        isFallback:
                            true,

                        timestamp:
                            lastKnown.timestamp
                    };

                } catch {
                    return null;
                }
            };

        try {
            const permission =
                await Location
                    .getForegroundPermissionsAsync();

            let status =
                permission.status;

            if (status === 'undetermined') {
                const requested =
                    await Location
                        .requestForegroundPermissionsAsync();

                status =
                    requested.status;
            }

            if (status !== 'granted') {
                return {
                    error:
                        'PERMISSION_DENIED'
                };
            }

            const servicesEnabled =
                await Location
                    .hasServicesEnabledAsync();

            if (!servicesEnabled) {
                return {
                    error:
                        'GPS_DISABLED'
                };
            }

            /*
             * Normalmente já existe uma posição da sessão.
             * Nesse caso a resposta é praticamente imediata.
             */
            const recent =
                await getRecent();

            if (recent) {
                return recent;
            }

            try {
                const current: any =
                    await Promise.race([
                        Location
                            .getCurrentPositionAsync({
                                accuracy:
                                    Location.Accuracy.High
                            }),

                        new Promise(
                            (_, reject) =>
                                setTimeout(
                                    () =>
                                        reject(
                                            new Error(
                                                'PHOTO_GPS_TIMEOUT'
                                            )
                                        ),
                                    4000
                                )
                        )
                    ]);

                if (current?.mocked) {
                    return {
                        error:
                            'FAKE_GPS'
                    };
                }

                const latitude =
                    Number(
                        current?.coords?.latitude
                    );

                const longitude =
                    Number(
                        current?.coords?.longitude
                    );

                if (
                    Number.isFinite(latitude) &&
                    Number.isFinite(longitude)
                ) {
                    return {
                        latitude,
                        longitude,

                        isFallback:
                            false,

                        timestamp:
                            current.timestamp
                    };
                }

            } catch {
                /*
                 * A leitura pode ter atualizado o cache
                 * imediatamente antes do timeout.
                 */
                const refreshed =
                    await getRecent();

                if (refreshed) {
                    return refreshed;
                }
            }

            return {
                error:
                    'NO_SIGNAL'
            };

        } catch (error) {
            console.error(
                '[PHOTO GPS]',
                error
            );

            return {
                error:
                    'FATAL_ERROR'
            };
        }
    };

export const getSmartLocation = async (): Promise<LocationResult> => {
    // SMART_LOCATION_5MIN_FALLBACK_V1
    const FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;

    const getRecentLastKnown = async () => {
        try {
            const lastKnown: any =
                await Location.getLastKnownPositionAsync({
                    maxAge: FALLBACK_MAX_AGE_MS
                });

            if (!lastKnown) {
                return null;
            }

            if (lastKnown.mocked) {
                return { error: 'FAKE_GPS' };
            }

            const timestamp =
                Number(lastKnown.timestamp || 0);

            if (
                !timestamp ||
                Date.now() - timestamp >
                    FALLBACK_MAX_AGE_MS
            ) {
                return null;
            }

            return {
                latitude:
                    lastKnown.coords.latitude,
                longitude:
                    lastKnown.coords.longitude,
                isFallback: true,
                timestamp:
                    lastKnown.timestamp
            };
        } catch {
            return null;
        }
    };

    try {
        const currentPermission =
            await Location.getForegroundPermissionsAsync();

        let permissionStatus =
            currentPermission.status;

        if (
            permissionStatus ===
            'undetermined'
        ) {
            const requestedPermission =
                await Location
                    .requestForegroundPermissionsAsync();

            permissionStatus =
                requestedPermission.status;
        }

        if (
            permissionStatus !==
            'granted'
        ) {
            return {
                error:
                    'PERMISSION_DENIED'
            };
        }

        const servicesEnabled =
            await Location.hasServicesEnabledAsync();

        if (!servicesEnabled) {
            return {
                error:
                    'GPS_DISABLED'
            };
        }

        try {
            const locationPromise =
                Location.getCurrentPositionAsync({
                    accuracy:
                        Location.Accuracy.High
                });

            const timeoutPromise =
                new Promise((_, reject) =>
                    setTimeout(
                        () =>
                            reject(
                                new Error(
                                    'TIMEOUT'
                                )
                            ),
                        10000
                    )
                );

            const location: any =
                await Promise.race([
                    locationPromise,
                    timeoutPromise
                ]);

            if (location?.mocked) {
                return {
                    error:
                        'FAKE_GPS'
                };
            }

            if (
                Number.isFinite(
                    Number(
                        location?.coords
                            ?.latitude
                    )
                ) &&
                Number.isFinite(
                    Number(
                        location?.coords
                            ?.longitude
                    )
                )
            ) {
                return {
                    latitude:
                        location.coords
                            .latitude,
                    longitude:
                        location.coords
                            .longitude,
                    isFallback: false,
                    timestamp:
                        location.timestamp
                };
            }
        } catch {
            // Sem posição nova:
            // tenta a última posição válida.
        }

        const lastKnown =
            await getRecentLastKnown();

        if (
            lastKnown?.error ===
            'FAKE_GPS'
        ) {
            return {
                error:
                    'FAKE_GPS'
            };
        }

        if (
            lastKnown &&
            Number.isFinite(
                Number(
                    lastKnown.latitude
                )
            ) &&
            Number.isFinite(
                Number(
                    lastKnown.longitude
                )
            )
        ) {
            return lastKnown;
        }

        return {
            error:
                'NO_SIGNAL'
        };
    } catch (error) {
        console.error(
            "❌ [GPS Engine] Erro fatal:",
            error
        );

        return {
            error:
                'FATAL_ERROR'
        };
    }
};