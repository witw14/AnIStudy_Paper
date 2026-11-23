import { test, expect, type Page } from "@playwright/test";

async function renameSelected(page: Page, title: string) {
  const card = page.locator('.quick-note-card[data-selected="true"]');
  await card.getByRole("button", { name: /^笔记操作/ }).click();
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await card.getByRole("textbox", { name: "笔记标题" }).fill(title);
  await card.getByRole("textbox", { name: "笔记标题" }).press("Enter");
}

test.beforeEach(async ({ request, context }) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  for (const n of w.notes || [])
    await request.delete(`/api/workspaces/${w.id}/notes/${n.id}`);
  await context.addInitScript((id) => {
    localStorage.setItem("anistudy.workspace", id);
    localStorage.setItem("anistudy.quick-space", id);
  }, w.id);
});

test("technology details always offer a new attached note and open it with the technology title", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  const node = w.nodes[0];
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.locator(`.graph-node[data-node-id="${node.id}"]`).click();
  const detail = page.getByRole("dialog", { name: "节点详情" });
  await expect(
    detail.getByRole("heading", { name: "关联笔记", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "新增笔记", exact: true }).click();
  await expect(
    page.locator('.quick-note-card[data-selected="true"] > strong'),
  ).toHaveText(node.name);
  await expect(
    page.getByText("关联论文与技术节点（1）", { exact: true }),
  ).toBeVisible();
  const saved = await (await request.get(`/api/workspaces/${w.id}`)).json();
  expect(saved.notes).toHaveLength(1);
  expect(saved.notes[0].nodeIds).toEqual([node.id]);
  expect(saved.notes[0].paperIds).toEqual([]);
  await page
    .getByRole("textbox", { name: "笔记正文", exact: true })
    .fill("## 技术记录\n\n从技术窗口创建。");
  await page.getByRole("textbox", { name: "笔记正文" }).press("Control+s");
  await expect(page.locator(".note-save-state")).toHaveText("已保存");
  await page.reload();
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.locator(`.graph-node[data-node-id="${node.id}"]`).click();
  await expect(
    detail.getByRole("button", { name: "新增笔记", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: node.name, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "笔记正文", exact: true }),
  ).toHaveValue(/技术记录/);
});

test("Markdown notes attach to multiple papers and technologies and open from both details", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  await page.goto("/");
  await page.getByRole("button", { name: "笔记库", exact: true }).click();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await renameSelected(page, "我的关联笔记");
  await page
    .getByRole("textbox", { name: "笔记正文", exact: true })
    .fill(
      "## 理解记录\n\n**跨论文共性**\n\n- [ ] 继续研究\n\n| 技术 | 含义 |\n| --- | --- |\n| CNN | 特征 |\n",
    );
  await page.getByRole("button", { name: "竖分栏", exact: true }).click();
  await expect(page.locator(".md-preview h2")).toHaveText("理解记录");
  await expect(page.locator(".md-preview strong")).toHaveText("跨论文共性");
  await expect(page.locator(".md-preview table")).toBeVisible();
  await page.getByText("关联论文与技术节点（0）", { exact: true }).click();
  for (const p of w.papers.slice(0, 2))
    await page.getByRole("checkbox", { name: p.title, exact: true }).check();
  for (const n of w.nodes.slice(0, 2))
    await page.getByRole("checkbox", { name: n.name, exact: true }).check();
  await page.getByRole("textbox", { name: "笔记正文" }).press("Control+s");
  await expect(page.locator(".note-save-state")).toHaveText("已保存");
  const updated = await (await request.get(`/api/workspaces/${w.id}`)).json();
  const note = updated.notes.find(
    (n: { title: string }) => n.title === "我的关联笔记",
  );
  expect(note.paperIds).toHaveLength(2);
  expect(note.nodeIds).toHaveLength(2);
  await page.reload();
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByText(w.papers[0].title, { exact: true }).first().click();
  await page.getByRole("button", { name: "我的关联笔记", exact: true }).click();
  await expect(
    page.locator('.quick-note-card[data-selected="true"] > strong'),
  ).toHaveText("我的关联笔记");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.locator(`.graph-node[data-node-id="${w.nodes[0].id}"]`).click();
  await page.getByRole("button", { name: "我的关联笔记", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "笔记正文", exact: true }),
  ).toHaveValue(/理解记录/);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出 Markdown", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("我的关联笔记.md");
});

test("quick note list fills window height and keeps long titles in equal single-line cards, omitting empty association counts", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  const title =
    "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift";
  await request.post(`/api/workspaces/${w.id}/notes`, {
    data: { title, paperIds: [w.papers[0].id] },
  });
  await request.post(`/api/workspaces/${w.id}/notes`, {
    data: { title: "技术笔记", nodeIds: [w.nodes[0].id] },
  });
  await request.post(`/api/workspaces/${w.id}/notes`, {
    data: { title: "无关联笔记" },
  });
  await page.setViewportSize({ width: 1000, height: 740 });
  await page.goto("/?quick-notes=1");
  const list = page.locator(".notes-list");
  const long = list.getByRole("button", { name: title, exact: true });
  await expect(long).toBeVisible();
  await expect(long).toHaveAttribute("title", title);
  await expect(long.locator("..").locator("strong")).toHaveText(title);
  await expect(long.locator("..").getByLabel("关联论文 1")).toBeVisible();
  await expect(
    list
      .getByRole("button", { name: "技术笔记", exact: true })
      .locator("..")
      .getByLabel("关联技术 1"),
  ).toBeVisible();
  await expect(
    list
      .getByRole("button", { name: "无关联笔记", exact: true })
      .locator("..")
      .locator(".quick-note-counts"),
  ).toBeEmpty();
  const bounds = (await list.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(490);
  expect(bounds.y + bounds.height).toBeGreaterThan(640);
  const cards = await list.locator(".quick-note-card").evaluateAll((elements) =>
    elements.map((el) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    })),
  );
  expect(new Set(cards.map((c) => c.width)).size).toBe(1);
  expect(new Set(cards.map((c) => c.height)).size).toBe(1);
  await expect(long.locator("..").locator("strong")).toHaveCSS(
    "white-space",
    "nowrap",
  );
  expect(
    await long
      .locator("..")
      .locator("strong")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "test-results/quick-notes-list.png" });
  await page.setViewportSize({ width: 640, height: 620 });
  expect((await list.boundingBox())!.height).toBeGreaterThan(400);
});

test("quick notes have a compact toolbar, card menu, independent scroll areas and a collapsible sidebar", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  const created = await (
    await request.post(`/api/workspaces/${w.id}/notes`, {
      data: { title: "待改名", content: "## 第一节\n\n内容" },
    })
  ).json();
  await page.setViewportSize({ width: 880, height: 760 });
  await page.goto("/?quick-notes=1");
  const sidebar = page.getByRole("complementary", { name: "笔记侧栏" }),
    toolbar = page.getByRole("toolbar", { name: "Markdown 工具栏" }),
    editor = page.getByRole("textbox", { name: "笔记正文" });
  await expect(sidebar).toBeVisible();
  await expect(
    sidebar.getByRole("textbox", { name: "搜索笔记" }),
  ).toBeVisible();
  await expect(sidebar.getByLabel("笔记研究空间")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "新建笔记" })).toBeVisible();
  await expect(
    page.locator(
      ".quick-notes > header,.md-footer,.note-attachments,.note-editor-heading",
    ),
  ).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "沉浸编辑" })).toHaveCount(
    0,
  );
  for (const name of [
    "置顶",
    "编辑",
    "竖分栏",
    "横分栏",
    "预览",
    "导出 Markdown",
  ])
    await expect(toolbar.getByRole("button", { name })).toBeVisible();
  await expect(toolbar.getByRole("link", { name: "打开主页面" })).toBeVisible();
  const card = sidebar.locator(`[data-note-id="${created.note.id}"]`);
  await card.getByRole("button", { name: "笔记操作：待改名" }).click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  const titleInput = card.getByRole("textbox", { name: "笔记标题" });
  await titleInput.fill("已改名");
  await titleInput.press("Enter");
  await expect(
    sidebar.getByRole("button", { name: "已改名", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await (
        await request.get(`/api/workspaces/${w.id}`)
      ).json();
      return current.notes.some((n: { title: string }) => n.title === "已改名");
    })
    .toBe(true);
  await card.getByRole("button", { name: "笔记操作：已改名" }).click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  await card.getByRole("textbox", { name: "笔记标题" }).fill("失焦改名");
  await toolbar.getByRole("button", { name: "竖分栏" }).click();
  await expect(
    sidebar.getByRole("button", { name: "失焦改名", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const current = await (
        await request.get(`/api/workspaces/${w.id}`)
      ).json();
      return current.notes.some(
        (n: { title: string }) => n.title === "失焦改名",
      );
    })
    .toBe(true);
  await editor.fill(
    Array.from({ length: 100 }, (_, i) => `段落 ${i}`).join("\n\n"),
  );
  await expect(page.locator(".note-save-state")).toHaveText("已保存");
  await toolbar.getByRole("button", { name: "竖分栏" }).click();
  await expect(page.locator(".mode-split-vertical .md-preview")).toHaveCSS(
    "overflow-y",
    "auto",
  );
  await expect(page.locator(".note-current")).toHaveCSS("overflow-y", "hidden");
  await expect(editor).toHaveCSS("overflow-y", "auto");
  await toolbar.getByRole("button", { name: "收起笔记侧栏" }).click();
  await expect(sidebar).toBeHidden();
  await expect(
    toolbar.getByRole("button", { name: "展开笔记侧栏" }),
  ).toBeVisible();
  await toolbar.getByRole("button", { name: "展开笔记侧栏" }).click();
  await expect(sidebar).toBeVisible();
  await page.screenshot({ path: "test-results/quick-notes-compact.png" });
  await page.setViewportSize({ width: 420, height: 420 });
  await expect(editor).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "导出 Markdown" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => void dialog.accept());
  await card.getByRole("button", { name: "笔记操作：失焦改名" }).click();
  await page.getByRole("menuitem", { name: "删除笔记" }).click();
  await expect(
    sidebar.getByRole("button", { name: "失焦改名", exact: true }),
  ).toHaveCount(0);
});

test("quick notes page edits the same notes and prevents stale window overwrites", async ({
  page,
  request,
  context,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  const created = await (
    await request.post(`/api/workspaces/${w.id}/notes`, {
      data: { title: "双窗口笔记", content: "初稿" },
    })
  ).json();
  await page.goto("/?quick-notes=1");
  await page.getByRole("button", { name: "双窗口笔记", exact: true }).click();
  const another = await context.newPage();
  await another.goto("/?quick-notes=1");
  await another
    .getByRole("button", { name: "双窗口笔记", exact: true })
    .click();
  await another
    .getByRole("textbox", { name: "笔记正文" })
    .fill("另一窗口的新版本");
  await expect(another.locator(".note-save-state")).toHaveText("已保存");
  // This page retains revision 1; server must reject its write rather than clobber.
  await page.getByRole("textbox", { name: "笔记正文" }).fill("过期窗口的草稿");
  await page.getByRole("textbox", { name: "笔记正文" }).press("Control+s");
  await expect(page.getByRole("alert")).toContainText("另一个窗口");
  const latest = await (await request.get(`/api/workspaces/${w.id}`)).json();
  expect(
    latest.notes.find((n: { id: string }) => n.id === created.note.id).content,
  ).toBe("另一窗口的新版本");
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    "过期窗口的草稿",
  );
});

test("paper and bilingual technology text can be edited through detail pencils", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  await page.goto("/");
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByText(w.papers[0].title, { exact: true }).first().click();
  await page.getByRole("button", { name: "编辑论文标题", exact: true }).click();
  await page
    .getByRole("textbox", { name: "论文标题", exact: true })
    .fill("手动修正论文题名");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".paper-detail-title")).toHaveText(
    "手动修正论文题名",
  );
  await page.getByRole("button", { name: "编辑阅读导览", exact: true }).click();
  await page
    .getByRole("textbox", { name: "阅读导览正文", exact: true })
    .fill("**我的阅读导览**");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".detail-panel .markdown strong")).toHaveText(
    "我的阅读导览",
  );
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.locator(`.graph-node[data-node-id="${w.nodes[0].id}"]`).click();
  await page.getByRole("button", { name: "编辑技术标题" }).click();
  await page
    .getByRole("textbox", { name: "英文标题" })
    .fill("User edited technique");
  await page.getByRole("textbox", { name: "中文标题" }).fill("用户修正技术");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".detail-panel h2")).toHaveText(
    "User edited technique",
  );
});
