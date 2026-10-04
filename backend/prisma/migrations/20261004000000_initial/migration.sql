CREATE TABLE "Trip" (
  "id" UUID PRIMARY KEY, "driverId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextSequence" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "TelemetryPoint" (
  "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "clientPointId" UUID NOT NULL, "sequence" INTEGER NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "heading" DOUBLE PRECISION CHECK ("heading" >= 0 AND "heading" < 360),
  "speed" DOUBLE PRECISION CHECK ("speed" >= 0),
  "timestamp" TIMESTAMPTZ(3) NOT NULL, "isOfflineCache" BOOLEAN NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("tripId", "clientPointId")
);
CREATE UNIQUE INDEX "TelemetryPoint_tripId_sequence_key" ON "TelemetryPoint"("tripId", "sequence");
CREATE INDEX "TelemetryPoint_tripId_timestamp_idx" ON "TelemetryPoint"("tripId", "timestamp");
CREATE TABLE "TelemetryOutbox" (
  "id" SERIAL PRIMARY KEY, "tripId" UUID NOT NULL REFERENCES "Trip"("id") ON DELETE RESTRICT,
  "payload" JSONB NOT NULL, "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TelemetryOutbox_publishedAt_id_idx" ON "TelemetryOutbox"("publishedAt", "id");
