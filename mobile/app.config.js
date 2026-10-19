export default ({ config }) => {
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const iosMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;
  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: config.ios?.bundleIdentifier ?? 'com.livingwell088.routerunner',
    },
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', {
        ...(mapsApiKey ? { androidGoogleMapsApiKey: mapsApiKey } : {}),
        ...(iosMapsApiKey ? { iosGoogleMapsApiKey: iosMapsApiKey } : {}),
      }],
    ],
    android: {
      ...config.android,
      ...(mapsApiKey ? { config: { ...config.android?.config, googleMaps: { apiKey: mapsApiKey } } } : {}),
    },
  };
};
