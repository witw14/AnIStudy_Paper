import { test, expect } from "@playwright/test";

test("chat heading stays in one row and the composer expands only while editing without losing multiline drafts", async ({
  page,
}) => {
  await page.goto("/");
  const heading = page.locator(".chat-heading");
  const modes = heading.getByRole("group", { name: "对话模式" });
  const input = page.getByLabel("向研究助手提问", { exact: true });
  const form = page.locator(".chat-composer");
  const separator = page.getByRole("separator", { name: "调整对话面板宽度" });
  await separator.focus();
  for (let i = 0; i < 3; i++) await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "280");
  const titleBox = (await heading.locator("strong").boundingBox())!;
  const modeBox = (await modes.boundingBox())!;
  expect(
    Math.abs(titleBox.y + titleBox.height / 2 - modeBox.y - modeBox.height / 2),
  ).toBeLessThan(2);
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(modeBox.x);
  expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect((await form.boundingBox())!.height).toBeLessThanOrEqual(42);
  await input.focus();
  await input.fill("第一行问题\n第二行补充");
  expect((await form.boundingBox())!.height).toBeGreaterThanOrEqual(100);
  await page.screenshot({ path: "test-results/chat-compact-editing.png" });
  await heading.locator("strong").click();
  expect((await form.boundingBox())!.height).toBeLessThanOrEqual(42);
  await expect(input).toHaveValue("第一行问题\n第二行补充");
  await input.focus();
  await expect(input).toHaveValue("第一行问题\n第二行补充");
  await heading.locator("strong").click();
  await page.screenshot({ path: "test-results/chat-compact-collapsed.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(await heading.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});

test("quoting a technology opens Paper Mode with the earliest linked library paper and leaves the prompt unsent", async ({
  page,
  request,
  context,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    demo.id,
  );
  const w = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  const paper = w.papers[0];
  w.papers = [
    {
      ...paper,
      id: "late",
      title: "Later admission",
      short: "Later admission",
      year: 2000,
      addedAt: "2001-01-01",
      libraryAddedAt: "2025-01-01",
      inLibrary: true,
    },
    {
      ...paper,
      id: "early",
      title: "Earlier admission",
      short: "Earlier admission",
      year: 2024,
      addedAt: "2024-01-01",
      libraryAddedAt: undefined,
      inLibrary: true,
    },
    {
      ...paper,
      id: "candidate",
      title: "Uncollected candidate",
      short: "Uncollected candidate",
      addedAt: "1999-01-01",
      inLibrary: false,
    },
  ];
  w.nodes = [
    {
      ...w.nodes[0],
      id: "quote-node",
      name: "Quote Method",
      englishName: "Quote Method",
      chineseName: "引用方法",
      paperIds: ["late", "candidate", "early"],
    },
  ];
  w.edges = [];
  w.paperEdges = [];
  w.routes = [];
  w.messages = [];
  await page.route(`**/api/workspaces/${demo.id}`, (route) =>
    route.fulfill({ json: w }),
  );
  let sent = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/chat") && r.method() === "POST") sent++;
  });
  const quote = async () => {
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    if (page.viewportSize()!.width < 1020)
      await page.getByRole("button", { name: "折叠侧栏", exact: true }).click();
    await page
      .getByRole("button", { name: "查看 Quote Method", exact: true })
      .click();
    await page
      .getByRole("button", { name: "引用并打开对话", exact: true })
      .click();
  };
  await page.goto("/");
  await quote();
  await expect(
    page.getByRole("button", { name: "Paper Mode", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("对话论文", { exact: true })).toHaveValue(
    "early",
  );
  const input = page.getByLabel("向研究助手提问", { exact: true });
  await expect(input).toHaveValue(
    "请解释 Quote Method 技术在这篇论文中的作用，以及其是怎么实现的。",
  );
  expect(sent).toBe(0);
  await page.screenshot({ path: "test-results/chat-technology-quote.png" });
  w.nodes[0].paperIds = ["candidate", "missing"];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await quote();
  await expect(page.locator(".chat-panel")).toBeVisible();
  await expect(page.getByLabel("对话论文", { exact: true })).toHaveValue("");
  await expect(input).toHaveValue(
    "请解释 Quote Method 技术在这篇论文中的作用，以及其是怎么实现的。",
  );
  expect(sent).toBe(0);
});

test("paper key technologies display that paper's own two-sentence summary and still open technology details", async ({
  page,
  request,
  context,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    demo.id,
  );
  const w = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  w.papers = [
    {
      ...w.papers[0],
      id: "classification",
      title: "Classification Paper",
      short: "Classification Paper",
      inLibrary: true,
    },
    {
      ...w.papers[1],
      id: "detection",
      title: "Detection Paper",
      short: "Detection Paper",
      inLibrary: true,
    },
  ];
  w.nodes = [
    {
      ...w.nodes[0],
      id: "shared-tech",
      name: "Shared Method",
      englishName: "Shared Method",
      chineseName: "共用方法",
      paperIds: ["classification", "detection"],
      paperRelations: [
        {
          paperId: "classification",
          relation: "Uses",
          summary: {
            role: "本文用该技术提取分类特征。",
            implementation: "将输入编码后交给分类头。",
          },
        },
        {
          paperId: "detection",
          relation: "Extends",
          summary: {
            role: "本文扩展该技术以定位目标。",
            implementation: "在多尺度特征上连接检测头。",
          },
        },
      ],
    },
  ];
  w.edges = [];
  w.paperEdges = [];
  w.routes = [];
  await page.route(`**/api/workspaces/${demo.id}`, (route) =>
    route.fulfill({ json: w }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page
    .getByRole("button", { name: "Classification Paper", exact: true })
    .click();
  const detail = page.getByRole("dialog", { name: "节点详情" });
  const card = detail.locator('.paper-tech-card[data-tech-id="shared-tech"]');
  await expect(card).toContainText(
    "本文用该技术提取分类特征。 将输入编码后交给分类头。",
  );
  await expect(card).not.toContainText("定位目标");
  await card.click();
  await expect(
    detail.getByRole("heading", {
      level: 2,
      name: "Shared Method",
      exact: true,
    }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page
    .getByRole("button", { name: "Detection Paper", exact: true })
    .click();
  await expect(card).toContainText(
    "本文扩展该技术以定位目标。 在多尺度特征上连接检测头。",
  );
  await expect(card).not.toContainText("分类头");
  await page.screenshot({
    path: "test-results/paper-technology-summaries.png",
  });
});
