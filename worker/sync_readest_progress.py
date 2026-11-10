#!/usr/bin/env python3
"""把 Readest 同步上来的阅读进度写回 Book.epubPercent。

Readest 的 WebDAV 同步目录结构：
    u<id>/Readest/library.json            书单（hash → title）
    u<id>/Readest/books/<hash>/config.json { "config": { "progress": [当前, 总数] }, ... }
"""
import glob
import json
import os
import re
import subprocess

ROOT = "/home/gxwtf/reading-books"
DB = None
for line in open("/home/gxwtf/gxwtf_reading/.env", encoding="utf-8"):
    if line.startswith("DATABASE_URL="):
        DB = line.split("=", 1)[1].strip().strip('"')


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z\u4e00-\u9fff]", "", (s or "").lower())


updated = 0
for user_dir in glob.glob(os.path.join(ROOT, "u*")):
    lib_path = os.path.join(user_dir, "Readest", "library.json")
    if not os.path.exists(lib_path):
        continue
    try:
        lib = json.load(open(lib_path, encoding="utf-8"))
    except Exception:
        continue

    hash_title = {b["hash"]: b.get("title") or "" for b in lib.get("books", []) if b.get("hash")}

    # 我们库里的书（按标题索引）
    rows = json.loads(
        subprocess.run(
            ["psql", DB, "-tAc",
             "select coalesce(json_agg(json_build_object('id',id,'title',title)),'[]') from \"Book\""],
            capture_output=True, text=True,
        ).stdout or "[]"
    )
    by_title = {norm(r["title"]): r["id"] for r in rows}

    for cfg_path in glob.glob(os.path.join(user_dir, "Readest", "books", "*", "config.json")):
        h = os.path.basename(os.path.dirname(cfg_path))
        title = hash_title.get(h)
        if not title:
            continue
        book_id = by_title.get(norm(title))
        if not book_id:
            continue
        try:
            cfg = json.load(open(cfg_path, encoding="utf-8"))
        except Exception:
            continue
        prog = (cfg.get("config") or {}).get("progress") or []
        if len(prog) == 2 and prog[1]:
            pct = round(prog[0] / prog[1] * 100, 2)
            subprocess.run(
                ["psql", DB, "-c",
                 f'update "Book" set "epubPercent"={pct}, "lastReadTime"=now() where id={book_id}'],
                capture_output=True,
            )
            updated += 1

print("更新进度:", updated)
