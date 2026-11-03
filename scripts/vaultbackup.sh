#!/bin/sh
# vaultbackup.sh — 把 Obsidian 知识库推到私有仓库做异地备份
#
# 为什么要有这个：
#   2026-11-02 一次误删把 /var/minis 整个清空，语料库全丢，
#   只因为语料库从没做过 Notion 镜像。备份不是可选项。
#
# 用法：
#   sh vaultbackup.sh           备份 + 推送
#   sh vaultbackup.sh --dry     只报告会推送什么，不实际推送
#   sh vaultbackup.sh --restore <目标目录>   从备份恢复
#
# 约定：
#   - 备份仓库是私有的，只放文件内容
#   - 绝不把任何凭据、token、.obsidian 工作区配置推上去

set -u

VAULT="${VAULT_PATH:-/var/minis/mounts/dev/TheBook}"
WORK="${VAULT_BACKUP_DIR:-/var/minis/shared/vault-backup}"
REMOTE="https://github.com/kyoukawa/vault-backup.git"
MODE="${1:-}"

case "$MODE" in
  --restore)
    TARGET="${2:-}"
    [ -n "$TARGET" ] || { echo "用法: sh vaultbackup.sh --restore <目标目录>"; exit 1; }
    mkdir -p "$TARGET"
    if [ -d "$WORK/.git" ]; then
      cd "$WORK" && git pull --quiet 2>/dev/null
    else
      mkdir -p "$WORK"
      git clone --quiet "$REMOTE" "$WORK" 2>/dev/null || { echo "✗ 克隆失败"; exit 1; }
    fi
    cp -r "$WORK"/. "$TARGET"/ 2>/dev/null
    rm -rf "$TARGET/.git"
    echo "✓ 已恢复到 $TARGET"
    exit 0
    ;;
esac


# 推送前检查：vault 必须真实存在，否则不要用一个空目录覆盖备份
if [ ! -d "$VAULT" ]; then
  echo "✗ vault 不存在：$VAULT" >&2
  echo "  挂载没恢复时不要跑备份——那会用空目录覆盖已有的备份。" >&2
  exit 2
fi
if [ -z "$(ls -A "$VAULT" 2>/dev/null)" ]; then
  echo "✗ vault 是空的：$VAULT" >&2
  echo "  拒绝用空目录覆盖备份。" >&2
  exit 2
fi

# 首次：初始化工作副本
if [ ! -d "$WORK/.git" ]; then
  echo "· 初始化备份工作副本 $WORK"
  mkdir -p "$WORK"
  cd "$WORK" || exit 1
  git init -q
  git config user.email "vault-backup@users.noreply.github.com"
  git config user.name "vault-backup"
  git remote add origin "$REMOTE" 2>/dev/null
  git config core.fileMode false      # iSH 的 chmod 无效，避免整仓虚假改动
else
  cd "$WORK" || exit 1
fi

# 同步内容：先清空工作区（保留 .git），再从 vault 拷
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} + 2>/dev/null
for d in 阅读收集 语料库 语文语料库; do
  [ -d "$VAULT/$d" ] && cp -r "$VAULT/$d" . 2>/dev/null && echo "  + $d"
done

# ---------------------------------------------------------------------------
# Minis 配置备份（明文，仓库为私有）
#   mcp-servers/  MCP 服务器配置，含 Bearer token 与 OAuth 令牌
#   memory/       GLOBAL.md（全局记忆）与 SOUL.md
#   skills/       所有技能的 SKILL.md
# 不备份：workspace/（代码自有 Git）、attachments/（体积大）、browser/、offloads/
# ---------------------------------------------------------------------------
MINIS=/var/minis
mkdir -p _minis

if [ -d "$MINIS/mcp-servers" ]; then
  mkdir -p _minis/mcp-servers
  cp "$MINIS/mcp-servers/servers.json" _minis/mcp-servers/ 2>/dev/null
  # OAuth 令牌（授权状态，丢了要重新授权）
  [ -d "$MINIS/mcp-servers/oauth" ] && \
    cp -r "$MINIS/mcp-servers/oauth" _minis/mcp-servers/ 2>/dev/null
  echo "  + mcp-servers"
fi

if [ -d "$MINIS/memory" ]; then
  mkdir -p _minis/memory
  cp "$MINIS"/memory/*.md _minis/memory/ 2>/dev/null
  echo "  + memory"
fi

if [ -d "$MINIS/skills" ]; then
  mkdir -p _minis/skills
  for d in "$MINIS"/skills/*/; do
    n=$(basename "$d")
    [ -f "$d/SKILL.md" ] && mkdir -p "_minis/skills/$n" && \
      cp "$d/SKILL.md" "_minis/skills/$n/"
  done
  echo "  + skills"
fi

# 保留 snippets（自写样式），但剔除设备相关的工作区状态
if [ -d "$VAULT/.obsidian/snippets" ]; then
  mkdir -p .obsidian
  cp -r "$VAULT/.obsidian/snippets" .obsidian/ 2>/dev/null
fi
find .obsidian -maxdepth 1 -type f -delete 2>/dev/null   # 只留 snippets 子目录
find . -name ".DS_Store" -delete 2>/dev/null
find . -name "*.tmp" -delete 2>/dev/null

# 凭据文件检查：只检查 vault 内容区，_minis/ 是有意明文备份的配置
if find . -path ./_minis -prune -o -type f \
     \( -name "*token*" -o -name "*.env" -o -name "*credential*" \) -print 2>/dev/null | grep -q .; then
  echo "✗ vault 内容区发现疑似凭据文件，已中止：" >&2
  find . -path ./_minis -prune -o -type f \
     \( -name "*token*" -o -name "*.env" -o -name "*credential*" \) -print 2>/dev/null >&2
  exit 3
fi

COUNT=$(find . -name "*.md" -not -path "./.git/*" | wc -l)
SIZE=$(du -sh . 2>/dev/null | cut -f1)
echo "· 收集到 $COUNT 个 Markdown 文件，共 $SIZE"

if [ "$MODE" = "--dry" ]; then
  echo "（dry-run，未提交）"
  git status --short | head -20
  exit 0
fi

git add -A
if git diff --cached --quiet 2>/dev/null; then
  echo "· 没有变化，跳过提交"
else
  STAMP=$(date '+%Y-%m-%d %H:%M')
  git -c commit.gpgsign=false -c core.editor=true commit -q -m "backup: $STAMP（$COUNT 篇）"
  echo "✓ 已提交"
fi

# 备份仓库固定用 main，避免两套分支并存
git branch -q -M main 2>/dev/null || true
git push -q -u origin main 2>&1
echo "✓ 已推送：$REMOTE"
