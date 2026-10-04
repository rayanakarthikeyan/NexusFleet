import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types';
import { credentialKey } from './sessionPolicy';

export async function getTripCredential(session: Session): Promise<string> {
  const token = await getSavedTripCredential(session);
  if (!token)
    throw new Error(`Sign in as ${session.role === 'driver' ? 'Driver' : 'Viewer'} first`);
  return token;
}

export const getSavedTripCredential = (session: Session) =>
  SecureStore.getItemAsync(credentialKey(session));

export const saveTripCredential = (session: Session, token: string) =>
  SecureStore.setItemAsync(credentialKey(session), token);

export const deleteTripCredential = (session: Session) =>
  SecureStore.deleteItemAsync(credentialKey(session));
