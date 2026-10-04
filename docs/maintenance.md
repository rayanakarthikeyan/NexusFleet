# Maintenance notes

## Dependency audit — 4 October 2026

The locked dependency graph reports 35 npm advisories: 25 high and 10 moderate. The backend-only audit with `--omit=dev` reports four high findings in Prisma, `@prisma/config`, `deepmerge-ts` and `effect`; npm retains the CLI through Prisma Client’s optional peer relationship. The full graph also reports Expo-related dependencies including `braces`, `node-forge`, `postcss`, `image-size` and `uuid`.

These counts are not a reachability assessment. The reported issues have not all been resolved. A safe-range update made no changes; `npm audit fix` proposed a Prisma downgrade and failed dependency resolution. Do not force a downgrade or override major versions just to make the audit output green.

Before a production release, update Expo and Prisma as a deliberate migration, review the relevant advisories, regenerate the client, and rerun database and physical-device checks. The Render demo retains the Prisma CLI because migrations run at startup. A production deployment should run migrations separately and ship a pruned runtime, as the Dockerfile already supports.

Useful commands:

```powershell
npm audit
npm audit --omit=dev --workspace backend
npm outdated
```

## Before sharing a demo build

- Complete the physical-device checklist in [demo.md](demo.md).
- Record the API URL, APK version and supported handset/Android version.
- Renew the demo trip codes if the seven-day expiry falls during the presentation.
- Check provider quotas and wake the Render service before the session.
- Check that OpenFreeMap loads on the target network and map attribution remains visible.

## Before adding gateway replicas

Add a shared Socket.IO adapter, rate limiting and transactional outbox claims. Multiple instances of the current publisher can emit the same outbox row, and a room only contains sockets connected to its own process. The demo intentionally runs one instance.
