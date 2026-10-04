import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
async function main() {
  if ((process.env.JWT_SECRET?.length ?? 0) < 32) throw new Error('Configure JWT_SECRET first');
  const db = new PrismaClient();
  try {
    const index = process.argv.indexOf('--trip-id');
    const requestedTrip = index >= 0 ? process.argv[index + 1] : undefined;
    if (index >= 0 && !requestedTrip) throw new Error('--trip-id requires an existing trip UUID');
    const trip = requestedTrip
      ? await db.trip.findUniqueOrThrow({ where: { id: requestedTrip } })
      : await db.trip.create({ data: { driverId: randomUUID() } });
    const driverId = trip.driverId;
    const jwt = new JwtService({ secret: process.env.JWT_SECRET });
    const issue = (sub: string, role: string) =>
      jwt.sign(
        { sub, role, tripId: trip.id },
        {
          issuer: 'nexusfleet',
          audience: 'nexusfleet-mobile',
          expiresIn: '7d',
          algorithm: 'HS256',
        },
      );
    // Manual provisioning for the portfolio demo; credentials never ship in an APK.
    console.log(
      JSON.stringify(
        {
          tripId: trip.id,
          driverToken: issue(driverId, 'driver'),
          consumerToken: issue(randomUUID(), 'consumer'),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
