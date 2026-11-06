#!/bin/sh
# 站点冒烟检查：健康接口 + 首页 + 关键页
# 用法：sh scripts/smoke.sh [https://reading.gxwtf.cn]
set -u
BASE="${1:-https://reading.gxwtf.cn}"
FAIL=0

check() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$1")
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "302" ]; then
    printf '  ✓ %-42s %s\n' "$1" "$code"
  else
    printf '  ✗ %-42s %s\n' "$1" "$code"
    FAIL=1
  fi
}

echo "冒烟检查 $BASE"
check "$BASE/api/health"
check "$BASE/"
check "$BASE/login"

echo
if [ "$FAIL" = "0" ]; then echo "全部通过"; else echo "有失败项，看上面"; fi
exit "$FAIL"
