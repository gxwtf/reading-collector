ALTER TABLE "Entry" ADD COLUMN IF NOT EXISTS "shareToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Entry_shareToken_key" ON "Entry"("shareToken");
