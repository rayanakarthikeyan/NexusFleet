# NexusFleet architecture and setup

NexusFleet is an Android telemetry reference implementation using Expo SDK 54, React Native, NestJS 11, Prisma 6.19 and PostgreSQL. It saves GPS fixes to SQLite before attempting delivery, retries with stable IDs, and plays committed locations on a consumer map. The complete source is presented file by file in [IMPLEMENTATION.md](IMPLEMENTATION.md).

This repository has production-oriented persistence, validation and authentication. It still needs a physical Android test, deployment configuration and an application-specific identity system before a real fleet rollout. No mobile app can guarantee a coordinate that Android never delivers, or preserve data after app storage is erased.

## Delivery and recovery

1. The background task captures a native location batch and inserts it atomically into SQLite. UUIDs are assigned once and retained through every delivery retry.
2. The sync manager reads a bounded snapshot of at most 500 points. The persisted simulation flag and NetInfo state gate both Socket.IO and HTTP delivery. Internet reachability `null` permits an attempt; `false` does not.
3. A fresh isolated fix uses `live_location`. The gateway commits it to PostgreSQL before acknowledging it. A dropped socket or lost ACK falls back to REST with the same ID. Historical batches use `POST /telemetry/burst-sync` directly.
4. PostgreSQL enforces uniqueness on `(tripId, clientPointId)`. A trip row lock serializes sequence allocation and commit order. A retry returns the original IDs without allocating additional points or notifications. Reusing an ID for different coordinates rejects the entire batch.
5. SQLite deletes only IDs from a validated commit acknowledgement. New fixes inserted while an upload is in flight survive. A crash after server commit and before local deletion causes a harmless duplicate attempt on restart.
6. A transaction also writes a broadcast outbox. A polling gateway publishes committed arrays to the trip room. Consumers subscribe, then request paginated history, deduplicating by sequence. Periodic history reads recover packets missed by Socket.IO, including when the server restarts.

Delivery is **at least once**, with an idempotent database effect. Socket.IO alone does not guarantee arrival of a server event at a disconnected consumer; history recovery supplies that guarantee for committed points. See [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

`isOfflineCache` describes a delayed ingestion. Queue rows are marked delayed when offline, simulated offline, part of a backlog, or retried after a socket failure. If a socket delivery already committed and only its ACK was lost, retrying with `true` preserves the original committed record: the coordinate was ingested live.

## Repository files

| File | Purpose |
| --- | --- |
| `backend/prisma/schema.prisma` and migrations | Trips, idempotent points, commit sequences and broadcast outbox |
| `backend/src/telemetry/telemetry.service.ts` | Atomic bulk ingestion and cursor-based history |
| `backend/src/telemetry/telemetry.gateway.ts` | Authentication, authorized rooms, durable live ACKs and outbox publication |
| `backend/src/telemetry/telemetry.controller.ts` | Burst array validation, session metadata and history |
| `mobile/services/LocalDatabase.ts` | Serialized SQLite operations, atomic capture, bounded lock retries and ID deletion |
| `mobile/services/SyncManager.ts` | Single-flight delivery, socket fallback, reconnect and bounded exponential retries |
| `mobile/services/LocationTask.ts` | Module-scope registration, GPS capture and Android permission/service lifecycle |
| `mobile/screens/DriverScreen.tsx` | Active-trip controls, queue count, errors and persisted simulated network drop |
| `mobile/screens/ConsumerMap.tsx` | Sequence recovery, Reanimated marker props and compressed playback |
| `mobile/app.json`, `app.config.ts`, `eas.json` | Native permissions, build-time Maps key and APK preview profile |

## Local backend setup

Use Node 20.19.4 or later and Docker with Compose, or an existing PostgreSQL installation. The checked-in lockfile pins the dependency graph. Commands below use PowerShell and start in the repository root.

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Set a local `POSTGRES_PASSWORD` in the root `.env`. Set the matching, URL-encoded password in `backend/.env`'s `DATABASE_URL`, and a random `JWT_SECRET` of at least 32 characters. Keep the actual files out of version control. `npm run` executes backend commands in that workspace, where dotenv and Prisma load `backend/.env`.

```powershell
docker compose up -d
npm run db:migrate -w backend
npm run build:backend
npm run start -w backend
```

`npm run dev -w backend` uses `tsc-watch` to preserve the decorator metadata Nest dependency injection requires. Directly running the Nest entry point with `tsx` does not emit that metadata.

In another terminal, create a trip and issue credentials:

```powershell
npm run provision -w backend
```

Paste the printed **driverToken** into the driver app and **consumerToken** into the second device. Tokens authorize only their own trip; the driver subject must match `Trip.driverId`. They expire after seven days. To renew the same trip while an offline queue remains, run:

```powershell
npm run provision -w backend -- --trip-id YOUR_EXISTING_TRIP_UUID
```

The mobile Credential button accepts a renewed credential for the same trip without discarding pending points. Switching to a different trip requires stopping native tracking and emptying the queue. Credentials are stored in Expo SecureStore, rather than bundled into the APK. Provisioning is an operator CLI for the portfolio demo; integrate your identity provider and token renewal API for a deployed product.

## Mobile and APK setup

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Set `EXPO_PUBLIC_API_URL` to a reachable HTTPS origin, such as `https://api.your-domain.example`. The Android phone's `localhost` is the phone, not the development computer. A preview release requires HTTPS. A development client can use an HTTP URL only if its Android network-security configuration permits cleartext; HTTPS works with the supplied configuration.

Enable Google Maps SDK for Android and set `GOOGLE_MAPS_API_KEY`. Restrict the key to `com.nexusfleet.app` and the SHA-1 of the EAS signing certificate. The key is necessarily included in the native app, so Android application restrictions matter. `app.config.ts` reads it at build time; a literal `process.env...` string in JSON would not interpolate it. See [Expo Google Maps configuration](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/).

Configure the Expo account and project from the mobile directory:

```powershell
Set-Location mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli init
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://api.your-domain.example --visibility plaintext
npx eas-cli env:create --environment preview --name GOOGLE_MAPS_API_KEY --value YOUR_RESTRICTED_MAPS_KEY --visibility sensitive
npx eas-cli build --platform android --profile preview
```

EAS initialization adds the real project identifier to this app's configuration. Because this repository uses a dynamic config, copy any requested `extra.eas.projectId` into `app.config.ts`'s returned object. Keep the supplied `preview.android.buildType` equal to `apk`. Download and install the artifact from the resulting EAS build page. No EAS build or external deployment has been initiated by this implementation.

For an interactive development build, use the `development` profile and then `npm run start -w mobile`. Background Android location needs a development or standalone build: Expo Go does not supply the foreground/background services. See [Expo background location requirements](https://docs.expo.dev/versions/v54.0.0/sdk/location/) and [EAS APK configuration](https://docs.expo.dev/build-reference/apk/).

## API and socket protocol

All telemetry HTTP requests require `Authorization: Bearer <trip-token>`. Socket.IO requires `{ auth: { token } }` at connection time and uses WebSocket transport on the default namespace. Socket token expiry disconnects the client. A reverse proxy must forward WebSocket upgrades.

`POST /telemetry/burst-sync` accepts a JSON array of 1–500 objects:

```json
[
  {
    "tripId": "1d00a589-8bf5-44e1-b158-f53fc5b5b063",
    "clientPointId": "db7d63f8-df61-431b-9484-a26f49db31f0",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "heading": 355,
    "speed": 12.4,
    "timestamp": 1791120000000,
    "isOfflineCache": true
  }
]
```

The response after commit is:

```json
{"success":true,"acceptedIds":["db7d63f8-df61-431b-9484-a26f49db31f0"]}
```

Latitude/longitude are degrees, heading is clockwise from true north, speed is metres per second, and timestamp is epoch milliseconds. Missing speed or heading is `null`; Expo's negative sentinel values are normalized in the task. Prisma stores the timestamp as `TIMESTAMPTZ(3)` and converts it back to milliseconds at the API boundary. Unknown fields and invalid spatial values are rejected.

`live_location` accepts one identical object and acknowledges with the same response shape. `subscribe_trip` accepts `{ "trip_id": "<authorized UUID>" }`. The server publishes `location_frames` as `{ "points": [...] }`, adding `sequence` and `receivedAt` to each point. `GET /telemetry/history?after=0` returns up to 500 frames, `nextCursor`, and `hasMore`. `GET /telemetry/session` returns the authorized trip and role. `GET /health` checks database readiness.

## SQLite concurrency

All queries share one serialized promise queue, including settings and reads. Capture batches use `BEGIN IMMEDIATE` and `COMMIT`; errors roll back the whole batch. WAL permits readers on other native connections, `synchronous=FULL` requests durable commits, and a busy timeout plus bounded retries handles short cross-runtime contention. A rejected operation does not poison later operations.

Network I/O occurs outside SQLite transactions, so GPS inserts can continue while a batch uploads. Deletes use parameterized ID lists from an exact acknowledgement, never an unqualified table wipe. Batches stay below SQLite's usual bind-variable limits. Expo documents the transaction-scope hazards of ordinary asynchronous transactions; explicit connection serialization avoids unrelated queries joining the capture transaction. See [Expo SQLite transactions](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## Map interpolation mathematics

The marker coordinate is a native animated prop from `useAnimatedProps`; React state carries only status and historical polyline data. `latitude`, unwrapped `longitude`, and unwrapped `heading` are `useSharedValue` values. `withTiming` uses linear easing and a normal live duration of 1000 milliseconds:

```text
u(t) = clamp((t - t0) / duration, 0, 1)
latitude(t) = latitude0 + (latitude1 - latitude0) * u(t)
delta(a,b) = (((b - a + 180) mod 360) + 360) mod 360 - 180
longitude(t) = longitude0 + delta(longitude0, longitude1) * u(t)
heading(t) = heading0 + delta(heading0, heading1) * u(t)
```

Longitude is normalized to `[-180,180)` and heading to `[0,360)` only when feeding the native marker. Thus 179° to -179° crosses 2°, and heading 350° to 10° rotates 20°. Using raw endpoints would animate almost all the way around the earth or spin the vehicle backwards.

When GPS bearing is unknown, the previous and next coordinates supply a spherical initial bearing:

```text
dlambda = delta(longitude0, longitude1) * pi / 180
phi0 = latitude0 * pi / 180
phi1 = latitude1 * pi / 180
y = sin(dlambda) * cos(phi1)
x = cos(phi0)*sin(phi1) - sin(phi0)*cos(phi1)*cos(dlambda)
heading = normalizeDegrees(atan2(y,x) * 180 / pi)
```

A stationary fix retains the existing bearing. Coordinate interpolation is linear in geographic degrees, suitable for nearby vehicle fixes; it is not great-circle interpolation over long flights. The marker's first fix initializes immediately, avoiding an animation from an arbitrary default city.

Catch-up mode plays every pending newer point with `duration = max(30, min(120, 2000 / (remaining + 1)))`. A shared completion animation calls `scheduleOnRN` when the UI animation finishes, advancing the next segment. This avoids tying replay progression to a JS timer. Path updates are batched at 100 ms, with 5000 rendered fixes retained. History reads pause when the playback queue reaches 1000 fixes. Every accepted point stays in PostgreSQL even when it is outside the bounded display window. Older late arrivals fill the path in event-time order without moving the current marker backwards.

The Reanimated/Worklets dependencies follow the SDK 54 versions and Babel setup documented by [Expo](https://docs.expo.dev/versions/v54.0.0/sdk/reanimated/).

## Demonstration on two Android devices

1. Connect the driver and consumer with credentials for the same trip. Grant precise foreground location, then choose **Allow all the time** in the Android settings screen. Start the driver trip while the app is visible.
2. Move with the device. The consumer should animate between committed GPS fixes. Android shows the foreground service notification.
3. Turn on **Simulate Network Drop** and continue moving. The queue count grows and PostgreSQL receives no new points from subsequent captures while the flag remains active.
4. Background and reopen the driver app. The simulation flag and queue remain persisted. Turning off the flag starts burst delivery; the consumer fills the historical path with compressed interpolation.
5. Repeat with a real dead zone or airplane mode. Restore connectivity and return to the app. Confirm the queue drains and queued UUIDs appear exactly once in PostgreSQL.
6. Interrupt the API during delivery, restart it, and retry. Confirm the local queue remains until a commit ACK arrives. Kill the driver process after a batch has committed but before local deletion; reopening should safely retry those IDs.

The flag gates new delivery attempts. An upload already in flight when the button is pressed can finish and acknowledge its already-captured points. The simulator does not disable the separate consumer connection.

## Verification

The backend build, mobile TypeScript check, native Expo config introspection and Android Metro/Hermes bundle export were verified on this workspace. Six tests passed with no skips: two PostgreSQL/Nest integration scenarios and four mobile reliability/math scenarios. The integration tests cover concurrent retries, lost acknowledgements, transaction rollback, driver ownership, consumer write rejection, invalid coordinates, room isolation, actual Socket.IO broadcasts and history recovery after disconnect.

```powershell
npm run build:backend
npm run check:mobile
```

To run the integration suite, point `TEST_DATABASE_URL` at a **separate test database**, apply migrations there, and run:

```powershell
$env:TEST_DATABASE_URL='postgresql://nexus:TEST_PASSWORD@localhost:5432/nexusfleet_test?schema=public'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npm run db:migrate -w backend
npm test
```

Without `TEST_DATABASE_URL`, database tests are explicitly skipped. Mobile tests run on Node and verify acknowledgement validation, serialization recovery, angle wraparound and bearing calculations. They do not exercise the native SQLite binding, Android service lifecycle or actual Maps rendering. `node scripts/verify-pure.mjs` is a fallback runner for those same pure tests.

To regenerate the complete source listing:

```powershell
node scripts/source-guide.mjs
```

## Operating limits

Android can stop tracking after a force-stop, vendor task termination, permission revocation or reboot. The supplied Expo configuration does not implement a boot receiver or automatic restart after force-stop. Persisted data survives an ordinary process restart; capture resumes when native tracking is active or the user starts the trip again. NetInfo listeners and JS retry timers also cannot promise immediate background reconnection if the OS suspends execution. Background GPS callbacks attempt bounded sync, and foreground activation always retries. Test these behaviors on the target handset. See [Expo platform constraints](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

Storage exhaustion, uninstall and device failure are outside the durability guarantee. There is no queue eviction policy that silently discards coordinates. Capture/storage errors are logged and surfaced in the Driver screen when they can be persisted; monitor storage before a long-running deployment.

Run **one Nest gateway instance** with this configuration. Its outbox publisher and Socket.IO rooms are process-local. Before scaling horizontally, add a Socket.IO Redis adapter, shared rate limiting and outbox claims/leases. History recovery already handles missed and repeated publications. Use TLS termination, a restricted PostgreSQL network, database backups, location retention rules and outbox cleanup for deployment. The supplied Dockerfile builds from the root with `docker build -f backend/Dockerfile .`; its container listens on port 3000. Run Prisma migrations from the build/operator environment before rollout, because the production runtime prunes the Prisma development CLI.

The signed demo credentials are bearer credentials and expire after seven days. Production identity integration should issue shorter-lived tokens, renew them before expiry and apply driver/consumer revocation rules. Signing material stays on the backend. The supplied HTTP and socket rate limits protect this single-process demo; infrastructure-level connection limits are still a deployment concern.
