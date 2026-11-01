#!/usr/bin/env python3
"""归档：写 Obsidian 笔记 → 重建首页索引 →（可选）镜像到 Notion。

Obsidian 是唯一权威；Notion 是从属镜像，失败只记一笔，不回滚不重试。

用法:
  python3 archive.py --title "标题" --url "https://…" --body body.md \
      [--source "微信公众号"] [--author "作者"] [--date 2026-11-01] \
      [--tags 视频,Agent] [--notion]
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CFG, archive_dir, vault_root  # noqa: E402
import inbox  # noqa: E402


def safe_filename(title: str, max_chars: int | None = None) -> str:
    """把标题变成安全文件名：去掉路径分隔符、控制字符、保留中文。"""
    limit = max_chars or CFG["output"]["filename_max_chars"]
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', " ", title).strip()
    name = re.sub(r"\s+", " ", name)
    name = name.rstrip(". ")
    return name[:limit] or "untitled"


def note_path(title: str, date: str, url: str = "") -> Path:
    cfg = CFG["vault"]
    base = archive_dir()
    if cfg["group_by_year"]:
        base = base / date[:4]
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{date}-{safe_filename(title)}.md"


def build_note(title: str, url: str, body: str, source: str = "",
               author: str = "", date: str = "", tags: list[str] | None = None) -> str:
    date = date or dt.date.today().strftime(CFG["output"]["date_format"])
    tags = ["阅读收集"] + [t for t in (tags or []) if t]
    tag_block = "\n".join(f"  - {t}" for t in tags)
    meta = "　·　".join(x for x in [
        source,
        f"[原文]({url})" if url else "",
        author,
    ] if x)
    return f"""---
title: "{title}"
source: "{source}"
author: "{author}"
url: "{url}"
collected: "{date}"
tags:
{tag_block}
---

> [!info] 来源
> {meta}

{body.strip()}
"""


def find_existing(url: str) -> Path | None:
    """按 URL 去重：同一链接重跑不产生第二篇。"""
    if not url:
        return None
    root = archive_dir()
    if not root.exists():
        return None
    for p in root.rglob("*.md"):
        if p.name == CFG["vault"]["index"]:
            continue
        try:
            head = p.read_text(encoding="utf-8")[:600]
        except OSError:
            continue
        if f'url: "{url}"' in head:
            return p
    return None


def write_note(title: str, url: str, body: str, **kw) -> Path:
    existing = find_existing(url)
    date = kw.get("date") or dt.date.today().strftime(CFG["output"]["date_format"])
    path = existing or note_path(title, date, url)
    path.write_text(build_note(title, url, body, **kw), encoding="utf-8")
    return path


def rebuild_index() -> Path:
    """重建首页：按年份分组、组内按日期倒序。"""
    root = archive_dir()
    index_name = CFG["vault"]["index"]
    index_path = root / index_name
    rows = []
    for p in root.rglob("*.md"):
        if p.name == index_name:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        fm = {}
        if text.startswith("---"):
            block = text.split("---", 2)
            if len(block) >= 3:
                for line in block[1].splitlines():
                    if ":" in line and not line.startswith(" "):
                        k, v = line.split(":", 1)
                        fm[k.strip()] = v.strip().strip('"')
        title = fm.get("title") or p.stem
        url = fm.get("url", "")
        rel = p.relative_to(root).with_suffix("").as_posix()
        rows.append({
            "title": title, "source": fm.get("source", ""),
            "author": fm.get("author", ""), "date": fm.get("collected", ""),
            "link": f"[[{rel}|{title}]]", "url": url,
        })
    rows.sort(key=lambda r: r["date"], reverse=True)

    years: dict[str, list] = {}
    for r in rows:
        years.setdefault(r["date"][:4] or "未分类", []).append(r)

    lines = [
        f"# {CFG['vault']['folder']} · 导航",
        "",
        "> 收集到的网页 / 公众号 / X / 播客 / 视频等有价值内容，一条一篇。",
        "> 由 reading-collector 自动生成，请勿手工编辑本文件的表格区。",
        "",
        f"共 **{len(rows)}** 篇，按收集时间倒序。",
        "",
    ]
    for year in sorted(years, reverse=True):
        lines += [
            f"## {year}",
            "",
            "| 标题 | 来源 | 作者 | 收集日期 |",
            "| --- | --- | --- | --- |",
        ]
        for r in years[year]:
            lines.append(
                f"| {r['link']} | {r['source'] or '—'} | {r['author'] or '—'} | {r['date']} |"
            )
        lines.append("")
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text("\n".join(lines), encoding="utf-8")
    return index_path


def mirror_to_notion(title: str, url: str, body: str, source: str = "",
                     author: str = "", date: str = "") -> dict:
    """从属镜像。失败不影响主流程。"""
    cfg = CFG["notion"]
    if not cfg["enabled"]:
        return {"skipped": "notion.enabled = false"}
    if not cfg["parent_page_id"]:
        return {"skipped": "未配置 notion.parent_page_id"}
    head = "\n".join(x for x in [
        f"来源：{source}" if source else "",
        f"作者：{author}" if author else "",
        f"链接：{url}" if url else "",
        f"日期：{date}" if date else "",
    ] if x)
    content = (head + "\n\n---\n\n" + body.strip()) if head else body.strip()
    payload = {
        "parent": {"page_id": cfg["parent_page_id"]},
        "pages": [{"properties": {"title": title}, "content": content}],
    }
    return inbox.mcp(cfg["server"], cfg["create_tool"], payload)


def read_body_file(spec: str) -> str:
    """读正文。支持普通路径与进程替换（/dev/fd/N、/proc/self/fd/N）。

    进程替换传进来的 fd 是管道，既不能 stat 出大小也不能 seek，
    所以统一按流读取，不走 Path.read_text。
    """
    if spec == "-":
        return sys.stdin.read()
    p = Path(spec)
    if p.exists() or spec.startswith(("/dev/fd/", "/proc/self/fd/")):
        with open(spec, encoding="utf-8", errors="replace") as f:
            return f.read()
    sys.exit(f"正文文件不存在：{spec}")


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description="把一篇整理好的内容归档到 Obsidian")
    ap.add_argument("--title", required=True)
    ap.add_argument("--url", default="")
    ap.add_argument("--body", help="正文 Markdown 文件路径，省略则从 stdin 读")
    ap.add_argument("--source", default="")
    ap.add_argument("--author", default="")
    ap.add_argument("--date", default="")
    ap.add_argument("--tags", default="", help="逗号分隔，会自动加上「阅读收集」")
    ap.add_argument("--notion", action="store_true", help="强制镜像到 Notion")
    ap.add_argument("--dry-run", action="store_true", help="只打印，不落盘")
    a = ap.parse_args()

    body = (read_body_file(a.body) if a.body else sys.stdin.read())
    tags = [t.strip() for t in a.tags.split(",") if t.strip()]
    date = a.date or dt.date.today().strftime(CFG["output"]["date_format"])

    if a.dry_run:
        print(build_note(a.title, a.url, body, a.source, a.author, date, tags)[:1200])
        return

    path = write_note(a.title, a.url, body, source=a.source, author=a.author,
                      date=date, tags=tags)
    idx = rebuild_index()
    result = {"note": str(path), "index": str(idx)}
    if a.notion:
        CFG["notion"]["enabled"] = True
    result["notion"] = mirror_to_notion(a.title, a.url, body, a.source, a.author, date)
    print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
