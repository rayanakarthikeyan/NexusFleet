import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { getQueueCount, getSession, getSetting, saveSession } from '../services/LocalDatabase';
import { LOCATION_TASK, startTracking, stopTracking } from '../services/LocationTask';
import { flushQueue, observeSync } from '../services/SyncManager';
import { colors } from '../theme';
export default function DriverScreen() {
  const [tracking, setTracking] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [session, count, started, captureError, syncError] = await Promise.all([
          getSession(),
          getQueueCount(),
          Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
          getSetting('capture-error'),
          getSetting('sync-error'),
        ]);
        if (mounted) {
          setSimulated(session?.simulateOffline ?? false);
          setQueued(count);
          setTracking(started);
          setError(captureError || syncError || null);
          setReady(true);
        }
      } catch (err) {
        if (mounted) setError(String(err));
      } finally {
        refreshing = false;
      }
    };
    const unobserve = observeSync((message) => {
      if (mounted) setError(message);
    });
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    const network = NetInfo.addEventListener((state) => {
      if (mounted)
        setConnected(
          state.isConnected === null
            ? null
            : state.isConnected && state.isInternetReachable !== false,
        );
    });
    return () => {
      mounted = false;
      clearInterval(timer);
      unobserve();
      network();
    };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      Alert.alert('NexusFleet', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const offline = simulated || connected === false;
  const disabled = busy || !ready;
  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Text style={styles.title}>Your trip</Text>
        <View style={[styles.pill, offline && styles.offlinePill]}>
          <View style={[styles.dot, offline && styles.offlineDot]} />
          <Text style={styles.pillText}>
            {simulated
              ? 'Simulated offline'
              : connected === null
                ? 'Connecting'
                : offline
                  ? 'Offline'
                  : 'Connected'}
          </Text>
        </View>
      </View>
      <View style={styles.card}>
        <Text style={[styles.eyebrow, styles.onDarkMuted]}>SAVED ON THIS DEVICE</Text>
        <Text style={styles.count}>{queued.toLocaleString()}</Text>
        <Text style={[styles.cardTitle, styles.onDark]}>
          {queued === 1 ? 'location waiting to upload' : 'locations waiting to upload'}
        </Text>
        <Text style={[styles.description, styles.onDarkMuted]}>
          {offline
            ? 'Keep moving. Your route will upload when delivery resumes.'
            : queued
              ? 'Saved points are waiting for confirmation from the server.'
              : 'New locations are saved locally before delivery.'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.cardTitle}>{tracking ? 'Trip recording' : 'Ready to record'}</Text>
        <Text style={styles.description}>
          {tracking ? 'Background enabled' : 'Location paused'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.button, tracking && styles.stopButton, disabled && styles.disabled]}
        onPress={() => {
          void action(async () => {
            if (tracking) await stopTracking();
            else await startTracking();
            setTracking(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK));
          });
        }}
      >
        <Text style={[styles.buttonText, tracking && styles.stopText]}>
          {busy ? 'Working…' : tracking ? 'Stop trip' : 'Start trip'}
        </Text>
      </Pressable>
      <Text style={styles.description}>
        An active trip records location in the background. Choose “Allow all the time” when Android
        opens location settings.
      </Text>
      <View style={styles.demoCard}>
        <Text style={styles.eyebrow}>DEMO CONTROLS</Text>
        <Text style={styles.cardTitle}>Take the connection out of the equation.</Text>
        <Text style={styles.description}>
          Turn this on, move with the phone, then turn it off to watch saved locations catch up on
          the live map.
        </Text>
        <Pressable
          disabled={disabled}
          style={[styles.toggle, simulated && styles.toggleOn, disabled && styles.disabled]}
          accessibilityRole="switch"
          accessibilityState={{ checked: simulated, disabled }}
          onPress={() => {
            void action(async () => {
              const session = await getSession();
              if (session?.role !== 'driver') throw new Error('Connect to a driver trip first');
              const next = !session.simulateOffline;
              await saveSession({ ...session, simulateOffline: next });
              setSimulated(next);
              if (!next) await flushQueue();
            });
          }}
        >
          <Text style={[styles.toggleText, simulated && styles.toggleOnText]}>
            Simulate Network Drop
          </Text>
          <Text style={[styles.toggleText, simulated && styles.toggleOnText]}>
            {simulated ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Delivery needs attention</Text>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.description}>
            Upload failures keep saved locations in the queue. Capture errors may mean new locations
            could not be saved.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 24, gap: 20 },
  title: { fontSize: 26, fontWeight: '700', color: colors.ink },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#E5F5ED',
  },
  offlinePill: { backgroundColor: colors.warningSoft },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.positive },
  offlineDot: { backgroundColor: colors.warning },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.ink },
  card: { backgroundColor: colors.ink, borderRadius: 20, padding: 24, gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700', color: colors.muted },
  count: { fontSize: 64, fontWeight: '700', color: colors.surface, fontVariant: ['tabular-nums'] },
  onDark: { color: colors.surface },
  onDarkMuted: { color: '#B9C7D9' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  description: { fontSize: 13, lineHeight: 21, color: colors.muted },
  button: { padding: 18, borderRadius: 12, backgroundColor: colors.brand },
  stopButton: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  buttonText: { color: 'white', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  stopText: { color: colors.ink },
  disabled: { opacity: 0.5 },
  demoCard: {
    padding: 20,
    borderRadius: 20,
    gap: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    padding: 17,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
  },
  toggleOn: { backgroundColor: colors.warningSoft },
  toggleText: { fontSize: 14, fontWeight: '700', color: colors.brand },
  toggleOnText: { color: colors.warning },
  errorCard: { gap: 10, padding: 18, borderRadius: 12, backgroundColor: '#FFF0ED' },
  errorTitle: { fontWeight: '700', color: colors.danger },
  error: { color: colors.danger, lineHeight: 21 },
});
