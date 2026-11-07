#!/usr/bin/env python3
"""阅读收集 MCP 服务（stdio）。

把站点开放 API 包成 MCP 工具，任何支持 MCP 的客户端都能用：
  · save_url  收藏链接
  · search    搜索（标题/正文/划线/批注）
  · list      最近条目
  · get       单条详情

环境变量：
  READING_API_BASE  默认 https://reading.gxwtf.cn
  READING_API_KEY   SECRET_API_KEY（服务器 .env 里那把）

协议：JSON-RPC 2.0，按行分隔（MCP stdio 传输）。
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("READING_API_BASE", "https://reading.gxwtf.cn").rstrip("/")
KEY = os.environ.get("READING_API_KEY", "").strip()

TOOLS = [
    {
        "name": "save_url",
        "description": "把链接收藏进阅读收集（自动抓正文 / 转写音视频）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "urls": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "要收藏的链接，可多个",
                },
                "tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "可选标签",
                },
            },
            "required": ["urls"],
        },
    },
    {
        "name": "search",
        "description": "搜索收藏（标题、正文、来源、逐字稿、划线批注）",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "list",
        "description": "列出最近收藏",
        "inputSchema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "default": 10}},
        },
    },
    {
        "name": "get",
        "description": "取单条收藏的详情（含正文 Markdown、逐字稿、概括）",
        "inputSchema": {
            "type": "object",
            "properties": {"id": {"type": "integer"}},
            "required": ["id"],
        },
    },
]


def api(path: str, method: str = "GET", payload: dict | None = None) -> dict:
    url = f"{BASE}{path}"
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    except Exception as exc:  # 网络错误
        raise RuntimeError(f"请求失败: {exc}") from exc


def call_tool(name: str, args: dict) -> str:
    if not KEY:
        raise RuntimeError("未配置 READING_API_KEY")

    if name == "save_url":
        urls = args.get("urls") or ([args["url"]] if args.get("url") else [])
        body = {"urls": urls, "tags": args.get("tags") or []}
        res = api("/api/v1/entries", "POST", body)
        return f"已收藏 {res.get('added', 0)} 条，跳过重复 {res.get('skipped', 0)} 条"

    if name == "search":
        res = api(f"/api/v1/entries?q={urllib.parse.quote(args['query'])}&limit={int(args.get('limit', 10))}")
        items = res.get("entries", [])
        if not items:
            return "没有匹配的收藏"
        return "\n".join(f"- [{e['id']}] {e['title']}  ({e.get('site') or ''})  {e['url']}" for e in items)

    if name == "list":
        res = api(f"/api/v1/entries?limit={int(args.get('limit', 10))}")
        items = res.get("entries", [])
        if not items:
            return "还没有收藏"
        return "\n".join(
            f"- [{e['id']}] {e['title']}  ({e.get('kind')}, {e.get('readState')})" for e in items
        )

    if name == "get":
        res = api(f"/api/v1/entries/{int(args['id'])}")
        entry = res.get("entry") or {}
        if not entry:
            return "没有这条收藏"
        parts = [
            f"# {entry.get('title')}",
            f"链接：{entry.get('url')}",
            f"状态：{entry.get('state')} / {entry.get('readState')}",
        ]
        if entry.get("summary"):
            parts += ["", "## 概括", entry["summary"]]
        if entry.get("contentMd"):
            parts += ["", "## 正文", entry["contentMd"][:8000]]
        if entry.get("transcript"):
            parts += ["", "## 逐字稿", entry["transcript"][:8000]]
        return "\n".join(parts)

    raise RuntimeError(f"未知工具：{name}")


def send(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        method = msg.get("method")
        msg_id = msg.get("id")

        if method == "initialize":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "reading-collector", "version": "1.0.0"},
                    },
                }
            )
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})
        elif method == "tools/call":
            params = msg.get("params") or {}
            name = params.get("name", "")
            args = params.get("arguments") or {}
            try:
                text = call_tool(name, args)
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {"content": [{"type": "text", "text": text}]},
                    }
                )
            except Exception as exc:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": msg_id,
                        "result": {
                            "isError": True,
                            "content": [{"type": "text", "text": f"出错了：{exc}"}],
                        },
                    }
                )
        elif msg_id is not None:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": msg_id,
                    "error": {"code": -32601, "message": f"不支持的方法 {method}"},
                }
            )


if __name__ == "__main__":
    main()
