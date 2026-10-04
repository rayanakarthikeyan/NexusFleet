import type { ConfigContext, ExpoConfig } from 'expo/config';
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config, name: 'NexusFleet', slug: 'nexusfleet',
  android: { ...config.android, config: {
    ...config.android?.config, googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '' },
  } },
});
