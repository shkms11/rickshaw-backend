CREATE TABLE "OwnerRentalIncomeEntry" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "rickshawId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OwnerRentalIncomeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerRentalIncomeEntry_rickshawId_workDate_key"
ON "OwnerRentalIncomeEntry"("rickshawId", "workDate");
CREATE INDEX "OwnerRentalIncomeEntry_ownerId_workDate_idx"
ON "OwnerRentalIncomeEntry"("ownerId", "workDate");

ALTER TABLE "OwnerRentalIncomeEntry"
ADD CONSTRAINT "OwnerRentalIncomeEntry_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "Owner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OwnerRentalIncomeEntry"
ADD CONSTRAINT "OwnerRentalIncomeEntry_rickshawId_fkey"
FOREIGN KEY ("rickshawId") REFERENCES "Rickshaw"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
