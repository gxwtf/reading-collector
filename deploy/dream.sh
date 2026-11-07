#!/bin/sh
# dream —— 每天凌晨的自动整理任务
# 采集当天状态 → 派给云端 agent 做一轮收尾（清理/归档/体检/报告）
set -e
cd /home/gxwtf/gxwtf_reading || exit 1
. /home/gxwtf/.config/agent-cloud/env

LOG=/home/gxwtf/dream/dream.log
mkdir -p /home/gxwtf/dream

{
  echo "===== dream $(date '+%Y-%m-%d %H:%M:%S') ====="

  GITLOG=$(git log --since='24 hours ago' --oneline | head -30)
  GITCOUNT=$(git log --since='24 hours ago' --oneline | wc -l)
  SERVICES=$(systemctl is-active gxreading gxreading-worker gxreading-dav gxreadest nginx 2>/dev/null | tr '\n' ' ')
  DISK=$(df -h / | tail -1 | awk '{print $5" used, "$4" free"}')
  BOOKS=$(ls /home/gxwtf/reading-books/*.epub /home/gxwtf/reading-books/*.pdf 2>/dev/null | wc -l)
  DBS=$(PGPASSWORD=wddxgy_2714 psql "$DATABASE_URL" -tAc 'select count(*) from "Book"' 2>/dev/null || echo '?')
  ENTRIES=$(PGPASSWORD=wddxgy_2714 psql "$DATABASE_URL" -tAc 'select count(*) from "Entry"' 2>/dev/null || echo '?')
  NOTES=$(PGPASSWORD=wddxgy_2714 psql "$DATABASE_URL" -tAc 'select count(*) from "BookAnnotation"' 2>/dev/null || echo '?')

  PROMPT=$(cat <<TXT
【dream｜每日凌晨自动整理】今天是 $(date '+%Y-%m-%d')。

## 今天的现场数据
- 最近 24 小时提交数：${GITCOUNT}
${GITLOG}
- 服务状态（gxreading / worker / dav / readest / nginx）：${SERVICES}
- 磁盘：${DISK}
- 书库：磁盘 ${BOOKS} 本 / 数据库 ${DBS} 本；条目 ${ENTRIES} 条；笔记 ${NOTES} 条

## 你要做的事（按顺序，能省则省）
1. 体检：pnpm typecheck 通过即可，不用 build；失败才修
2. 书库一致性：跑 sh worker/sync_library.sh，确认四层计数一致（根目录 / DB / Readest 目录 / library.json 条目），不一致就修
3. 清理：/tmp 下超过 1 天的临时文件删掉；仓库里未跟踪的 .tmp / .bak 清掉（别碰 node_modules、.next）
4. 文档：如果今天有功能变更，更新 docs/HANDOFF.md 的「当前状态」几行，不要长篇
5. 收尾：git add 改动（只加自己碰的文件），commit 'chore(dream): 每日整理 $(date +%F)'，push origin main
6. 最后用一句话总结今天的变化 + 有没有需要老大注意的问题

约束：不要改业务逻辑，不要装依赖，不要动 nginx/sudo 配置。剩下的时间留给判断，不要为了改而改。
TXT
)

  printf '%s' "$PROMPT" > /tmp/dream-prompt.txt
  RESP=$(/usr/bin/python3 - <<'PYEOF'
import json, os, urllib.request

prompt = open("/tmp/dream-prompt.txt", encoding="utf-8").read()
token = os.environ["AGENT_CLOUD_TOKEN"]
body = json.dumps(
    {"prompt": prompt, "project": "gxwtf_reading", "device": "dream-timer"},
    ensure_ascii=False,
).encode()
req = urllib.request.Request(
    "http://127.0.0.1:3006/v1/agent/run",
    data=body,
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print(r.read().decode())
except Exception as e:  # noqa: BLE001
    print("dispatch failed:", e)
PYEOF
)
  echo "派单结果: $RESP"
} >> "$LOG" 2>&1

tail -200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
echo "dream done $(date '+%H:%M:%S')" >> "$LOG"
