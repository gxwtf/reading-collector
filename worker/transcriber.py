"""音视频转写：yt-dlp 抓音轨 → whisper.cpp 转写 → 逐字稿 + 分段。

云端只保留 whisper.cpp 后端：纯 C++，服务器上装好 whisper-cli 与模型即可，
不依赖 ctranslate2（musl 上必崩）。语言必须与原声一致，选错输出是乱码。
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from config import ASR_LOCALE, FFMPEG, TMP_ROOT, WHISPER_CLI, WHISPER_MODEL, YTDLP


class TranscribeError(RuntimeError):
    pass


def _run(cmd: list[str], timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _fetch_meta(url: str) -> dict:
    r = _run([YTDLP, "-J", "--no-playlist", "--no-warnings", url], timeout=300)
    if r.returncode != 0:
        raise TranscribeError(f"yt-dlp 取信息失败：{(r.stderr or '')[-300:]}")
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError as exc:
        raise TranscribeError("yt-dlp 返回的元信息不是合法 JSON") from exc


def _download_audio(url: str, workdir: Path) -> Path:
    out_tpl = str(workdir / "audio.%(ext)s")
    r = _run(
        [YTDLP, "-f", "bestaudio/best", "-o", out_tpl, "--no-playlist", "--no-warnings", url],
        timeout=3600,
    )
    if r.returncode != 0:
        raise TranscribeError(f"下载音轨失败：{(r.stderr or '')[-300:]}")
    cands = [p for p in workdir.glob("audio.*") if p.suffix not in (".part", ".ytdl")]
    if not cands:
        raise TranscribeError("下载完成但找不到音频文件")
    return max(cands, key=lambda p: p.stat().st_size)


def _to_wav(src: Path) -> Path:
    """whisper.cpp 只吃 16kHz 单声道 wav"""
    dst = src.with_name("audio16k.wav")
    r = _run(
        [FFMPEG, "-y", "-i", str(src), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(dst)],
        timeout=1800,
    )
    if r.returncode != 0 or not dst.exists():
        raise TranscribeError(f"ffmpeg 转码失败：{(r.stderr or '')[-300:]}")
    return dst


def _asr(wav: Path, locale: str) -> tuple[str, list[dict], str]:
    binp = shutil.which(WHISPER_CLI) or (WHISPER_CLI if Path(WHISPER_CLI).exists() else None)
    if not binp:
        raise TranscribeError(f"找不到 whisper-cli（{WHISPER_CLI}）")
    if not Path(WHISPER_MODEL).exists():
        raise TranscribeError(f"whisper 模型不存在：{WHISPER_MODEL}")

    lang = (locale or ASR_LOCALE).split("-")[0]

    vad_model = os.environ.get("WHISPER_VAD", "")
    vad_args = ["--vad", "-vm", vad_model] if vad_model and Path(vad_model).exists() else []
    out_base = wav.with_suffix("")
    r = _run(
        [
            binp,
            "-m", WHISPER_MODEL,
            "-f", str(wav),
            "-l", lang,
            "-nt",
            # 解码：束搜索 + 贪心温度，比默认更稳
            "-bs", "5",
            "-bo", "5",
            "-tp", "0",
            "-ojf",
            "-of", str(out_base),
            *vad_args,
        ],
    )

    text = ""
    segments: list[dict] = []
    json_path = Path(str(out_base) + ".json")
    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            for item in data.get("transcription", []):
                words = []
                for tok in item.get("tokens", []):
                    t = (tok.get("text") or "").replace("\u2581", " ")
                    stripped = t.strip()
                    if not stripped or stripped.startswith("<|") or stripped.startswith("[_"):
                        continue
                    off = tok.get("offsets", {})
                    start, end = off.get("from", 0) / 1000, off.get("to", 0) / 1000

                    # 纯标点并入前一个词，避免高亮停在一个逗号上
                    if words and all(ch in PUNCT_ONLY for ch in stripped):
                        words[-1]["text"] += t
                        words[-1]["end"] = end
                        continue

                    words.append({"start": start, "end": end, "text": t})
                segments.append(
                    {
                        "start": item.get("offsets", {}).get("from", 0) / 1000,
                        "end": item.get("offsets", {}).get("to", 0) / 1000,
                        "text": (item.get("text") or "").strip(),
                        "words": words,
                    }
                )
            text = "".join(s["text"] for s in segments).strip()
        except (json.JSONDecodeError, OSError):
            pass
        finally:
            json_path.unlink(missing_ok=True)

    if not text:
        if r.returncode != 0:
            raise TranscribeError(f"whisper-cli 失败：{(r.stderr or '')[-300:]}")
        raise TranscribeError("转写结果为空")

    return text, segments, lang


PUNCT_ONLY = set("，。、；：？！,.!?;:\"'（）()[]{}《》<>—…·-")


def clean_title(text: str) -> str:
    """B 站标题常把「标题 + p01 + 【字幕】 + 标题」拼在一起，去掉重复与分 P 后缀。"""
    t = re.sub(r"\s+p\d+\s*", " ", (text or "").strip())
    t = re.sub(r"\s+", " ", t).strip()

    # 去掉【中英字幕】这类标签后，取最长的一段
    parts = [p.strip() for p in re.split(r"【[^】]*】", t) if p.strip()]
    if parts:
        t = max(parts, key=len)

    # 「A + A」式重复：找到第二次出现的开头并截断
    if len(t) > 40:
        head = t[:20]
        for i in range(25, len(t) // 2 + 1):
            if t[i : i + 20] == head:
                t = t[:i].strip()
                break
    return t[:120]


SITES = {
    "bilibili.com": "哔哩哔哩",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "xiaoyuzhoufm.com": "小宇宙",
    "podcasts.apple.com": "Apple Podcasts",
    "spotify.com": "Spotify",
}


def _site_of(url: str) -> str:
    host = httpx_host(url)
    for key, name in SITES.items():
        if host.endswith(key):
            return name
    return "音视频"


def httpx_host(url: str) -> str:
    from urllib.parse import urlparse

    return (urlparse(url).hostname or "").replace("www.", "")


BILI_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


def _bili_json(api: str) -> dict:
    import json as _json
    import urllib.request

    headers = {"User-Agent": BILI_UA, "Referer": "https://www.bilibili.com/"}
    sess = os.environ.get("BILI_SESSDATA", "").strip()
    if sess:
        headers["Cookie"] = f"SESSDATA={sess}"
    req = urllib.request.Request(api, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return _json.loads(resp.read())


def try_bilibili_subtitle(url: str, locale: str | None = None) -> dict | None:
    """B 站官方字幕：有登录态（BILI_SESSDATA）才有数据；拿不到就返回 None 走转写。"""
    if "bilibili.com" not in url:
        return None
    if not os.environ.get("BILI_SESSDATA", "").strip():
        print("[subtitle] 未配置 BILI_SESSDATA，跳过官方字幕（B 站接口需要登录态）", flush=True)
    m = re.search(r"(BV[0-9A-Za-z]+)", url)
    if not m:
        return None
    bvid = m.group(1)

    try:
        view = _bili_json(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}")
        data = view.get("data") or {}
        pages = data.get("pages") or []
        page_no = int(re.search(r"[?&]p=(\d+)", url).group(1)) if re.search(r"[?&]p=(\d+)", url) else 1
        cid = pages[page_no - 1]["cid"] if pages and len(pages) >= page_no else data.get("cid")
        if not cid:
            return None

        player = _bili_json(
            f"https://api.bilibili.com/x/player/v2?bvid={bvid}&cid={cid}"
        )
        subs = ((player.get("data") or {}).get("subtitle") or {}).get("subtitles") or []
        if not subs:
            print("[subtitle] 该视频没有官方字幕，回退语音识别", flush=True)
            return None

        want = (locale or "").split("-")[0].lower()
        chosen = None
        for s in subs:
            lan = (s.get("lan") or "").lower()
            if want and want in lan:
                chosen = s
                break
        chosen = chosen or subs[0]

        sub_url = chosen.get("subtitle_url") or ""
        if sub_url.startswith("//"):
            sub_url = "https:" + sub_url
        body = _bili_json(sub_url).get("body") or []
        segments = [
            {
                "start": float(item.get("from") or 0),
                "end": float(item.get("to") or 0),
                "text": (item.get("content") or "").strip(),
            }
            for item in body
        ]
        text = " ".join(seg["text"] for seg in segments if seg["text"])
        if len(text) < 40:
            return None

        return {
            "text": text,
            "segments": segments,
            "locale": chosen.get("lan") or (locale or "zh-CN"),
            "backend": "bilibili",
            "model": None,
            "durationSec": int(data.get("duration") or 0) or None,
            "title": clean_title(data.get("title") or ""),
            "author": (data.get("owner") or {}).get("name"),
            "coverImage": data.get("pic"),
            "kind": "video",
            "site": "哔哩哔哩",
        }
    except Exception as exc:  # noqa: BLE001 - 拿不到就回退
        print(f"[subtitle] 官方字幕不可用：{exc}", flush=True)
        return None


def transcribe(url: str, locale: str | None = None) -> dict:
    """返回 {text, segments, locale, backend, model, durationSec, title, author, coverImage, kind}"""
    official = try_bilibili_subtitle(url, locale)
    if official:
        print("[subtitle] 使用 B 站官方字幕", flush=True)
        return official

    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    meta = _fetch_meta(url)

    with tempfile.TemporaryDirectory(dir=TMP_ROOT) as tmp:
        workdir = Path(tmp)
        audio = _download_audio(url, workdir)
        wav = _to_wav(audio)
        text, segments, lang = _asr(wav, locale or ASR_LOCALE)

    duration = meta.get("duration") or (segments[-1]["end"] if segments else None)
    thumbnail = meta.get("thumbnail")
    if not thumbnail and meta.get("thumbnails"):
        thumbnail = meta["thumbnails"][-1].get("url")

    return {
        "text": text,
        "segments": segments,
        "locale": locale or ASR_LOCALE,
        "backend": "whispercpp",
        "model": Path(WHISPER_MODEL).name,
        "durationSec": int(duration) if duration else None,
        "title": clean_title(meta.get("title") or ""),
        "author": meta.get("uploader") or meta.get("channel"),
        "coverImage": thumbnail,
        "kind": "video",
        "site": _site_of(url),
    }
