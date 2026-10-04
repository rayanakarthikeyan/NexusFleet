# Run NexusFleet locally

## Local backend setup

Use Node 20.19.4 or later and Docker with Compose, or an existing PostgreSQL installation. The checked-in lockfile pins the dependency graph. Commands below use PowerShell and start in the repository root.

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
```

Set a local `POSTGRES_PASSWORD` in the root `.env`. Set the matching, URL-encoded password in `backend/.env`'s `DATABASE_URL`, and copy that same local URL into `DIRECT_URL`. Set a random `JWT_SECRET` of at least 32 characters. Keep the actual files out of version control. `npm run` executes backend commands in that workspace, where dotenv and Prisma load `backend/.env`.

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

EAS initialization assigns the real project identifier. The dynamic config preserves `extra.eas.projectId` from `app.json` and also accepts an `EAS_PROJECT_ID` environment variable. Keep the supplied `preview.android.buildType` equal to `apk`. Download and install the artifact from the resulting EAS build page. See [the deployment runbook](deployment.md) for the Render/Neon setup and hosted build variables.

For an interactive development build, use the `development` profile and then `npm run start -w mobile`. Background Android location needs a development or standalone build: Expo Go does not supply the foreground/background services. See [Expo background location requirements](https://docs.expo.dev/versions/v54.0.0/sdk/location/) and [EAS APK configuration](https://docs.expo.dev/build-reference/apk/).
