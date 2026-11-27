-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "entryId" INTEGER,
    "filename" VARCHAR(255) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "mime" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attachment_userId_createdAt_idx" ON "Attachment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_entryId_idx" ON "Attachment"("entryId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
