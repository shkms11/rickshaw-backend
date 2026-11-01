CREATE TYPE "AiActionType" AS ENUM ('ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_UPDATE', 'RICKSHAW_STATUS', 'DRIVER_STATUS');

CREATE TABLE "AiActionLog" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AiActionType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "AiActionLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiActionLog_proposalId_key" ON "AiActionLog"("proposalId");
CREATE INDEX "AiActionLog_userId_createdAt_idx" ON "AiActionLog"("userId", "createdAt");

ALTER TABLE "AiActionLog"
ADD CONSTRAINT "AiActionLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
