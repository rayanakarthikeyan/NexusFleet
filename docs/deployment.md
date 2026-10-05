# Deploy the demo

The stack stays the same: Expo/React Native, NestJS, Socket.IO, Prisma and PostgreSQL. Render hosts one gateway, Neon supplies PostgreSQL, and EAS builds the Android APK. Provider accounts are required; the map uses MapLibre and OpenFreeMap without an API key. The demo API is deployed at [nexusfleet-api.onrender.com](https://nexusfleet-api.onrender.com/health), backed by Neon Free in Singapore. Its HTTPS and Socket.IO paths were checked with synthetic points on 4 October 2026.

## 1. Create the Neon database

Create a project on Neon’s Free plan, using a region near the Render service. In **Connect**, copy both PostgreSQL connection strings:

- `DATABASE_URL`: the pooled URL, whose hostname contains `-pooler`.
- `DIRECT_URL`: the unpooled URL, used by Prisma migrations.

Keep Neon’s TLS parameters. Do not put either URL in a commit or a mobile environment variable. Free-plan availability and limits are listed in [Neon’s pricing](https://neon.com/pricing).

## 2. Create the Render service

In Render, create a Blueprint from this repository:

https://github.com/rayanakarthikeyan/NexusFleet

The root `render.yaml` declares a **Free** Node web service in Singapore. Leave the root directory unset so the build can read the shared lockfile. Supply the two Neon URLs when prompted. Render generates `JWT_SECRET`; preserve it across deployments so existing trip codes remain valid.

The build installs backend dependencies, generates Prisma Client and compiles TypeScript. Startup runs `prisma migrate deploy` before opening the HTTP listener. A failed migration stops startup instead of exposing an API against an incompatible schema. Prisma’s CLI stays installed for this native Node deployment; the separate Docker image expects migrations to be run by an operator before startup.

Wait for a successful deployment, then open:

```text
https://YOUR_RENDER_SERVICE.onrender.com/health
```

The endpoint checks PostgreSQL connectivity. Render supplies `PORT` and TLS. Native mobile clients do not require browser CORS; add explicit `CORS_ORIGINS` if you later deploy a web viewer.

Free services sleep after 15 minutes without inbound traffic and may take about a minute to wake. Open `/health` before a live presentation and allow the app to retry. A temporary timeout leaves the SQLite queue intact. Free services have no shell or pre-deploy command, which is why migrations run during startup. See [Render’s free-service limits](https://render.com/docs/free) and [Blueprint reference](https://render.com/docs/blueprint-spec).

## 3. Seed the demo accounts

On your computer, put the Neon URLs and the **same** Render `JWT_SECRET` in the ignored `backend/.env`. This file grants backend access; keep it private.

```powershell
npm ci
npm run build:backend
npm run seed:demo --workspace backend
```

Before seeding, set `DEMO_DRIVER_PASSWORD` and `DEMO_VIEWER_PASSWORD` in `backend/.env` to separate passwords of 12–128 characters. The default sign-in identifiers are `driver@nexusfleet.example` and `user@nexusfleet.example`; these reserved example addresses do not receive email. The seed stores salted password hashes in Neon. Neither passwords nor database credentials belong in Render's public variables, GitHub or the APK.

For an existing trip, set `DEMO_TRIP_ID` to its UUID before seeding. Repeating the seed preserves the trip and driver identity, so a pending queue can still sync. Sign in under the matching Driver or Viewer role; each successful login issues a token valid for seven days. See [local setup](local-setup.md) for account lifecycle details.

Trip access codes remain available as a fallback:

```powershell
npm run provision --workspace backend
```

The command prints driver and viewer codes valid for seven days. Share each code only with its intended demo device. To renew access without changing the trip or losing its pending queue:

```powershell
npm run provision --workspace backend -- --trip-id YOUR_EXISTING_TRIP_UUID
```

Use **Trip access** in the app to enter the renewed code. Opening that form keeps the driver’s foreground sync manager running.

## 4. Configure EAS and the free map

The project is linked in `mobile/app.json` to [NexusFleet on Expo](https://expo.dev/accounts/rayanakarthikeyan/projects/nexusfleet). A fork should initialize a separate Expo project from its `mobile` directory.

Set `EXPO_PUBLIC_API_URL` in the EAS **preview** environment to the actual Render HTTPS origin, without a path. Use plaintext visibility: this public address is bundled into the app. The preview build preflight rejects missing or placeholder configuration.

MapLibre Native uses the OpenFreeMap Liberty style by default. No map key, Google account or Google billing setup is needed. The Expo plugin installs the native renderer; it needs an APK or development build. Attribution remains enabled. Optionally set `EXPO_PUBLIC_MAP_STYLE_URL` to a compatible hosted style. Public tiles require connectivity; the SQLite telemetry queue still records fixes when the basemap cannot load. The app does not currently download offline basemap regions. See [OpenFreeMap](https://openfreemap.org/) and [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/).

## 5. Build and share the APK

The [1.0.1 phone build](https://expo.dev/accounts/rayanakarthikeyan/projects/nexusfleet/builds/d7fd3ab8-429a-490b-bf88-10011703cff6) was submitted from commit `8183cd9` on 5 October 2026, with Android versionCode 3. It adds email/password sign-in and compressed ARM64-only native libraries. Download the APK from that page once the build succeeds. It reuses the existing signing key; account passwords are excluded from the bundle.

The first signed preview build is available as the [APK download](https://expo.dev/artifacts/eas/aAnk1gV-ivbnHGLIvLE_Gms9LGlbmuh5Llcywy3_JeM.apk) and on [EAS](https://expo.dev/accounts/rayanakarthikeyan/projects/nexusfleet/builds/7457eb8b-46df-436b-a6b5-ad28b49bc129). It is version 1.0.0 (Android versionCode 2), built from commit `c4fc3a7` on 4 October 2026. Access codes and backend secrets are excluded. Ten CI tests and hosted API/socket checks passed; physical-device validation remains required.

From `mobile`:

```powershell
npx eas-cli build --platform android --profile phone
```

Use `phone` for the smaller ARM64 APK. For a universal APK that also supports ARM32 and x86 devices:

```powershell
npx eas-cli build --platform android --profile preview
```

The checked-in preview profile produces an `.apk` for direct installation. Share the successful build’s installation link and use it on both Android devices. The app runs independently of Metro. EAS Free uses a limited, lower-priority build quota; consult [Expo’s plans](https://docs.expo.dev/billing/plans/) before starting repeated builds.

Run the [two-device checklist](demo.md) before sharing the demo. Verify the real APK’s background permission flow, queue retention and catch-up rendering. A passing TypeScript check or JS bundle export does not establish that these native behaviors work.

## Troubleshooting

| Symptom                     | First check                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Initial API timeout         | Wake the Render service through `/health`; check deployment logs                       |
| Migration startup failure   | `DIRECT_URL` must be the unpooled Neon URL with TLS enabled                            |
| Access code rejected        | Provisioning and Render must use the same `JWT_SECRET`; check code expiry              |
| Queue stays nonzero         | Simulation switch, connectivity, access code expiry and backend health                 |
| Blank basemap               | Device connectivity, OpenFreeMap availability and the optional style URL               |
| Capture stops in background | Precise/background permissions, native service notification and handset power settings |
