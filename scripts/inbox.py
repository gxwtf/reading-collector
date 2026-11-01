#!/usr/bin/env python3
"""待办收集：从待办应用的分组里读取「题目 + 链接」条目。

当前支持：
  - frogtodo（Minis 的 Todo MCP，默认）
  - file     （本地 inbox.md / inbox.json，无需任何 MCP，适合其它宿主）

用法:
  python3 inbox.py                 # 列出待处理条目（人类可读）
  python3 inbox.py --json          # 机器可读
  python3 inbox.py --done <id>     # 标记完成
  python3 inbox.py --backend file --inbox ./inbox.md
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CFG  # noqa: E402

URL_RE = re.compile(r"https?://[^\s，,、）)\]」\}<>\"']+")


# --------------------------------------------------------------------------- MCP


def mcp(server: str, tool: str, args: dict | None = None, timeout: int | None = None) -> dict:
    """调用 MCP 工具并剥掉 {result:{content:[{text}]}} 外壳。

    返回解析后的 JSON；失败时返回 {"error": ...}，不抛异常——
    镜像等从属步骤不该因为一次超时就中断整个批次。
    """
    cli = CFG["mcp"]["cli"]
    if not _which(cli):
        return {"error": f"MCP 客户端 {cli!r} 不存在，请安装或改用 --backend file"}
    cmd = [cli, "call", server, tool]
    if args is not None:
        cmd.append(json.dumps(args, ensure_ascii=False))
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout or CFG["mcp"]["timeout"]
        )
    except subprocess.TimeoutExpired:
        return {"error": "MCP 调用超时"}
    text = (r.stdout or "").strip()
    if not text:
        return {"error": (r.stderr or "空响应")[-300:]}
    try:
        outer = json.loads(text)
    except json.JSONDecodeError:
        return {"error": text[-300:]}
    if isinstance(outer, dict) and outer.get("error"):
        return {"error": outer["error"]}
    try:
        return json.loads(outer["result"]["content"][0]["text"])
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return outer


def _which(name: str) -> str | None:
    import shutil

    return shutil.which(name)


# ---------------------------------------------------------------- delta parsing


def delta_text(content: str | None) -> str:
    """青蛙todo 的 content 是 Quill Delta 富文本，转成纯文本。

    形如 [{"insert":"标题\\n"},{"insert":"https://…","attributes":{"link":"…"}}]
    不是 Delta 时原样返回。
    """
    if not content:
        return ""
    s = content.strip()
    if not s.startswith("["):
        return s
    try:
        ops = json.loads(s)
    except json.JSONDecodeError:
        return s
    out = []
    for op in ops:
        ins = op.get("insert")
        if isinstance(ins, str):
            out.append(ins)
        elif isinstance(ins, dict):
            out.append(ins.get("image", ""))
    return "".join(out)


def delta_links(content: str | None) -> list[str]:
    """取 Delta 里显式的 attributes.link（比正则更可靠，能拿到被隐藏的完整 URL）。"""
    s = (content or "").strip()
    if not s.startswith("["):
        return []
    try:
        ops = json.loads(s)
    except json.JSONDecodeError:
        return []
    links = []
    for op in ops:
        attrs = op.get("attributes") or {}
        if attrs.get("link"):
            links.append(attrs["link"])
    return links


def extract_urls(text: str, raw: str | None = None) -> list[str]:
    """Delta 链接优先，再退回正文正则；去重保序。"""
    urls = delta_links(raw) + URL_RE.findall(text or "")
    seen, out = set(), []
    for u in urls:
        u = u.rstrip(".,;、")
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


# ------------------------------------------------------------------- backends


def pick_category() -> dict | None:
    """按配置的分组名找分类：精确匹配优先，其次包含匹配。"""
    want = CFG["todo"]["category"]
    d = mcp(CFG["todo"]["server"], "frogtodo_list_categories")
    cats = d.get("categories") or []
    for c in cats:
        if (c.get("title") or "").strip() == want:
            return c
    for c in cats:
        if want and want in (c.get("title") or ""):
            return c
    return None


def backend_frogtodo() -> list[dict]:
    cat = pick_category()
    if not cat:
        return [{
            "error": f"未找到分组「{CFG['todo']['category']}」",
            "hint": "在待办 App 的「分类」里新建同名分组，或改 config.toml 的 todo.category",
        }]
    d = mcp(CFG["todo"]["server"], "frogtodo_search_todos",
            {"categoryIndexId": cat["categoryIndexId"]})
    items = d.get("todos") or []
    out = []
    for t in items:
        if t.get("complete") or t.get("archived"):
            continue
        title = (t.get("title") or "").strip()
        raw = t.get("content") or ""
        text = delta_text(raw)
        out.append({
            "id": t.get("todoIndexId") or t.get("id"),
            "title": title,
            "text": text,
            "urls": extract_urls(text, raw),
            "raw": t,
        })
    return out


def backend_file(path: str) -> list[dict]:
    """本地收件箱：Markdown 复选框或 JSON 数组。

    Markdown 写法（推荐，Obsidian / 任意编辑器都能改）：

        - [ ] 文章标题
          https://example.com/post
        - [ ] 视频标题
          https://www.bilibili.com/video/BV1xx
    """
    p = Path(path).expanduser()
    if not p.exists():
        return [{"error": f"收件箱不存在：{p}"}]
    if p.suffix == ".json":
        data = json.loads(p.read_text(encoding="utf-8"))
        out = []
        for i, it in enumerate(data):
            title = it.get("title", "")
            urls = it.get("urls") or extract_urls(it.get("url", ""))
            out.append({"id": str(it.get("id", i)), "title": title,
                        "text": it.get("url", ""), "urls": urls})
        return out

    items, cur = [], None
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*[-*]\s*\[( |x|X)\]\s*(.+)$", line)
        if m:
            if m.group(1).strip().lower() == "x":
                cur = None
                continue
            cur = {"title": m.group(2).strip(), "text": "", "urls": []}
            items.append(cur)
            continue
        if cur is not None:
            cur["text"] += line.strip() + "\n"
            cur["urls"] = extract_urls(cur["text"])
    for i, it in enumerate(items):
        it["id"] = f"file-{i}"
    return items


def backend_frogtodo_done(todo_id: str) -> dict:
    return mcp(CFG["todo"]["server"], "frogtodo_complete_todo",
               {"todoIndexId": todo_id, "complete": True,
                "idempotencyKey": f"done-{todo_id}"})


def backend_file_done(todo_id: str, path: str) -> dict:
    """把对应复选框从 [ ] 改成 [x]。"""
    p = Path(path).expanduser()
    lines = p.read_text(encoding="utf-8").splitlines()
    idx = int(todo_id.split("-")[-1])
    seen, out = -1, []
    for line in lines:
        m = re.match(r"^\s*[-*]\s*\[( |x|X)\]", line)
        if m:
            seen += 1
            if seen == idx and m.group(1) == " ":
                line = line.replace("[ ]", "[x]", 1)
        out.append(line)
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
    return {"ok": True, "marked": todo_id}


# ----------------------------------------------------------------------- main


def main() -> None:
    args = sys.argv[1:]
    backend = "frogtodo"
    inbox_path = "./inbox.md"
    if "--backend" in args:
        backend = args[args.index("--backend") + 1]
    if "--inbox" in args:
        inbox_path = args[args.index("--inbox") + 1]

    if "--done" in args:
        tid = args[args.index("--done") + 1]
        res = (backend_frogtodo_done(tid) if backend == "frogtodo"
               else backend_file_done(tid, inbox_path))
        print(json.dumps(res, ensure_ascii=False)[:400])
        return

    items = backend_frogtodo() if backend == "frogtodo" else backend_file(inbox_path)
    if items and items[0].get("error"):
        print(json.dumps(items[0], ensure_ascii=False))
        return

    if "--json" in args:
        print(json.dumps({"backend": backend, "count": len(items),
                          "todos": [{k: v for k, v in it.items() if k != "raw"}
                                    for it in items]},
                         ensure_ascii=False, indent=1))
        return

    print(f"待处理 {len(items)} 条  (backend={backend})")
    for i, it in enumerate(items, 1):
        label = it["title"] or (it["text"].splitlines() or [""])[0][:60]
        print(f"  {i}. [{it['id']}] {label}")
        for u in it["urls"]:
            print(f"       -> {u}")
        if not it["urls"]:
            print("       (无链接，跳过)")


if __name__ == "__main__":
    main()
