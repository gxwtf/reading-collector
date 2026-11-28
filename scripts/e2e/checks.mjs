/**
 * 具体检查项。每个检查接收 page（已带登录态），返回 { name, ok, detail }。
 *
 * 设计取舍：
 * - **只断言可观测的属性**（computed style、URL、DOM 计数），不做像素比对。
 *   视觉回归需要基线图与容差，本项目还没有稳定的视觉基线。
 * - **每项独立 try/catch**：一项炸掉不该让后面的检查全跳过，
 *   否则一次失败会掩盖其它失败，排查时得反复重跑。
 * - detail 里放**实际值**而不是「通过/失败」：断言失败时最想知道的是它读到了什么。
 */

/** 小工具：把任意值变成适合打在一行里的短字符串 */
function show(value, max = 60) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function expect(name, fn) {
  try {
    const detail = await fn();
    // fn 返回字符串即视为通过（字符串就是给用户看的实际值）
    return { name, ok: true, detail: String(detail) };
  } catch (error) {
    return { name, ok: false, detail: error?.message ? String(error.message).slice(0, 160) : String(error) };
  }
}

function must(cond, message) {
  if (!cond) throw new Error(message);
}

export async function runChecks(page, { baseUrl, entryId }) {
  const results = [];

  // ── 1. 登录态可注入：能进 / 且不是被踢回登录页
  results.push(
    await expect("登录态注入", async () => {
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
      const url = page.url();
      must(!/\/login/.test(url), `被重定向到 ${url}`);
      const title = await page.title();
      return `URL ${new URL(url).pathname}，标题「${title}」`;
    }),
  );

  // ── 2. 布局基线：卡片数 > 0，且没有横向溢出
  results.push(
    await expect("首页卡片与溢出", async () => {
      const { cards, overflow } = await page.evaluate(() => ({
        cards: document.querySelectorAll("article").length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      must(cards > 0, `卡片数 ${cards}，列表是空的`);
      must(overflow <= 1, `横向溢出 ${overflow}px`);
      return `${cards} 张卡片，横向溢出 ${overflow}px`;
    }),
  );

  // ── 3. 进入详情页（后续检查都在详情页上做）
  results.push(
    await expect("进入详情页", async () => {
      await page.goto(`${baseUrl}/entry/${entryId}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      const h1 = await page.textContent("h1").catch(() => null);
      must(h1, "详情页没有 h1，可能 404 了");
      return `「${show(h1.trim(), 40)}」`;
    }),
  );

  // ── 4. 正文正确渲染：行高约 1.9（设计说明 §3.3）
  results.push(
    await expect("正文排版", async () => {
      const m = await page.evaluate(() => {
        const el = document.querySelector(".prose-reading");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { fontSize: parseFloat(cs.fontSize), lineHeight: parseFloat(cs.lineHeight) };
      });
      must(m, "找不到 .prose-reading");
      const ratio = m.lineHeight / m.fontSize;
      must(ratio > 1.5 && ratio < 2.3, `行高比 ${ratio.toFixed(2)} 不在 1.5–2.3`);
      return `${m.fontSize}px / ${m.lineHeight}px = ${ratio.toFixed(2)}`;
    }),
  );

  // ── 5. 字号切换生效：点 A+ 后 computed fontSize 变大
  // 放在开面板之前——TypographyPanel 是浮层，会盖住 ReadingShell 的工具条，
  // 面板开着点 A+ 会一直等到超时。
  results.push(
    await expect("字号切换生效", async () => {
      const before = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector(".prose-reading")).fontSize),
      );
      // 「放大字号」有两处（工具条 + 面板里各一个），限定工具条那个
      await page.locator("button[aria-label=放大字号]").first().click({ timeout: 5000 });
      await page.waitForTimeout(300);
      const after = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector(".prose-reading")).fontSize),
      );
      must(after > before, `点 A+ 后字号没变大（${before} → ${after}）`);
      return `${before}px → ${after}px`;
    }),
  );

  // ── 6. 排版面板可打开
  results.push(
    await expect("排版面板可打开", async () => {
      await page.getByRole("button", { name: "排版设置" }).click({ timeout: 5000 });
      const dialog = page.locator("[role=dialog]").first();
      await dialog.waitFor({ state: "visible", timeout: 5000 });
      const count = await page.locator("[role=dialog]").count();
      return `${count} 个 dialog 可见`;
    }),
  );

  // ── 7. 字体切换生效：选「宋体」后 fontFamily 含衬线字体（面板此时是开的）
  results.push(
    await expect("字体切换生效", async () => {
      // 字体按钮是纵向大按钮、里面还有副标题，按「包含文字」找而不是 exact
      const dialog = page.locator("[role=dialog]").first();
      await dialog.getByRole("button", { name: /宋体/ }).first().click({ timeout: 5000 });
      await page.waitForTimeout(300);
      const family = await page.evaluate(
        () => getComputedStyle(document.querySelector(".prose-reading")).fontFamily,
      );
      must(/Songti|SimSun|serif/i.test(family), `字体栈里没有衬线字体：${show(family, 100)}`);
      return show(family, 70);
    }),
  );

  // 关掉面板，免得后面的截图被它盖住
  await page
    .getByRole("button", { name: "排版设置" })
    .click({ timeout: 3000 })
    .catch(() => undefined);

  // ── 8. 搜索高亮生效：CSS.highlights 有区间，且 DOM 未被改写
  results.push(
    await expect("搜索高亮生效", async () => {
      // 从正文里挑一个**连续的汉字/字母串**当搜索词。
      // 不能简单 slice：正文开头常是「@某某\n\n上周末」，切出来会带空白或换行，
      // findSearchMatches 按字面匹配当然找不到——这会让测试误报成功能坏了。
      const q = await page.evaluate(() => {
        const el = document.querySelector(".prose-reading");
        const text = el?.textContent ?? "";
        const runs = text.match(/[一-龥A-Za-z]{4,12}/g);
        return runs && runs.length > 0 ? runs[0] : "";
      });
      must(q, "正文里找不到连续 4–12 字的中文/字母串，挑不出搜索词");

      await page.goto(`${baseUrl}/entry/${entryId}?q=${encodeURIComponent(q)}`, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      // SearchHighlight 在 effect 里注册，给两帧
      await page.waitForTimeout(600);

      const info = await page.evaluate(() => {
        const el = document.querySelector(".prose-reading");
        const html = el ? el.innerHTML : "";
        const ranges = [];
        if (typeof CSS !== "undefined" && CSS.highlights) {
          for (const [, hl] of CSS.highlights) {
            for (const r of hl) ranges.push(r.toString().length);
          }
        }
        return { ranges, htmlLen: html.length, hasMark: /<mark/i.test(html) };
      });
      must(info.ranges.length > 0, `CSS.highlights 里没有区间（hasMark=${info.hasMark}）`);
      must(!info.hasMark, "DOM 里出现了 <mark>，说明改了 DOM 而不是用 Highlight API");
      return `${info.ranges.length} 个区间，DOM 未插入标记`;
    }),
  );

  // ── 9. 深色模式：切换到深色后正文背景不能是近白
  results.push(
    await expect("深色模式无白块", async () => {
      await page.evaluate(() => {
        localStorage.setItem("theme", "dark");
        document.documentElement.classList.add("dark");
      });
      await page.waitForTimeout(200);
      const bg = await page.evaluate(() => {
        const pick = (sel) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).backgroundColor : null;
        };
        return { html: pick("html"), body: pick("body"), prose: pick(".prose-reading") };
      });
      // 判断「近白」：解析 rgb 后看亮度
      const luminance = (rgb) => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb ?? "");
        if (!m) return null;
        return (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
      };
      const bodyLum = luminance(bg.body);
      must(bodyLum !== null, `读不到 body 背景（${show(bg.body)}）`);
      must(bodyLum < 128, `body 背景太亮：${bg.body}（亮度 ${Math.round(bodyLum)}）`);
      await page.evaluate(() => {
        localStorage.removeItem("theme");
        document.documentElement.classList.remove("dark");
      });
      return `body ${bg.body}，亮度 ${Math.round(bodyLum)}`;
    }),
  );

  // ── 10. 移动端 390px 不溢出
  results.push(
    await expect("移动端 390px 不溢出", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(300);
      const { overflow, width } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        width: window.innerWidth,
      }));
      must(overflow <= 1, `横向溢出 ${overflow}px（视口 ${width}px）`);
      await page.setViewportSize({ width: 1280, height: 800 });
      return `视口 ${width}px，溢出 ${overflow}px`;
    }),
  );

  return results;
}
