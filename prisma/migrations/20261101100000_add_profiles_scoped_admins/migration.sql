ALTER TABLE "Driver" ALTER COLUMN "licenseNo" DROP NOT NULL;
ALTER TABLE "Owner" ADD COLUMN "rickshawSequence" INTEGER NOT NULL DEFAULT 0;

UPDATE "Owner"
SET "rickshawSequence" = (
    SELECT COUNT(*)::INTEGER
    FROM "Rickshaw"
    WHERE "Rickshaw"."ownerId" = "Owner"."id"
);

CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nid" TEXT,
    "nidIv" TEXT,
    "nidAuthTag" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "division" TEXT,
    "district" TEXT,
    "upazila" TEXT,
    "unionWard" TEXT,
    "villageRoad" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAssignment" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_division_district_upazila_idx" ON "UserProfile"("division", "district", "upazila");
CREATE UNIQUE INDEX "AdminAssignment_adminId_key" ON "AdminAssignment"("adminId");
CREATE INDEX "AdminAssignment_ownerId_idx" ON "AdminAssignment"("ownerId");

ALTER TABLE "UserProfile"
ADD CONSTRAINT "UserProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
