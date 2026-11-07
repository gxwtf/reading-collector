#!/usr/bin/env python3
"""把书库里所有书硬链接到一个扁平目录 _library/，方便手机 WebDAV 一次下完。"""
import json
import os
import subprocess
import sys

BOOKS_DIR = os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books")
DB = os.environ.get("DATABASE_URL", "")


def rows():
    sql = (
        'select coalesce(json_agg(json_build_object('
        "'title', title, 'format', format, 'file', \"fileName\""
        ')), \'[]\') from "Book"'
    )
    out = subprocess.run(
        ["psql", DB, "-tAc", sql], capture_output=True, text=True, check=True
    ).stdout.strip()
    return json.loads(out or "[]")


def main():
    mirror = os.path.join(BOOKS_DIR, "_library")
    os.makedirs(mirror, exist_ok=True)

    made = 0
    for b in rows():
        src = os.path.join(BOOKS_DIR, b["file"])
        safe = "".join(c for c in b["title"] if c not in '/\\:*?"<>|')[:80].strip() or f"book-{made}"
        dst = os.path.join(mirror, f"{safe}.{b['format']}")
        try:
            if not os.path.exists(src):
                continue
            if os.path.exists(dst):
                if os.path.getsize(dst) == os.path.getsize(src):
                    continue
                os.remove(dst)
            os.link(src, dst)
            made += 1
        except OSError as e:
            print(f"skip {b['title'][:30]}: {e}", file=sys.stderr)

    print(f"mirror ready: {len(os.listdir(mirror))} files ({made} new)")


if __name__ == "__main__":
    main()
