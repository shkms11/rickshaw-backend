ALTER TABLE "AdminAssignment"
DROP CONSTRAINT "AdminAssignment_scope_check";

ALTER TABLE "AdminAssignment"
ADD CONSTRAINT "AdminAssignment_scope_check"
CHECK (("isObserver" = true AND "ownerId" IS NULL) OR "isObserver" = false);

CREATE UNIQUE INDEX "AdminAssignment_adminId_global_key"
ON "AdminAssignment"("adminId")
WHERE "ownerId" IS NULL;
