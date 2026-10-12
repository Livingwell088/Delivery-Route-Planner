export default ({ config }) => {
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    android: {
      ...config.android,
      ...(mapsApiKey ? { config: { googleMaps: { apiKey: mapsApiKey } } } : {}),
    },
  };
};
