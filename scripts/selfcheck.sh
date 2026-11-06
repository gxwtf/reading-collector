#!/bin/sh
# 自检脚本：给 agent 的「度量」环节用。
# 用法：sh scripts/selfcheck.sh [--build]
#   不传 --build 时跳过生产构建（本地没装依赖也能跑前两项）
set -u
cd "$(dirname "$0")/.." || exit 1
FAIL=0
run() {
  printf '\n== %s ==\n' "$1"
  shift
  if "$@"; then
    printf '   ✓ 通过\n'
  else
    printf '   ✗ 失败\n'
    FAIL=$((FAIL + 1))
  fi
}

run "单元测试" pnpm test
run "类型检查" pnpm typecheck

if [ "${1:-}" = "--build" ]; then
  run "生产构建" pnpm build
fi

printf '\n== 代码异味扫描 ==\n'
for pat in "TODO" "FIXME" "console\\.log" "as never"; do
  if command -v rg >/dev/null 2>&1; then
    n=$(rg -c "$pat" src worker --glob '!*.test.ts' 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  else
    n=$(grep -rE "$pat" src worker --exclude='*.test.ts' 2>/dev/null | wc -l | tr -d ' ')
  fi
  printf '   %-14s %s 处\n' "$pat" "${n:-0}"
done

printf '\n== 依赖安全提示 ==\n'
pnpm outdated 2>/dev/null | tail -n +2 | head -10 || true

printf '\n=========================\n'
if [ "$FAIL" -eq 0 ]; then
  echo "自检通过（失败项 0）"
else
  echo "自检失败：$FAIL 项"
fi
exit "$FAIL"
