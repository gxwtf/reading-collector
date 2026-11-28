/**
 * e2e 基础设施：启动浏览器、注入登录态、收集结果。
 *
 * 为什么用 playwright-core 而不是 playwright：
 *   playwright 的 install 会下载一整套浏览器（~300MB）。服务器上已经有
 *   Edge 158（/usr/bin/microsoft-edge 是真二进制，不是 snap 壳），
 *   直接驱动它即可，省下载也省磁盘。
 *
 * 为什么工具装在 ~/e2e-tools 而不是项目里：
 *   这是运维验证工具，不是运行时依赖。放进 package.json 会让生产构建
 *   多背一个包，也会让 `pnpm install` 变慢。
 *
 * 用法：
 *   node scripts/e2e/smoke.mjs                 # 打 http://127.0.0.1:3005
 *   node scripts/e2e/smoke.mjs --base=<url>    # 指定地址
 *   node scripts/e2e/smoke.mjs --headful       # 有头模式，排查用
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(import.meta.url);

/** playwright-core 装在 ~/e2e-tools，不在项目 node_modules 里 */
const E2E_TOOLS = process.env.E2E_TOOLS || path.join(os.homedir(), "e2e-tools");

/**
 * 浏览器路径。服务器是 Linux 用系统 Edge，本机 Windows 也有 Edge。
 *
 * 注意顺序：显式给了 EDGE_PATH 就**只用它**，找不到就报错，不回退。
 * 静默回退会让人以为「测的是我指定的那个浏览器」，实际测的是另一个——
 * 之前验「没有 Edge 时的退出码」就因为回退而误判成正常跑完。
 */
const EDGE_CANDIDATES = process.env.EDGE_PATH
  ? [process.env.EDGE_PATH]
  : [
      "/usr/bin/microsoft-edge",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];

export const EDGE_PATH = EDGE_CANDIDATES[0];

/** 退出码约定，见任务书 */
export const EXIT = { OK: 0, FAIL: 1, NO_EDGE: 2, NO_SERVER: 3 };

/** 从 ~/e2e-tools 加载 playwright-core */
export function loadPlaywright() {
  try {
    return require(path.join(E2E_TOOLS, "node_modules", "playwright-core"));
  } catch (error) {
    throw new Error(
      `加载 playwright-core 失败（找的是 ${E2E_TOOLS}/node_modules）。` +
        `先执行：mkdir -p ${E2E_TOOLS} && cd ${E2E_TOOLS} && npm init -y && npm i playwright-core`,
    );
  }
}

export function resolveEdgePath() {
  return EDGE_CANDIDATES.find((p) => existsSync(p)) ?? null;
}

/** 给失败文案用：告诉用户到底试了哪些路径 */
export function triedEdgePaths() {
  return EDGE_CANDIDATES.join("、");
}

export function assertEdgeExists() {
  const bin = resolveEdgePath();
  if (!bin) return false;
  try {
    execFileSync(bin, ["--version"], { timeout: 10000, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * 铸一个登录会话 cookie。
 *
 * 复用站点的 iron-session 密钥，在项目目录里跑（/tmp 下解析不到 node_modules）。
 * 这是本机自测专用：不经过 SSO，直接构造一个合法会话。
 */
export async function mintSessionCookie({ repoDir, userId = 2691 }) {
  const script = `
import { sealData } from "iron-session";
import fs from "node:fs";
const env = fs.readFileSync(".env", "utf8");
const pw = /^SECRET_COOKIE_PASSWORD=(.*)$/m.exec(env)[1].replace(/^"|"$/g, "");
console.log(await sealData({
  isLoggedIn: true, userId: ${userId}, userName: "e2e", admin: 0,
  email: "", realName: "", grade: 12, counter: 0, version: "senior",
}, { password: pw, ttl: 1800 }));
`;
  const tmp = path.join(repoDir, ".e2e-mint.mjs");
  writeFileSync(tmp, script, "utf8");
  try {
    const out = execFileSync("node", [tmp], { cwd: repoDir, timeout: 30000, encoding: "utf8" });
    return out.trim();
  } finally {
    // 用 rmSync 而不是 rm 命令：Windows 上 `rm` 不一定存在（PowerShell 里是别名）
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* 清理失败无关紧要 */
    }
  }
}

/** 健康检查：服务没起来就别浪费时间开浏览器 */
export async function checkHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: body?.ok === true && body?.db === "up", detail: JSON.stringify(body) };
  } catch (error) {
    return { ok: false, detail: String(error).slice(0, 120) };
  }
}

/** 截图目录：按日期分，便于事后复核 */
export function shotDir() {
  const dir = path.join(os.homedir(), "e2e-shots", new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 打开一个已登录的页面。
 *
 * cookie 的 domain 用 127.0.0.1（baseUrl 是 127.0.0.1 时）——iron-session 是
 * host-only cookie，domain 填错浏览器不会带上。
 */
export async function newLoggedInPage(browser, { baseUrl, cookie }) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "zh-CN",
  });
  const { hostname } = new URL(baseUrl);
  await context.addCookies([
    {
      name: "gxreading_session",
      value: cookie,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  // 页面里的 console.error 收集起来，最后一起报——前端报错往往就是断言失败的原因
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));
  return { context, page, consoleErrors };
}

/** 结果表格输出 */
export function printResults(results) {
  const pad = Math.max(...results.map((r) => [...r.name].length), 10);
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗";
    const name = r.name.padEnd(pad, " ");
    console.log(`  ${mark} ${name}  ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n  ${results.length - failed} 通过 / ${failed} 失败`);
  return failed === 0;
}
