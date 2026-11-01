CREATE TABLE "AdminNoticeBoard" (
    "id" TEXT NOT NULL DEFAULT 'admin',
    "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminNoticeBoard_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AdminNoticeBoard" ("id", "items")
VALUES (
    'admin',
    '[
      "Review vehicle removal requests and lost-rickshaw alerts promptly.",
      "Use fleet controls to update vehicle and driver statuses.",
      "Registration approvals and user reports are available below."
    ]'::jsonb
), (
    'owner',
    '[
      "Search approved drivers by phone number before assigning a vehicle.",
      "A vehicle removal request takes effect only after admin approval.",
      "Lost-rickshaw alerts and admin decisions appear in your fleet."
    ]'::jsonb
), (
    'driver',
    '[
      "Turn on GPS sharing while working so your assigned vehicle can be tracked.",
      "Use the lost-rickshaw alert immediately if your assigned vehicle is missing.",
      "Send account or vehicle problems to the admin team from this dashboard."
    ]'::jsonb
);

ALTER TABLE "AdminNoticeBoard"
ADD CONSTRAINT "AdminNoticeBoard_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
