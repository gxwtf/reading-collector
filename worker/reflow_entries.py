"""把已经入库的「无分段」正文重新抓一遍并更新。

只处理「疑似被压平」的条目：正文超过 N 字，但平均每千字空行对 < 3，
或最长行超过 800 字。这类条目几乎必然是抓取时段落信息丢了。

用法：
  python3 reflow_entries.py --dry-run      # 只报告，不写库
  python3 reflow_entries.py --limit 5      # 最多处理 5 条
  python3 reflow_entries.py                # 处理全部命中的
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import httpx
import psycopg  # noqa: E402

from config import HTTP_TIMEOUT, USER_AGENT
from fetcher import fetch_article


def _is_flat(md: str) -> bool:
    """正文是否像「没有段落」的一大坨。"""
    if not md or len(md) < 600:
        return False
    lines = [l for l in md.split("\n")]
    blanks = sum(1 for l in lines if not l.strip())
    longest = max((len(l) for l in lines), default=0)
    per_1k = blanks / max(1, len(md)) * 1000
    return longest > 800 or per_1k < 3


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        print("缺少 DATABASE_URL", file=sys.stderr)
        return 1

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, url, "contentMd" FROM "Entry" '
                'WHERE kind = %s AND "contentMd" IS NOT NULL AND length("contentMd") >= 600',
                ("article",),
            )
            rows = cur.fetchall()

        flat = [(i, u, md) for i, u, md in rows if _is_flat(md)]
        print(f"共 {len(rows)} 条文章，疑似无分段 {len(flat)} 条")
        if args.limit:
            flat = flat[: args.limit]

        fixed = 0
        for eid, url, old in flat:
            longest = max((len(l) for l in old.split("\n")), default=0)
            print(f"\n--- id={eid} 当前 {len(old)} 字 / 最长行 {longest}")
            print(f"    {url[:90]}")
            if args.dry_run:
                continue
            try:
                article = fetch_article(url)
            except Exception as exc:  # noqa: BLE001 - 单条失败不影响其它
                print(f"    重新抓取失败：{exc}")
                continue
            new = article.get("contentMd") or ""
            if not _is_flat(new):
                new_longest = max((len(l) for l in new.split("\n")), default=0)
                print(f"    已修复：{len(new)} 字 / 最长行 {new_longest}")
                with conn.cursor() as cur:
                    cur.execute('UPDATE "Entry" SET "contentMd" = %s WHERE id = %s', (new, eid))
                conn.commit()
                fixed += 1
            else:
                print("    重抓后仍无分段，跳过")

    print(f"\n完成，修复 {fixed} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
