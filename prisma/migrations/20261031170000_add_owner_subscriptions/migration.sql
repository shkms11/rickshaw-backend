CREATE TABLE "OwnerSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trialStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidUntil" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSubscription_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OwnerSubscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OwnerSubscriptionPayment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "gatewaySessionId" TEXT,
    "validationId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "rickshawCount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "OwnerSubscriptionPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OwnerSubscriptionPayment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OwnerSubscription_ownerId_key" ON "OwnerSubscription"("ownerId");
CREATE INDEX "OwnerSubscription_paidUntil_idx" ON "OwnerSubscription"("paidUntil");
CREATE UNIQUE INDEX "OwnerSubscriptionPayment_transactionId_key" ON "OwnerSubscriptionPayment"("transactionId");
CREATE INDEX "OwnerSubscriptionPayment_ownerId_status_idx" ON "OwnerSubscriptionPayment"("ownerId", "status");
CREATE INDEX "OwnerSubscriptionPayment_createdAt_idx" ON "OwnerSubscriptionPayment"("createdAt");

INSERT INTO "OwnerSubscription" ("id", "ownerId", "isDemo", "updatedAt")
SELECT 'demo-' || md5("Owner"."id"), "Owner"."id", true, CURRENT_TIMESTAMP
FROM "Owner"
JOIN "User" ON "User"."id" = "Owner"."userId"
WHERE "User"."email" IN ('rahman@rickshaw.com', 'dhaka@rickshaw.com')
ON CONFLICT ("ownerId") DO UPDATE SET "isDemo" = true;
