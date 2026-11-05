"""worker 配置：全部走环境变量，与站点共用 .env"""
from __future__ import annotations

import os
from pathlib import Path

# 站点地址（worker 通过 HTTP 与站点通信，不直连数据库）
BASE_URL = os.environ.get("READING_BASE_URL", "http://127.0.0.1:3005").rstrip("/")
API_KEY = os.environ.get("INTERNAL_API_KEY", "")
WORKER_NAME = os.environ.get("WORKER_NAME", os.uname().nodename if hasattr(os, "uname") else "worker")

# 轮询间隔与空转退避
POLL_INTERVAL = float(os.environ.get("WORKER_POLL_INTERVAL", "5"))
IDLE_MAX_INTERVAL = float(os.environ.get("WORKER_IDLE_MAX_INTERVAL", "30"))

# 抓取
HTTP_TIMEOUT = float(os.environ.get("FETCH_TIMEOUT", "30"))
USER_AGENT = os.environ.get(
    "FETCH_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
)

# 转写
TMP_ROOT = Path(os.environ.get("VIDEO_WORKDIR") or "/tmp/reading-worker")
ASR_LOCALE = os.environ.get("ASR_LOCALE", "zh-CN")
WHISPER_CLI = os.environ.get("WHISPER_CLI", "whisper-cli")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "/opt/whisper.cpp/models/ggml-small.bin")
YTDLP = os.environ.get("YTDLP", "yt-dlp")
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")

# 单次任务最长执行时间（秒），超时按失败上报
TASK_TIMEOUT = int(os.environ.get("WORKER_TASK_TIMEOUT", "1800"))
