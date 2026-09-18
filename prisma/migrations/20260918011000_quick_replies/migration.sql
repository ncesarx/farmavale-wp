CREATE TABLE "QuickReply" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "QuickReply_organizationId_shortcut_key" ON "QuickReply"("organizationId", "shortcut");
CREATE INDEX "QuickReply_organizationId_isActive_category_idx" ON "QuickReply"("organizationId", "isActive", "category");
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
