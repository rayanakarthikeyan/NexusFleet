import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { getQueueCount, getSession, getSetting, saveSession } from '../services/LocalDatabase';
import { LOCATION_TASK, startTracking, stopTracking } from '../services/LocationTask';
import { flushQueue, observeSync } from '../services/SyncManager';
export default function DriverScreen() {
  const [tracking, setTracking] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const [session, count, started, captureError, syncError] = await Promise.all([
          getSession(), getQueueCount(), Location.hasStartedLocationUpdatesAsync(LOCATION_TASK),
          getSetting('capture-error'), getSetting('sync-error'),
        ]);
        if (mounted) { setSimulated(session?.simulateOffline ?? false); setQueued(count);
          setTracking(started); setError(captureError || syncError || null); }
      } catch (err) { if (mounted) setError(String(err)); }
    };
    const unobserve = observeSync(message => { if (mounted) setError(message); });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 1000);
    return () => { mounted = false; clearInterval(timer); unobserve(); };
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    try { await work(); }
    catch (err) { Alert.alert('NexusFleet', err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  return <View style={styles.panel}>
    <Text style={styles.title}>Driver telemetry</Text>
    <Text style={styles.count}>{queued} queued fixes</Text>
    <Text>{tracking ? 'Background trip active' : 'Tracking stopped'}</Text>
    <Text>Speed: metres/second · timestamps: epoch milliseconds</Text>
    <Pressable disabled={busy} style={[styles.button, { backgroundColor: simulated ? '#B3261E' : '#176BFA' }]}
      accessibilityRole="switch" accessibilityState={{ checked: simulated, disabled: busy }}
      onPress={() => { void action(async () => {
        const session = await getSession();
        if (!session) throw new Error('No driver session');
        await saveSession({ ...session, simulateOffline: !simulated });
        setSimulated(!simulated);
        if (simulated) await flushQueue();
      }); }}>
      <Text style={styles.buttonText}>Simulate Network Drop</Text>
      <Text style={styles.buttonText}>{simulated ? 'ON · fixes stay on device' : 'OFF · delivery enabled'}</Text>
    </Pressable>
    <Text>Location is collected during an active trip, including in the background. On Android, choose “Allow all the time” when settings opens.</Text>
    <Pressable disabled={busy} style={styles.button} onPress={() => { void action(async () => {
      if (tracking) await stopTracking(); else await startTracking();
      setTracking(!tracking);
    }); }}><Text style={styles.buttonText}>{busy ? 'Working…' : tracking ? 'Stop trip' : 'Start trip'}</Text></Pressable>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Text>Return to this screen after restoring connectivity to inspect the queue. Background GPS callbacks also attempt delivery.</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: 24, gap: 20 }, title: { fontSize: 26, fontWeight: '700' },
  count: { fontSize: 32, fontWeight: '700', color: '#176BFA' },
  button: { padding: 18, borderRadius: 12, backgroundColor: '#176BFA' },
  buttonText: { color: 'white', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  error: { color: '#B3261E' },
});
