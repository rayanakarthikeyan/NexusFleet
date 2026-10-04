export interface LocationPayload {
  clientPointId: string;
  tripId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
  isOfflineCache: boolean;
}
export interface LocationFrame extends LocationPayload {
  sequence: number;
  receivedAt: string;
}
export interface SyncAck {
  success: true;
  acceptedIds: string[];
}
export interface Session {
  tripId: string;
  role: 'driver' | 'consumer';
  simulateOffline: boolean;
}
