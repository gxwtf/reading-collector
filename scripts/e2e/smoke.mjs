/**
 * 前端冒烟：用系统 Edge 跑一遍真实页面，替代「人肉点一遍」。
 *
 * 用法：
 *   node scripts/e2e/smoke.mjs
 *   node scripts/e2e/smoke.mjs --base=http://127.0.0.1:3005 --entry=67
 *   node scripts/e2e/smoke.mjs --headful        # 有头，排查用
 *
 * 退出码：0 全过 / 1 有失败 / 2 没有 Edge / 3 服务没起来
 */
import path from "node:path";
import {
  EXIT,
  assertEdgeExists,
  checkHealth,
  loadPlaywright,
  mintSessionCookie,
  newLoggedInPage,
  printResults,
  resolveEdgePath,
  shotDir,
  triedEdgePaths,
} from "./lib.mjs";
import { runChecks } from "./checks.mjs";

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const BASE = arg("base", "http://127.0.0.1:3005");
const ENTRY = Number(arg("entry", "67"));
const HEADFUL = process.argv.includes("--headful");
const REPO_DIR = arg("repo", process.cwd());

async function main() {
  // 1) 前置检查：没 Edge 或服务没起来，直接给出明确原因，不白开浏览器
  if (!assertEdgeExists()) {
    console.error(`✗ Edge 未找到，试过：${triedEdgePaths()}`);
    console.error("  用 EDGE_PATH=<路径> 指定，或确认系统装了 Edge。");
    return EXIT.NO_EDGE;
  }
  const edgeBin = resolveEdgePath();

  const health = await checkHealth(BASE);
  if (!health.ok) {
    console.error(`✗ 健康检查失败（${BASE}/api/health）：${health.detail}`);
    return EXIT.NO_SERVER;
  }
  console.log(`  健康检查 OK  ${health.detail}`);

  const { chromium } = loadPlaywright();
  const cookie = await mintSessionCookie({ repoDir: REPO_DIR });

  const browser = await chromium.launch({
    executablePath: edgeBin,
    headless: !HEADFUL,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const shots = shotDir();
  let results = [];
  let consoleErrors = [];

  try {
    const { context, page, consoleErrors: errs } = await newLoggedInPage(browser, { baseUrl: BASE, cookie });
    consoleErrors = errs;

    console.log(`\n  运行检查（${BASE}，entry=${ENTRY}）\n`);
    results = await runChecks(page, { baseUrl: BASE, entryId: ENTRY });

    // 截图留证：桌面 + 移动
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE}/entry/${ENTRY}`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.screenshot({ path: path.join(shots, "entry-desktop.png"), fullPage: false });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(shots, "entry-mobile.png"), fullPage: false });
    } catch (error) {
      console.log(`  （截图失败：${String(error).slice(0, 80)}）`);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  console.log("");
  const allOk = printResults(results);

  // 前端报错单独列——断言过了但控制台有错，也是隐患
  const realErrors = consoleErrors.filter((e) => !/favicon|manifest/i.test(e));
  if (realErrors.length > 0) {
    console.log(`\n  控制台错误 ${realErrors.length} 条：`);
    for (const e of realErrors.slice(0, 5)) console.log(`    · ${e}`);
  }

  console.log(`\n  截图：${shots}`);
  return allOk && realErrors.length === 0 ? EXIT.OK : EXIT.FAIL;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("运行失败：", error);
    process.exit(EXIT.FAIL);
  });
