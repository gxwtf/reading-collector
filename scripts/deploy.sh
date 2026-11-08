#!/bin/sh
# 零停机构建：在临时副本里 build，再把 .next 整体换进去。
# 直接在仓库里 pnpm build 会先清空 .next，正在跑的服务会白屏 —— 这是 2026-11-08 那次「网站崩了」的原因。
set -e
SRC=/home/gxwtf/gxwtf_reading
TMP=/home/gxwtf/.build-reading
rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$SRC/" "$TMP/"
ln -sfn "$SRC/node_modules" "$TMP/node_modules"
cd "$TMP"
pnpm build
cd "$SRC"
rsync -a --delete "$TMP/.next/" "$SRC/.next/"
rm -rf "$TMP"
echo "build done，执行 systemctl restart gxreading 生效（需端上 sudo）"
