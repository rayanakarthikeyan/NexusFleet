import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types';
import {
  getQueueCount,
  getSession,
  getViewerSession,
  initializeDatabase,
  saveSession,
  saveViewerSession,
  setSetting,
} from './LocalDatabase';
import { api, disconnectTransport } from './Transport';
import {
  deleteTripCredential,
  getSavedTripCredential,
  saveTripCredential,
} from './CredentialStore';
import { LOCATION_TASK } from './LocationTask';
import { SerialQueue } from './SerialQueue';
import { assertDriverReplacement, TripRole, verifiedSession } from './sessionPolicy';

const accountWrites = new SerialQueue();

export async function loadAccounts() {
  await initializeDatabase();
  const legacy = await getSession();
  const legacyToken = await SecureStore.getItemAsync('trip-token');
  if (legacy && legacyToken) {
    // Upgrade the single-login release without discarding its queue or token.
    // Write the role/trip-bound credential before retiring the old key.
    if (!(await getSavedTripCredential(legacy))) await saveTripCredential(legacy, legacyToken);
    if (legacy.role === 'consumer') {
      await saveViewerSession(legacy);
      await setSetting('session', '');
    }
    await SecureStore.deleteItemAsync('trip-token');
  }
  const [driver, viewer] = await Promise.all([getSession(), getViewerSession()]);
  return { driver: driver?.role === 'driver' ? driver : null, viewer };
}

export function signIn(role: TripRole, accessCode: string): Promise<Session> {
  return accountWrites.run(async () => {
    const code = accessCode.trim();
    if (!code) throw new Error('Enter a trip access code');
    const next = verifiedSession(await api<unknown>('/telemetry/session', {}, code), role);
    const old = role === 'driver' ? await getSession() : await getViewerSession();
    if (role === 'driver') {
      assertDriverReplacement(
        old,
        next,
        await getQueueCount(),
        await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
      );
      next.simulateOffline = old?.tripId === next.tripId ? old.simulateOffline : false;
    }
    // A new trip uses a different SecureStore key. If the metadata write fails,
    // the previously bound trip still resolves to its own credential.
    await saveTripCredential(next, code);
    if (role === 'driver') {
      await saveSession(next);
      disconnectTransport();
    } else {
      await saveViewerSession(next);
    }
    return next;
  });
}

export function signOut(role: TripRole): Promise<void> {
  return accountWrites.run(async () => {
    const old = role === 'driver' ? await getSession() : await getViewerSession();
    if (role === 'driver') {
      assertDriverReplacement(
        old,
        null,
        await getQueueCount(),
        await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
      );
    }
    await setSetting(role === 'driver' ? 'session' : 'viewer-session', '');
    if (role === 'driver') disconnectTransport();
    if (old) await deleteTripCredential(old);
  });
}
