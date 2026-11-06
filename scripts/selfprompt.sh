#!/bin/sh
# 自我提示词生成器：把仓库当前状态压成一段可直接交给 agent 的提示。
# 用法：
#   sh scripts/selfprompt.sh            # 输出提示词
#   sh scripts/selfprompt.sh --run      # 输出并直接跑一次自检（结果写进提示）
set -u
cd "$(dirname "$0")/.." || exit 1

RUN_CHECK=0
[ "${1:-}" = "--run" ] && RUN_CHECK=1

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
LAST=$(git log --oneline -5 2>/dev/null | sed 's/^/    /')

count_odor() {
  rg -c "$1" src worker --glob '!*.test.ts' 2>/dev/null | awk -F: '{s+=$2} END {print s+0}'
}
TODO_N=$(count_odor "TODO")
FIXME_N=$(count_odor "FIXME")
LOG_N=$(count_odor "console\\.log")
NEVER_N=$(count_odor "as never")

BIGGEST=$(wc -l src/**/*.tsx src/**/*.ts 2>/dev/null | sort -rn | sed -n '2p' | awk '{print $2" ("$1" 行)"}')
TEST_N=$(rg -c "^test\\(" src --glob '*.test.ts' 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')

CHECK=""
if [ "$RUN_CHECK" = "1" ]; then
  if pnpm test >/tmp/sp_test.log 2>&1; then T="通过"; else T="失败（看 /tmp/sp_test.log）"; fi
  if pnpm typecheck >/tmp/sp_tc.log 2>&1; then C="通过"; else C="失败（看 /tmp/sp_tc.log）"; fi
  CHECK="- 单元测试：$T
- 类型检查：$C"
else
  CHECK="- （未运行，加 --run 会附上测试与类型检查结果）"
fi

cat <<EOF
# 自我改进任务提示

你在维护 \`reading-collector\`（Next 16 + Prisma + Python worker）。
下面是根据仓库当前状态自动生成的任务提示，请照 [docs/SELF_IMPROVE.md](docs/SELF_IMPROVE.md) 的循环执行。

## 当前状态

- 分支：$BRANCH ｜ 未提交改动：$DIRTY 个文件
- 测试用例数：$TEST_N
$CHECK
- 异味：TODO $TODO_N ｜ FIXME $FIXME_N ｜ console.log $LOG_N ｜ as never $NEVER_N
- 最大文件：${BIGGEST:-无}

最近提交：
$LAST

## 候选任务（按优先级，只挑一个）

1. 若有测试/类型检查失败 → 先修它，别的都不碰。
2. 有未提交改动 → 先把它们收尾（跑验证 → 提交），不要叠加新改动。
3. 异味最高的一类：
   - TODO/FIXME：逐条确认是「待做」还是「已过时」，能删就删、能做就做。
   - console.log：换成结构化错误日志或删除。
   - as never：确认类型来源，补 Prisma 类型或抽 interface。
4. 最大文件超过 400 行 → 按职责拆分（先抽纯展示组件，再抽 hook）。
5. 没有测试的纯函数 → 补 \`node --test\` 用例（参考 src/lib/url.test.ts 的写法）。

## 约束

- 一次只做一件；改动不超过 300 行 diff。
- 必须跑：\`pnpm test\`、\`pnpm typecheck\`、\`pnpm build\`。
- 不碰生产数据；不改探针/鉴权/部署脚本，除非任务就是它。
- 提交用 Conventional Commits + 中文，说明「为什么」。
- 卡住两轮没有进展 → 停下，写清缺什么信息。

## 交付格式

1. 一句话说明这次修了什么、为什么
2. 改动文件清单
3. 验证结果（测试/类型/构建 三行）
4. 若部署了：health 与 smoke 结果
EOF
