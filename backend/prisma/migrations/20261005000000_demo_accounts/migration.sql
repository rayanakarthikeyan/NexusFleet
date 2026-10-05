CREATE TABLE "DemoAccount" (
  "id" UUID PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('driver', 'consumer')),
  "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "DemoAccount_email_key" ON "DemoAccount"("email");
CREATE INDEX "DemoAccount_tripId_idx" ON "DemoAccount"("tripId");
