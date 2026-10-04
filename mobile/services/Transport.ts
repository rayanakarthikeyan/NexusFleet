import * as SecureStore from 'expo-secure-store';
import { io, Socket } from 'socket.io-client';
import { LocationPayload } from '../types';
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
export async function credential() {
  const token = await SecureStore.getItemAsync('trip-token');
  if (!token) throw new Error('Set a trip credential first');
  return token;
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
