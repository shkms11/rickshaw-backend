CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DriverLocation_driverId_key" ON "DriverLocation"("driverId");
CREATE INDEX "DriverLocation_updatedAt_idx" ON "DriverLocation"("updatedAt");
ALTER TABLE "DriverLocation" ADD CONSTRAINT "DriverLocation_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
