import { LocationPayload, SyncAck } from '../types';
export function acceptedIds(ack: unknown, sent: LocationPayload[]): string[] {
  const result = ack as Partial<SyncAck> | null;
  const ids = new Set(sent.map(p => p.clientPointId));
  if (result?.success !== true || !Array.isArray(result.acceptedIds) ||
    result.acceptedIds.length !== ids.size || new Set(result.acceptedIds).size !== ids.size ||
    result.acceptedIds.some(id => typeof id !== 'string' || !ids.has(id))) {
    throw new Error('Invalid commit acknowledgement; retaining queue');
  }
  return result.acceptedIds;
}
