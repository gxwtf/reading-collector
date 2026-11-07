#!/bin/sh
# 书库一条龙：清洗书名/元数据 → 发布到 Readest 云书库 → 数据库去重
# 上传完成后可由接口立即调用，也由 systemd timer 兜底每 10 分钟跑一次。
set -e
cd /home/gxwtf/gxwtf_reading || exit 1

LOCK=/tmp/gxreading-library-sync.lock
exec 9>"$LOCK"
# 已有任务在跑就直接退出，不排队
flock -n 9 || { echo "sync already running"; exit 0; }

export READEST_BOOKS_DIR=/home/gxwtf/reading-books
PY=/home/gxwtf/venv_reading/bin/python

# 先让站点扫一遍磁盘，把新文件登记进数据库（走开放 API）
PW=$(grep -m1 "^READEST_PASSWORD=" .env | cut -d= -f2-)
TOKEN=$(curl -s -m 20 -X POST http://127.0.0.1:3005/api/v1/auth/login \
  -H "content-type: application/json" \
  -d "{\"username\":\"readest\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get(\"accessToken\",\"\"))" 2>/dev/null)
if [ -n "$TOKEN" ]; then
  curl -s -m 60 -o /dev/null -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3005/api/v1/books || true
fi

$PY worker/enrich_books.py
/usr/bin/python3 worker/publish_readest.py
psql "$DATABASE_URL" -q -f worker/dedupe.sql

echo "library synced at $(date '+%H:%M:%S')"
