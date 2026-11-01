#!/usr/bin/env python3
"""统一配置：环境变量 > config/config.toml > 内置默认值。

所有路径与平台差异都集中在这里，脚本本身不再出现硬编码本机路径。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import tomllib  # py3.11+
except ModuleNotFoundError:  # pragma: no cover
    try:
        import tomli as tomllib  # 3.9 / 3.10 回退
    except ModuleNotFoundError:
        tomllib = None

DEFAULTS = {
    "vault": {
        # Obsidian vault 根目录（必填，否则用 MINIS_VAULT）
        "path": "",
        # 归档子目录，相对 vault
        "folder": "阅读收集",
        # 是否按年份分子目录：阅读收集/2026/xxx.md
        "group_by_year": True,
        # 附件目录名
        "assets": "附件",
        # 首页索引文件名
        "index": "首页.md",
    },
    "todo": {
        # 青蛙todo 分组名（精确匹配优先，其次模糊包含）
        "category": "阅读收集",
        "server": "Todo",
    },
    "notion": {
        # 从属镜像开关，默认关闭
        "enabled": False,
        # 父页面 ID
        "parent_page_id": "",
        "server": "Notion",
        "create_tool": "notion-create-pages",
    },
    "video": {
        # 转写工作目录
        "workdir": "",
        # 每片秒数
        "chunk_seconds": 45,
        # 语音识别语言，auto 时按宿主探测
        "locale": "auto",
        # 识别失败重试次数
        "retries": 4,
        # 每次调用间隔秒数（apple-speech 并发会限流）
        "gap": 0.4,
        # yt-dlp / ffmpeg 可执行路径
        "ytdlp": "yt-dlp",
        "ffmpeg": "ffmpeg",
        "ffprobe": "ffprobe",
        "speech": "apple-speech",
    },
    "mcp": {
        # minis-mcp-cli 可执行路径
        "cli": "minis-mcp-cli",
        # 调用超时秒数
        "timeout": 120,
    },
    "output": {
        # 笔记收集日期取当天
        "date_format": "%Y-%m-%d",
        "filename_max_chars": 60,
    },
}


def _merge(base: dict, override: dict) -> dict:
    for k, v in (override or {}).items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _merge(base[k], v)
        else:
            base[k] = v
    return base


def _env_override(cfg: dict) -> dict:
    """环境变量优先级最高，便于 CI / 容器覆盖。"""
    mapping = {
        "MINIS_VAULT": ("vault", "path"),
        "READING_FOLDER": ("vault", "folder"),
        "READING_ASSETS": ("vault", "assets"),
        "FROGTODO_CATEGORY": ("todo", "category"),
        "NOTION_PARENT_PAGE_ID": ("notion", "parent_page_id"),
        "VIDEO_WORKDIR": ("video", "workdir"),
        "ASR_LOCALE": ("video", "locale"),
    }
    for var, (sec, key) in mapping.items():
        val = os.environ.get(var)
        if val:
            cfg[sec][key] = val
    if os.environ.get("NOTION_ENABLED", "").lower() in ("1", "true", "yes"):
        cfg["notion"]["enabled"] = True
    return cfg


def find_config_file() -> Path | None:
    """查找顺序：$READING_CONFIG → ./config/config.toml → 仓库根 config/config.toml。"""
    env = os.environ.get("READING_CONFIG")
    if env and Path(env).exists():
        return Path(env)
    here = Path(__file__).resolve()
    for base in (Path.cwd(), here.parent.parent):
        p = base / "config" / "config.toml"
        if p.exists():
            return p
    return None


def load() -> dict:
    cfg = _merge({k: dict(v) for k, v in DEFAULTS.items()}, {})
    path = find_config_file()
    if path:
        if tomllib:
            with open(path, "rb") as f:
                cfg = _merge(cfg, tomllib.load(f))
        else:
            print(f"警告：发现 {path}，但当前 Python 没有 tomllib/tomli，"
                  f"已忽略该文件（pip install tomli 或升级到 3.11+）",
                  file=sys.stderr)
    cfg = _env_override(cfg)

    # 自动探测：只认真正带 .obsidian 的目录，绝不猜挂载根或 Documents
    if not cfg["vault"]["path"]:
        for cand in (Path.home() / "Obsidian", Path.home() / "Documents"):
            if (cand / ".obsidian").is_dir():
                cfg["vault"]["path"] = str(cand)
                break

    if not cfg["video"]["workdir"]:
        cfg["video"]["workdir"] = str(
            Path(os.environ.get("TMPDIR", "/tmp")) / "reading-collector"
        )
    return cfg


CFG = load()


def vault_root() -> Path:
    root = CFG["vault"]["path"]
    if not root:
        sys.exit(
            "未配置 vault 路径。请设置环境变量 MINIS_VAULT，"
            "或在 config/config.toml 里填写 [vault] path。"
        )
    return Path(root)


def archive_dir() -> Path:
    return vault_root() / CFG["vault"]["folder"]


def speech_binary() -> str:
    """返回可用的语音识别命令，找不到时返回空串。"""
    import shutil

    return shutil.which(CFG["video"]["speech"]) or ""


def resolve_locale(text_hint: str = "") -> str:
    """auto 时：有中文字符判 zh-CN，否则 en-US。"""
    loc = CFG["video"]["locale"]
    if loc and loc != "auto":
        return loc
    if any("\u4e00" <= ch <= "\u9fff" for ch in text_hint or ""):
        return "zh-CN"
    return "en-US"


def dump() -> None:
    import json

    print(json.dumps(CFG, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    dump()
