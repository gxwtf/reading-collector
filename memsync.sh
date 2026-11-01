#!/bin/sh
# memsync.sh — 把全局记忆同步到所有副本，并推送到 GitHub。
#
# 权威源：/var/minis/memory/GLOBAL.md
# 副本：  /var/minis/shared/COLLAB.md               （兼容旧引用）
#         <repo>/docs/GLOBAL-MEMORY.md              （随仓库走）
#
# 用法：
#   sh memsync.sh              # 同步三份 + 推 GitHub
#   sh memsync.sh --no-push    # 只同步文件，不推送
#   sh memsync.sh --check      # 只检查是否一致
set -u
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SRC=/var/minis/memory/GLOBAL.md
SHARED=/var/minis/shared/COLLAB.md
REPO=${RC_REPO:-/tmp/rc-remote}
DOCS="$REPO/docs/GLOBAL-MEMORY.md"

PUSH=1
CHECK=0
for a in "$@"; do
  case "$a" in
    --no-push) PUSH=0 ;;
    --check)   CHECK=1 ;;
  esac
done

[ -f "$SRC" ] || { echo "✗ 找不到权威源：$SRC" >&2; exit 1; }

# 仓库不在就跑一次浅克隆，避免 /tmp 被清后彻底找不到
if [ ! -d "$REPO/.git" ]; then
  echo "· 仓库不存在，克隆到 $REPO"
  git clone --depth 5 https://github.com/kyoukawa/reading-collector.git "$REPO" >/dev/null 2>&1 \
    || { echo "✗ 克隆失败" >&2; exit 1; }
fi
mkdir -p "$REPO/docs"

if [ "$CHECK" -eq 1 ]; then
  echo "权威源：$(md5sum "$SRC" | cut -d' ' -f1)"
  [ -f "$SHARED" ] && echo "shared：$(md5sum "$SHARED" | cut -d' ' -f1)"
  [ -f "$DOCS" ]   && echo "docs  ：$(md5sum "$DOCS" | cut -d' ' -f1)"
  if [ -f "$SHARED" ] && [ -f "$DOCS" ] && cmp -s "$SRC" "$SHARED" && cmp -s "$SRC" "$DOCS"; then
    echo "✓ 三份一致"
  else
    echo "✗ 有不一致，跑 sh memsync.sh 修复"
    exit 1
  fi
  exit 0
fi

# 1) 同步副本
cp "$SRC" "$SHARED"
cp "$SRC" "$DOCS"
echo "· 已同步 shared + docs"

# 2) 推送
if [ "$PUSH" -eq 1 ]; then
  cd "$REPO" || exit 1
  git pull -q --rebase >/dev/null 2>&1 || true
  if [ -z "$(git status --porcelain docs/GLOBAL-MEMORY.md)" ]; then
    echo "· 仓库里的记忆已是最新，无需提交"
  else
    git add docs/GLOBAL-MEMORY.md
    git -c commit.gpgsign=false \
        -c user.name="kyoukawa" \
        -c user.email="kyoukawa@users.noreply.github.com" \
        commit -q -m "docs: 同步全局记忆" \
      && git push -q origin HEAD 2>/dev/null && echo "✓ 已推送" \
      || echo "⚠ 推送失败（文件已同步，下次再推）"
  fi
fi

md5sum "$SRC" "$SHARED" "$DOCS" | awk '{print "  " $1 "  " $2}'
