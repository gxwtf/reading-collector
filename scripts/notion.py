#!/usr/bin/env python3
"""Notion 从属镜像：创建、更新、索引，全部可重跑。

Obsidian 是唯一权威；Notion 是便于网页浏览的副本。所以这里所有失败都
返回 {"status": "error", ...} 而不抛异常——一次镜像失败不该中断整个批次。

幂等的关键在 config/notion-map.json：记录 URL → page_id。同一条链接再次归档
走 update 而不是 create，不会在父页面里堆出重复页。

用法:
  notion.py check                        连接与父页面是否可达
  notion.py list [--limit N]             父页面下的子页面
  notion.py url <链接>                   这条链接已镜像到哪个页面
  notion.py sync --title T --url U --body body.md [--source S] [--dry-run]
  notion.py rebuild-index                重建「📇 索引」表格页
  notion.py delete <page_id> --yes       把一个镜像页移入回收站
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CFG  # noqa: E402
import inbox  # noqa: E402

MAP_PATH = Path(__file__).resolve().parent.parent / "config" / "notion-map.json"
INDEX_TITLE = "📇 索引"


# ---------------------------------------------------------------- 映射表

def _norm(url: str) -> str:
    return (url or "").strip().rstrip("/")


def load_map() -> dict:
    if MAP_PATH.exists():
        try:
            return json.loads(MAP_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
    return {}


def save_map(mapping: dict) -> None:
    MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = MAP_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(mapping, ensure_ascii=False, indent=1, sort_keys=True),
                   encoding="utf-8")
    os.replace(tmp, MAP_PATH)


# ---------------------------------------------------------------- 正文组织

ICON_RULES = [
    ("mp.weixin.qq.com", "💬"),
    ("bilibili.com", "🎬"),
    ("b23.tv", "🎬"),
    ("youtube.com", "🎬"),
    ("youtu.be", "🎬"),
    ("xiaoyuzhoufm.com", "🎧"),
    ("podcasts.apple.com", "🎧"),
    ("x.com", "🐦"),
    ("twitter.com", "🐦"),
    ("github.com", "🐙"),
]


def guess_icon(url: str, source: str = "") -> str:
    host = re.sub(r"^https?://(www\.)?", "", url or "").split("/")[0].lower()
    for frag, icon in ICON_RULES:
        if frag in host:
            return icon
    if "微信" in (source or ""):
        return "💬"
    if any(k in (source or "") for k in ("视频", "播客", "Bilibili", "YouTube")):
        return "🎬"
    return "📄"


def build_content(title: str, url: str, body: str, source: str = "",
                  author: str = "", date: str = "", parent_page_id: str = "") -> str:
    """来源头 + 分隔线 + 正文。头部信息让镜像页脱离 Obsidian 也能自解释。

    顶部另加「← 返回 有价值内容收集」，与 Obsidian 笔记的返回按钮对应；
    离开父页面往下翻了好几页时，不用一路滚回去。
    """
    head = "\n".join(x for x in [
        f"来源：{source}  " if source else "",
        f"作者：{author}  " if author else "",
        f"链接：{url}  " if url else "",
        f"收集日期：{date or dt.date.today().isoformat()}",
    ] if x)
    parent_page_id = parent_page_id or (CFG["notion"].get("parent_page_id") or "")
    back = ""
    if parent_page_id:
        pid = parent_page_id.replace("-", "")
        parent_url = "https://app.notion.com/p/" + pid
        # 前面加几个字符，避免 Notion 把整行当成页面提及（mention）而吞掉箭头文字
        back = f"← [返回 有价值内容收集]({parent_url})\n\n"
    return f"{back}{head}\n\n---\n\n{body.strip()}\n"


def _extract_created(res: dict) -> tuple[str, str]:
    """从 notion-create-pages 的返回里挖出 (page_id, page_url)。"""
    pages = (res or {}).get("pages") or []
    if pages:
        return pages[0].get("id", ""), pages[0].get("url", "")
    # 某些版本把结果包在 text 里
    text = (res or {}).get("text") or ""
    m = re.search(r'"id"\s*:\s*"([0-9a-f-]{32,36})"', text)
    u = re.search(r'"(?:url)"\s*:\s*"(https://[^"]+)"', text)
    return (m.group(1) if m else ""), (u.group(1) if u else "")


# ---------------------------------------------------------------- 主操作

def _server() -> str:
    return CFG["notion"].get("server", "Notion")


def check() -> dict:
    cfg = CFG["notion"]
    out = {"enabled": bool(cfg.get("enabled")),
           "parent_page_id": cfg.get("parent_page_id", ""),
           "connected": False, "parent_ok": False,
           "mirrored_pages": len(load_map())}
    me = inbox.mcp(_server(), "notion-get-self", {})
    if me.get("error"):
        out["error"] = me["error"]
        return out
    ws = me.get("workspace") or {}
    out.update({"connected": True, "workspace": ws.get("name"),
                "user": (me.get("user") or {}).get("name")})
    if cfg.get("parent_page_id"):
        page = inbox.mcp(_server(), "notion-fetch", {"id": cfg["parent_page_id"]})
        if page.get("error"):
            out["parent_error"] = page["error"]
        else:
            out["parent_ok"] = True
            out["parent_title"] = (page.get("title") or "").strip()
    return out


def sync(title: str, url: str, body: str, source: str = "", author: str = "",
         date: str = "", icon: str = "", dry_run: bool = False) -> dict:
    """创建或更新镜像页。永不对 Notion 侧故障抛异常。"""
    cfg = CFG["notion"]
    if not cfg.get("enabled"):
        return {"status": "skipped", "reason": "notion.enabled = false"}
    if not cfg.get("parent_page_id"):
        return {"status": "skipped", "reason": "未配置 notion.parent_page_id"}

    date = date or dt.date.today().isoformat()
    icon = icon or guess_icon(url, source)
    content = build_content(title, url, body, source, author, date)
    if dry_run:
        return {"status": "dry_run", "chars": len(content), "icon": icon}

    mapping = load_map()
    key = _norm(url)
    rec = mapping.get(key) or {}
    page_id = rec.get("page_id")

    if page_id:
        # replace_content 必须 allow_deleting_content，否则旧内容块清不掉
        r = inbox.mcp(_server(), "notion-update-page", {
            "page_id": page_id,
            "command": "replace_content",
            "new_str": content,
            "allow_deleting_content": True,
            "allow_async": False,
        })
        if r.get("error"):
            return {"status": "error", "action": "update", "error": r["error"]}
        inbox.mcp(_server(), "notion-update-page", {
            "page_id": page_id,
            "command": "update_properties",
            "properties": {"title": title},
            "allow_async": False,
        })
        rec.update({"title": title, "mirrored_at": dt.datetime.now().isoformat(timespec="seconds")})
        mapping[key] = rec
        save_map(mapping)
        return {"status": "ok", "action": "updated", "page_id": page_id,
                "url": rec.get("page_url", "")}

    r = inbox.mcp(_server(), cfg.get("create_tool", "notion-create-pages"), {
        "parent": {"page_id": cfg["parent_page_id"]},
        "pages": [{"properties": {"title": title}, "content": content, "icon": icon}],
        "allow_async": False,
    })
    if r.get("error"):
        return {"status": "error", "action": "create", "error": r["error"]}
    page_id, page_url = _extract_created(r)
    if not page_id:
        return {"status": "error", "action": "create", "error": "返回里没有 page id", "raw": r}
    mapping[key] = {"page_id": page_id, "page_url": page_url, "title": title,
                    "mirrored_at": dt.datetime.now().isoformat(timespec="seconds")}
    save_map(mapping)
    return {"status": "ok", "action": "created", "page_id": page_id, "url": page_url}


def lookup(url: str) -> dict:
    return load_map().get(_norm(url), {})


def list_pages(limit: int = 50) -> list[dict]:
    parent = CFG["notion"].get("parent_page_id")
    if not parent:
        return []
    page = inbox.mcp(_server(), "notion-fetch", {"id": parent})
    text = page.get("text") or ""
    found = re.findall(r'<page url="([^"]+)">\s*([^<]*?)\s*</page>', text)
    return [{"url": u, "title": t.strip()} for u, t in found][:limit]


def rebuild_index() -> dict:
    """父页面下的「📇 索引」：所有镜像页的表格，每次归档后刷新。"""
    parent = CFG["notion"].get("parent_page_id")
    if not parent:
        return {"status": "skipped", "reason": "未配置 notion.parent_page_id"}
    rows = sorted(load_map().items(), key=lambda kv: kv[1].get("mirrored_at", ""), reverse=True)
    lines = ["| 标题 | 原文 | 镜像日期 |", "|---|---|---|"]
    for url, rec in rows:
        title = (rec.get("title") or "").replace("|", "｜")
        lines.append("| [%s](%s) | [链接](%s) | %s |" % (
            title, rec.get("page_url", ""), url, (rec.get("mirrored_at") or "")[:10]))
    content = "\n".join(lines) + "\n"

    existing = next((p for p in list_pages(200) if INDEX_TITLE in p["title"]), None)
    if existing:
        r = inbox.mcp(_server(), "notion-update-page", {
            "page_id": existing["url"],
            "command": "replace_content",
            "new_str": content,
            "allow_deleting_content": True,
            "allow_async": False,
        })
        return {"status": "error" if r.get("error") else "updated",
                "url": existing["url"], "rows": len(rows), **(r if r.get("error") else {})}

    r = inbox.mcp(_server(), "notion-create-pages", {
        "parent": {"page_id": parent},
        "pages": [{"properties": {"title": INDEX_TITLE}, "content": content, "icon": "📇"}],
        "allow_async": False,
    })
    if r.get("error"):
        return {"status": "error", "error": r["error"]}
    _, url = _extract_created(r)
    return {"status": "created", "url": url, "rows": len(rows)}


def _page_id(value: str) -> str:
    """接受 UUID 或 Notion 页面 URL，统一成带连字符的 UUID。"""
    v = (value or "").strip()
    m = re.search(r"([0-9a-f]{32})", v.replace("-", ""))
    if not m:
        m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", v)
        return m.group(1) if m else v
    h = m.group(1)
    return "%s-%s-%s-%s-%s" % (h[:8], h[8:12], h[12:16], h[16:20], h[20:])


def delete(page_id: str, confirmed: bool = False) -> dict:
    if not confirmed:
        return {"status": "refused", "reason": "加 --yes 才会真的删除"}
    return inbox.mcp(_server(), "notion-delete-pages",
                     {"page_ids": [_page_id(page_id)], "user_confirmed": True})


# ---------------------------------------------------------------- CLI

def main() -> None:
    ap = argparse.ArgumentParser(description="Notion 从属镜像")
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sync", help="创建或更新一条笔记的镜像")
    s.add_argument("--title", required=True)
    s.add_argument("--url", required=True)
    s.add_argument("--body", help="正文文件，'-' 读 stdin")
    s.add_argument("--source", default="")
    s.add_argument("--author", default="")
    s.add_argument("--date", default="")
    s.add_argument("--icon", default="")
    s.add_argument("--dry-run", action="store_true")

    u = sub.add_parser("url", help="查某条链接的镜像页")
    u.add_argument("url")

    sub.add_parser("check", help="连接与父页面检查")
    li = sub.add_parser("list", help="列出父页面下的子页面")
    li.add_argument("--limit", type=int, default=30)
    sub.add_parser("rebuild-index", help="重建「📇 索引」表格页")
    d = sub.add_parser("delete", help="把一个镜像页移入回收站")
    d.add_argument("page_id")
    d.add_argument("--yes", action="store_true")

    a = ap.parse_args()

    if a.cmd == "check":
        out = check()
    elif a.cmd == "sync":
        body = sys.stdin.read() if a.body in (None, "-") else Path(a.body).read_text(
            encoding="utf-8", errors="replace")
        out = sync(a.title, a.url, body, a.source, a.author, a.date, a.icon, a.dry_run)
    elif a.cmd == "url":
        out = lookup(a.url)
    elif a.cmd == "list":
        out = list_pages(a.limit)
    elif a.cmd == "rebuild-index":
        out = rebuild_index()
    else:
        out = delete(a.page_id, a.yes)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
