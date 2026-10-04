# Deploy the demo

The stack stays the same: Expo/React Native, NestJS, Socket.IO, Prisma and PostgreSQL. Render hosts one gateway, Neon supplies PostgreSQL, and EAS builds the Android APK. Provider accounts and a Google Maps Android key are required. These instructions do not imply that a service or APK has already been published.

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

## 3. Provision a demo trip locally

On your computer, put the Neon URLs and the **same** Render `JWT_SECRET` in the ignored `backend/.env`. This file grants backend access; keep it private.

```powershell
npm ci
npm run build:backend
npm run provision --workspace backend
```

The command creates a trip and prints driver and viewer codes valid for seven days. Share each code only with its intended demo device. To renew access without changing the trip or losing its pending queue:

```powershell
npm run provision --workspace backend -- --trip-id YOUR_EXISTING_TRIP_UUID
```

Use **Trip access** in the app to enter the renewed code. Opening that form keeps the driver’s foreground sync manager running.

## 4. Configure EAS and Google Maps

In `mobile`, sign in to Expo and initialize the project:

```powershell
Set-Location mobile
npx eas-cli login
npx eas-cli init
```

For the dynamic app configuration, store the assigned UUID as `EAS_PROJECT_ID` in `mobile/.env` and in the EAS preview environment. Alternatively, put the non-secret project ID in `extra.eas.projectId` in `app.json`; the dynamic config preserves it. Do not use a made-up UUID.

Set these variables in the EAS **preview** environment through the Expo dashboard or CLI:

| Variable              | Value                                               | Visibility |
| --------------------- | --------------------------------------------------- | ---------- |
| `EAS_PROJECT_ID`      | Actual Expo project UUID                            | Plaintext  |
| `EXPO_PUBLIC_API_URL` | Actual Render HTTPS origin, without a trailing path | Plaintext  |
| `GOOGLE_MAPS_API_KEY` | Restricted Android Maps key                         | Sensitive  |

Enable Maps SDK for Android. Restrict the key to `com.nexusfleet.app` and the SHA-1 of the EAS signing certificate, available through `npx eas-cli credentials --platform android`. Maps requires its own Google Cloud configuration and billing eligibility; a free EAS account does not supply a Maps key. Check [Google’s setup requirements](https://developers.google.com/maps/documentation/android-sdk/get-api-key) and [Expo’s map configuration](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/).

## 5. Build and share the APK

From `mobile`:

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
| Blank Google map            | Maps SDK enabled, API key configured, package name and signing SHA-1 restrictions      |
| Capture stops in background | Precise/background permissions, native service notification and handset power settings |
