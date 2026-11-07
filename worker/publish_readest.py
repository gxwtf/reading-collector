#!/usr/bin/env python3
"""把阅读收集里的书发布成 Readest 的云书库格式。

Readest 的 WebDAV 同步要求：
    Readest/library.json
    Readest/books/<hash>/<原文件名>
    Readest/books/<hash>/config.json   # 进度 + 划线
hash = KOReader 风格的 partial MD5（12 段 1KB）
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time

BOOKS_DIR = os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books")
DB = os.environ.get("DATABASE_URL", "")
LIB_DIR = os.path.join(BOOKS_DIR, "Readest")
LIB_JSON = os.path.join(LIB_DIR, "library.json")
DEVICE = "minis-publisher"
VERSION = "reader-1"


def db_rows():
    sql = (
        'select coalesce(json_agg(json_build_object('
        "'id', id, 'title', title, 'author', author, 'format', format, 'file', \"fileName\""
        ')), \'[]\') from "Book"'
    )
    out = subprocess.run(["psql", DB, "-tAc", sql], capture_output=True, text=True, check=True).stdout
    return json.loads(out.strip() or "[]")


def partial_md5(path: str) -> str:
    size = os.path.getsize(path)
    h = hashlib.md5()
    with open(path, "rb") as f:
        i = -1
        while i <= 10:
            off = 0 if i == -1 else 1024 * (4 ** i)
            if off >= size:
                break
            f.seek(off)
            h.update(f.read(1024))
            i += 1
    return h.hexdigest()


def main():
    os.makedirs(os.path.join(LIB_DIR, "books"), exist_ok=True)
    lib = {"schemaVersion": 1, "books": []}
    if os.path.exists(LIB_JSON):
        with open(LIB_JSON, encoding="utf-8") as f:
            lib = json.load(f)

    by_hash = {b["hash"]: b for b in lib.get("books", [])}
    now = int(time.time() * 1000)
    added = 0

    for row in db_rows():
        src = os.path.join(BOOKS_DIR, row["file"])
        if not os.path.exists(src):
            print(f"skip missing {row['file']}", file=sys.stderr)
            continue

        h = partial_md5(src)

        fmt = (row["format"] or "epub").upper()
        base = os.path.basename(row["file"])
        target_dir = os.path.join(LIB_DIR, "books", h)
        os.makedirs(target_dir, exist_ok=True)

        dst = os.path.join(target_dir, base)
        if not os.path.exists(dst):
            try:
                os.link(src, dst)
            except OSError:
                shutil.copy2(src, dst)

        # Readest 的封面约定：books/<hash>/cover.png（它自己也是 JPEG 数据塞在 .png 里）
        cover_hash = ""
        cover_src = None
        for cand in (f"covers/{row['id']}.jpg", f"covers/{row['id']}.png"):
            cp = os.path.join(BOOKS_DIR, cand)
            if os.path.exists(cp):
                cover_src = cp
                break
        if cover_src:
            with open(cover_src, "rb") as f:
                cdata = f.read()
            with open(os.path.join(target_dir, "cover.png"), "wb") as f:
                f.write(cdata)
            cover_hash = hashlib.md5(cdata).hexdigest()

        cfg_path = os.path.join(target_dir, "config.json")
        if not os.path.exists(cfg_path):
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "schemaVersion": 1,
                        "bookHash": h,
                        "metaHash": "",
                        "config": {"progress": [0, 0], "location": "", "updatedAt": now},
                        "booknotes": [],
                        "writerDeviceId": DEVICE,
                        "writerVersion": VERSION,
                    },
                    f,
                    ensure_ascii=False,
                )

        entry = {
            "hash": h,
            "format": fmt,
            "metaHash": h,
            "title": row["title"],
            "originalFilename": base,
            "sourceTitle": row["title"],
            "author": row.get("author") or "",
            **({"coverHash": cover_hash, "coverUpdatedAt": now} if cover_hash else {}),
            "metadata": {
                "title": row["title"],
                "author": row.get("author") or "",
                "language": "zh",
            },
            "createdAt": now,
            "uploadedAt": now,
            "deletedAt": None,
            "updatedAt": now,
            "progress": None,
        }
        if h in by_hash:
            if cover_hash:
                by_hash[h]["coverHash"] = cover_hash
                by_hash[h]["coverUpdatedAt"] = now
        else:
            by_hash[h] = entry
            added += 1
            print(f"+ {row['title'][:36]} → books/{h[:10]}…")

    lib["books"] = list(by_hash.values())
    tmp = LIB_JSON + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lib, f, ensure_ascii=False)
    os.replace(tmp, LIB_JSON)
    print(f"library.json 现有 {len(lib['books'])} 本（本次新增 {added}）")


if __name__ == "__main__":
    main()
