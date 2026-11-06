-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "mediaError" TEXT,
ADD COLUMN     "mediaPath" VARCHAR(500),
ADD COLUMN     "mediaState" VARCHAR(20) NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "prefs" JSONB;

-- CreateTable
CREATE TABLE "Keyframe" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "timeSec" DOUBLE PRECISION NOT NULL,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyframe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Keyframe_entryId_idx" ON "Keyframe"("entryId");

-- AddForeignKey
ALTER TABLE "Keyframe" ADD CONSTRAINT "Keyframe_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyframe" ADD CONSTRAINT "Keyframe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
