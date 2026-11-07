-- 中文没有空格，tsvector 切不开；改用 pg_trgm 让 ILIKE 走索引
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Entry_title_trgm_idx"
  ON "Entry" USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Entry_excerpt_trgm_idx"
  ON "Entry" USING gin (excerpt gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Entry_content_trgm_idx"
  ON "Entry" USING gin ("contentMd" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Highlight_quote_trgm_idx"
  ON "Highlight" USING gin (quote gin_trgm_ops);
