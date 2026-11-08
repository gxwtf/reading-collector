#!/bin/sh
# 零停机构建：在临时副本里 build，再把 .next 整体换进去。
# 直接在仓库里 pnpm build 会先清空 .next，正在跑的服务会白屏 —— 这是 2026-11-08 那次「网站崩了」的原因。
set -e
exec 9>/tmp/gxreading-build.lock
flock -n 9 || { echo '另一个构建正在进行，退出'; exit 0; }
SRC=/home/gxwtf/gxwtf_reading
TMP=/home/gxwtf/.build-reading
rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$SRC/" "$TMP/"
ln -sfn "$SRC/node_modules" "$TMP/node_modules"
cd "$TMP"
pnpm build
cd "$SRC"
# 不删旧分片：打开的标签页还引用着旧 hash 的 chunk，删掉就会 500
rsync -a "$TMP/.next/" "$SRC/.next/"
# 顺手清掉 7 天前的旧分片，避免无限膨胀
find "$SRC/.next/static" -type f -mtime +7 -delete 2>/dev/null || true
rm -rf "$TMP"
echo "build done，执行 systemctl restart gxreading 生效（需端上 sudo）"
