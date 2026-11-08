-- DropIndex
DROP INDEX "BookAnnotation_bookId_cfi_text_key";

-- AlterTable
ALTER TABLE "BookAnnotation" ADD COLUMN     "userId" INTEGER NOT NULL DEFAULT 2691;

-- CreateIndex
CREATE INDEX "BookAnnotation_userId_idx" ON "BookAnnotation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnnotation_userId_bookId_cfi_text_key" ON "BookAnnotation"("userId", "bookId", "cfi", "text");
