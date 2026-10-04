import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '../types';
import type { TripRole } from '../services/sessionPolicy';
import { colors } from '../theme';

interface Props {
  role: TripRole;
  session: Session | null;
  busy: boolean;
  onSubmit: (code: string) => Promise<void>;
  onCancel: () => void;
}

export default function TripSignIn({ role, session, busy, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('');
  const driver = role === 'driver';
  const label = driver ? 'Driver' : 'Viewer';

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>{label.toUpperCase()} SIGN-IN</Text>
      <Text style={styles.title}>
        {driver
          ? 'Keep the route.\nEven without coverage.'
          : 'Follow the trip.\nWatch the route catch up.'}
      </Text>
      <Text style={styles.description}>
        {driver
          ? 'Record locations in the background and upload saved points when the connection returns.'
          : 'Watch committed locations on the map, including points uploaded after a network drop.'}
      </Text>
      <View style={styles.card}>
        <Text style={styles.label}>{label} trip access code</Text>
        <Text style={styles.description}>
          {session
            ? `Renew access to trip ${session.tripId.slice(0, 8)} or connect another trip.`
            : `Paste the ${label.toLowerCase()} code supplied for your demo trip.`}
        </Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          editable={!busy}
          placeholder={`Paste ${label.toLowerCase()} code`}
          placeholderTextColor={colors.muted}
          accessibilityLabel={`${label} trip access code`}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !code.trim() }}
          disabled={busy || !code.trim()}
          style={[styles.primary, (busy || !code.trim()) && styles.disabled]}
          onPress={() => {
            void onSubmit(code);
          }}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryText}>Sign in as {label}</Text>
          )}
        </Pressable>
        {session && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={styles.cancel}
            onPress={onCancel}
          >
            <Text style={styles.link}>Back to current {label.toLowerCase()} trip</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.footnote}>
        Driver and Viewer codes are stored separately in secure storage. Switching roles does not
        stop an active driver trip.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 24, paddingTop: 32, gap: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.5, fontWeight: '700', color: colors.brand },
  title: { fontSize: 30, lineHeight: 39, fontWeight: '700', color: colors.ink },
  description: { fontSize: 14, lineHeight: 23, color: colors.muted },
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
  footnote: { fontSize: 12, lineHeight: 19, color: colors.muted },
});
