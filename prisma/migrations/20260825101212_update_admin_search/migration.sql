-- CreateIndex
CREATE INDEX "Complaint_userId_idx" ON "Complaint"("userId");

-- CreateIndex
CREATE INDEX "Complaint_tripId_idx" ON "Complaint"("tripId");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_subject_idx" ON "Complaint"("subject");

-- CreateIndex
CREATE INDEX "Complaint_createdAt_idx" ON "Complaint"("createdAt");

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- CreateIndex
CREATE INDEX "Driver_createdAt_idx" ON "Driver"("createdAt");

-- CreateIndex
CREATE INDEX "Owner_createdAt_idx" ON "Owner"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Rickshaw_ownerId_idx" ON "Rickshaw"("ownerId");

-- CreateIndex
CREATE INDEX "Rickshaw_status_idx" ON "Rickshaw"("status");

-- CreateIndex
CREATE INDEX "Rickshaw_createdAt_idx" ON "Rickshaw"("createdAt");

-- CreateIndex
CREATE INDEX "Trip_passengerId_idx" ON "Trip"("passengerId");

-- CreateIndex
CREATE INDEX "Trip_driverId_idx" ON "Trip"("driverId");

-- CreateIndex
CREATE INDEX "Trip_rickshawId_idx" ON "Trip"("rickshawId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_pickupLocation_idx" ON "Trip"("pickupLocation");

-- CreateIndex
CREATE INDEX "Trip_dropoffLocation_idx" ON "Trip"("dropoffLocation");

-- CreateIndex
CREATE INDEX "Trip_createdAt_idx" ON "Trip"("createdAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
