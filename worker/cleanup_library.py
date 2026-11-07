#!/usr/bin/env python3
"""收敛书库：每本书只在根目录保留一份干净路径，删掉 Anx/Readest/镜像等冗余目录。"""
import json
import os
import re
import shutil
import subprocess
import sys

BOOKS = "/home/gxwtf/reading-books"
DB = os.environ["DATABASE_URL"]

rows = subprocess.run(
    [
        "psql",
        DB,
        "-tAc",
        "select coalesce(json_agg(json_build_object('id', id, 'title', title, 'format', format, 'file', \"fileName\")), '[]') from \"Book\"",
    ],
    capture_output=True,
    text=True,
    check=True,
).stdout

books = json.loads(rows.strip() or "[]")
moved, updated = 0, 0

for b in books:
    src = os.path.join(BOOKS, b["file"])
    if not os.path.exists(src):
        print(f"! missing {b['file']}", file=sys.stderr)
        continue
    safe = re.sub(r'[/\\:*?"<>|]', "_", b["title"]).strip()[:90] or f"book-{b['id']}"
    name = f"{safe}.{b['format']}"
    dst = os.path.join(BOOKS, name)
    if os.path.abspath(src) != os.path.abspath(dst):
        if os.path.exists(dst):
            os.remove(dst)
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)
        moved += 1
    if b["file"] != name:
        subprocess.run(
            ["psql", DB, "-tAc", f"update \"Book\" set \"fileName\" = $${name}$$ where id={b['id']}"],
            check=True,
            capture_output=True,
        )
        updated += 1

print(f"linked {moved}, db updated {updated}")

for d in ["anx", "Readest", "_library", "original"]:
    p = os.path.join(BOOKS, d)
    if os.path.isdir(p):
        shutil.rmtree(p)
        print(f"removed dir {d}")

for n in os.listdir(BOOKS):
    if n.startswith("_") and os.path.isfile(os.path.join(BOOKS, n)):
        os.remove(os.path.join(BOOKS, n))
        print(f"removed mirror {n[:40]}")

print("--- 根目录最终文件")
for n in sorted(os.listdir(BOOKS)):
    p = os.path.join(BOOKS, n)
    if os.path.isfile(p):
        print(f"  {n}  ({os.path.getsize(p) // 1024} KB)")
