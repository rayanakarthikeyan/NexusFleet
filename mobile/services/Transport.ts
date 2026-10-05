import { io, Socket } from 'socket.io-client';
import { LocationPayload, Session } from '../types';
import { getSession } from './LocalDatabase';
import { getTripCredential } from './CredentialStore';
export { acceptedIds } from './acknowledgement';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export function backendUrl() {
  if (!/^https:\/\//.test(API_URL) && !(__DEV__ && /^http:\/\//.test(API_URL))) {
    throw new Error('Set EXPO_PUBLIC_API_URL to an HTTPS backend URL');
  }
  return API_URL;
}
let socket: Socket | undefined;
let socketToken: string | undefined;
export async function credential(explicitSession?: Session) {
  // Background uploads always resolve the persisted DRIVER binding. A viewer
  // supplies its own session explicitly and can never replace this credential.
  const session = explicitSession ?? (await getSession());
  if (!session || (!explicitSession && session.role !== 'driver'))
    throw new Error('Sign in as Driver first');
  return getTripCredential(session);
}
export function disconnectTransport() {
  socket?.disconnect();
  socket = undefined;
  socketToken = undefined;
}
export async function driverSocket() {
  const token = await credential();
  if (!socket || socketToken !== token) {
    disconnectTransport();
    socketToken = token;
    socket = io(backendUrl(), {
      transports: ['websocket'],
      auth: { token },
      autoConnect: false,
      reconnection: false,
      timeout: 5000,
    });
  }
  const current = socket;
  if (current.connected) return current;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      current.off('connect', connected);
      current.off('connect_error', failed);
      clearTimeout(timer);
    };
    const connected = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => failed(new Error('Socket connect timed out')), 5500);
    current.once('connect', connected);
    current.once('connect_error', failed);
    current.connect();
  });
  return current;
}
export async function sendLive(point: LocationPayload): Promise<unknown> {
  const current = await driverSocket();
  return new Promise((resolve, reject) =>
    current
      .timeout(4000)
      .emit('live_location', point, (error: Error | null, ack: unknown) =>
        error ? reject(error) : resolve(ack),
      ),
  );
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  tokenOverride?: string,
): Promise<T> {
  const url = backendUrl();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(`${url}${path}`, {
      ...init,
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init.headers,
        Authorization: `Bearer ${tokenOverride ?? (await credential())}`,
      },
    });
    if (!response.ok)
      throw new Error(
        `API returned ${response.status}${response.status === 401 ? ': renew the trip credential' : ''}`,
      );
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginWithPassword(
  email: string,
  password: string,
  role: Session['role'],
): Promise<string> {
  const abort = new AbortController();
  // A sleeping free demo server can take a minute to wake. This longer timeout
  // applies only to interactive sign-in; background uploads stay bounded.
  const timer = setTimeout(() => abort.abort(), 75000);
  try {
    const response = await fetch(`${backendUrl()}/auth/login`, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, role }),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Email or password is incorrect for this role.');
      if (response.status === 429)
        throw new Error('Too many sign-in attempts. Wait a minute and retry.');
      throw new Error(`Sign-in is unavailable (${response.status}). Try again shortly.`);
    }
    const result = (await response.json()) as { accessToken?: unknown };
    if (typeof result.accessToken !== 'string' || !result.accessToken)
      throw new Error('The server returned an invalid sign-in response.');
    return result.accessToken;
  } catch (error) {
    if (abort.signal.aborted)
      throw new Error('The demo server is taking longer to wake. Please retry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
