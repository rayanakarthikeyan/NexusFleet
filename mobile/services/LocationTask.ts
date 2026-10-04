import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { getSession, getSetting, insertLocations, setSetting } from './LocalDatabase';
import { flushQueue } from './SyncManager';
export const LOCATION_TASK = 'nexusfleet-background-location-v1';
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) throw new Error(error.message);
    const session = await getSession();
    // Stopping tracking clears this flag only after the native service stops.
    if (!session || session.role !== 'driver' || await getSetting('tracking') !== '1' || !data?.locations.length) return;
    const state = await NetInfo.fetch().catch(() => null);
    await insertLocations(data.locations.map(fix => ({
      clientPointId: Crypto.randomUUID(), tripId: session.tripId,
      latitude: fix.coords.latitude, longitude: fix.coords.longitude,
      heading: fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading % 360 : null,
      speed: fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed : null,
      timestamp: Math.trunc(fix.timestamp),
      isOfflineCache: session.simulateOffline || !state?.isConnected || state.isInternetReachable === false,
    })));
    // Persist first even online. No in-memory-only gap between capture and ACK.
    await setSetting('capture-error', '');
    if (!session.simulateOffline) await flushQueue();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Background location failed';
    console.error('Location task failed:', message);
    await setSetting('capture-error', message).catch(() => undefined);
  }
});
export async function startTracking() {
  const session = await getSession();
  if (!session || session.role !== 'driver') throw new Error('Configure a driver session first');
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') throw new Error('Precise foreground location permission is required');
  if (foreground.android?.accuracy === 'coarse') throw new Error('Enable precise location in Android app settings');
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') throw new Error('Choose “Allow all the time” in Android location settings');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Enable device location services');
  await setSetting('tracking', '1');
  try {
    if (!await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5,
      deferredUpdatesInterval: 1000, pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'NexusFleet trip active',
        notificationBody: 'Location is saved on this device and synced when connected.',
        notificationColor: '#176BFA', killServiceOnDestroy: false,
      },
    });
  } catch (error) { await setSetting('tracking', '0'); throw error; }
}
export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  await setSetting('tracking', '0');
  await flushQueue();
}
