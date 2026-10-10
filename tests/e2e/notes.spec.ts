import { test, expect } from "@playwright/test";

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
    page.getByRole("textbox", { name: "笔记标题", exact: true }),
  ).toHaveValue(node.name);
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
  await page.getByRole("button", { name: "保存", exact: true }).click();
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
  await page
    .getByRole("textbox", { name: "笔记标题", exact: true })
    .fill("我的关联笔记");
  await page
    .getByRole("textbox", { name: "笔记正文", exact: true })
    .fill(
      "## 理解记录\n\n**跨论文共性**\n\n- [ ] 继续研究\n\n| 技术 | 含义 |\n| --- | --- |\n| CNN | 特征 |\n",
    );
  await expect(page.locator(".md-preview h2")).toHaveText("理解记录");
  await expect(page.locator(".md-preview strong")).toHaveText("跨论文共性");
  await expect(page.locator(".md-preview table")).toBeVisible();
  await page.getByText("关联论文与技术节点（0）", { exact: true }).click();
  for (const p of w.papers.slice(0, 2))
    await page.getByRole("checkbox", { name: p.title, exact: true }).check();
  for (const n of w.nodes.slice(0, 2))
    await page.getByRole("checkbox", { name: n.name, exact: true }).check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
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
    page.getByRole("textbox", { name: "笔记标题", exact: true }),
  ).toHaveValue("我的关联笔记");
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
  await page.getByRole("button", { name: /双窗口笔记/ }).click();
  const another = await context.newPage();
  await another.goto("/?quick-notes=1");
  await another.getByRole("button", { name: /双窗口笔记/ }).click();
  await another
    .getByRole("textbox", { name: "笔记正文" })
    .fill("另一窗口的新版本");
  await expect(another.locator(".note-save-state")).toHaveText("已保存");
  // This page retains revision 1; server must reject its write rather than clobber.
  await page.getByRole("textbox", { name: "笔记正文" }).fill("过期窗口的草稿");
  await page.getByRole("button", { name: "保存", exact: true }).click();
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
  await page.getByRole("button", { name: "编辑论文正文", exact: true }).click();
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
