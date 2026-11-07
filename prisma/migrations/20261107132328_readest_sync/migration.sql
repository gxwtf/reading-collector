-- DropIndex
DROP INDEX "Entry_content_trgm_idx";

-- DropIndex
DROP INDEX "Entry_excerpt_trgm_idx";

-- DropIndex
DROP INDEX "Entry_title_trgm_idx";

-- DropIndex
DROP INDEX "Highlight_quote_trgm_idx";

-- CreateTable
CREATE TABLE "Book" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "format" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "readStatus" TEXT,
    "epubCfi" TEXT,
    "epubHref" TEXT,
    "epubPercent" DOUBLE PRECISION,
    "pdfPage" INTEGER,
    "pdfPercent" DOUBLE PRECISION,
    "lastReadTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnnotation" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER NOT NULL,
    "cfi" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT,
    "style" TEXT,
    "note" TEXT,
    "chapterTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookBookmark" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER NOT NULL,
    "cfi" TEXT,
    "pageNumber" INTEGER,
    "title" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingSession" (
    "id" SERIAL NOT NULL,
    "bookId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "startProgress" DOUBLE PRECISION,
    "endProgress" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Book_fileName_key" ON "Book"("fileName");

-- CreateIndex
CREATE INDEX "Book_userId_idx" ON "Book"("userId");

-- CreateIndex
CREATE INDEX "BookAnnotation_bookId_idx" ON "BookAnnotation"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnnotation_bookId_cfi_text_key" ON "BookAnnotation"("bookId", "cfi", "text");

-- CreateIndex
CREATE INDEX "BookBookmark_bookId_idx" ON "BookBookmark"("bookId");

-- CreateIndex
CREATE INDEX "ReadingSession_bookId_idx" ON "ReadingSession"("bookId");

-- AddForeignKey
ALTER TABLE "BookAnnotation" ADD CONSTRAINT "BookAnnotation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookBookmark" ADD CONSTRAINT "BookBookmark_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingSession" ADD CONSTRAINT "ReadingSession_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
