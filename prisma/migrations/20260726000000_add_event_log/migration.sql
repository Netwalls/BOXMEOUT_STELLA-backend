-- Add EventLog table for idempotent event processing
CREATE TABLE IF NOT EXISTS "EventLog" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventType"   TEXT NOT NULL,
  "contractId"  TEXT NOT NULL,
  "ledger"      INTEGER NOT NULL,
  "txHash"      TEXT NOT NULL,
  "body"        JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- Ensure no duplicate event processing: same txHash + eventType never processed twice
CREATE UNIQUE INDEX IF NOT EXISTS "EventLog_txHash_eventType_key"
  ON "EventLog" ("txHash", "eventType");
