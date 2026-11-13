#!/bin/bash
# 统一部署器（带 tag / 快照 / 冒烟 / 自动回滚 / append-only 日志）
#
#   scripts/deploy.sh deploy   [--tag v1.2.3]   # 构建 → 快照 → 切换 → 重启 → 冒烟
#   scripts/deploy.sh rollback                  # 回到上一个成功版本
#   scripts/deploy.sh smoke                     # 只跑基线
#   scripts/deploy.sh log                       # 最近 20 条部署记录
#
# 环境变量：APP_DIR / SERVICE / APP_URL / PROJECT 可在调用时覆盖。
set -euo pipefail

PROJECT="${PROJECT:-reading}"
MODE="${MODE:-next}"
SMOKE_EXPECT="${SMOKE_EXPECT:-200}"   # next：构建+快照+可回滚；restart：只重启+冒烟
APP_DIR="${APP_DIR:-/home/gxwtf/gxwtf_reading}"
SERVICE="${SERVICE:-gxreading}"
APP_URL="${APP_URL:-https://reading.gxwtf.cn}"
RESOLVE_IP="${RESOLVE_IP:-39.105.54.184}"
ROOT="${RELEASES_ROOT:-$HOME/releases}/$PROJECT"
LOG="${DEPLOY_LOG:-$HOME/deploy-log.jsonl}"
KEEP=5
BUILD_DIR="$HOME/.build-$PROJECT"

C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_OFF=$'\033[0m'
say() { printf '%s\n' "$*"; }
ok() { printf '%s✓%s %s\n' "$C_GRN" "$C_OFF" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YEL" "$C_OFF" "$*"; }
die() { printf '%s✗%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 日志
log_event() { # kind status key=value...
  python3 - "$LOG" "$PROJECT" "$@" <<'PY'
import json, sys, datetime, os
log, project, kind, status = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
extra_obj = {}
for kv in sys.argv[5:]:
    k, _, v = kv.partition("=")
    extra_obj[k] = v
rec = {
    "ts": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
    "project": project,
    "kind": kind,
    "status": status,
    "operator": os.environ.get("SUDO_USER") or os.environ.get("USER") or "unknown",
    **extra_obj,
}
with open(log, "a", encoding="utf-8") as f:
    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
PY
}

# ---------------------------------------------------------------- 冒烟基线
smoke() {
  local base="$APP_URL"
  local CURL_OPTS=()
  case "$base" in
    *://127.0.0.1*|*://localhost*) CURL_OPTS=() ;;
    *) CURL_OPTS=(--resolve "$(echo "$base" | sed -E 's#https?://##; s#/.*##'):443:$RESOLVE_IP") ;;
  esac
  local fails=0
  check() { # name expected path [grep]
    local name="$1" want="$2" path="$3" needle="${4:-}"
    local code body
    body=$(curl -sSL --max-time 25 "${CURL_OPTS[@]}" -w '\n%{http_code}' "$base$path" 2>/dev/null || true)
    code=$(printf '%s' "$body" | tail -n1)
    if [ "$code" != "$want" ]; then
      printf '  %s✗%s %-34s %s（期望 %s）\n' "$C_RED" "$C_OFF" "$name" "$code" "$want"
      fails=$((fails+1)); return
    fi
    if [ -n "$needle" ] && ! printf '%s' "$body" | head -n -1 | grep -q "$needle"; then
      printf '  %s✗%s %-34s 缺少关键字 %s\n' "$C_RED" "$C_OFF" "$name" "$needle"
      fails=$((fails+1)); return
    fi
    printf '  %s✓%s %-34s %s\n' "$C_GRN" "$C_OFF" "$name" "$code"
  }

  say "— 冒烟基线 —"
  if [ "$PROJECT" != "reading" ]; then
    check "首页" "$SMOKE_EXPECT" "/"
    say "— 冒烟完成：$fails 项失败 —"
    return "$fails"
  fi
  check "健康检查"          200 "/api/health"
  check "登录页"            200 "/login" "登录"
  check "书库页（未登录跳转）" "200" "/books"
  check "未登录访问分享页"    "404" "/s/__nope__"

  # 静态资源抽样：从 HTML 里取一个 chunk
  local chunk
  chunk=$(curl -sSL --max-time 25 "${CURL_OPTS[@]}" "$base/login" 2>/dev/null \
    | grep -oE '/_next/static/chunks/[^"]+\.js' | head -1 || true)
  if [ -n "$chunk" ]; then
    check "静态分片 ${chunk##*/}" 200 "$chunk"
  else
    warn "未能从首页取到 chunk，跳过静态分片检查"
  fi

  say "— 冒烟完成：$fails 项失败 —"
  return "$fails"
}

# ---------------------------------------------------------------- 部署
cmd_deploy() {
  local tag=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --tag) tag="${2:-}"; shift 2 ;;
      *) die "未知参数 $1" ;;
    esac
  done

  cd "$APP_DIR"
  local sha ts name dir
  sha="$(git rev-parse --short HEAD)"
  ts="$(date +%Y%m%d-%H%M%S)"
  name="${tag:-$ts-$sha}"
  dir="$ROOT/$name"
  mkdir -p "$dir"

  say "部署 $PROJECT @ $sha（版本 $name，模式 $MODE）"

  if [ "$MODE" != "next" ]; then
    say "— 重启（restart 模式，无构建）—"
    sudo -n systemctl restart "$SERVICE" || die "重启失败"
    sleep 4
    if smoke; then
      ok "重启完成：$PROJECT"
      log_event deploy succeeded version="$name" sha="$sha" mode="$MODE"
      return 0
    fi
    log_event deploy failed version="$name" sha="$sha" mode="$MODE" stage=smoke
    die "重启后冒烟失败，请人工介入"
  fi

  # 1) 构建（临时副本，避免清空线上 .next）
  say "— 构建 —"
  rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$APP_DIR/" "$BUILD_DIR/"
  # 上一轮构建的 .next 必须清掉：它在 rsync 的 exclude 里，--delete 删不到它，
  # 而 Next 16 的 server/route-cache 是持久化缓存，跨构建不会自动清。
  # 不清理会把旧构建渲染出来的 HTML 一起带进 release，见 2026-11-13 gxwriting 事故：
  # 线上 /books/all 一直命中 11-05 的缓存页面，里面的 Server Action id 在新构建里不存在，
  # 表现为「页面看起来像没登录 + 控制台 409 Failed to find Server Action」。
  rm -rf "$BUILD_DIR/.next"
  # 依赖用硬链接复制：TurboPack 不接受指向构建目录之外的 node_modules 符号链接
  rm -rf "$BUILD_DIR/node_modules"
  if [ -d "$APP_DIR/node_modules" ]; then
    cp -al "$APP_DIR/node_modules" "$BUILD_DIR/node_modules" 2>/dev/null || cp -a "$APP_DIR/node_modules" "$BUILD_DIR/node_modules"
  fi
  ( cd "$BUILD_DIR" && pnpm build >/tmp/build-$PROJECT.log 2>&1 ) || { tail -30 /tmp/build-$PROJECT.log; log_event deploy failed version="$name" sha="$sha" stage=build; die "构建失败"; }
  ok "构建完成"

  # 2) 快照：新构建 + 旧构建 + 数据库
  rsync -a --delete "$BUILD_DIR/.next/" "$dir/next/"
  local prev=""
  [ -L "$ROOT/current" ] && prev="$(readlink -f "$ROOT/current")"
  if [ -n "$prev" ] && [ -d "$prev/next" ]; then
    ok "可回滚版本：$(basename "$prev")"
  else
    warn "没有上一版，本次不可回滚"
  fi

  local db="${DATABASE_URL:-}"
  if [ -z "$db" ] && [ -f "$APP_DIR/.env" ]; then
    db="$(grep -m1 '^DATABASE_URL=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"' || true)"
  fi
  if [ -n "$db" ]; then
    pg_dump "$db" -Fc -f "$dir/db.dump" 2>/dev/null && ok "数据库快照 $(du -h "$dir/db.dump" | cut -f1)" || warn "数据库快照失败"
  fi

  # 3) 切换
  say "— 切换 —"
  rsync -a "$dir/next/" "$APP_DIR/.next/"
  # 清掉线上残留的持久化路由缓存：final rsync 没有 --delete（保留旧 chunk 给老标签页），
  # 旧的 server/route-cache 会留下来并且优先级高于新构建的静态产物，
  # 造成「新构建 + 旧页面缓存」，Server Action id 对不上 → 409。
  rm -rf "$APP_DIR/.next/server/route-cache"
  systemctl --user is-active >/dev/null 2>&1 || true
  sudo -n systemctl restart "$SERVICE" || die "重启 $SERVICE 失败"
  sleep 6

  # 4) 冒烟
  if smoke; then
    ln -sfn "$dir" "$ROOT/current"
    ok "部署成功：$name"
    log_event deploy succeeded version="$name" sha="$sha" tag="$tag" rollback_from="$(basename "${prev:-none}")"
    cleanup_old
    return 0
  fi

  warn "冒烟失败，准备回滚"
  log_event deploy failed version="$name" sha="$sha" stage=smoke
  cmd_rollback --from-failure "$name"
}

# ---------------------------------------------------------------- 回滚
cmd_rollback() {
  if [ "$MODE" != "next" ]; then
    die "$PROJECT 是 restart 模式，没有构建快照；回滚请用 git 切回上一个 commit 后重启"
  fi
  local from_failure=""
  [ "${1:-}" = "--from-failure" ] && from_failure="${2:-}"

  local cur target
  cur="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  target=""
  for d in $(ls -1dt "$ROOT"/*/ 2>/dev/null | sed 's#/$##'); do
    [ -L "$d" ] && continue
    [ -d "$d/next" ] || continue
    [ "$(readlink -f "$d")" = "$cur" ] && continue
    [ -n "$from_failure" ] && [ "$(basename "$d")" = "$from_failure" ] && continue
    target="$d"; break
  done

  if [ -z "$target" ] || [ ! -d "$target/next" ]; then
    die "没有可回滚的版本"
  fi

  say "回滚到：$(basename "$target")"
  rsync -a --delete "$target/next/" "$APP_DIR/.next/"
  rm -rf "$APP_DIR/.next/server/route-cache"
  sudo -n systemctl restart "$SERVICE" || die "重启失败"
  sleep 6

  if smoke; then
    ln -sfn "$target" "$ROOT/current"
    ok "回滚完成"
    log_event rollback succeeded to="$(basename "$target")" failed_version="$from_failure"
  else
    die "回滚后冒烟仍失败，需要人工介入"
  fi
}

cleanup_old() {
  local dirs
  dirs=$(ls -1dt "$ROOT"/*/ 2>/dev/null | sed 's#/$##' || true)
  local n=0
  while read -r d; do
    [ -z "$d" ] && continue
    n=$((n+1))
    if [ "$n" -gt "$KEEP" ] && [ "$d" != "$(readlink -f "$ROOT/current")" ]; then
      rm -rf "$d"
    fi
  done <<< "$dirs"
}

cmd_build_only() {
  say "只构建（不改线上）"
  local sha; sha=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
  BUILD_DIR="$HOME/.build-$PROJECT"
  rm -rf "$BUILD_DIR"; mkdir -p "$BUILD_DIR"
  rsync -a --delete --exclude node_modules --exclude .next --exclude .git "$APP_DIR/" "$BUILD_DIR/"
  rm -rf "$BUILD_DIR/.next"   # 持久化 route-cache 跨构建残留，见 cmd_deploy 注释
  rm -rf "$BUILD_DIR/node_modules"
  [ -d "$APP_DIR/node_modules" ] && { cp -al "$APP_DIR/node_modules" "$BUILD_DIR/node_modules" 2>/dev/null || cp -a "$APP_DIR/node_modules" "$BUILD_DIR/node_modules"; }
  if ( cd "$BUILD_DIR" && pnpm build >/tmp/build-$PROJECT.log 2>&1 ); then
    ok "构建通过（产物在 $BUILD_DIR/.next，未影响线上）"
  else
    tail -30 /tmp/build-$PROJECT.log; die "构建失败"
  fi
}

cmd_log() {
  [ -f "$LOG" ] || die "还没有部署记录"
  python3 - "$LOG" <<'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
for r in rows[-20:]:
    print(f"{r['ts']}  {r['project']:<10} {r['kind']}/{r['status']:<9} {r.get('version','')}")
PY
}

case "${1:-}" in
  deploy) shift; cmd_deploy "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  smoke) smoke ;;
  build_only|build-only) cmd_build_only ;;
  log) cmd_log ;;
  *) die "用法: deploy.sh {deploy [--tag x] | rollback | smoke | build_only | log}" ;;
esac
