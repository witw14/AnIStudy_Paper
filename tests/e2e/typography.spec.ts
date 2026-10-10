import { test, expect, type Locator } from "@playwright/test";

async function expectReadableChinese(locator: Locator) {
  const glyphs = await locator.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const boxes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const fontSize = parseFloat(
        getComputedStyle(node.parentElement!).fontSize,
      );
      for (let i = 0; i < (node.textContent || "").length; i++) {
        if (!/[\u3400-\u9fff]/.test(node.textContent![i])) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const box = range.getBoundingClientRect();
        boxes.push({ width: box.width, height: box.height, fontSize });
      }
    }
    return boxes;
  });
  expect(glyphs.length).toBeGreaterThan(0);
  for (const glyph of glyphs) {
    expect(glyph.width).toBeGreaterThanOrEqual(glyph.fontSize * 0.85);
    expect(glyph.height).toBeGreaterThanOrEqual(glyph.fontSize * 0.85);
  }
}

test("Chinese headings and medium-weight labels retain glyph widths without remote fonts, including narrow and zoomed layouts", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.setViewportSize({ width: 1920, height: 850 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("每一步探索");
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(async () => {
    const result = [];
    for (const weight of [400, 500, 600, 700]) {
      const faces = await document.fonts.load(
        `${weight} 20px "Noto Sans SC"`,
        "中文标题知识技术图谱",
      );
      result.push({ weight, loaded: faces.length });
    }
    return result;
  });
  for (const font of fonts) expect(font.loaded).toBeGreaterThan(0);
  // FontFace checks alone can pass while fallback glyphs are drawn. Ask Chromium
  // which fonts actually supplied the Chinese heading glyphs as well.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "h1",
  });
  const actual = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(actual.fonts.length).toBeGreaterThan(0);
  for (const font of actual.fonts) {
    expect(font.isCustomFont).toBe(true);
    expect(font.familyName).toContain("Noto Sans SC");
  }
  await cdp.detach();
  await expect(page.locator("text.node-symbol")).toHaveCount(0);
  for (const selector of [
    "h1",
    "nav button.active",
    ".section-title h2",
    ".chat-heading strong",
    ".chat-welcome h3",
    ".context-card strong",
  ])
    await expectReadableChinese(page.locator(selector).first());
  expect(requests).toEqual([]);
  await expect(page.locator("h1")).toHaveCSS("letter-spacing", "normal");
  await page.screenshot({
    path: "test-results/chinese-typography-desktop.png",
  });
  await page.evaluate(() => {
    document.body.style.zoom = "1.25";
  });
  await expectReadableChinese(page.locator("h1"));
  await expectReadableChinese(page.locator(".chat-heading strong"));
  await page.evaluate(() => {
    document.body.style.zoom = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("h1")).toContainText("每一步探索");
  await page.evaluate(() => document.fonts.ready);
  await expectReadableChinese(page.locator("h1"));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/chinese-typography-mobile.png" });
});
