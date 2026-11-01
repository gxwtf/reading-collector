#!/usr/bin/env bash
# 一键安装：检查依赖 → 写配置 → 注册技能 → 自检
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.claude/skills}"   # 可覆盖
VAULT=""
INSTALL_SKILLS=0
DRY=0

usage() {
  cat <<'EOF'
用法: install.sh [选项]

  --vault <path>      Obsidian vault 根目录（必填，除非已设 MINIS_VAULT）
  --skills-dir <path> 技能安装目录（默认 ~/.claude/skills）
  --install-skills    把 skills/* 复制到技能目录
  --dry-run           只检查依赖，不写任何文件
  -h, --help          显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault) VAULT="$2"; shift 2 ;;
    --skills-dir) SKILLS_DIR="$2"; shift 2 ;;
    --install-skills) INSTALL_SKILLS=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1"; usage; exit 1 ;;
  esac
done

echo "== 检查依赖 =="
missing=0
for bin in python3 ffmpeg ffprobe yt-dlp; do
  if command -v "$bin" >/dev/null 2>&1; then
    printf '  ✓ %-10s %s\n' "$bin" "$(command -v "$bin")"
  else
    printf '  ✗ %-10s 缺失\n' "$bin"; missing=1
  fi
done

# 语音识别后端：二选一
if command -v apple-speech >/dev/null 2>&1; then
  echo "  ✓ apple-speech  (推荐，macOS/iOS)"
  ASR=apple
elif python3 -c "import faster_whisper" 2>/dev/null; then
  echo "  ✓ faster-whisper (本机推理)"
  ASR=whisper
else
  echo "  ✗ 没有可用的语音识别后端"
  echo "     macOS/iOS: 安装 apple-speech（Minis 自带）"
  echo "     其它平台:  pip install faster-whisper"
  missing=1
fi

# MCP 客户端（只有用待办后端时才需要）
if command -v minis-mcp-cli >/dev/null 2>&1; then
  echo "  ✓ minis-mcp-cli"
else
  echo "  ! minis-mcp-cli 缺失 —— 只能用 --backend file 的本地收件箱"
fi

python3 -c "import tomllib" 2>/dev/null \
  && echo "  ✓ tomllib (Python 3.11+)" \
  || echo "  ! Python <3.11，将忽略 config.toml，只能用环境变量配置"

if [[ $missing -eq 1 ]]; then
  echo
  echo "依赖不全。可用 -h 查看安装提示，或自行补齐后重跑。"
  [[ $DRY -eq 1 ]] || exit 1
fi

if [[ -z "$VAULT" ]]; then
  VAULT="${MINIS_VAULT:-}"
fi
if [[ -z "$VAULT" ]]; then
  echo
  echo "请用 --vault 指定 Obsidian vault 路径，例如："
  echo "  ./scripts/install.sh --vault /path/to/知识库 --install-skills"
  exit 1
fi
if [[ ! -d "$VAULT" ]]; then
  echo "vault 路径不存在: $VAULT"; exit 1
fi
echo "  ✓ vault  $VAULT"

[[ $DRY -eq 1 ]] && { echo; echo "dry-run 结束，未写入任何文件。"; exit 0; }

echo "== 写配置 =="
CFG="$ROOT/config/config.toml"
if [[ -f "$CFG" ]]; then
  echo "  已存在，保留不覆盖：$CFG"
else
  sed "s|^path = \"\"|path = \"$VAULT\"|" "$ROOT/config/config.example.toml" > "$CFG"
  echo "  已生成 $CFG"
fi

echo "== 自检 =="
python3 - "$ROOT" <<'PY'
import sys, importlib.util
root = sys.argv[1]
sys.path.insert(0, root + "/scripts")
import config
print(f"  vault   {config.vault_root()}")
print(f"  归档目录 {config.archive_dir()}")
print(f"  ASR 后端 {config.speech_binary() or '未找到 apple-speech'}")
PY

if [[ $INSTALL_SKILLS -eq 1 ]]; then
  echo "== 安装技能 =="
  mkdir -p "$SKILLS_DIR"
  for s in "$ROOT"/skills/*/; do
    name="$(basename "$s")"
    rm -rf "$SKILLS_DIR/$name"
    cp -r "$s" "$SKILLS_DIR/$name"
    echo "  → $SKILLS_DIR/$name"
  done
  echo "  提示：技能里的脚本路径需指向本仓库，见 SKILL.md 顶部说明。"
fi

echo
echo "完成。下一步："
echo "  1. 在待办应用里建一个分组（默认名「阅读收集」）"
echo "  2. 建条目：标题写题目，正文放链接"
echo "  3. python3 scripts/inbox.py       # 看看读到了什么"
