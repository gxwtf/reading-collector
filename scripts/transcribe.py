#!/usr/bin/env python3
"""视频 → 逐字稿：yt-dlp 抓音轨与章节 → ffmpeg 切片 → 语音识别 → 带时间戳文本。

语音识别后端可插拔（见 asr/）：
  apple   macOS / iOS 的 apple-speech（零配置、免费、无需 API key）
  whisper faster-whisper 本地推理（需自行安装，x86_64 上可用）

用法:
  python3 transcribe.py "<视频URL>" [--locale zh-CN] [--backend apple] [-o out.json]

⚠️ 识别语言必须与原声一致。英文讲座用 en-US，中文用 zh-CN，选错会输出乱码。
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import CFG  # noqa: E402


def run(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def fetch_meta(url: str) -> dict:
    cfg = CFG["video"]
    r = run([cfg["ytdlp"], "-J", "--no-playlist", "--no-warnings", url], timeout=300)
    if r.returncode != 0:
        print(f"[meta] 失败：{r.stderr[-300:]}", file=sys.stderr)
        return {}
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return {}


def fetch_audio(url: str, workdir: Path) -> Path | None:
    cfg = CFG["video"]
    out_tpl = str(workdir / "audio.%(ext)s")
    r = run([cfg["ytdlp"], "-f", "bestaudio/best", "-o", out_tpl,
             "--no-playlist", "--no-warnings", url], timeout=1800)
    if r.returncode != 0:
        print(f"[audio] 失败：{r.stderr[-300:]}", file=sys.stderr)
        return None
    cands = [p for p in workdir.glob("audio.*") if p.suffix not in (".part", ".ytdl")]
    return max(cands, key=lambda p: p.stat().st_size) if cands else None


def duration_of(path: Path) -> float:
    r = run([CFG["video"]["ffprobe"], "-v", "error", "-show_entries",
             "format=duration", "-of", "default=nw=1:nk=1", str(path)], timeout=120)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def cut(src: Path, workdir: Path, start: float, length: float, idx: int) -> Path | None:
    dst = workdir / f"c{idx:04d}.wav"
    r = run([CFG["video"]["ffmpeg"], "-y", "-loglevel", "error",
             "-ss", str(start), "-t", str(length), "-i", str(src),
             "-ar", "16000", "-ac", "1", str(dst)], timeout=300)
    return dst if r.returncode == 0 and dst.exists() else None


# --------------------------------------------------------------- asr backends


def asr_apple(path: Path, locale: str, tries: int = 4) -> str | None:
    """apple-speech。并发会限流，必须串行 + 间隔 + 重试。"""
    binp = shutil.which(CFG["video"]["speech"])
    if not binp:
        return None
    last = None
    for k in range(tries):
        r = run([binp, "transcribe", "--source", str(path),
                 "--language", locale, "-q"], timeout=600)
        if r.returncode == 0 and r.stdout.strip().startswith("{"):
            try:
                data = json.loads(r.stdout)
            except json.JSONDecodeError:
                data = None
            if data is not None:
                segs = data.get("segments") or []
                text = " ".join(s.get("substring", "") for s in segs).strip()
                if text:
                    return text
        last = (r.stderr or "")[-200:]
        time.sleep(1.5 * (k + 1))
    print(f"[asr] 放弃 {path.name} {last}", file=sys.stderr)
    return None


_WHISPER_MODEL = None


def asr_whisper(path: Path, locale: str, tries: int = 1) -> str | None:
    global _WHISPER_MODEL
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[asr] faster-whisper 未安装，跳过", file=sys.stderr)
        return None
    if _WHISPER_MODEL is None:
        size = os.environ.get("WHISPER_MODEL", "small")
        _WHISPER_MODEL = WhisperModel(size, device="cpu", compute_type="int8")
    lang = (locale or "en-US").split("-")[0]
    segs, _info = _WHISPER_MODEL.transcribe(str(path), language=lang, vad_filter=True)
    return " ".join(s.text.strip() for s in segs).strip()


BACKENDS = {"apple": asr_apple, "whisper": asr_whisper}


def pick_backend() -> str:
    want = os.environ.get("ASR_BACKEND", "")
    if want in BACKENDS:
        return want
    if shutil.which(CFG["video"]["speech"]):
        return "apple"
    try:
        import faster_whisper  # noqa: F401
        return "whisper"
    except ImportError:
        return "apple"


# ----------------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description="视频转逐字稿")
    ap.add_argument("url")
    ap.add_argument("--locale", default=CFG["video"]["locale"],
                    help="识别语言，auto 则按标题猜；英文 auto 会得到 en-US")
    ap.add_argument("--backend", default=None, choices=list(BACKENDS))
    ap.add_argument("-o", "--out", default=None)
    ap.add_argument("--tag", default=None, help="工作目录与输出文件名")
    a = ap.parse_args()

    cfg = CFG["video"]
    backend = a.backend or pick_backend()
    tag = a.tag or os.path.basename(a.url.split("?")[0])[:40].replace("/", "_") or "video"
    tag = "".join(ch for ch in tag if ch.isalnum() or ch in "._-") or "video"
    workdir = Path(cfg["workdir"]) / tag
    workdir.mkdir(parents=True, exist_ok=True)

    print(f"[1/4] 读取元数据…", flush=True)
    meta = fetch_meta(a.url)
    title = meta.get("title") or ""
    print(f"      {title} | {meta.get('duration')}s", flush=True)

    locale = a.locale
    if locale == "auto":
        locale = "zh-CN" if any("\u4e00" <= c <= "\u9fff" for c in title) else "en-US"
        print(f"      自动判定语言：{locale}（不对就用 --locale 指定）", flush=True)

    print(f"[2/4] 下载音轨…", flush=True)
    audio = fetch_audio(a.url, workdir)
    if not audio:
        sys.exit("音轨下载失败")
    dur = duration_of(audio)
    print(f"      {audio.name} {dur:.0f}s", flush=True)

    chunk = int(cfg["chunk_seconds"])
    n = int(dur // chunk) + 1
    print(f"[3/4] 切片 x{n}…", flush=True)
    cuts: dict[int, Path] = {}
    with ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(cut, audio, workdir, i * chunk,
                          min(chunk, dur - i * chunk), i): i for i in range(n)}
        for f, i in futs.items():
            p = f.result()
            if p:
                cuts[i] = p
    print(f"      {len(cuts)}/{n} 片", flush=True)

    print(f"[4/4] 识别（backend={backend}, locale={locale}）…", flush=True)
    fn = BACKENDS[backend]
    texts: dict[int, str] = {}
    done = 0
    with ThreadPoolExecutor(1) as ex:  # 串行，避免限流
        def one(p: Path) -> str | None:
            t = fn(p, locale, cfg["retries"])
            time.sleep(cfg["gap"])
            return t
        futs = {ex.submit(one, p): i for i, p in sorted(cuts.items())}
        for f, i in futs.items():
            t = f.result()
            done += 1
            if t:
                texts[i] = t
            if done % 10 == 0 or done == len(cuts):
                print(f"      {done}/{len(cuts)}", flush=True)

    lines = [f"[{i * chunk // 60:02d}:{i * chunk % 60:02d}] {texts[i]}" for i in sorted(texts)]
    result = {
        "title": title,
        "url": a.url,
        "uploader": meta.get("uploader"),
        "duration": dur,
        "locale": locale,
        "backend": backend,
        "chapters": [{"t": c.get("start_time"), "title": c.get("title")}
                     for c in (meta.get("chapters") or [])],
        "description": meta.get("description"),
        "transcript": lines,
    }
    out = Path(a.out) if a.out else workdir / "transcript.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    coverage = f"{len(texts)}/{n}"
    print(f"[done] 覆盖 {coverage} 片段 -> {out}", flush=True)
    if len(texts) < n * 0.5:
        print("⚠️ 超过一半片段识别失败，多为并发限流。检查 gap / retries 后重跑。",
              file=sys.stderr)


if __name__ == "__main__":
    main()
