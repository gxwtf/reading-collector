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


def yaml_str(s: str) -> str:
    """安全地写进 YAML 双引号字符串：转义反斜杠与引号，换行压成空格。"""
    s = (s or "").replace("\\", "\\\\").replace('"', '\\"')
    return '"' + s.replace("\r", " ").replace("\n", " ") + '"'


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
title: {yaml_str(title)}
source: {yaml_str(source)}
author: {yaml_str(author)}
url: {yaml_str(url)}
collected: {yaml_str(date)}
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


def read_frontmatter(text: str) -> dict:
    """按行边界解析 front-matter。

    不能用 split("---")：正文里的水平分隔线、以及标题值里本身含 --- 都会切错。
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fm = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" in line and line[:1] not in (" ", "\t", "-"):
            k, v = line.split(":", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] == '"':
                v = v[1:-1].replace('\\"', '"').replace("\\\\", "\\")
            fm[k.strip()] = v
    return fm


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
        fm = read_frontmatter(text)
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
    """从属镜像。失败不影响主流程。

    幂等交给 notion.sync：同一条 URL 再归档是更新原页，不会堆出重复页。
    """
    import notion  # 延迟导入，避免 --no-notion 时的无谓开销
    return notion.sync(title, url, body, source=source, author=author, date=date)


def read_body_file(spec: str) -> str:
    """读正文。支持普通路径、stdin（-）与进程替换（/dev/fd/N）。

    进程替换传进来的 fd 是管道，不能 stat 也不能 seek，所以按流读；
    另外某些精简环境（如 iSH）没有 /dev/fd，此时尽最大努力直读。
    """
    if spec == "-":
        return sys.stdin.read()
    if spec.startswith(("/dev/fd/", "/proc/self/fd/")):
        try:
            with open(spec, encoding="utf-8", errors="replace") as f:
                return f.read()
        except FileNotFoundError:
            sys.exit(
                f"当前环境不支持进程替换（{spec} 不存在）。\n"
                f"先把正文写到文件再传：--body ./body.md\n"
                f"或用管道：cat body.md | archive.py ... （省略 --body 即读 stdin）"
            )
    p = Path(spec)
    if not p.exists():
        sys.exit(f"正文文件不存在：{spec}")
    return p.read_text(encoding="utf-8")


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
