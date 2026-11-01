CREATE TABLE "DriverActivityEntry" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "fare" DECIMAL(10,2) NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverActivityEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DriverActivityEntry_driverId_workDate_idx"
ON "DriverActivityEntry"("driverId", "workDate");

ALTER TABLE "DriverActivityEntry"
ADD CONSTRAINT "DriverActivityEntry_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
