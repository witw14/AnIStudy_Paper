import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

test.beforeEach(async ({ request, page }) => {
  await request.patch("/api/preferences", {
    data: { autoDownloadPapers: true, autoOrganizePapers: false },
  });
  await page.route("https://arxiv.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#eaf2ed"/><text x="20" y="45" fill="#2d715f">Feature diagram</text></svg>',
    }),
  );
});
async function setup(
  page: Page,
  request: APIRequestContext,
  context: BrowserContext,
  id = "2401.12345",
  organize = false,
) {
  const w = await (
    await request.post("/api/workspaces", {
      data: { name: `Reading test ${Date.now()}` },
    })
  ).json();
  const imported = await (
    await request.post(`/api/workspaces/${w.id}/arxiv`, { data: { input: id } })
  ).json();
  const paper = imported.papers[0];
  await expect
    .poll(async () => {
      const current = await (
        await request.get(`/api/workspaces/${w.id}`)
      ).json();
      return current.papers[0].acquisition?.state;
    })
    .toMatch(/ready|failed/);
  if (organize)
    await request.post(`/api/workspaces/${w.id}/papers/${paper.id}/organize`, {
      data: {},
    });
  await context.addInitScript((id) => {
    if (!localStorage.getItem("anistudy.workspace"))
      localStorage.setItem("anistudy.workspace", id);
  }, w.id);
  await page.goto("/");
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByRole("button", { name: paper.title, exact: true }).click();
  const detail = page.getByRole("dialog", { name: "节点详情", exact: true });
  await expect(detail).toBeVisible();
  return { workspaceId: w.id, paperId: paper.id, paper, detail };
}
async function selectText(page: Page, needle: string, exactBlock?: string) {
  const block = exactBlock
    ? page.locator(`[data-block-id="${exactBlock}"] .reading-block-html`)
    : page.locator(".reading-block-html").filter({ hasText: needle }).first();
  await block.scrollIntoViewIfNeeded();
  await block.evaluate((element, needle) => {
    const text = element.textContent || "",
      start = text.indexOf(needle),
      end = start + needle.length;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT),
      range = document.createRange();
    let offset = 0,
      begun = false;
    while (walker.nextNode()) {
      const node = walker.currentNode,
        length = node.textContent?.length || 0;
      if (!begun && start <= offset + length) {
        range.setStart(node, start - offset);
        begun = true;
      }
      if (begun && end <= offset + length) {
        range.setEnd(node, end - offset);
        break;
      }
      offset += length;
    }
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, needle);
  await expect(page.locator(".reader-selection-tools")).toBeVisible();
}
test("PDF and native HTML open from the same paper with outline, equations, tables, search and safe mobile reading", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context);
  await expect(
    detail.getByRole("status", { name: "原文获取状态" }),
  ).toContainText("原文已就绪");
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await expect(reader.locator(".reader-source-label")).toContainText(
    "arXiv 原始 HTML",
  );
  await expect(reader.locator("math")).toHaveCount(1);
  await expect(reader.locator("table")).toHaveCount(1);
  await expect(reader.locator("script")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Boolean(
        (window as unknown as { readerInjected?: boolean }).readerInjected,
      ),
    ),
  ).toBe(false);
  await reader
    .getByRole("complementary", { name: "论文大纲" })
    .getByRole("button", { name: "3 Limitations", exact: true })
    .click();
  await expect(reader.locator(".reading-block.is-focused")).toContainText(
    "3 Limitations",
  );
  await reader.getByLabel("查找正文", { exact: true }).fill("dataset shifts");
  await expect(reader.locator(".reader-search-count")).toHaveText(
    "第 1 处 / 共 1 处",
  );
  await reader
    .getByLabel("查找正文", { exact: true })
    .fill("Attention Routing");
  await expect(reader.locator(".reader-search-count")).toHaveText(
    "第 1 处 / 共 3 处",
  );
  await reader.getByRole("button", { name: "下一个匹配词" }).click();
  await expect(reader.locator(".reader-search-count")).toHaveText(
    "第 2 处 / 共 3 处",
  );
  const activeFrame = reader.locator(
    '.reader-search-frame[data-current="true"]',
  );
  await expect(activeFrame).toHaveCount(1);
  const wordFrame = (await activeFrame.boundingBox())!;
  expect(wordFrame.width).toBeLessThan(180);
  await reader
    .getByLabel("查找正文", { exact: true })
    .fill(
      "Attention Routing combines relevant features using learned attention weights. The method preserves residual information",
    );
  await expect.poll(() => activeFrame.count()).toBeGreaterThan(1);
  const header = (await reader.locator(".reader-header").boundingBox())!;
  const layout = (await reader.locator(".reader-layout").boundingBox())!;
  expect(layout.y - header.y - header.height).toBeLessThan(50);
  await expect(
    reader.locator(".reader-source-note, .reader-status"),
  ).toHaveCount(0);
  await reader.getByRole("button", { name: "增大阅读字号" }).click();
  await expect(reader.locator(".reader-content")).toHaveCSS(
    "font-size",
    "16px",
  );
  await reader.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(reader.getByTitle("论文 PDF 原文")).toBeVisible();
  await reader.getByRole("button", { name: "HTML", exact: true }).click();
  await page.screenshot({ path: "test-results/reader-native-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await reader
    .getByRole("button", { name: "展开论文大纲", exact: true })
    .click();
  await reader
    .getByRole("button", { name: "收起论文大纲", exact: true })
    .click();
  await reader
    .getByRole("button", { name: "展开阅读侧栏", exact: true })
    .click();
  await reader
    .getByRole("button", { name: "收起阅读侧栏", exact: true })
    .click();
  expect(
    await reader.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/reader-native-mobile.png" });
});
test("HTML highlights and annotation notes save automatically and survive closing/reload, including multi-window revision conflicts", async ({
  page,
  request,
  context,
}) => {
  const { workspaceId, paperId, detail } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  const toolsHeight = (await reader
    .locator(".reader-selection-tools")
    .boundingBox())!.height;
  await selectText(page, "Attention Routing");
  expect(
    (await reader.locator(".reader-selection-tools").boundingBox())!.height,
  ).toBe(toolsHeight);
  await reader.getByRole("button", { name: "绿色高亮", exact: true }).click();
  await reader.getByRole("button", { name: "标注选段", exact: true }).click();
  await reader.locator(".reading-highlight").first().hover();
  const note = reader.getByPlaceholder("添加标注备注，自动保存…");
  await note.fill("这段说明组合特征的机制。");
  await expect
    .poll(async () => {
      const d = await (
        await request.get(
          `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
        )
      ).json();
      return d.annotations[0]?.note;
    })
    .toBe("这段说明组合特征的机制。");
  expect(
    await page.evaluate(
      () =>
        (
          CSS as unknown as { highlights: Map<string, { size: number }> }
        ).highlights.get("anistudy-green")?.size,
    ),
  ).toBe(1);
  await reader.getByRole("button", { name: "关闭原文阅读" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page
    .getByRole("button", { name: /^Controlled Reader Paper/, exact: false })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "打开HTML", exact: true })
    .click();
  await reader.locator(".reading-highlight").first().hover();
  await expect(note).toHaveValue("这段说明组合特征的机制。");
  await expect(
    reader.locator(".reading-highlight.has-note").first(),
  ).toBeVisible();
  const current = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  const annotation = current.annotations[0];
  await request.patch(
    `/api/workspaces/${workspaceId}/papers/${paperId}/annotations/${annotation.id}`,
    { data: { revision: annotation.revision, note: "另一个窗口已更新" } },
  );
  await note.fill("当前窗口的冲突草稿");
  await expect(reader.getByRole("alert")).toContainText("其他窗口更新");
  await expect(note).toHaveValue("当前窗口的冲突草稿");
  await reader
    .getByRole("button", { name: "载入最新标注", exact: true })
    .click();
  await expect(note).toHaveValue("另一个窗口已更新");
  await page.screenshot({ path: "test-results/reader-annotations.png" });
});
test("technology tags and node details navigate to the same paragraph without exposing manual attachment controls", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId } = await setup(
    page,
    request,
    context,
    "2401.12345",
    true,
  );
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  const tag = reader.locator(".reader-tech-tag").first();
  await expect(tag).toContainText("Attention Routing");
  await expect(tag).toContainText("正式讲解");
  await expect(reader.locator(".reader-tech-tag")).toHaveCount(1);
  await expect(reader.locator(".reader-tech-tag")).not.toContainText(
    "术语匹配",
  );
  await tag.locator("button").first().click();
  await expect(reader.locator(".reading-block.is-focused")).toContainText(
    "Attention Routing",
  );
  await expect(reader.getByLabel("选段关联技术", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    reader.getByRole("button", { name: "关联技术", exact: true }),
  ).toHaveCount(0);
  await tag
    .getByRole("button", { name: "查看技术 Attention Routing", exact: true })
    .click();
  const node = page.getByRole("dialog", { name: "节点详情" });
  await expect(node.getByText("原文关联段落", { exact: true })).toBeVisible();
  await node
    .locator(".source-passage-button")
    .filter({ hasText: "Attention Routing" })
    .first()
    .click();
  await expect(reader.locator(".reading-block.is-focused")).toContainText(
    "Attention Routing",
  );
  await page.screenshot({ path: "test-results/reader-technology-links.png" });
});
test("selected-text explanation and normal chat replies carry validated source buttons that return to the original passage", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await selectText(page, "learned attention weights");
  await reader
    .getByRole("button", { name: "引用选文到论文对话", exact: true })
    .click();
  await expect(reader.getByLabel("原文阅读问题", { exact: true })).toHaveValue(
    "请解释：‘learned attention weights’",
  );
  await expect(reader.locator(".reader-chat-message")).toHaveCount(0);
  await reader.getByRole("button", { name: "发送", exact: true }).click();
  await expect(
    reader.locator(".reader-explanation .assistant .markdown").first(),
  ).toContainText("注意力路由");
  const source = reader.locator(".reader-explanation .source-citation");
  await expect(source).toHaveCount(1);
  await source.click();
  await expect(reader.locator(".reading-block.is-focused")).toContainText(
    "learned attention weights",
  );
  await reader.getByRole("button", { name: "对话", exact: true }).click();
  await expect(reader.locator(".reader-chat-message")).toHaveCount(2);
  await reader
    .getByLabel("原文阅读问题", { exact: true })
    .fill("进一步解释残差信息");
  await reader.getByRole("button", { name: "发送", exact: true }).click();
  await expect(reader.locator(".reader-chat-message")).toHaveCount(4);
  await page.screenshot({ path: "test-results/reader-source-explanation.png" });
  await reader.getByRole("button", { name: "关闭原文阅读" }).click();
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "论文对话", exact: true })
    .click();
  await expect(page.locator(".chat-panel .source-citation")).toHaveCount(2);
  await page.locator(".chat-panel .source-citation").first().click();
  await expect(reader.locator(".reading-block.is-focused")).toContainText(
    "learned attention weights",
  );
  await reader.getByRole("button", { name: "对话", exact: true }).click();
  await expect(reader.locator(".reader-chat-message")).toHaveCount(4);
});
test("reader chat shares thinking controls with paper chat and persists changes", async ({
  page,
  request,
  context,
}) => {
  const old = await (await request.get("/api/settings")).json();
  await request.put("/api/settings", {
    data: {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-v4-pro",
      deepThinking: "auto",
      reasoningEffort: "auto",
    },
  });
  try {
    const { detail } = await setup(page, request, context);
    await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
    const reader = page.getByRole("dialog", { name: "论文原文阅读" });
    await reader.getByRole("button", { name: "对话", exact: true }).click();
    await reader
      .getByLabel("深度思考", { exact: true })
      .selectOption("enabled");
    await expect(reader.getByLabel("思考强度", { exact: true })).toBeEnabled();
    await reader.getByLabel("思考强度", { exact: true }).selectOption("low");
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/settings")).json()).reasoningEffort,
      )
      .toBe("low");
    await reader
      .getByRole("button", { name: "关闭原文阅读", exact: true })
      .click();
    await detail.getByRole("button", { name: "论文对话", exact: true }).click();
    await expect(
      page.locator(".chat-panel").getByLabel("深度思考", { exact: true }),
    ).toHaveValue("enabled");
    await expect(
      page.locator(".chat-panel").getByLabel("思考强度", { exact: true }),
    ).toHaveValue("low");
  } finally {
    await request.put("/api/settings", { data: old });
  }
});

test("converted HTML announces its limitations, and failed downloads leave a retryable paper record", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context, "2401.00001");
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await expect(reader.locator(".reader-source-label")).toContainText(
    "pdf 自动转换 HTML",
  );
  await expect(reader.locator(".reader-source-label")).toHaveAttribute(
    "title",
    /可能缺失/,
  );
  await expect(reader.locator(".reading-page-label").first()).toHaveText(
    "PDF 第 1 页",
  );
  await page.screenshot({ path: "test-results/reader-converted.png" });
  await reader.getByRole("button", { name: "关闭原文阅读" }).click();
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "关闭详情" })
    .click();
  const failed = await (
    await request.post("/api/workspaces", {
      data: { name: "Failed download test" },
    })
  ).json();
  await request.post(`/api/workspaces/${failed.id}/arxiv`, {
    data: { input: "2401.00000" },
  });
  await expect
    .poll(async () => {
      const w = await (
        await request.get(`/api/workspaces/${failed.id}`)
      ).json();
      return w.papers[0]?.acquisition?.state;
    })
    .toBe("failed");
  await page.reload();
  await page
    .getByLabel("顶部切换研究空间", { exact: true })
    .selectOption(failed.id);
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page
    .getByRole("button", {
      name: "Controlled Reader Paper 2401.00000",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "节点详情" })
      .getByRole("button", { name: "获取原文", exact: true }),
  ).toBeEnabled();
});

test("highlighting overlapping text preserves its note and only the click action removes a highlight without confirmation", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await selectText(page, "Attention Routing combines relevant features");
  await page.keyboard.press("Control+b");
  await expect(reader.locator(".reading-highlight")).toHaveCount(1);
  await reader.locator(".reading-highlight").hover();
  const popup = reader.getByRole("dialog", { name: "高亮笔记" });
  await popup
    .getByPlaceholder("添加标注备注，自动保存…")
    .fill("必须保留的标注笔记");
  await popup.getByRole("button", { name: "关闭高亮笔记" }).click();
  await selectText(
    page,
    "Attention Routing combines relevant features using learned attention weights.",
  );
  await reader.getByRole("button", { name: "标注选段", exact: true }).click();
  await expect(reader.locator(".reading-highlight.has-note")).toHaveCount(1);
  const docPath = `/api/workspaces/${workspaceId}/papers/${paperId}/document`;
  const current = await (await request.get(docPath)).json();
  expect(current.annotations[0].note).toBe("必须保留的标注笔记");
  expect(current.annotations[0].quote).toBe(
    "Attention Routing combines relevant features using learned attention weights.",
  );
  let confirmations = 0;
  page.on("dialog", async (d) => {
    confirmations++;
    await d.dismiss();
  });
  await reader.locator(".reading-highlight").click();
  const tools = reader.getByRole("toolbar", { name: "标注操作" });
  await expect(tools.getByRole("button")).toHaveCount(2);
  expect(await tools.innerText()).toBe("");
  await tools.getByRole("button", { name: "引用标注至对话" }).click();
  await expect(reader.getByLabel("原文阅读问题", { exact: true })).toHaveValue(
    "请解释：‘Attention Routing combines relevant features using learned attention weights.’",
  );
  await reader.locator(".reading-highlight").click();
  await tools.getByRole("button", { name: "取消标注并删除笔记" }).click();
  await expect(reader.locator(".reading-highlight")).toHaveCount(0);
  expect((await (await request.get(docPath)).json()).annotations).toHaveLength(
    0,
  );
  expect(confirmations).toBe(0);
});

test("annotation popup is borderless and compact, grows with its longest line, handles Enter/Shift+Enter/Ctrl+Enter and disappears immediately on pointer exit", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await selectText(page, "Attention Routing");
  await page.keyboard.press("Control+b");
  const mark = reader.locator(".reading-highlight").first();
  await mark.hover();
  const popup = reader.getByRole("dialog", { name: "高亮笔记" }),
    input = popup.locator("textarea");
  await expect(popup).toBeVisible();
  await expect(input).toHaveCSS("border-top-width", "0px");
  await expect(
    popup.locator('[role="status"],.annotation-actions'),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await popup.boundingBox())!.height)
    .toBeLessThan(65);
  const initial = (await popup.boundingBox())!;
  const editor = (await input.boundingBox())!;
  await page.mouse.move(editor.x + 30, editor.y + 10, { steps: 12 });
  await expect(popup).toBeVisible();
  await input.click();
  await input.fill("中".repeat(30));
  await expect
    .poll(async () => (await popup.boundingBox())!.width)
    .toBeGreaterThan(initial.width + 100);
  const medium = (await popup.boundingBox())!;
  expect(medium.height).toBeLessThan(65);
  await input.fill("中".repeat(100));
  await expect
    .poll(async () => (await popup.boundingBox())!.height)
    .toBeGreaterThan(medium.height + 10);
  const wide = (await popup.boundingBox())!;
  expect(wide.width).toBeLessThan(475);
  await input.fill("中".repeat(30) + "\n短行");
  await expect
    .poll(async () => (await popup.boundingBox())!.width)
    .toBeCloseTo(medium.width, 0);
  await input.fill("第一行");
  await input.press("Shift+Enter");
  await input.pressSequentially("第二行");
  await expect(input).toHaveValue("第一行\n第二行");
  await input.press("Control+Enter");
  await input.pressSequentially("第三行");
  await expect(input).toHaveValue("第一行\n第二行\n第三行");
  await input.press("Enter");
  await expect(popup).not.toBeVisible();
  await expect(reader.locator(".reading-highlight").first()).toBeFocused();
  await reader.locator(".reading-highlight").first().hover();
  await expect(popup).toBeVisible();
  await page.screenshot({ path: "test-results/annotation-compact-note.png" });
  const exit = await reader.locator(".reader-header").boundingBox();
  await page.mouse.move(exit!.x + 30, exit!.y + 10);
  expect(await popup.isVisible()).toBe(false);
});

test("merging several highlights preserves multiline notes in order and supports quoted ranges across inline HTML", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  for (const [phrase, note] of [
    ["Attention Routing", "笔记1段落1\n段落2"],
    ["relevant features", "笔记2段落1"],
    ["learned attention weights", "笔记3段落1"],
  ]) {
    await selectText(page, phrase);
    await page.keyboard.press("Control+b");
    const mark = reader
      .locator(".reading-highlight")
      .filter({ hasText: phrase })
      .first();
    await mark.hover();
    const popup = reader.getByRole("dialog", { name: "高亮笔记" });
    await popup.locator("textarea").fill(note);
    await popup.getByRole("button", { name: "关闭高亮笔记" }).click();
  }
  const full =
    "Attention Routing combines relevant features using learned attention weights.";
  await selectText(page, full);
  await page.keyboard.press("Control+b");
  await expect(reader.locator(".reading-highlight")).toHaveCount(1);
  const doc = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  expect(doc.annotations[0].note).toBe(
    "笔记1段落1\n段落2\n笔记2段落1\n笔记3段落1",
  );
  expect(doc.annotations[0].quote).toBe(full);
  await page.reload();
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page
    .getByRole("button", { name: /^Controlled Reader Paper/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "打开HTML", exact: true })
    .click();
  await reader.locator(".reading-highlight").hover();
  await expect(
    reader.getByRole("dialog", { name: "高亮笔记" }).locator("textarea"),
  ).toHaveValue(doc.annotations[0].note);
  await reader.getByRole("button", { name: "关闭高亮笔记" }).click();
  const start = doc.document.blocks.find((b: { text: string }) =>
    b.text.startsWith("Attention Routing combines"),
  );
  const end = doc.document.blocks.find((b: { text: string }) =>
    b.text.startsWith("The normalization step"),
  );
  await reader.evaluate(
    (element, { start, end }) => {
      const first = element.querySelector(
          `[data-block-id="${start}"] .reading-block-html`,
        )!,
        last = element.querySelector(
          `[data-block-id="${end}"] .reading-block-html`,
        )!;
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.childNodes.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      last.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    },
    { start: start.id, end: end.id },
  );
  await page.keyboard.press("Control+b");
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(
              `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
            )
          ).json()
        ).annotations.length,
    )
    .toBe(2);
  const second = reader
    .locator(`[data-block-id="${end.id}"] .reading-highlight`)
    .first();
  await second.hover();
  await expect(
    reader.getByRole("dialog", { name: "高亮笔记" }).locator("textarea"),
  ).toHaveValue(doc.annotations[0].note);
  await second.click();
  await reader
    .getByRole("toolbar", { name: "标注操作" })
    .getByRole("button", { name: "取消标注并删除笔记" })
    .click();
  await expect(reader.locator(".reading-highlight")).toHaveCount(0);
});

test("the resizable reading sidebar shares library notes and keeps editing modes inside the sidebar", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId } = await setup(page, request, context);
  const create = async (title: string, paperIds: string[]) =>
    (
      await (
        await request.post(`/api/workspaces/${workspaceId}/notes`, {
          data: { title, content: "已有笔记正文", paperIds },
        })
      ).json()
    ).note;
  await create("较早关联笔记", [paperId]);
  const newest = await create("最新关联笔记", [paperId]);
  await create("未关联的草稿", []);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.getByRole("button", { name: "笔记", exact: true }).click();
  await expect(reader.getByLabel("笔记标题", { exact: true })).toHaveValue(
    "最新关联笔记",
  );
  await reader
    .getByLabel("笔记正文", { exact: true })
    .fill("## 来自阅读侧栏的笔记\n\n保留原文旁的编辑状态。");
  await expect
    .poll(
      async () =>
        (
          await (await request.get(`/api/workspaces/${workspaceId}`)).json()
        ).notes.find((n: { id: string }) => n.id === newest.id)?.content,
    )
    .toContain("来自阅读侧栏");
  const before = (await reader.locator(".reader-content").boundingBox())!;
  const divider = await reader
    .getByRole("separator", { name: "调整阅读侧栏宽度" })
    .boundingBox();
  await page.mouse.move(divider!.x + divider!.width / 2, divider!.y + 100);
  await page.mouse.down();
  await page.mouse.move(divider!.x - 120, divider!.y + 100);
  await page.mouse.up();
  const after = (await reader.locator(".reader-content").boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 100);
  await expect(reader.getByRole("button", { name: "沉浸编辑" })).toHaveCount(0);
  const noteRect = (await reader
      .locator(".reader-note-panel .md-editor")
      .boundingBox())!,
    contentRect = (await reader.locator(".reader-content").boundingBox())!;
  expect(noteRect.x).toBeGreaterThanOrEqual(contentRect.x + contentRect.width);
  await reader.getByRole("button", { name: "预览", exact: true }).click();
  await reader.getByRole("button", { name: "编辑", exact: true }).click();
  await reader.getByLabel("笔记正文", { exact: true }).fill("侧栏中修改的正文");
  await expect(reader.getByLabel("阅读笔记范围", { exact: true })).toHaveCount(
    0,
  );
  await reader
    .getByLabel("选择阅读笔记", { exact: true })
    .selectOption({ label: "较早关联笔记" });
  await expect(reader.getByLabel("笔记标题", { exact: true })).toHaveValue(
    "较早关联笔记",
  );
  await reader
    .getByRole("button", { name: "新建阅读笔记", exact: true })
    .click();
  await expect(reader.getByLabel("笔记标题", { exact: true })).toHaveValue(
    "Controlled Reader Paper 2401.12345",
  );
  await page.screenshot({ path: "test-results/reader-sidebar-notes.png" });
  await reader.getByRole("button", { name: "关闭原文阅读" }).click();
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "关闭详情" })
    .click();
  await page.getByRole("button", { name: /^笔记库/ }).click();
  await expect(
    page.getByRole("button", { name: "最新关联笔记", exact: true }),
  ).toBeVisible();
});
test("reader Enter sends immediately with a floating model-progress box, protects new drafts and keeps failed user messages", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId } = await setup(page, request, context);
  let release: () => void = () => {},
    calls = 0;
  await page.route(`**/api/workspaces/${workspaceId}/chat`, async (route) => {
    calls++;
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ response: await route.fetch() });
    } else
      await route.fulfill({ status: 502, json: { error: "受控模型错误" } });
  });
  await page.route(`**/api/workspaces/${workspaceId}/operations/*`, (route) =>
    route.fulfill({
      json: {
        status: "running",
        current: {
          phase: "model",
          label: "正在调用大模型…",
          detail: "理解当前论文",
        },
        steps: [],
      },
    }),
  );
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.getByRole("button", { name: "对话", exact: true }).click();
  const input = reader.getByLabel("原文阅读问题", { exact: true });
  const originalTop = (await reader.locator(".reader-layout").boundingBox())!.y;
  await input.fill("请解释残差信息");
  await input.press("Shift+Enter");
  expect(calls).toBe(0);
  await input.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    ),
  );
  expect(calls).toBe(0);
  await input.press("Enter");
  await expect(reader.locator(".reader-chat-message.user")).toContainText(
    "请解释残差信息",
  );
  await expect(input).toHaveValue("");
  await expect(
    reader.getByRole("status", { name: "操作进度", exact: true }),
  ).toContainText("正在调用大模型…");
  expect((await reader.locator(".reader-layout").boundingBox())!.y).toBe(
    originalTop,
  );
  await input.fill("下一轮问题");
  await input.press("Enter");
  expect(calls).toBe(1);
  await expect(input).toHaveValue("下一轮问题");
  release();
  await expect(reader.locator(".reader-chat-message.assistant")).toHaveCount(1);
  await expect(reader.locator(".reader-chat-message.user")).toHaveCount(1);
  await expect(input).toHaveValue("下一轮问题");
  await expect(
    reader.getByRole("status", { name: "操作进度", exact: true }),
  ).toHaveCount(0);
  await input.press("Enter");
  await expect(reader.locator(".reader-chat-message.user")).toHaveCount(2);
  await expect(reader.locator(".chat-delivery-error")).toHaveCount(1);
  await expect(input).toHaveValue("");
  await reader.getByRole("button", { name: "重新编辑", exact: true }).click();
  await expect(input).toHaveValue("下一轮问题");
  await page.screenshot({ path: "test-results/reader-compact-chat.png" });
});

test("an empty paper-note sidebar shows only create and creates an attached library note", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.getByRole("button", { name: "笔记", exact: true }).click();
  await expect(reader.locator(".reader-note-panel select")).toHaveCount(0);
  await expect(reader.locator(".reader-note-panel .note-editor")).toHaveCount(
    0,
  );
  const create = reader.getByRole("button", {
    name: "新建阅读笔记",
    exact: true,
  });
  await expect(create).toContainText("创建笔记");
  await create.click();
  await expect(reader.getByLabel("笔记标题", { exact: true })).toHaveValue(
    "Controlled Reader Paper 2401.12345",
  );
  await expect(reader.locator(".reader-note-panel select")).toHaveCount(0);
  await page.screenshot({ path: "test-results/reader-compact-note.png" });
});

test("download and automatic organization controls save independently and restore through configuration import", async ({
  page,
  request,
  context,
}) => {
  await setup(page, request, context);
  await page
    .getByRole("dialog", { name: "节点详情" })
    .getByRole("button", { name: "关闭详情" })
    .click();
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "偏好选项" });
  await settings
    .getByLabel("加入论文库后自动获取原文", { exact: true })
    .uncheck();
  await settings
    .getByLabel("加入论文库后自动 AI 整理", { exact: true })
    .check();
  await settings
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(settings).not.toBeVisible();
  const file = await (await request.get("/api/preferences/export")).json();
  expect(file.settings.autoDownloadPapers).toBe(false);
  expect(file.settings.autoOrganizePapers).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(
    settings.getByLabel("加入论文库后自动获取原文", { exact: true }),
  ).not.toBeChecked();
  await expect(
    settings.getByLabel("加入论文库后自动 AI 整理", { exact: true }),
  ).toBeChecked();
  file.settings.autoDownloadPapers = true;
  file.settings.autoOrganizePapers = false;
  await settings.getByLabel("导入个人配置文件", { exact: true }).setInputFiles({
    name: "acquisition.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(
    settings.getByLabel("加入论文库后自动获取原文", { exact: true }),
  ).toBeChecked();
  await expect(
    settings.getByLabel("加入论文库后自动 AI 整理", { exact: true }),
  ).not.toBeChecked();
});

test("library read button opens a ninety-percent blurred reader, outside click closes it and PDF exposes only refresh", async ({
  page,
  request,
  context,
}) => {
  const { detail } = await setup(page, request, context);
  await detail.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page
    .locator(".paper-card")
    .getByRole("button", { name: "阅读原文", exact: true })
    .click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  const rect = (await reader.boundingBox())!;
  expect(Math.abs(rect.width - page.viewportSize()!.width * 0.9)).toBeLessThan(
    2,
  );
  expect(
    await page
      .locator(".paper-reader-backdrop")
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain("blur");
  await reader.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(
    reader.locator(".reader-toolbar").getByRole("button"),
  ).toHaveCount(1);
  await expect(
    reader
      .locator(".reader-toolbar")
      .getByRole("button", { name: "刷新原文", exact: true }),
  ).toBeVisible();
  await expect(reader.locator(".reader-outline")).toBeHidden();
  await expect(reader.locator(".reader-aside")).toBeHidden();
  await page.mouse.click(2, 2);
  await expect(reader).toHaveCount(0);
});

test("long full translation continues after reader exit, page changes and reload, with global progress and recorded activity", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId, paper } = await setup(
    page,
    request,
    context,
    "2401.00002",
  );
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.getByRole("button", { name: "翻译全文", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "全文翻译进度", exact: true }),
  ).toBeVisible();
  await reader
    .getByRole("button", { name: "关闭原文阅读", exact: true })
    .click();
  await page.getByRole("button", { name: "关闭详情", exact: true }).click();
  await page.getByRole("button", { name: "空间总览", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "全文翻译进度", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/background-translation-progress.png",
  });
  await page.reload();
  await expect(
    page.getByRole("status", { name: "全文翻译进度", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () => {
        const tasks = await (
          await request.get(`/api/tasks?workspaceId=${workspaceId}`)
        ).json();
        return tasks.find(
          (t: { category: string }) => t.category === "translation",
        )?.status;
      },
      { timeout: 30000 },
    )
    .toBe("succeeded");
  await expect(
    page.getByRole("status", { name: "全文翻译结果", exact: true }),
  ).toContainText("全文翻译完成");
  const task = (
    await (await request.get(`/api/tasks?workspaceId=${workspaceId}`)).json()
  ).find((t: { category: string }) => t.category === "translation");
  expect(task.calls).toBeGreaterThan(5);
  expect(task.totalTokens).toBe(task.calls * 152);
  await page.getByRole("button", { name: "查看动态", exact: true }).click();
  const activity = page.getByRole("dialog", { name: "动态", exact: true });
  await expect(activity).toContainText(paper.title);
  await expect(activity).toContainText(
    `${task.totalTokens.toLocaleString()} tokens`,
  );
  await activity.getByRole("button", { name: "关闭弹窗" }).click();
  const data = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  expect(data.translation.state).toBe("complete");
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByRole("button", { name: paper.title, exact: true }).click();
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  await expect(
    reader.getByRole("button", { name: "译文", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("status", { name: "全文翻译结果", exact: true })
    .locator(".background-task-content")
    .click();
  await expect(activity).toBeVisible();
  const layers = await page.evaluate(() => ({
    reader: Number(
      getComputedStyle(document.querySelector(".paper-reader-backdrop")!)
        .zIndex,
    ),
    activity: Number(
      getComputedStyle(document.querySelector(".modal-backdrop")!).zIndex,
    ),
  }));
  expect(layers.activity).toBeGreaterThan(layers.reader);
  await page.keyboard.press("Escape");
  await expect(activity).not.toBeVisible();
  await expect(reader).toBeVisible();
});
test("full translation supports dual adjustable panes and interleaving, isolates annotations, original search and chat context, and caches results", async ({
  page,
  request,
  context,
}) => {
  const { detail, workspaceId, paperId } = await setup(page, request, context);
  await detail.getByRole("button", { name: "打开HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.getByRole("button", { name: "翻译全文", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "全文翻译进度", exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByRole("button", { name: "译文", exact: true }),
  ).toBeVisible();
  await expect(reader.locator(".reader-translation")).toBeVisible();
  await expect(reader.locator(".reader-translation")).toContainText("中文译文");
  const splitter = reader.getByRole("separator", {
    name: "调整原文与译文宽度",
  });
  const before = (await reader
    .locator(".reader-content")
    .first()
    .boundingBox())!.width;
  const bounds = (await splitter.boundingBox())!;
  await page.mouse.move(bounds.x + 3, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 95, bounds.y + 100);
  await page.mouse.up();
  expect(
    (await reader.locator(".reader-content").first().boundingBox())!.width,
  ).toBeGreaterThan(before + 70);
  await reader.getByLabel("查找正文", { exact: true }).fill("中文译文");
  await expect(reader.locator(".reader-search-count")).toContainText("共 0 处");
  await reader.getByLabel("查找正文", { exact: true }).fill("dataset shifts");
  await expect(reader.locator(".reader-search-count")).toContainText("共 1 处");
  await reader.getByLabel("查找正文", { exact: true }).fill("");
  const d = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  const translated = d.translation.document.blocks[0];
  await selectText(page, "中文译文", translated.id);
  await expect(
    reader.getByRole("button", { name: "引用选文到论文对话", exact: true }),
  ).toBeDisabled();
  await reader.getByRole("button", { name: "标注选段", exact: true }).click();
  await selectText(page, "learned attention weights");
  await reader.getByRole("button", { name: "标注选段", exact: true }).click();
  await expect
    .poll(async () => {
      const current = await (
        await request.get(
          `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
        )
      ).json();
      return [
        current.annotations.length,
        current.translationAnnotations.length,
      ];
    })
    .toEqual([1, 1]);
  const annotated = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  expect(annotated.annotations).toHaveLength(1);
  expect(annotated.translationAnnotations).toHaveLength(1);
  await reader.getByRole("button", { name: "穿插", exact: true }).click();
  await expect(reader.locator(".reader-pages")).toHaveAttribute(
    "data-mode",
    "interleaved",
  );
  const kinds = await reader
    .locator(".reader-content .reading-block")
    .evaluateAll((els) =>
      els
        .slice(0, 4)
        .map((el) => el.classList.contains("reading-translated-block")),
    );
  expect(kinds).toEqual([false, true, false, true]);
  await expect(
    reader.locator(".reader-content .reading-highlight"),
  ).toHaveCount(2);
  await page.screenshot({ path: "test-results/reader-interleaved.png" });
  const posts: unknown[] = [];
  await page.route(`**/api/workspaces/${workspaceId}/chat`, async (route) => {
    posts.push(route.request().postDataJSON());
    return route.continue();
  });
  await reader.getByRole("button", { name: "对话", exact: true }).click();
  await reader
    .getByLabel("原文阅读问题", { exact: true })
    .fill("解释注意力权重");
  await reader.getByRole("button", { name: "发送", exact: true }).click();
  await expect(reader.locator(".reader-chat-message.assistant")).toHaveCount(1);
  expect(JSON.stringify(posts)).not.toContain("中文译文");
  const firstId = d.translation.id;
  await reader.getByRole("button", { name: "翻译全文", exact: true }).click();
  await expect(reader.locator(".reader-translation")).toBeVisible();
  const second = await (
    await request.get(
      `/api/workspaces/${workspaceId}/papers/${paperId}/document`,
    )
  ).json();
  expect(second.translation.id).toBe(firstId);
  await reader.getByRole("button", { name: "原文", exact: true }).click();
  await expect(reader.locator(".reader-pages")).toHaveAttribute(
    "data-mode",
    "translation",
  );
  await reader.getByRole("button", { name: "原文", exact: true }).click();
  await expect(reader.locator(".reader-pages")).toHaveAttribute(
    "data-mode",
    "both",
  );
  await reader.getByRole("button", { name: "译文", exact: true }).click();
  await expect(reader.locator(".reader-pages")).toHaveAttribute(
    "data-mode",
    "original",
  );
  await expect(
    reader.getByRole("button", { name: "翻译选段", exact: true }),
  ).toHaveCount(0);
});
