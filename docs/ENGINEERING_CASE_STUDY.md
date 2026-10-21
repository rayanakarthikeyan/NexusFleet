# NexusFleet engineering case study

NexusFleet is an offline fleet telemetry demo. Its central failure case is a server committing GPS points while the phone loses the acknowledgement. The client must retry without losing saved points or duplicating the route.

## Implementation and trade-offs

- SQLite captures a fix before transport starts. Stable point IDs survive retries; local deletion is restricted to explicitly acknowledged IDs.
- NestJS validates ingestion and trip access. PostgreSQL serializes sequence allocation under a trip-row lock.
- Coordinates and broadcast intent commit in the same transaction. Viewer history provides a recovery path for missed live events.
- A bounded sync loop keeps network calls outside SQLite transactions, with retry triggers for reconnects, new fixes, and app activation.

This is at-least-once delivery with idempotent database effects. It does not assume exactly-once network delivery. See [the architecture](architecture.md), [ingestion transaction](../backend/src/telemetry/telemetry.service.ts), and [client sync manager](../mobile/services/SyncManager.ts).

## Reproduce the evidence

Use Node 22 or later and a separate migrated PostgreSQL test database. Do not point tests at the hosted demo database.

```sh
npm ci
npm run build:backend
npm run check:mobile
npm test
```

Set `TEST_DATABASE_URL` to the isolated test database. Database suites explicitly skip without it. The [CI workflow](../.github/workflows/ci.yml) provisions PostgreSQL 16 and supplies that variable, so its database checks actually execute.

The [telemetry integration suite](../backend/test/telemetry.integration.test.ts) now checks two concurrent trips with 100 unique points each. Overlapping batches are repeated to represent lost acknowledgements. It asserts exact ID sets, 100 contiguous history sequences per trip, no cross-trip leakage, and no extra outbox intent on a complete retry. Existing tests cover conflicting IDs, transaction rollback, role access, API validation, socket room isolation, and history recovery.

[Mobile tests](../mobile/test/reliability.test.ts) check acknowledgement validation, serial work after a rejected write, credential separation, and interpolation math. These are helper checks, not proof of native GPS or Expo SQLite execution on a physical phone.

## Current limits

The hosted service and APK are demo infrastructure. Physical-device background capture, force-stop behavior, native persistence, and animation need their own device evidence. Multi-instance operation requires shared socket coordination and outbox leasing; identity renewal, retention, and operational monitoring also need production work. The retry suite establishes correctness for its finite scenarios, not a throughput SLA or a general formal proof.

## Interview walkthrough

Show the network-drop demo and queue recovery, then explain a lost response after commit. Walk through the row lock, original retry IDs, acknowledgement validation, and outbox. Use the database test to show why a repeated response must not allocate another history sequence or broadcast intent.
