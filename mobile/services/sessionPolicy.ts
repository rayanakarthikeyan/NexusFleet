import type { Session } from '../types';

export type TripRole = Session['role'];
export type SignInInput = { email: string; password: string } | { code: string };

export function credentialKey(session: Pick<Session, 'tripId' | 'role'>): string {
  return `nexusfleet.${session.role}.${session.tripId}`;
}

export function verifiedSession(value: unknown, expectedRole: TripRole): Session {
  const candidate = value as Partial<Session> | null;
  if (
    !candidate ||
    typeof candidate.tripId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.tripId,
    ) ||
    candidate.role !== expectedRole
  ) {
    throw new Error(
      `Use a ${expectedRole === 'driver' ? 'Driver' : 'Viewer'} trip access code for this sign-in.`,
    );
  }
  return { tripId: candidate.tripId, role: expectedRole, simulateOffline: false };
}

export function assertDriverReplacement(
  current: Session | null,
  next: Session | null,
  queueCount: number,
  nativeTracking: boolean,
) {
  if (current?.tripId === next?.tripId && current && next) return;
  if (queueCount > 0 || nativeTracking) {
    throw new Error(
      'Stop the driver trip and upload saved locations before changing or signing out of the driver account. Viewer sign-in is still available.',
    );
  }
}
