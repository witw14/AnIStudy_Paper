import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

test.use({ timezoneId: "Asia/Shanghai" });
const displayDefaults = { showChatTime: true, showChatTokens: true };
test.beforeEach(async ({ request }) => {
  await request.patch("/api/preferences", { data: displayDefaults });
});
test.afterEach(async ({ request }) => {
  await request.patch("/api/preferences", { data: displayDefaults });
});

async function fixture(
  page: Page,
  request: APIRequestContext,
  context: BrowserContext,
) {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  const w = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  w.messages = [
    {
      id: "user",
      role: "user",
      mode: "research",
      content: "解释注意力机制。",
      time: "2026-10-06T03:04:05Z",
    },
    {
      id: "answer",
      role: "assistant",
      mode: "research",
      content: "**注意力机制**按相关程度组合信息。",
      time: "2026-10-06T03:04:12Z",
      tokenUsage: {
        inputTokens: 123,
        outputTokens: 456,
        totalTokens: 579,
        reasoningTokens: 78,
      },
    },
    {
      id: "legacy",
      role: "assistant",
      mode: "research",
      content: "历史回答",
      time: "2026-10-05T01:00:00Z",
    },
    {
      id: "unknown",
      role: "assistant",
      mode: "research",
      content: "服务商未返回用量",
      time: "2026-10-06T03:05:00Z",
      tokenUsage: null,
    },
    {
      id: "zero",
      role: "assistant",
      mode: "research",
      content: "零 token 记录",
      time: "2026-10-06T03:06:00Z",
      tokenUsage: { outputTokens: 0 },
    },
  ];
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    w.id,
  );
  await page.route(`**/api/workspaces/${w.id}`, (route) =>
    route.fulfill({ json: w }),
  );
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const settings = await (await request.get("/api/settings")).json();
    await route.fulfill({ json: { ...settings, hasKey: true } });
  });
  return w;
}

test("chat times and actual output tokens remain compact, toggle independently, and survive save/reload/import", async ({
  page,
  request,
  context,
}) => {
  await fixture(page, request, context);
  await page.goto("/");
  const messages = page.locator(".chat-messages");
  const output = messages.locator(".chat-token-usage");
  await expect(messages.locator("time").first()).toHaveText(
    "2026-10-06 11:04:05",
  );
  await expect(output.first()).toHaveText("输出 456 token");
  await expect(output.first()).toHaveAttribute(
    "title",
    /输入 123 token.*总计 579 token.*推理 78 token/,
  );
  await expect(output.nth(1)).toHaveText("输出 token：未记录");
  await expect(output.nth(2)).toHaveText("输出 token：接口未返回");
  await expect(output.nth(3)).toHaveText("输出 0 token");
  const separator = page.getByRole("separator", { name: "调整对话面板宽度" });
  await separator.focus();
  for (let i = 0; i < 3; i++) await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "280");
  expect(
    await messages.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/chat-time-token-desktop.png" });
  const open = () =>
    page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const save = async () => {
    await dialog
      .getByRole("button", { name: "保存偏好选项", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
  };
  await open();
  await dialog.getByLabel("显示对话时间", { exact: true }).uncheck();
  await expect(messages.locator("time")).toHaveCount(5); // Draft settings do not apply until saved.
  await save();
  await expect(messages.locator("time")).toHaveCount(0);
  await expect(output).toHaveCount(4);
  await page.reload();
  await expect(messages.locator("time")).toHaveCount(0);
  const file = await (await request.get("/api/preferences/export")).json();
  expect(file.settings.showChatTime).toBe(false);
  expect(file.settings.showChatTokens).toBe(true);
  await open();
  await dialog.getByLabel("显示对话时间", { exact: true }).check();
  await dialog.getByLabel("显示输出 token 数", { exact: true }).uncheck();
  await save();
  await expect(messages.locator("time")).toHaveCount(5);
  await expect(output).toHaveCount(0);
  await open();
  await dialog.getByLabel("导入个人配置文件", { exact: true }).setInputFiles({
    name: "display.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("个人配置已导入");
  await expect(
    dialog.getByLabel("显示对话时间", { exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByLabel("显示输出 token 数", { exact: true }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await expect(messages.locator("time")).toHaveCount(0);
  await expect(output).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await messages.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/chat-time-token-mobile.png" });
});

test("server-reported chat phases update in the loading box; polling ends on success and failure", async ({
  page,
  request,
  context,
}) => {
  const w = await fixture(page, request, context);
  w.messages = [];
  let release: () => void = () => {};
  let oid = "";
  let calls = 0;
  let pollCount = 0;
  let current = {
    phase: "model",
    label: "正在调用大模型…",
    detail: "理解当前论文",
  };
  await page.route(`**/api/workspaces/${w.id}/chat`, async (route) => {
    calls++;
    oid = route.request().headers()["x-anistudy-operation"];
    expect(oid).toMatch(/^[0-9a-f-]{36}$/);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    if (calls === 1) {
      w.messages.push(
        {
          id: "sent",
          role: "user",
          mode: "research",
          content: "test",
          time: new Date().toISOString(),
        },
        {
          id: "reply",
          role: "assistant",
          mode: "research",
          content: "测试回答",
          time: new Date().toISOString(),
          tokenUsage: { outputTokens: 8 },
        },
      );
      await route.fulfill({ json: w });
    } else
      await route.fulfill({
        status: 502,
        json: { error: "模型请求失败（502）" },
      });
  });
  await page.route(`**/api/workspaces/${w.id}/operations/*`, (route) => {
    pollCount++;
    expect(route.request().url().endsWith(oid)).toBe(true);
    return route.fulfill({
      json: {
        id: oid,
        workspaceId: w.id,
        status: "running",
        current,
        steps: [],
      },
    });
  });
  await page.goto("/");
  const input = page.getByLabel("向研究助手提问", { exact: true });
  const box = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(
    page.getByRole("heading", { name: "正在生长的知识地图", exact: true }),
  ).toBeVisible();
  await input.fill("test");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(box).toContainText("正在调用大模型…");
  await expect(page.locator(".message.user")).toContainText("test");
  await expect(input).toHaveValue("");
  await input.fill("下一轮草稿");
  await expect(page.locator(".thinking")).toContainText("正在调用大模型…");
  await page.screenshot({ path: "test-results/chat-model-progress.png" });
  current = {
    phase: "saving",
    label: "正在保存对话…",
    detail: "记录回复时间与 token 用量",
  };
  await expect(box).toContainText("正在保存对话…");
  release();
  await expect(box).toHaveCount(0);
  await expect(page.locator(".chat-token-usage")).toHaveText("输出 8 token");
  await expect(page.locator(".message.user")).toHaveCount(1);
  await expect(input).toHaveValue("下一轮草稿");
  const firstCount = pollCount;
  await page.waitForTimeout(1000);
  expect(pollCount).toBe(firstCount);
  current = { phase: "model", label: "正在调用大模型…", detail: "第二轮" };
  await input.fill("second");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(box).toContainText("第二轮");
  release();
  await expect(box).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("模型请求失败（502）");
  await expect(page.locator(".message.user").last()).toContainText("second");
  await expect(page.locator(".chat-delivery-error")).toHaveCount(1);
  const finalCount = pollCount;
  await page.waitForTimeout(1000);
  expect(pollCount).toBe(finalCount);
});

test("route verification displays real paper counters and stops after returning the workspace", async ({
  page,
  request,
  context,
}) => {
  const w = await fixture(page, request, context);
  let release: () => void = () => {};
  let oid = "";
  const current = {
    phase: "verification",
    label: "正在验证论文真实性…",
    detail: "Attention Is All You Need",
    current: 2,
    total: 3,
  };
  await page.route(
    `**/api/workspaces/${w.id}/routes/generate`,
    async (route) => {
      oid = route.request().headers()["x-anistudy-operation"];
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ json: w });
    },
  );
  await page.route(`**/api/workspaces/${w.id}/operations/*`, (route) =>
    route.fulfill({
      json: {
        id: oid,
        workspaceId: w.id,
        status: "running",
        current,
        steps: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "学习路线", exact: true }).click();
  await page.getByLabel("研究方向", { exact: true }).fill("理解注意力机制");
  await page.getByRole("button", { name: "生成路线", exact: true }).click();
  const box = page.getByRole("status", { name: "操作进度", exact: true });
  await expect(box).toContainText("正在验证论文真实性…（2/3）");
  await expect(box).toContainText("Attention Is All You Need");
  await page.screenshot({
    path: "test-results/route-verification-progress.png",
  });
  release();
  await expect(box).toHaveCount(0);
});
