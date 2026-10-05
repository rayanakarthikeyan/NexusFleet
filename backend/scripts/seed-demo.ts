import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/accounts/password';

async function main() {
  const driverEmail = (process.env.DEMO_DRIVER_EMAIL ?? 'driver@nexusfleet.example')
    .trim()
    .toLowerCase();
  const viewerEmail = (process.env.DEMO_VIEWER_EMAIL ?? 'user@nexusfleet.example')
    .trim()
    .toLowerCase();
  if (driverEmail === viewerEmail) throw new Error('Driver and Viewer need different emails');
  const driverPassword = process.env.DEMO_DRIVER_PASSWORD;
  const viewerPassword = process.env.DEMO_VIEWER_PASSWORD;
  if (!driverPassword || !viewerPassword)
    throw new Error('Set DEMO_DRIVER_PASSWORD and DEMO_VIEWER_PASSWORD in backend/.env');
  const [driverHash, viewerHash] = await Promise.all([
    hashPassword(driverPassword),
    hashPassword(viewerPassword),
  ]);
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.demoAccount.findUnique({ where: { email: driverEmail } });
      const requested = process.env.DEMO_TRIP_ID;
      if (existing && requested && existing.tripId !== requested)
        throw new Error('Existing demo account belongs to another trip; refusing to rebind it');
      const trip =
        existing || requested
          ? await tx.trip.findUniqueOrThrow({ where: { id: existing?.tripId ?? requested! } })
          : await tx.trip.create({ data: { driverId: randomUUID() } });
      if (existing && (existing.role !== 'driver' || existing.id !== trip.driverId))
        throw new Error('Existing driver email conflicts with trip ownership');
      const viewer = await tx.demoAccount.findUnique({ where: { email: viewerEmail } });
      if (viewer && (viewer.role !== 'consumer' || viewer.tripId !== trip.id))
        throw new Error('Existing viewer email belongs to another role or trip');
      // Re-running seed renews hashes on the same trip; queued locations keep their identity.
      await tx.demoAccount.upsert({
        where: { email: driverEmail },
        update: { passwordHash: driverHash, disabled: false },
        create: {
          id: trip.driverId,
          email: driverEmail,
          passwordHash: driverHash,
          role: 'driver',
          tripId: trip.id,
        },
      });
      await tx.demoAccount.upsert({
        where: { email: viewerEmail },
        update: { passwordHash: viewerHash, disabled: false },
        create: { email: viewerEmail, passwordHash: viewerHash, role: 'consumer', tripId: trip.id },
      });
      return { tripId: trip.id, driverEmail, viewerEmail };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Demo seed failed');
  process.exitCode = 1;
});
