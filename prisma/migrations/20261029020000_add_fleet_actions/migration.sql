CREATE TYPE "FleetActionType" AS ENUM ('LOST_RICKSHAW', 'REMOVE_RICKSHAW');
CREATE TYPE "FleetActionStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED', 'RESOLVED');

CREATE TABLE "FleetAction" (
    "id" TEXT NOT NULL,
    "rickshawId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "type" "FleetActionType" NOT NULL,
    "status" "FleetActionStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetAction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FleetAction_rickshawId_fkey" FOREIGN KEY ("rickshawId") REFERENCES "Rickshaw"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FleetAction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FleetAction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FleetAction_rickshawId_status_idx" ON "FleetAction"("rickshawId", "status");
CREATE INDEX "FleetAction_type_status_idx" ON "FleetAction"("type", "status");
CREATE INDEX "FleetAction_createdAt_idx" ON "FleetAction"("createdAt");
