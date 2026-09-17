CREATE TABLE "SlaPolicy" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "priority" "ConversationPriority" NOT NULL,
  "responseMinutes" INTEGER NOT NULL,
  "warningMinutes" INTEGER NOT NULL DEFAULT 15,
  "escalateAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  "notifySupervisors" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SlaPolicy_organizationId_priority_key" ON "SlaPolicy"("organizationId", "priority");
CREATE INDEX "SlaPolicy_organizationId_isActive_idx" ON "SlaPolicy"("organizationId", "isActive");
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SlaPolicy" ("id", "organizationId", "priority", "responseMinutes", "warningMinutes", "escalateAfterMinutes", "updatedAt")
SELECT 'sla_' || md5(o."id" || p.priority), o."id", p.priority::"ConversationPriority", p.response_minutes, p.warning_minutes, p.escalate_minutes, CURRENT_TIMESTAMP
FROM "Organization" o
CROSS JOIN (VALUES
  ('LOW', 240, 30, 60),
  ('NORMAL', 60, 15, 30),
  ('HIGH', 30, 10, 15),
  ('URGENT', 10, 5, 5)
) AS p(priority, response_minutes, warning_minutes, escalate_minutes)
ON CONFLICT ("organizationId", "priority") DO NOTHING;
