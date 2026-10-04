# Delivery, recovery and map playback

## Delivery and recovery

1. The background task captures a native location batch and inserts it atomically into SQLite. UUIDs are assigned once and retained through every delivery retry.
2. The sync manager reads a bounded snapshot of at most 500 points. The persisted simulation flag and NetInfo state gate both Socket.IO and HTTP delivery. Internet reachability `null` permits an attempt; `false` does not.
3. A fresh isolated fix uses `live_location`. The gateway commits it to PostgreSQL before acknowledging it. A dropped socket or lost ACK falls back to REST with the same ID. Historical batches use `POST /telemetry/burst-sync` directly.
4. PostgreSQL enforces uniqueness on `(tripId, clientPointId)`. A trip row lock serializes sequence allocation and commit order. A retry returns the original IDs without allocating additional points or notifications. Reusing an ID for different coordinates rejects the entire batch.
5. SQLite deletes only IDs from a validated commit acknowledgement. New fixes inserted while an upload is in flight survive. A crash after server commit and before local deletion causes a harmless duplicate attempt on restart.
6. A transaction also writes a broadcast outbox. A polling gateway publishes committed arrays to the trip room. Consumers subscribe, then request paginated history, deduplicating by sequence. Periodic history reads recover packets missed by Socket.IO, including when the server restarts.

Delivery is **at least once**, with an idempotent database effect. Socket.IO alone does not guarantee arrival of a server event at a disconnected consumer; history recovery supplies that guarantee for committed points. See [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).

`isOfflineCache` describes a delayed ingestion. Queue rows are marked delayed when offline, simulated offline, part of a backlog, or retried after a socket failure. If a socket delivery already committed and only its ACK was lost, retrying with `true` preserves the original committed record: the coordinate was ingested live.

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
{ "success": true, "acceptedIds": ["db7d63f8-df61-431b-9484-a26f49db31f0"] }
```

Latitude/longitude are degrees, heading is clockwise from true north, speed is metres per second, and timestamp is epoch milliseconds. Missing speed or heading is `null`; Expo's negative sentinel values are normalized in the task. Prisma stores the timestamp as `TIMESTAMPTZ(3)` and converts it back to milliseconds at the API boundary. Unknown fields and invalid spatial values are rejected.

`live_location` accepts one identical object and acknowledges with the same response shape. `subscribe_trip` accepts `{ "trip_id": "<authorized UUID>" }`. The server publishes `location_frames` as `{ "points": [...] }`, adding `sequence` and `receivedAt` to each point. `GET /telemetry/history?after=0` returns up to 500 frames, `nextCursor`, and `hasMore`. `GET /telemetry/session` returns the authorized trip and role. `GET /health` checks database readiness.

## SQLite concurrency

All queries share one serialized promise queue, including settings and reads. Capture batches use `BEGIN IMMEDIATE` and `COMMIT`; errors roll back the whole batch. WAL permits readers on other native connections, `synchronous=FULL` requests durable commits, and a busy timeout plus bounded retries handles short cross-runtime contention. A rejected operation does not poison later operations.

Network I/O occurs outside SQLite transactions, so GPS inserts can continue while a batch uploads. Deletes use parameterized ID lists from an exact acknowledgement, never an unqualified table wipe. Batches stay below SQLite's usual bind-variable limits. Expo documents the transaction-scope hazards of ordinary asynchronous transactions; explicit connection serialization avoids unrelated queries joining the capture transaction. See [Expo SQLite transactions](https://docs.expo.dev/versions/latest/sdk/sqlite/).

## Map interpolation mathematics

MapLibre renders the OpenFreeMap Liberty style without an API key, with attribution enabled. Its marker takes a native `lngLat` animated prop (longitude first) from `useAnimatedProps`; React state carries only status and historical polyline data. `latitude`, unwrapped `longitude`, and unwrapped `heading` are `useSharedValue` values. `withTiming` uses linear easing and a normal live duration of 1000 milliseconds:

```text
u(t) = clamp((t - t0) / duration, 0, 1)
latitude(t) = latitude0 + (latitude1 - latitude0) * u(t)
delta(a,b) = (((b - a + 180) mod 360) + 360) mod 360 - 180
longitude(t) = longitude0 + delta(longitude0, longitude1) * u(t)
heading(t) = heading0 + delta(heading0, heading1) * u(t)
```

Longitude is normalized to `[-180,180)` in `lngLat`. Heading is normalized to `[0,360)` in `useAnimatedStyle`, which rotates the marker's arrow. Map rotation and pitch gestures are disabled so the arrow stays aligned with true north. Thus 179° to -179° crosses 2°, and heading 350° to 10° rotates 20°. Using raw endpoints would animate almost all the way around the earth or spin the vehicle backwards.

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

## Operating limits

Android can stop tracking after a force-stop, vendor task termination, permission revocation or reboot. The supplied Expo configuration does not implement a boot receiver or automatic restart after force-stop. Persisted data survives an ordinary process restart; capture resumes when native tracking is active or the user starts the trip again. NetInfo listeners and JS retry timers also cannot promise immediate background reconnection if the OS suspends execution. Background GPS callbacks attempt bounded sync, and foreground activation always retries. Test these behaviors on the target handset. See [Expo platform constraints](https://docs.expo.dev/versions/v54.0.0/sdk/location/).

Storage exhaustion, uninstall and device failure are outside the durability guarantee. There is no queue eviction policy that silently discards coordinates. Capture/storage errors are logged and surfaced in the Driver screen when they can be persisted; monitor storage before a long-running deployment.

Run **one Nest gateway instance** with this configuration. Its outbox publisher and Socket.IO rooms are process-local. Before scaling horizontally, add a Socket.IO Redis adapter, shared rate limiting and outbox claims/leases. History recovery already handles missed and repeated publications. Use TLS termination, a restricted PostgreSQL network, database backups, location retention rules and outbox cleanup for deployment. The supplied Dockerfile builds from the root with `docker build -f backend/Dockerfile .`; its container listens on port 3000. Run Prisma migrations from the build/operator environment before rollout, because the production runtime prunes the Prisma development CLI.

The signed demo credentials are bearer credentials and expire after seven days. Production identity integration should issue shorter-lived tokens, renew them before expiry and apply driver/consumer revocation rules. Signing material stays on the backend. The supplied HTTP and socket rate limits protect this single-process demo; infrastructure-level connection limits are still a deployment concern.
