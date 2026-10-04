import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SerialQueue } from '../services/SerialQueue';
import {
  bearing,
  normalizeHeading,
  normalizeLongitude,
  shortestDelta,
} from '../services/interpolation';
import { acceptedIds } from '../services/acknowledgement';
import { LocationPayload } from '../types';
test('only an explicit commit acknowledgement for the exact batch permits deletion', () => {
  const sent = [{ clientPointId: 'a' }, { clientPointId: 'b' }] as LocationPayload[];
  assert.deepEqual(acceptedIds({ success: true, acceptedIds: ['b', 'a'] }, sent), ['b', 'a']);
  for (const ack of [
    undefined,
    null,
    { success: true },
    { success: false, acceptedIds: ['a', 'b'] },
    { success: true, acceptedIds: ['a'] },
    { success: true, acceptedIds: ['a', 'a'] },
    { success: true, acceptedIds: ['a', 'new-fix-arrived-during-upload'] },
  ]) {
    assert.throws(() => acceptedIds(ack, sent), /retaining queue/);
  }
});
test('concurrent work is serialized and a rejection does not poison subsequent writes', async () => {
  const queue = new SerialQueue(),
    events: string[] = [];
  const results = await Promise.allSettled([
    queue.run(async () => {
      events.push('first start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first end');
    }),
    queue.run(async () => {
      events.push('failure');
      throw new Error('disk busy');
    }),
    queue.run(async () => {
      events.push('last');
      return 42;
    }),
  ]);
  assert.deepEqual(events, ['first start', 'first end', 'failure', 'last']);
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(results[2], { status: 'fulfilled', value: 42 });
});
test('heading and longitude interpolate over the short arc', () => {
  assert.equal(shortestDelta(350, 10), 20);
  assert.equal(shortestDelta(10, 350), -20);
  assert.equal(shortestDelta(179, -179), 2);
  assert.equal(shortestDelta(-179, 179), -2);
  assert.equal(shortestDelta(1070, 10), 20);
  assert.equal(normalizeHeading(-10), 350);
  assert.equal(normalizeLongitude(181), -179);
});
test('missing GPS bearing uses geographic bearing and stationary fixes retain the last bearing', () => {
  assert.equal(bearing(0, 0, 0, 1), 90);
  assert.equal(bearing(0, 0, 1, 0), 0);
  assert.equal(bearing(12, 77, 12, 77), null);
  assert.equal(bearing(0, 179, 0, -179), 90);
});
