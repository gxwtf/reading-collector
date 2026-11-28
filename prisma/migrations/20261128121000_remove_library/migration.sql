-- 移除书库功能
--
-- 用户决定放弃书库（2026-11-28）。四张表删掉前已全量备份到
-- ~/backups/reading-library-20261128-114323/
--   tables-data.sql   数据（11 本书 + 0 批注 + 0 书签 + 0 会话）
--   tables-schema.sql 结构
--   reading-books.tar.gz  86MB 原始 EPUB/PDF
--   library-code.tar.gz   被删的代码
--
-- 顺序：先删有外键的子表，再删父表。Book 被 BookAnnotation /
-- BookBookmark / ReadingSession 引用，所以它必须最后删。

-- DropForeignKey
ALTER TABLE "BookAnnotation" DROP CONSTRAINT IF EXISTS "BookAnnotation_bookId_fkey";
ALTER TABLE "BookBookmark" DROP CONSTRAINT IF EXISTS "BookBookmark_bookId_fkey";
ALTER TABLE "ReadingSession" DROP CONSTRAINT IF EXISTS "ReadingSession_bookId_fkey";

-- DropTable
DROP TABLE IF EXISTS "ReadingSession";
DROP TABLE IF EXISTS "BookBookmark";
DROP TABLE IF EXISTS "BookAnnotation";
DROP TABLE IF EXISTS "Book";
