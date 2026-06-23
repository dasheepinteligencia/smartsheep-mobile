const appJson = require('./app.json');

module.exports = ({ config }) => {
  const appJsonExpo = appJson.expo || {};
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';

  const base = {
    ...config,
    ...appJsonExpo,
    android: {
      ...(config.android || {}),
      ...(appJsonExpo.android || {}),
    },
    extra: {
      ...(config.extra || {}),
      ...(appJsonExpo.extra || {}),
    },
  };

  const originalPlugins = Array.isArray(base.plugins) ? base.plugins : [];

  const pluginsWithoutMaps = originalPlugins.filter((plugin) => {
    if (typeof plugin === 'string') return plugin !== 'react-native-maps';
    if (Array.isArray(plugin)) return plugin[0] !== 'react-native-maps';
    return true;
  });

  return {
    ...base,
    plugins: pluginsWithoutMaps,
    android: {
      ...(base.android || {}),
      config: {
        ...((base.android || {}).config || {}),
        googleMaps: {
          ...(((base.android || {}).config || {}).googleMaps || {}),
          apiKey: androidMapsKey,
        },
      },
    },
    extra: {
      ...(base.extra || {}),
      googleMapsAndroidApiKey: androidMapsKey ? 'configured' : '',
      eas: base.extra?.eas,
    },
  };
};
