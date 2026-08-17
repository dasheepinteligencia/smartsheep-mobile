// MOBILE_GLOBAL_APP_ALERT_V2

import React, {
  ReactNode,
  useEffect,
  useState,
} from 'react';

import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react-native';

import { t } from '../utils/i18n';

// MOBILE_GLOBAL_APP_ALERT_I18N_FINISH_V1


export type AppAlertButton = {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: 'default' | 'cancel' | 'destructive';
};


export type AppAlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};


type AlertState = {
  visible: boolean;
  title: string;
  message: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
};


type ShowAlert = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  options?: AppAlertOptions
) => void;


let showAlert: ShowAlert | null = null;


const normalize = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();


const visualType = (
  title: string,
  message: string
): 'success' | 'error' | 'warning' => {

  const value = normalize(`${title} ${message}`);

  if (
    value.includes('sucesso') ||
    value.includes('success') ||
    value.includes('exito') ||
    value.includes('salvo') ||
    value.includes('saved') ||
    value.includes('guardado') ||
    value.includes('finalizada') ||
    value.includes('completed') ||
    value.includes('correctamente')
  ) {
    return 'success';
  }

  if (
    value.includes('erro') ||
    value.includes('error') ||
    value.includes('falha') ||
    value.includes('failed') ||
    value.includes('nao foi possivel') ||
    value.includes('unable') ||
    value.includes('no se pudo') ||
    value.includes('no fue posible') ||
    value.includes('indisponivel') ||
    value.includes('unavailable') ||
    value.includes('no disponible')
  ) {
    return 'error';
  }

  return 'warning';
};


export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AppAlertButton[],
    options?: AppAlertOptions
  ) {
    if (!showAlert) {
      console.warn(
        '[AppAlert] Provider não montado:',
        title,
        message
      );
      return;
    }

    showAlert(
      String(title || ''),
      String(message || ''),
      buttons,
      options
    );
  },
};


export function AppAlertProvider({
  children,
}: {
  children: ReactNode;
}) {

  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [],
  });


  useEffect(() => {
    showAlert = (
      title,
      message = '',
      buttons = [],
      options
    ) => {
      setState({
        visible: true,
        title,
        message,
        buttons: Array.isArray(buttons) ? buttons : [],
        options,
      });
    };

    return () => {
      showAlert = null;
    };
  }, []);


  const type = visualType(
    state.title,
    state.message
  );

  const mainColor =
    type === 'success'
      ? '#10B981'
      : type === 'error'
        ? '#EF4444'
        : '#F59E0B';


  const okText =
    String(
      t('commonOk')
    );

  const buttons =
    state.buttons.length > 0
      ? state.buttons
      : [{ text: okText }];


  const closeAndRun = (
    button?: AppAlertButton
  ) => {
    setState(prev => ({
      ...prev,
      visible: false,
    }));

    if (!button?.onPress) return;

    setTimeout(() => {
      try {
        const result = button.onPress?.();

        if (
          result &&
          typeof (result as any).catch === 'function'
        ) {
          (result as Promise<void>).catch(error => {
            console.warn(
              '[AppAlert] callback:',
              error
            );
          });
        }
      } catch (error) {
        console.warn(
          '[AppAlert] callback:',
          error
        );
      }
    }, 50);
  };


  const requestClose = () => {
    const cancel = buttons.find(
      button => button.style === 'cancel'
    );

    if (cancel) {
      closeAndRun(cancel);
      return;
    }

    if (state.options?.cancelable) {
      setState(prev => ({
        ...prev,
        visible: false,
      }));

      state.options?.onDismiss?.();
    }
  };


  return (
    <>
      {children}

      <Modal
        visible={state.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={requestClose}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>

            {type === 'success' && (
              <CheckCircle2
                size={50}
                color="#10B981"
                style={styles.icon}
              />
            )}

            {type === 'error' && (
              <XCircle
                size={50}
                color="#EF4444"
                style={styles.icon}
              />
            )}

            {type === 'warning' && (
              <AlertTriangle
                size={50}
                color="#F59E0B"
                style={styles.icon}
              />
            )}

            <Text style={styles.title}>
              {state.title}
            </Text>

            {!!state.message && (
              <Text style={styles.message}>
                {state.message}
              </Text>
            )}

            <View
              style={[
                styles.actions,
                buttons.length > 2 &&
                  styles.actionsVertical,
              ]}
            >
              {buttons.map((button, index) => {
                const cancel =
                  button.style === 'cancel';

                const destructive =
                  button.style === 'destructive';

                const backgroundColor =
                  cancel
                    ? '#F1F5F9'
                    : destructive
                      ? '#EF4444'
                      : mainColor;

                return (
                  <TouchableOpacity
                    key={`${button.text || okText}-${index}`}
                    activeOpacity={0.82}
                    style={[
                      styles.button,
                      { backgroundColor },
                    ]}
                    onPress={() =>
                      closeAndRun(button)
                    }
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        {
                          color: cancel
                            ? '#475569'
                            : '#FFFFFF',
                        },
                      ]}
                    >
                      {button.text || okText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}


const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },

  icon: {
    marginBottom: 16,
  },

  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },

  message: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },

  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },

  actionsVertical: {
    flexDirection: 'column',
  },

  button: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
