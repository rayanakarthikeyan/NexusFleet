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
import type { TripRole, SignInInput } from '../services/sessionPolicy';
import { colors } from '../theme';

interface Props {
  role: TripRole;
  session: Session | null;
  busy: boolean;
  onSubmit: (input: SignInInput) => Promise<void>;
  onCancel: () => void;
}

export default function TripSignIn({ role, session, busy, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [useCode, setUseCode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const driver = role === 'driver';
  const label = driver ? 'Driver' : 'Viewer';
  const incomplete = useCode ? !code.trim() : !email.trim() || !password;

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
        <Text style={styles.label}>
          {label} {useCode ? 'trip access code' : 'account'}
        </Text>
        <Text style={styles.description}>
          {session
            ? `Renew access to trip ${session.tripId.slice(0, 8)} or connect another trip.`
            : useCode
              ? `Paste the ${label.toLowerCase()} code supplied for your demo trip.`
              : `Use the demo ${driver ? 'driver' : 'user'} email and password supplied to you.`}
        </Text>
        {useCode ? (
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
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              editable={!busy}
              placeholder="Email address"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label} email`}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              editable={!busy}
              placeholder="Password"
              placeholderTextColor={colors.muted}
              accessibilityLabel={`${label} password`}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              style={styles.input}
            />
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || incomplete }}
          disabled={busy || incomplete}
          style={[styles.primary, (busy || incomplete) && styles.disabled]}
          onPress={() => {
            void onSubmit(useCode ? { code } : { email, password });
          }}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.primaryText}>Sign in as {label}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setUseCode(!useCode);
            setPassword('');
            setCode('');
          }}
          style={styles.cancel}
        >
          <Text style={styles.link}>
            {useCode ? 'Use email and password' : 'Use a trip code instead'}
          </Text>
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
        Driver and Viewer stay signed in separately. Switching roles keeps an active driver trip
        running. The demo server may take a minute to wake on your first sign-in.
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
