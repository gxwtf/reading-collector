#!/usr/bin/env python3
"""清理 Readest 云书库的孤儿：没有书文件的条目、没有条目引用的目录。"""
import json
import os
import shutil

BASE = os.environ.get("READEST_BOOKS_DIR", "/home/gxwtf/reading-books") + "/Readest"
EXT = (".epub", ".pdf", ".mobi", ".azw3", ".fb2", ".cbz", ".txt")


def main():
    lib_path = os.path.join(BASE, "library.json")
    if not os.path.exists(lib_path):
        print("no library.json")
        return
    lib = json.load(open(lib_path, encoding="utf-8"))
    books_dir = os.path.join(BASE, "books")

    keep, dropped = [], 0
    for b in lib.get("books", []):
        d = os.path.join(books_dir, b["hash"])
        files = [f for f in os.listdir(d) if f.lower().endswith(EXT)] if os.path.isdir(d) else []
        if not files:
            dropped += 1
            if os.path.isdir(d):
                shutil.rmtree(d)
            continue
        keep.append(b)

    referenced = {b["hash"] for b in keep}
    orphans = 0
    if os.path.isdir(books_dir):
        for name in os.listdir(books_dir):
            if name not in referenced:
                shutil.rmtree(os.path.join(books_dir, name), ignore_errors=True)
                orphans += 1

    lib["books"] = keep
    tmp = lib_path + ".tmp"
    json.dump(lib, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, lib_path)
    print(f"pruned entries {dropped}, orphan dirs {orphans}, kept {len(keep)}")


if __name__ == "__main__":
    main()
