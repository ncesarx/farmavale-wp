ALTER TABLE "Conversation"
  ADD COLUMN "welcomeStage" TEXT NOT NULL DEFAULT 'OFF',
  ADD COLUMN "welcomeName" TEXT,
  ADD COLUMN "welcomeReason" TEXT,
  ADD COLUMN "welcomeTurns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "welcomeUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "welcomeLastInboundAt" TIMESTAMP(3);
CREATE INDEX "Conversation_welcomeStage_welcomeUpdatedAt_idx" ON "Conversation"("welcomeStage", "welcomeUpdatedAt");
