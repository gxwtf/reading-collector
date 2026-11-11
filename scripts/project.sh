#!/bin/bash
# 统一的广学项目入口：按 deploy/projects.conf 找到目录/服务/URL，再调用 scripts/deploy.sh
#
#   scripts/project.sh list                  # 列出全部项目
#   scripts/project.sh smoke <name|all>      # 跑冒烟
#   scripts/project.sh deploy <name> [--tag] # 部署（next 项目构建；restart 项目只重启）
#   scripts/project.sh rollback <name>       # 回滚（仅 next 项目有效）
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
CONF="${PROJECTS_CONF:-$HERE/../deploy/projects.conf}"
DEPLOY="$HERE/deploy.sh"

C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_OFF=$'\033[0m'

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

load() { awk -F'\t' -v n="$1" '!/^#/ && $1==n {print}' "$CONF"; }

cmd_list() {
  printf '%-14s %-10s %-38s %s\n' 项目 模式 站点 状态
  while IFS=$'\t' read -r name dir svc url mode expect; do
    [ -z "$name" ] && continue
    case "$name" in \#*) continue ;; esac
    st=$(systemctl is-active "$svc" 2>/dev/null || true)
    printf '%-14s %-10s %-38s %s\n' "$name" "$mode" "$url" "$st"
  done < "$CONF"
}

cmd_smoke_one() {
  local name="$1" row dir svc url mode expect
  row="$(load "$name")" || true
  [ -z "$row" ] && { printf '%s\n' "未知项目：$name" >&2; return 2; }
  IFS=$'\t' read -r _ dir svc url mode expect <<< "$row"
  expect="${expect:-200|301|302|303|307|308}"

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$url" 2>/dev/null || echo 000)
  if printf '%s' "$code" | grep -qE "^($expect)$"; then
    printf '  %s✓%s %-14s %-38s %s\n' "$C_GRN" "$C_OFF" "$name" "$url" "$code"; return 0
  fi
  printf '  %s✗%s %-14s %-38s %s\n' "$C_RED" "$C_OFF" "$name" "$url" "$code"; return 1
}

cmd_smoke() {
  local target="${1:-all}"
  if [ "$target" != "all" ]; then cmd_smoke_one "$target"; return; fi
  printf '%s— 全站冒烟 —%s\n' "$C_YEL" "$C_OFF"
  local fails=0 n=0
  while IFS=$'\t' read -r name dir svc url mode expect; do
    [ -z "$name" ] && continue
    case "$name" in \#*) continue ;; esac
    n=$((n+1))
    cmd_smoke_one "$name" || fails=$((fails+1))
  done < "$CONF"
  printf '%s— %d 个站点，%d 个失败 —%s\n' "$C_YEL" "$n" "$fails" "$C_OFF"
  return "$fails"
}

cmd_with_conf() {
  local name="$1"; shift
  local row
  row="$(load "$name")" || true
  [ -z "$row" ] && { printf '%s\n' "未知项目：$name" >&2; exit 2; }
  local dir svc url mode
  IFS=$'\t' read -r _ dir svc url mode <<< "$row"
  local e
  e="$(printf '%s' "$row" | cut -f6)"
  PROJECT="$name" APP_DIR="$dir" SERVICE="$svc" APP_URL="$url" MODE="$mode" \
    SMOKE_EXPECT="${e:-200}" RELEASES_ROOT="$HOME/releases" \
    bash "$DEPLOY" "$@"
}

case "${1:-}" in
  list) cmd_list ;;
  smoke) shift; cmd_smoke "${1:-all}" ;;
  deploy) shift; cmd_with_conf "${1:?项目名}" deploy "${@:2}" ;;
  rollback) shift; cmd_with_conf "${1:?项目名}" rollback ;;
  *) usage ;;
esac
