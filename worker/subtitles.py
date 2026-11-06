"""用 yt-dlp 抓现成字幕（第三方工具路线）。

优先于 whisper：YouTube 的自动字幕、以及配置了 cookies 后的 B 站字幕都能直接拿到。
"""
from __future__ import annotations

import glob
import os
import re
import subprocess
import tempfile
from pathlib import Path

YTDLP = os.environ.get("YTDLP", "yt-dlp")
LANGS = "zh-Hans,zh-CN,zh,en,en-US,en-orig"

TIME_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})"
)


def _to_sec(h: str, m: str, s: str, ms: str) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_vtt(text: str) -> list[dict]:
    """把 VTT 解析成 [{start,end,text}]"""
    segments: list[dict] = []
    current: dict | None = None

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("WEBVTT") or line.startswith("NOTE"):
            continue
        m = TIME_RE.search(line)
        if m:
            if current and current["text"]:
                segments.append(current)
            current = {
                "start": _to_sec(*m.groups()[:4]),
                "end": _to_sec(*m.groups()[4:]),
                "text": "",
            }
            continue
        if current is not None:
            clean = re.sub(r"<[^>]+>", "", line).strip()
            if clean:
                current["text"] = (current["text"] + " " + clean).strip()

    if current and current["text"]:
        segments.append(current)
    return segments


def fetch_subtitles(url: str, locale: str | None = None) -> dict | None:
    """返回 {text, segments, locale, backend:'yt-dlp'}；拿不到返回 None。"""
    cookies = os.environ.get("YTDLP_COOKIES", "").strip()
    with tempfile.TemporaryDirectory(prefix="subs-") as tmp:
        cmd = [
            YTDLP,
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", LANGS,
            "--sub-format", "vtt",
            "--no-playlist",
            "--no-warnings",
            "-o", str(Path(tmp) / "sub"),
        ]
        if cookies and Path(cookies).exists():
            cmd += ["--cookies", cookies]
        cmd.append(url)

        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
        except (subprocess.TimeoutExpired, OSError):
            return None

        files = sorted(glob.glob(str(Path(tmp) / "*.vtt")))
        if not files:
            return None

        # 优先中文，其次英文
        files.sort(key=lambda f: 0 if ".zh" in f else 1)
        text = Path(files[0]).read_text(encoding="utf-8", errors="replace")
        segments = parse_vtt(text)
        if len(segments) < 3:
            return None

        joined = " ".join(s["text"] for s in segments)
        if len(joined) < 40:
            return None

        lang = "zh-CN" if ".zh" in files[0] else "en"

        return {
            "text": joined,
            "segments": segments,
            "locale": lang,
            "backend": "yt-dlp",
            "model": None,
        }
