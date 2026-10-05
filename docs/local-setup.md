# Run NexusFleet locally

## Local backend setup

Use Node 22 or later and Docker with Compose, or an existing PostgreSQL installation. The checked-in lockfile pins the dependency graph. Commands below use PowerShell and start in the repository root.

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

## Seed email/password demo accounts

Set `DEMO_DRIVER_PASSWORD` and `DEMO_VIEWER_PASSWORD` in the ignored `backend/.env` to different passwords of 12–128 characters. The default emails are `driver@nexusfleet.example` and `user@nexusfleet.example`; these are demo account identifiers, not email inboxes. Override the email variables if needed.

Run `npm run seed:demo --workspace backend`. The operator CLI stores salted scrypt hashes and binds both accounts to one trip. Re-running updates hashes on the same trip. Set `DEMO_TRIP_ID` when adding accounts to an existing trip; the seed refuses to rebind an existing account to a different trip. Passwords never enter GitHub or the mobile bundle.

In APK version 1.0.1 or later, choose Driver or Viewer and enter its email/password. The server returns a seven-day scoped token; the app saves only that token in SecureStore. Sign in again to renew without abandoning a pending driver queue. **Use a trip code instead** preserves access-code login. No public registration or password-reset flow is supplied for these operator-managed demo accounts.

## Mobile and APK setup

```powershell
Copy-Item mobile/.env.example mobile/.env
```

Set `EXPO_PUBLIC_API_URL` to a reachable HTTPS origin, such as `https://api.your-domain.example`. The Android phone's `localhost` is the phone, not the development computer. A preview release requires HTTPS. A development client can use an HTTP URL only if its Android network-security configuration permits cleartext; HTTPS works with the supplied configuration.

MapLibre Native renders the free OpenFreeMap Liberty style. No map API key or Google account is required. The MapLibre Expo plugin requires a native build; Expo Go cannot load it. Attribution stays enabled. Optionally set `EXPO_PUBLIC_MAP_STYLE_URL` to another compatible style. See [MapLibre Expo setup](https://maplibre.org/maplibre-react-native/docs/setup/expo/) and [OpenFreeMap](https://openfreemap.org/).

Configure the Expo account and project from the mobile directory:

```powershell
Set-Location mobile
npx eas-cli login
npx eas-cli build:configure
npx eas-cli init
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://api.your-domain.example --visibility plaintext
npx eas-cli build --platform android --profile phone
```

EAS initialization assigns the real project identifier in `app.json`. This repository is linked to the owner's NexusFleet project. Forks should initialize their own project. The `phone` profile extends preview and builds compressed ARM64 libraries. Use `preview` for a universal APK including emulator/32-bit architectures. Keep `preview.android.buildType` equal to `apk`. The build preflight rejects a missing or placeholder API URL before native compilation. Download the artifact from the resulting build page. See [the deployment runbook](deployment.md) for hosted configuration.

For an interactive development build, use the `development` profile and then `npm run start -w mobile`. Background Android location needs a development or standalone build: Expo Go does not supply the foreground/background services. See [Expo background location requirements](https://docs.expo.dev/versions/v54.0.0/sdk/location/) and [EAS APK configuration](https://docs.expo.dev/build-reference/apk/).
