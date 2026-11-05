#!/bin/sh
# memsync.sh — 把全局记忆同步到本地副本。
#
# 权威源：/var/minis/memory/GLOBAL.md
# 副本：  /var/minis/shared/COLLAB.md               （兼容旧引用）
#         /var/minis/shared/GLOBAL-MEMORY.md        （异地备份副本）
#
# 说明：记忆不再提交进任何公开仓库（组织仓 gxwtf/reading-collector 与
#       个人镜像仓都已在 HEAD 中移除，历史仍留档）。异地备份由 vaultbackup.sh
#       负责，它会打包 /var/minis/memory 与 /var/minis/shared 到私有仓。
#
# 用法：
#   sh memsync.sh              # 同步副本
#   sh memsync.sh --check      # 只检查是否一致
#   sh memsync.sh --no-push    # 兼容旧调用，现在等价于默认行为
set -u
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SRC=/var/minis/memory/GLOBAL.md
SHARED=/var/minis/shared/COLLAB.md
BACKUP=/var/minis/shared/GLOBAL-MEMORY.md

CHECK=0
for a in "$@"; do
  case "$a" in
    --check)   CHECK=1 ;;
    --no-push) : ;;
  esac
done

[ -f "$SRC" ] || { echo "✗ 找不到权威源：$SRC" >&2; exit 1; }

if [ "$CHECK" -eq 1 ]; then
  echo "权威源：$(md5sum "$SRC" | cut -d' ' -f1)  $SRC"
  [ -f "$SHARED" ] && echo "shared：$(md5sum "$SHARED" | cut -d' ' -f1)  $SHARED"
  [ -f "$BACKUP" ] && echo "备份  ：$(md5sum "$BACKUP" | cut -d' ' -f1)  $BACKUP"
  if [ -f "$SHARED" ] && [ -f "$BACKUP" ] && cmp -s "$SRC" "$SHARED" && cmp -s "$SRC" "$BACKUP"; then
    echo "✓ 副本一致"
  else
    echo "✗ 有不一致，跑 sh memsync.sh 修复"
    exit 1
  fi
  exit 0
fi

mkdir -p /var/minis/shared
cp "$SRC" "$SHARED"
cp "$SRC" "$BACKUP"
echo "· 已同步 shared/COLLAB.md + shared/GLOBAL-MEMORY.md"
md5sum "$SRC" "$SHARED" "$BACKUP" | awk '{print "  " $1 "  " $2}'
