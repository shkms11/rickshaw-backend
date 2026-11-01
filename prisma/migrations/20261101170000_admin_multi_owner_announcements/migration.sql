DROP INDEX "AdminAssignment_adminId_key";
ALTER TABLE "AdminAssignment" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "AdminAssignment" ADD COLUMN "isObserver" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "AdminAssignment_adminId_idx" ON "AdminAssignment"("adminId");
CREATE UNIQUE INDEX "AdminAssignment_adminId_ownerId_key" ON "AdminAssignment"("adminId", "ownerId");
ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_scope_check"
CHECK (("isObserver" = true AND "ownerId" IS NULL) OR ("isObserver" = false AND "ownerId" IS NOT NULL));

CREATE TYPE "AnnouncementAudience" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'DRIVER');

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "targetUserId" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Announcement_audience_createdAt_idx" ON "Announcement"("audience", "createdAt");
CREATE INDEX "Announcement_targetUserId_createdAt_idx" ON "Announcement"("targetUserId", "createdAt");
CREATE INDEX "Announcement_ownerId_audience_createdAt_idx" ON "Announcement"("ownerId", "audience", "createdAt");

ALTER TABLE "AdminAssignment" DROP CONSTRAINT "AdminAssignment_ownerId_fkey";
ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
ADD CONSTRAINT "Announcement_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
ADD CONSTRAINT "Announcement_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
ADD CONSTRAINT "Announcement_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
