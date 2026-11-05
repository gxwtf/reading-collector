"""worker 端 AI 概括：直接调用站点同一套 LLM_CONFIGS，失败退回抽取式。"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from summarize import summarize

PROMPT = """你在为「阅读收集」写一份读书笔记摘要。请严格按下面的 Markdown 结构输出，不要任何开场白或额外解释：

## 一句话结论
（一句话，不超过 40 字，说清这篇最重要的判断或发现）

## 分章要点
- **小标题**：要点（每条不超过 60 字，4-8 条）
- 视频/播客按时间顺序，每条以 [mm:ss] 开头
- 文章按原文的论证顺序，讲机制、讲取舍，不要复述流水账

## 金句
> 原文原句（视频/播客标 [mm:ss]）
（1-3 条，只挑真正有信息量或画面感的句子，不要编造）

要求：具体、带数字与专有名词；人名与术语保留原文；中文输出。"""


def _configs() -> list[dict]:
    raw = os.environ.get("LLM_CONFIGS", "")
    try:
        arr = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    return [c for c in arr if c.get("apiBase") and c.get("apiKey") and c.get("model")]


def _chat(cfg: dict, text: str, kind: str) -> str:
    intro = "这是一篇文章" if kind == "article" else "这是音视频的逐字稿，时间戳已在每段开头"
    body = json.dumps(
        {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": PROMPT},
                {"role": "user", "content": f"{intro}：\n\n{text}"},
            ],
            "max_tokens": 3000,
            "temperature": 0.2,
        }
    ).encode()

    req = urllib.request.Request(
        cfg["apiBase"].rstrip("/") + "/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["apiKey"]},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    if not content or len(content.strip()) < 30:
        raise ValueError("模型没有返回内容")
    return content.strip()


def _timestamped(segments: list[dict]) -> str:
    lines: list[str] = []
    start = 0.0
    buf: list[str] = []

    def flush() -> None:
        if buf:
            lines.append(f"[{_mmss(start)}] " + " ".join(buf).strip())

    for seg in segments:
        t = float(seg.get("start") or 0)
        if buf and t - start >= 45:
            flush()
            buf = []
            start = t
        elif not buf:
            start = t
        text = (seg.get("text") or "").strip()
        if text:
            buf.append(text)
    flush()
    return "\n".join(lines)


def _mmss(sec: float) -> str:
    m = int(sec // 60)
    s = int(sec % 60)
    return f"{m:02d}:{s:02d}"


def ai_summary(
    text: str,
    kind: str = "article",
    segments: list[dict] | None = None,
) -> str:
    """优先 AI；任何异常（无配置 / 超时 / 空返回）都退回抽取式。"""
    if not text or len(text.strip()) < 80:
        return ""

    source = _timestamped(segments) if segments else text
    source = source[:12000]

    for cfg in _configs():
        try:
            return _chat(cfg, source, kind)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as exc:
            print(f"[summary] {cfg.get('name', '?')} 失败：{exc}", flush=True)

    return summarize(text)
