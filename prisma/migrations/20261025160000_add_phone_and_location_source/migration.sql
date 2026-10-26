ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

CREATE TYPE "LocationSource" AS ENUM ('LIVE', 'LAST_KNOWN', 'DEMO');
ALTER TABLE "DriverLocation"
    ADD COLUMN "source" "LocationSource" NOT NULL DEFAULT 'LIVE';
