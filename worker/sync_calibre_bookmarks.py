#!/usr/bin/env python3
"""把 Calibre-Web 的书签单向同步到 BookAnnotation。

Calibre-Web 把书签存在 /home/gxwtf/calibre-config/app.db 的 bookmark 表：
    (id, user_id, book_id, format, bookmark_key)
bookmark_key 是 epub CFI 或页码锚点。这里按标题把它映射到我们的 Book，
写进 BookAnnotation（style='bookmark'，text 放占位说明，避免与划线冲突）。
"""
import json
import os
import re
import sqlite3
import subprocess

CAL_DB = "/home/gxwtf/calibre-config/app.db"
CAL_LIB = "/home/gxwtf/calibre-library/metadata.db"
DROP_DIR = "/home/gxwtf/reading-books/u2691"
USER_ID = 2691

for line in open("/home/gxwtf/gxwtf_reading/.env", encoding="utf-8"):
    if line.startswith("DATABASE_URL="):
        DB = line.split("=", 1)[1].strip().strip('"')

if not os.path.exists(CAL_DB):
    raise SystemExit("找不到 calibre-web 数据库")


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]", "", (s or "").lower())


# 1) calibre book_id → 标题
titles = {}
try:
    c = sqlite3.connect(f"file:{CAL_LIB}?mode=ro", uri=True)
    for bid, title in c.execute("select id, title from books"):
        titles[bid] = title
except Exception as e:  # noqa: BLE001
    print("读取 calibre 库失败:", e)

# 2) 我们库里的书
rows = json.loads(
    subprocess.run(
        ["psql", DB, "-tAc",
         "select coalesce(json_agg(json_build_object('id',id,'title',title)),'[]') from \"Book\""],
        capture_output=True, text=True,
    ).stdout or "[]"
)
by_title = {norm(r["title"]): r["id"] for r in rows}

# 3) calibre-web 书签
marks = []
try:
    cw = sqlite3.connect(f"file:{CAL_DB}?mode=ro", uri=True)
    for uid, bid, fmt, key in cw.execute(
        "select user_id, book_id, format, bookmark_key from bookmark"
    ):
        marks.append((bid, fmt, key))
except Exception as e:  # noqa: BLE001
    print("读取书签失败:", e)

print(f"书签 {len(marks)} 条，本地书 {len(rows)} 本")

added = 0
for bid, fmt, key in marks:
    title = titles.get(bid)
    if not title:
        continue
    book_id = by_title.get(norm(title))
    if not book_id or not key:
        continue
    text = f"（Calibre-Web 书签·{fmt or 'epub'}）"
    sql = (
        'insert into "BookAnnotation" ("userId","bookId",cfi,text,style,"createdAt","updatedAt") '
        f"values ({USER_ID},{book_id},$cfi${key}$cfi$, $t${text}$t$, 'bookmark', now(), now()) "
        f"on conflict (\"userId\",\"bookId\",cfi,text) do nothing"
    )
    r = subprocess.run(["psql", DB, "-c", sql], capture_output=True, text=True)
    if r.returncode == 0 and "INSERT 0 1" in r.stdout:
        added += 1

print("新增书签:", added)
