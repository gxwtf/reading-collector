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


def user_id() -> int | None:
    """从 READEST_BOOKS_DIR 的末级目录名 u<id> 推断账号，避免把别人的书发布进来。"""
    base = os.path.basename(os.path.normpath(BOOKS_DIR))
    if base.startswith("u") and base[1:].isdigit():
        return int(base[1:])
    return None


def db_rows():
    uid = user_id()
    where = f' where "userId" = {uid}' if uid is not None else ""
    sql = (
        'select coalesce(json_agg(json_build_object('
        "'id', id, 'title', title, 'author', author, 'format', format, 'file', \"fileName\""
        f')), \'[]\') from "Book"{where}'
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

    uid = user_id()
    prefix = f"u{uid}/" if uid is not None else ""

    for row in db_rows():
        # DB 里存的是相对书库根的路径（u<id>/xxx.epub），这里要相对本账号目录
        rel = row["file"][len(prefix):] if prefix and row["file"].startswith(prefix) else row["file"]
        src = os.path.join(BOOKS_DIR, rel)
        if not os.path.exists(src):
            print(f"skip missing {row['file']}", file=sys.stderr)
            continue

        h = partial_md5(src)

        fmt = (row["format"] or "epub").upper()
        base = os.path.basename(row["file"])
        target_dir = os.path.join(LIB_DIR, "books", h)
        os.makedirs(target_dir, exist_ok=True)
        # 同一本书只留一份：删掉旧文件名留下的副本（改书名后会出现）
        for other in os.listdir(target_dir):
            if other in ("config.json", "cover.png") or other.lower().endswith(
                (".epub", ".pdf", ".mobi", ".azw3", ".fb2", ".cbz")
            ):
                if not other.endswith(base):
                    try:
                        os.remove(os.path.join(target_dir, other))
                    except OSError:
                        pass

        dst = os.path.join(target_dir, base)
        need_link = True
        if os.path.exists(dst):
            try:
                same = os.stat(dst).st_ino == os.stat(src).st_ino
            except OSError:
                same = False
            need_link = not same
            if need_link:
                os.remove(dst)
        if need_link:
            try:
                os.link(src, dst)          # 硬链接：同一份数据，两处路径
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

        # 同一本书只留一份：删掉旧文件名留下的副本
        for other in os.listdir(target_dir):
            if other == base or other in ("config.json", "cover.png"):
                continue
            if other.lower().endswith((".epub", ".pdf", ".mobi", ".azw3", ".fb2", ".cbz")):
                try:
                    os.remove(os.path.join(target_dir, other))
                except OSError:
                    pass

        # 同一本书只留一份：删掉旧文件名留下的副本
        for other in os.listdir(target_dir):
            if other == base or other in ("config.json", "cover.png"):
                continue
            if other.lower().endswith((".epub", ".pdf", ".mobi", ".azw3", ".fb2", ".cbz")):
                try:
                    os.remove(os.path.join(target_dir, other))
                except OSError:
                    pass

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
            # 老条目也要跟着清洗后的书名/作者更新
            by_hash[h].update(
                {
                    "title": row["title"],
                    "sourceTitle": row["title"],
                    "author": row.get("author") or "",
                    "format": fmt,
                    "originalFilename": base,
                    "metadata": entry["metadata"],
                    "updatedAt": now,
                }
            )
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
