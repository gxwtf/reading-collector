#!/usr/bin/env python3
"""删除数据库里指向已不存在文件的书籍记录。"""
import json
import os
import subprocess
import sys

BOOKS = os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books")
DB = os.environ["DATABASE_URL"]

raw = subprocess.run(
    ["psql", DB, "-tAc",
     'select coalesce(json_agg(json_build_object(\'id\', id, \'f\', "fileName")), \'[]\') from "Book"'],
    capture_output=True, text=True, check=True,
).stdout

rows = json.loads(raw.strip() or "[]")
missing = [r for r in rows if not os.path.exists(os.path.join(BOOKS, r["f"]))]

for r in missing:
    print("delete", r["id"], r["f"][:60])
    subprocess.run(
        ["psql", DB, "-c", 'delete from "Book" where id=%d' % r["id"]],
        capture_output=True,
    )

print("剩余:", subprocess.run(
    ["psql", DB, "-tAc", 'select count(*) from "Book"'], capture_output=True, text=True
).stdout.strip())
