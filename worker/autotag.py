"""自动打标：抓取/转写完成后，用 LLM 从既有标签里挑或补 1-3 个标签。"""
from __future__ import annotations

import json
import os
import re
import urllib.request

PROMPT = """你在为一条收藏打标签。规则：
1. 优先复用给定「已有标签」，确实不合适才新建，最多 3 个
2. 标签要短（2-6 字），是主题/领域/体裁，不要是句子
3. 只输出 JSON 数组，例如 ["认知科学","长文"]，不要任何解释"""


def _configs() -> list[dict]:
    try:
        arr = json.loads(os.environ.get("LLM_CONFIGS", ""))
    except (json.JSONDecodeError, TypeError):
        return []
    return [c for c in arr if c.get("apiBase") and c.get("apiKey") and c.get("model")]


def suggest(text: str, existing: list[str], title: str = "") -> list[str]:
    if not text or len(text) < 200:
        return []
    cfgs = _configs()
    if not cfgs:
        return []

    sample = text[:4000]
    user = (
        f"标题：{title}\n已有标签：{', '.join(existing[:60]) or '（暂无）'}\n\n"
        f"正文节选：\n{sample}"
    )

    for cfg in cfgs:
        try:
            body = json.dumps(
                {
                    "model": cfg["model"],
                    "messages": [
                        {"role": "system", "content": PROMPT},
                        {"role": "user", "content": user},
                    ],
                    "max_tokens": 600,
                    "temperature": 0.2,
                }
            ).encode()
            req = urllib.request.Request(
                cfg["apiBase"].rstrip("/") + "/chat/completions",
                data=body,
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["apiKey"]},
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            match = re.search(r"\[[^\]]*\]", content or "")
            if not match:
                continue
            tags = json.loads(match.group(0))
            clean = [str(t).strip()[:12] for t in tags if str(t).strip()]
            return list(dict.fromkeys(clean))[:3]
        except Exception:
            continue
    return []
