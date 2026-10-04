import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from './types';
import { getSetting, setSetting } from './services/LocalDatabase';
import { loadAccounts, signIn, signOut } from './services/AccountManager';
import type { TripRole } from './services/sessionPolicy';
import { startSyncManager } from './services/SyncManager';
import DriverScreen from './screens/DriverScreen';
import ConsumerMap from './screens/ConsumerMap';
import TripSignIn from './screens/TripSignIn';
import { colors } from './theme';

export default function App() {
  const [driver, setDriver] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Session | null>(null);
  const [role, setRole] = useState<TripRole>('driver');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [driverRevision, setDriverRevision] = useState(0);
  const [viewerRevision, setViewerRevision] = useState(0);
  const session = role === 'driver' ? driver : viewer;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const accounts = await loadAccounts();
        const rememberedRole = await getSetting('active-role');
        if (!mounted) return;
        setDriver(accounts.driver);
        setViewer(accounts.viewer);
        setRole(
          rememberedRole === 'consumer' || (!accounts.driver && accounts.viewer)
            ? 'consumer'
            : 'driver',
        );
      } catch (error) {
        if (mounted) setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    // The selected UI role never owns the background session. Viewer login,
    // navigation and credential editing leave driver delivery running.
    if (driver) return startSyncManager();
  }, [driver?.tripId, driverRevision]);

  function selectRole(next: TripRole) {
    setRole(next);
    setEditing(false);
    void setSetting('active-role', next).catch((error) => Alert.alert('NexusFleet', String(error)));
  }

  async function configure(code: string) {
    setBusy(true);
    try {
      const next = await signIn(role, code);
      if (role === 'driver') {
        setDriver(next);
        setDriverRevision((value) => value + 1);
      } else {
        setViewer(next);
        setViewerRevision((value) => value + 1);
      }
      setEditing(false);
    } catch (error) {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function leaveRole() {
    setBusy(true);
    try {
      await signOut(role);
    } catch (error) {
      Alert.alert(
        'Sign-out needs attention',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      // Refresh even if SecureStore cleanup failed after unbinding an account.
      try {
        const accounts = await loadAccounts();
        setDriver(accounts.driver);
        setViewer(accounts.viewer);
      } catch (error) {
        Alert.alert('Account refresh failed', String(error));
      }
      setBusy(false);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>NexusFleet</Text>
            <Text style={styles.subtitle}>Every trip, connected.</Text>
          </View>
          {session && !editing && (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              hitSlop={12}
              onPress={() => setEditing(true)}
            >
              <Text style={styles.link}>Trip access</Text>
            </Pressable>
          )}
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand} />
            <Text style={styles.description}>Opening saved accounts…</Text>
          </View>
        ) : failure ? (
          <View style={styles.loading}>
            <Text style={styles.error}>Couldn’t open local storage: {failure}</Text>
            <Text style={styles.description}>Close and reopen the app to retry.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              {(['driver', 'consumer'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: role === value, disabled: busy }}
                  disabled={busy}
                  style={[styles.tab, role === value && styles.selectedTab]}
                  onPress={() => selectRole(value)}
                >
                  <Text style={[styles.tabText, role === value && styles.selectedTabText]}>
                    {value === 'driver' ? 'Driver' : 'Viewer'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!session || editing ? (
              <TripSignIn
                key={role}
                role={role}
                session={session}
                busy={busy}
                onSubmit={configure}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <View style={styles.accountRow}>
                  <Text style={styles.accountLabel}>
                    {role === 'driver' ? 'Driver' : 'Viewer'} · Trip {session.tripId.slice(0, 8)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    disabled={busy}
                    hitSlop={10}
                    onPress={() => {
                      void leaveRole();
                    }}
                  >
                    <Text style={styles.link}>{busy ? 'Working…' : 'Sign out'}</Text>
                  </Pressable>
                </View>
                {role === 'driver' ? (
                  <ScrollView>
                    <DriverScreen />
                  </ScrollView>
                ) : (
                  <ConsumerMap key={`${session.tripId}:${viewerRevision}`} session={session} />
                )}
              </>
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
  loading: { flex: 1, padding: 24, gap: 20, alignItems: 'center', justifyContent: 'center' },
  link: { color: colors.brand, fontWeight: '600', fontSize: 13 },
  description: { fontSize: 14, lineHeight: 23, color: colors.muted },
  error: { color: colors.danger, lineHeight: 22 },
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
  accountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  accountLabel: { fontSize: 12, color: colors.muted },
});
