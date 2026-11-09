#!/bin/sh
# 书库一条龙（按用户）：扫描 → 清洗元数据 → 发布到 Readest 云书库 → 清孤儿 → 去重
set -e
cd /home/gxwtf/gxwtf_reading || exit 1

LOCK=/tmp/gxreading-library-sync.lock
exec 9>"$LOCK"
flock -n 9 || { echo "sync already running"; exit 0; }

# 统一用站点 .env 的库连接
if [ -f .env ]; then
  ENV_DB=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')
  [ -n "$ENV_DB" ] && export DATABASE_URL="$ENV_DB"
  ENV_PW=$(grep -m1 '^READEST_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
fi

PY=/home/gxwtf/venv_reading/bin/python
BOOKS_ROOT=/home/gxwtf/reading-books

# 1) 先让站点扫一遍磁盘，把新文件登记进数据库
TOKEN=$(curl -s -m 20 -X POST http://127.0.0.1:3005/api/v1/auth/login \
  -H "content-type: application/json" \
  -d "{\"username\":\"readest\",\"password\":\"${ENV_PW}\"}" \
  | /usr/bin/python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)
if [ -n "$TOKEN" ]; then
  curl -s -m 120 -o /dev/null -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3005/api/v1/books || true
fi

# 2) 逐用户处理
for d in "$BOOKS_ROOT"/u*; do
  [ -d "$d" ] || continue
  export READEST_BOOKS_DIR="$d"
  echo "--- $(basename "$d")"
  $PY worker/enrich_books.py
  /usr/bin/python3 worker/publish_readest.py
  /usr/bin/python3 worker/prune_readest.py
done

# 3) 数据库去重
if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -q -f worker/dedupe.sql || true
fi

echo "library synced at $(date '+%H:%M:%S')"
