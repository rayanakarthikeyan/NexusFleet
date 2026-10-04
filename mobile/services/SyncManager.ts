import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import {
  getSession,
  getUnsyncedLocations,
  clearSyncedLocations,
  markDelayed,
  setSetting,
} from './LocalDatabase';
import { acceptedIds, api, disconnectTransport, sendLive } from './Transport';
let flushing: Promise<void> | undefined;
let requested = false;
let failures = 0;
const listeners = new Set<(error: string | null) => void>();
export const observeSync = (fn: (error: string | null) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function flushQueue(): Promise<void> {
  requested = true;
  if (flushing) return flushing;
  flushing = drain().finally(() => {
    flushing = undefined;
  });
  return flushing;
}
async function drain() {
  // Bound headless task execution. Remaining durable rows are retried on the
  // next GPS callback, reconnect, app activation, or foreground retry timer.
  const deadline = Date.now() + 20000;
  try {
    do {
      requested = false;
      const session = await getSession();
      const state = await NetInfo.fetch();
      if (
        !session ||
        session.role !== 'driver' ||
        session.simulateOffline ||
        !state.isConnected ||
        state.isInternetReachable === false
      )
        return;
      let points = await getUnsyncedLocations(session.tripId);
      if (!points.length) return;
      let acknowledgement: unknown;
      if (points.length === 1 && !points[0].isOfflineCache) {
        try {
          acknowledgement = await sendLive(points[0]);
          acceptedIds(acknowledgement, points);
        } catch {
          // The server may already have committed the timed-out frame. Retry
          // over REST with the SAME ID instead of generating a second point.
          await markDelayed(points.map((p) => p.clientPointId));
          points = points.map((p) => ({ ...p, isOfflineCache: true }));
        }
      } else {
        await markDelayed(points.map((p) => p.clientPointId));
        points = points.map((p) => ({ ...p, isOfflineCache: true }));
      }
      if (!acknowledgement || points.some((p) => p.isOfflineCache)) {
        // Check the durable demo flag again before fallback network I/O.
        if ((await getSession())?.simulateOffline) return;
        acknowledgement = await api('/telemetry/burst-sync', {
          method: 'POST',
          body: JSON.stringify(points),
        });
      }
      await clearSyncedLocations(acceptedIds(acknowledgement, points));
      failures = 0;
      await setSetting('sync-error', '');
      listeners.forEach((fn) => fn(null));
      requested = true;
    } while (requested && Date.now() < deadline);
  } catch (error) {
    failures++;
    const message = error instanceof Error ? error.message : 'Sync failed';
    console.warn('Sync retained local data:', message);
    await setSetting('sync-error', message).catch(() => undefined);
    listeners.forEach((fn) => fn(message));
  } finally {
    if (AppState.currentState !== 'active') disconnectTransport();
  }
}
export function startSyncManager() {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const trigger = () => {
    void flushQueue();
  };
  const network = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) trigger();
  });
  const lifecycle = AppState.addEventListener('change', (state) => {
    if (state === 'active') trigger();
  });
  const retry = async () => {
    await flushQueue();
    if (!stopped)
      timer = setTimeout(
        () => {
          void retry();
        },
        Math.min(60000, 5000 * 2 ** Math.min(failures, 4)) + Math.random() * 1000,
      );
  };
  void retry();
  return () => {
    stopped = true;
    clearTimeout(timer);
    network();
    lifecycle.remove();
    disconnectTransport();
  };
}
