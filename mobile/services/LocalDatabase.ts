import * as SQLite from 'expo-sqlite';
import { LocationPayload, Session } from '../types';
import { SerialQueue } from './SerialQueue';
const writes = new SerialQueue();
function locked<T>(operation: () => Promise<T>): Promise<T> {
  return writes.run(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // A second headless runtime can briefly hold the native file lock.
        // Keep this operation at the head of our queue while retrying it.
        if (attempt >= 4 || !/SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(String(error)))
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 50));
      }
    }
  });
}
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
interface Row extends Omit<LocationPayload, 'isOfflineCache'> {
  isOfflineCache: number;
}
export function initializeDatabase() {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync('nexusfleet.db');
      try {
        // WAL tolerates readers while a writer commits; FULL avoids discarding
        // a just-acknowledged local write during a device power interruption.
        await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;
          PRAGMA busy_timeout = 5000;
          CREATE TABLE IF NOT EXISTS QueuedLocations (
            clientPointId TEXT PRIMARY KEY NOT NULL, tripId TEXT NOT NULL,
            latitude REAL NOT NULL, longitude REAL NOT NULL,
            heading REAL, speed REAL, timestamp INTEGER NOT NULL,
            isOfflineCache INTEGER NOT NULL CHECK(isOfflineCache IN (0,1))
          );
          CREATE INDEX IF NOT EXISTS queue_order ON QueuedLocations(tripId,timestamp,clientPointId);
          CREATE TABLE IF NOT EXISTS Settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
        return db;
      } catch (error) {
        await db.closeAsync();
        throw error;
      }
    })();
    void opening.catch(() => {
      opening = undefined;
    });
  }
  return opening;
}
// Serialize ALL queries on one connection. Unrelated async writes cannot leak
// into a transaction. BEGIN IMMEDIATE also locks competing native connections.
export function insertLocations(points: LocationPayload[]) {
  return locked(async () => {
    const db = await initializeDatabase();
    await db.execAsync('BEGIN IMMEDIATE');
    try {
      for (const p of points)
        await db.runAsync(
          `INSERT OR IGNORE INTO QueuedLocations
        (clientPointId,tripId,latitude,longitude,heading,speed,timestamp,isOfflineCache)
        VALUES (?,?,?,?,?,?,?,?)`,
          p.clientPointId,
          p.tripId,
          p.latitude,
          p.longitude,
          p.heading,
          p.speed,
          p.timestamp,
          p.isOfflineCache ? 1 : 0,
        );
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  });
}
export const insertLocation = (data: LocationPayload) => insertLocations([data]);
export function getUnsyncedLocations(tripId: string, limit = 500): Promise<LocationPayload[]> {
  return locked(async () => {
    const db = await initializeDatabase();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM QueuedLocations WHERE tripId=? ORDER BY timestamp,clientPointId LIMIT ?',
      tripId,
      Math.max(1, Math.min(500, limit)),
    );
    return rows.map((p) => ({ ...p, isOfflineCache: Boolean(p.isOfflineCache) }));
  });
}
export function clearSyncedLocations(ids: string[]) {
  if (!ids.length) return Promise.resolve();
  if (ids.length > 500) return Promise.reject(new Error('Delete batch exceeds 500'));
  return locked(async () => {
    const db = await initializeDatabase();
    // Never DELETE the entire table: new fixes can arrive during an HTTP call.
    await db.runAsync(
      `DELETE FROM QueuedLocations WHERE clientPointId IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
  });
}
export function markDelayed(ids: string[]) {
  return locked(async () => {
    if (!ids.length) return;
    const db = await initializeDatabase();
    await db.runAsync(
      `UPDATE QueuedLocations SET isOfflineCache=1 WHERE clientPointId IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
  });
}
export function getQueueCount() {
  return locked(
    async () =>
      (
        await (
          await initializeDatabase()
        ).getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM QueuedLocations')
      )?.count ?? 0,
  );
}
export function setSetting(key: string, value: string) {
  return locked(async () => {
    await (
      await initializeDatabase()
    ).runAsync(
      'INSERT INTO Settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key,
      value,
    );
  });
}
export function getSetting(key: string) {
  return locked(
    async () =>
      (
        await (
          await initializeDatabase()
        ).getFirstAsync<{ value: string }>('SELECT value FROM Settings WHERE key=?', key)
      )?.value ?? null,
  );
}
export async function getSession(): Promise<Session | null> {
  const raw = await getSetting('session');
  return raw ? (JSON.parse(raw) as Session) : null;
}
export const saveSession = (session: Session) => setSetting('session', JSON.stringify(session));

export async function getViewerSession(): Promise<Session | null> {
  const raw = await getSetting('viewer-session');
  return raw ? (JSON.parse(raw) as Session) : null;
}

export const saveViewerSession = (session: Session) =>
  setSetting('viewer-session', JSON.stringify(session));
