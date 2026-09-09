ALTER TABLE "Message"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "Message_clientRequestId_key"
ON "Message"("clientRequestId");
