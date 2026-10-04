import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { Session } from './types';
import {
  getQueueCount,
  getSession,
  initializeDatabase,
  saveSession,
} from './services/LocalDatabase';
import { api, disconnectTransport } from './services/Transport';
import DriverScreen from './screens/DriverScreen';
import ConsumerMap from './screens/ConsumerMap';
import { LOCATION_TASK } from './services/LocationTask';
import { startSyncManager } from './services/SyncManager';
import { colors } from './theme';
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<'driver' | 'consumer'>('driver');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [editingCredential, setEditingCredential] = useState(false);
  const [credentialRevision, setCredentialRevision] = useState(0);
  useEffect(() => {
    void initializeDatabase()
      .then(getSession)
      .then((saved) => {
        setSession(saved);
        if (saved?.role === 'consumer') setTab('consumer');
      })
      .catch((error) => setFailure(String(error)))
      .finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (session?.role === 'driver') return startSyncManager();
  }, [session?.tripId, session?.role, credentialRevision]);
  async function configure() {
    setBusy(true);
    try {
      const verified = await api<{ tripId: string; role: Session['role'] }>(
        '/telemetry/session',
        {},
        token.trim(),
      );
      const old = await getSession();
      const sameTrip = old?.tripId === verified.tripId && old.role === verified.role;
      if (
        !sameTrip &&
        ((await getQueueCount()) > 0 ||
          (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)))
      ) {
        throw new Error(
          'Stop tracking and sync saved points before switching trips. You can renew the current trip credential.',
        );
      }
      const value: Session = {
        ...verified,
        simulateOffline: sameTrip ? old.simulateOffline : false,
      };
      // Validate first; a pasted credential for another trip must never replace
      // the token used by a concurrent background upload of the active trip.
      await SecureStore.setItemAsync('trip-token', token.trim());
      await saveSession(value);
      disconnectTransport();
      setSession(value);
      setToken('');
      setEditingCredential(false);
      setCredentialRevision((revision) => revision + 1);
      setTab(value.role === 'driver' ? 'driver' : 'consumer');
    } catch (error) {
      Alert.alert('Session failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  // Editing keeps the active session alive. Merely opening this form must not
  // stop foreground retries while the native task keeps recording locations.
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>NexusFleet</Text>
            <Text style={styles.subtitle}>Every trip, connected.</Text>
          </View>
          {session && !editingCredential && (
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setEditingCredential(true)}
            >
              <Text style={styles.link}>Trip access</Text>
            </Pressable>
          )}
        </View>
        {failure ? (
          <View style={styles.setup}>
            <Text style={styles.title}>Couldn’t open local storage</Text>
            <Text style={styles.error}>{failure}</Text>
            <Text style={styles.description}>Close and reopen the app to retry.</Text>
          </View>
        ) : !session || editingCredential ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.setup}>
            <Text style={styles.eyebrow}>
              {session ? 'RENEW TRIP ACCESS' : 'READY FOR THE ROAD'}
            </Text>
            <Text style={styles.title}>
              {session ? 'Reconnect to your trip.' : 'Keep moving.\nWe’ll keep the route.'}
            </Text>
            <Text style={styles.description}>
              Locations stay on your device when coverage drops and upload when you reconnect.
            </Text>
            <View style={styles.card}>
              <Text style={styles.label}>Trip access code</Text>
              <Text style={styles.description}>
                Paste the driver or viewer code supplied for your demo trip.
              </Text>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder="Paste your access code"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Trip access code"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                disabled={busy || !token.trim()}
                style={[styles.primary, (busy || !token.trim()) && styles.disabled]}
                onPress={() => {
                  void configure();
                }}
              >
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.primaryText}>Connect to trip</Text>
                )}
              </Pressable>
              {session && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  style={styles.cancel}
                  onPress={() => {
                    setEditingCredential(false);
                    setToken('');
                  }}
                >
                  <Text style={styles.link}>Back to current trip</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.footnote}>
              Your access code stays in this device’s secure storage.
            </Text>
          </ScrollView>
        ) : (
          <>
            <View style={styles.tabs}>
              {(['driver', 'consumer'] as const)
                .filter((value) => value !== 'driver' || session.role === 'driver')
                .map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === value }}
                    style={[styles.tab, tab === value && styles.selectedTab]}
                    onPress={() => setTab(value)}
                  >
                    <Text style={[styles.tabText, tab === value && styles.selectedTabText]}>
                      {value === 'driver' ? 'Driver' : 'Live map'}
                    </Text>
                  </Pressable>
                ))}
            </View>
            {tab === 'driver' ? (
              <ScrollView>
                <DriverScreen />
              </ScrollView>
            ) : (
              <ConsumerMap key={`${session.tripId}:${credentialRevision}`} session={session} />
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: { fontSize: 22, fontWeight: '800', color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.muted },
  setup: { padding: 24, paddingTop: 32, gap: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: colors.brand },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '700', color: colors.ink },
  description: { fontSize: 15, lineHeight: 23, color: colors.muted },
  card: {
    padding: 20,
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: colors.ink,
  },
  primary: { backgroundColor: colors.brand, padding: 17, borderRadius: 12, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  cancel: { alignItems: 'center', padding: 8 },
  link: { color: colors.brand, fontWeight: '600' },
  footnote: { fontSize: 12, lineHeight: 18, color: colors.muted },
  tabs: {
    marginHorizontal: 24,
    marginBottom: 12,
    padding: 4,
    borderRadius: 12,
    flexDirection: 'row',
    backgroundColor: '#E5EBF3',
  },
  tab: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 9 },
  selectedTab: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  selectedTabText: { color: colors.ink },
  error: { color: colors.danger, lineHeight: 22 },
});
