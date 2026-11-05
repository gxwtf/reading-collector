"""抽取式概括：不调用大模型，取每节首句作为要点。"""
from __future__ import annotations

import re

SENTENCE_RE = re.compile(r"(?<=[。！？.!?])\s*")


def _first_sentences(text: str, n: int = 2) -> str:
    parts = [p for p in SENTENCE_RE.split(re.sub(r"\s+", " ", text)) if p.strip()]
    return "".join(parts[:n]).strip()[:180]


def chunk_summary(text: str, max_points: int) -> list[str]:
    """无小标题的长文本（逐字稿）：按字符位置切段，各取首句。"""
    sentences = [s.strip() for s in SENTENCE_RE.split(re.sub(r"\s+", " ", text)) if len(s.strip()) > 8]
    if not sentences:
        return []
    total = sum(len(s) for s in sentences)
    step = max(200, total // max_points)
    out: list[str] = []
    pos = 0
    nxt = 0
    for s in sentences:
        if pos >= nxt:
            out.append(s[:150])
            nxt += step
            if len(out) >= max_points:
                break
        pos += len(s)
    return out


def summarize(text: str, max_points: int = 8) -> str:
    if not text or len(text.strip()) < 80:
        return ""

    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)

    points: list[str] = []
    heading = ""
    buffer: list[str] = []

    def flush() -> None:
        nonlocal buffer
        sentence = _first_sentences(" ".join(buffer)) if buffer else ""
        buffer = []
        if sentence:
            points.append(f"{heading}：{sentence}" if heading else sentence)

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush()
            continue
        m = re.match(r"^#{1,6}\s*(.+)$", line)
        if m:
            flush()
            heading = m.group(1).strip()[:40]
            continue
        if line.startswith((">", "|")) or re.match(r"^[-*]\s", line):
            continue
        if line.startswith("![") or line.startswith("```"):
            continue
        buffer.append(line)
    flush()

    seen: set[str] = set()
    out: list[str] = []
    for p in points:
        key = p[:24]
        if key in seen:
            continue
        seen.add(key)
        out.append(p if len(p) <= 140 else p[:140] + "…")
        if len(out) >= max_points:
            break

    if len(out) < 3:
        fallback = chunk_summary(text, max_points)
        if fallback:
            return "\n".join(f"- {p}" for p in fallback)

    return "\n".join(f"- {p}" for p in out)
