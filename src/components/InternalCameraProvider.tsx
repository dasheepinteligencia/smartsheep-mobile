import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  CameraView,
  useCameraPermissions,
} from 'expo-camera';


export type InternalCameraPhoto = {
  uri: string;
  width?: number;
  height?: number;
  exif?: any;
};


type CaptureOptions = {
  quality?: number;
};


type InternalCameraContextValue = {
  capturePhoto:
    (
      options?: CaptureOptions
    ) => Promise<InternalCameraPhoto | null>;
};


const InternalCameraContext =
  createContext<InternalCameraContextValue | null>(
    null
  );


export const useInternalCamera = () => {
  const value =
    useContext(
      InternalCameraContext
    );

  if (!value) {
    throw new Error(
      'InternalCameraProvider não encontrado.'
    );
  }

  return value;
};


export function InternalCameraProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    permission,
    requestPermission,
  ] =
    useCameraPermissions();

  const cameraRef =
    useRef<any>(null);

  const resolverRef =
    useRef<
      (
        value:
          InternalCameraPhoto |
          null
      ) => void
    >(
      () => {}
    );

  const pendingRef =
    useRef(false);

  const [visible, setVisible] =
    useState(false);

  const [ready, setReady] =
    useState(false);

  const [capturing, setCapturing] =
    useState(false);

  const [facing, setFacing] =
    useState<'back' | 'front'>(
      'back'
    );

  const [quality, setQuality] =
    useState(0.75);


  const finish =
    useCallback(
      (
        result:
          InternalCameraPhoto |
          null
      ) => {
        if (!pendingRef.current) {
          return;
        }

        pendingRef.current =
          false;

        const resolve =
          resolverRef.current;

        resolverRef.current =
          () => {};

        setVisible(false);
        setReady(false);
        setCapturing(false);

        resolve(result);
      },
      []
    );


  const capturePhoto =
    useCallback(
      async (
        options?: CaptureOptions
      ): Promise<
        InternalCameraPhoto |
        null
      > => {
        /*
         * MOBILE_INTERNAL_CAMERA_V1
         *
         * Uma captura por vez.
         */
        if (
          pendingRef.current
        ) {
          return null;
        }

        let granted =
          permission?.granted ===
          true;

        if (!granted) {
          try {
            const requested =
              await requestPermission();

            granted =
              requested?.granted ===
              true;
          } catch {
            granted = false;
          }
        }

        if (!granted) {
          return null;
        }

        setQuality(
          Math.max(
            0,
            Math.min(
              1,
              Number(
                options?.quality ??
                0.75
              )
            )
          )
        );

        setFacing('back');
        setReady(false);
        setCapturing(false);

        pendingRef.current =
          true;

        return await new Promise<
          InternalCameraPhoto |
          null
        >(
          (resolve) => {
            resolverRef.current =
              resolve;

            setVisible(true);
          }
        );
      },
      [
        permission?.granted,
        requestPermission,
      ]
    );


  const takePicture =
    useCallback(
      async () => {
        if (
          capturing ||
          !ready ||
          !cameraRef.current
        ) {
          return;
        }

        setCapturing(true);

        try {
          const result =
            await cameraRef.current
              .takePictureAsync({
                quality,
                base64: false,
                exif: true,
                skipProcessing: false,
              });

          if (
            !result?.uri
          ) {
            finish(null);
            return;
          }

          finish({
            uri:
              result.uri,

            width:
              result.width,

            height:
              result.height,

            exif:
              result.exif,
          });
        } catch (error) {
          console.log(
            '[INTERNAL CAMERA] Falha na captura:',
            error
          );

          finish(null);
        }
      },
      [
        capturing,
        ready,
        quality,
        finish,
      ]
    );


  const toggleFacing =
    useCallback(
      () => {
        if (capturing) {
          return;
        }

        setFacing(
          current =>
            current === 'back'
              ? 'front'
              : 'back'
        );
      },
      [capturing]
    );


  return (
    <InternalCameraContext.Provider
      value={{
        capturePhoto,
      }}
    >
      {children}

      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() =>
          finish(null)
        }
      >
        <View
          style={
            styles.container
          }
        >
          <CameraView
            ref={cameraRef}
            style={
              StyleSheet.absoluteFill
            }
            facing={facing}
            onCameraReady={() =>
              setReady(true)
            }
          />

          <SafeAreaView
            style={
              styles.overlay
            }
          >
            <View
              style={
                styles.topBar
              }
            >
              <Pressable
                style={
                  styles.actionButton
                }
                disabled={capturing}
                onPress={() =>
                  finish(null)
                }
              >
                <Text
                  style={
                    styles.actionText
                  }
                >
                  Cancelar
                </Text>
              </Pressable>

              <Pressable
                style={
                  styles.actionButton
                }
                disabled={capturing}
                onPress={
                  toggleFacing
                }
              >
                <Text
                  style={
                    styles.actionText
                  }
                >
                  {facing === 'back'
                    ? 'Frontal'
                    : 'Traseira'}
                </Text>
              </Pressable>
            </View>

            <View
              style={
                styles.bottomBar
              }
            >
              <Pressable
                accessibilityLabel="Tirar foto"
                disabled={
                  !ready ||
                  capturing
                }
                onPress={
                  takePicture
                }
                style={[
                  styles.shutterOuter,
                  (
                    !ready ||
                    capturing
                  ) &&
                    styles.shutterDisabled,
                ]}
              >
                <View
                  style={
                    styles.shutterInner
                  }
                />
              </Pressable>

              {capturing && (
                <View
                  style={
                    styles.loading
                  }
                >
                  <ActivityIndicator
                    size="small"
                  />

                  <Text
                    style={
                      styles.loadingText
                    }
                  >
                    Salvando foto...
                  </Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </InternalCameraContext.Provider>
  );
}


const styles =
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor:
        '#000000',
    },

    overlay: {
      flex: 1,
      justifyContent:
        'space-between',
    },

    topBar: {
      flexDirection:
        'row',
      justifyContent:
        'space-between',
      paddingHorizontal: 18,
      paddingTop: 10,
    },

    actionButton: {
      backgroundColor:
        'rgba(0,0,0,0.58)',
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 22,
    },

    actionText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },

    bottomBar: {
      minHeight: 150,
      alignItems:
        'center',
      justifyContent:
        'center',
      paddingBottom: 22,
    },

    shutterOuter: {
      width: 82,
      height: 82,
      borderRadius: 41,
      borderWidth: 5,
      borderColor:
        '#FFFFFF',
      alignItems:
        'center',
      justifyContent:
        'center',
      backgroundColor:
        'rgba(0,0,0,0.18)',
    },

    shutterInner: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor:
        '#FFFFFF',
    },

    shutterDisabled: {
      opacity: 0.45,
    },

    loading: {
      position:
        'absolute',
      bottom: 8,
      flexDirection:
        'row',
      alignItems:
        'center',
      gap: 8,
      backgroundColor:
        'rgba(0,0,0,0.58)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
    },

    loadingText: {
      color:
        '#FFFFFF',
      fontSize: 12,
    },
  });
