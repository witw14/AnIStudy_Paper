import { test, expect } from "@playwright/test";

test("node information, bidirectional relations, note placement and detail scroll reset", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((s: { demo: boolean }) => s.demo).id;
  const w = await (await request.get(`/api/workspaces/${id}`)).json();
  const [a, b] = w.nodes;
  const previousEdge = w.edges.find(
    (edge: { source: string; target: string }) =>
      (edge.source === a.id && edge.target === b.id) ||
      (edge.source === b.id && edge.target === a.id),
  );
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    id,
  );
  const created = await (
    await request.post(`/api/workspaces/${id}/notes`, {
      data: {
        title: "详情位置测试",
        nodeIds: [a.id],
        paperIds: [w.papers[0].id],
      },
    })
  ).json();
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await page.locator(`.graph-node[data-node-id="${a.id}"]`).click();
    const detail = page.getByRole("dialog", { name: "节点详情" });
    await detail.getByRole("button", { name: "编辑标签", exact: true }).click();
    await detail.getByRole("spinbutton", { name: "节点年份" }).fill("1996");
    await detail.getByRole("button", { name: "保存标签" }).click();
    await expect(detail.locator(".detail-tags")).toContainText("1996");
    await expect(
      detail.locator(".attached-notes + .editable-text"),
    ).toBeVisible();
    await detail.getByRole("button", { name: "编辑相连技术" }).click();
    await detail
      .getByRole("combobox", { name: `${b.name} 的关系`, exact: true })
      .selectOption("incoming:Uses");
    await expect(
      detail
        .locator(".connected-list")
        .getByRole("combobox", { name: `${b.name} 的关系`, exact: true }),
    ).toHaveValue("incoming:Uses");
    await detail
      .locator(".connection-target")
      .filter({ hasText: b.name })
      .click();
    await expect(detail.locator("h2")).toHaveText(b.name);
    expect(await detail.evaluate((el) => el.scrollTop)).toBe(0);
    await detail.getByRole("button", { name: "编辑相连技术" }).click();
    await expect(
      detail.getByRole("combobox", { name: `${a.name} 的关系`, exact: true }),
    ).toHaveValue("outgoing:Uses");
    await detail
      .getByRole("combobox", { name: `${a.name} 的关系`, exact: true })
      .selectOption("none");
    await expect(
      detail
        .locator(".connected-list .connection-target")
        .filter({ hasText: a.name }),
    ).toHaveCount(0);
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await page.getByRole("button", { name: /^论文库/ }).click();
    await page.getByText(w.papers[0].title, { exact: true }).first().click();
    await expect(
      detail.locator(".attached-notes + .paper-document-status"),
    ).toBeVisible();
  } finally {
    await request.delete(`/api/workspaces/${id}/notes/${created.note.id}`);
    await request.patch(`/api/workspaces/${id}/nodes/${a.id}`, {
      data: { year: a.year },
    });
    await request.put(
      `/api/workspaces/${id}/nodes/${a.id}/connections/${b.id}`,
      {
        data: {
          relation: previousEdge?.relation || null,
          direction: previousEdge?.source === a.id ? "outgoing" : "incoming",
        },
      },
    );
  }
});

test("unconnected technology search paginates at twenty and leaves connected peers visible", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((s: { demo: boolean }) => s.demo).id;
  const w = await (await request.get(`/api/workspaces/${id}`)).json();
  w.nodes = Array.from({ length: 48 }, (_, i) => ({
    ...w.nodes[0],
    id: `tech-${i}`,
    name: `技术 ${String(i).padStart(2, "0")}`,
    englishName: `Technique ${i}`,
    chineseName: `技术 ${i}`,
  }));
  w.edges = [
    { id: "one", source: "tech-1", target: "tech-0", relation: "Uses" },
  ];
  await page.route(`**/api/workspaces/${id}`, (route) =>
    route.fulfill({ json: w }),
  );
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    id,
  );
  await page.goto("/");
  await page.locator('.graph-node[data-node-id="tech-0"]').click();
  await page.getByRole("button", { name: "编辑相连技术" }).click();
  await expect(page.locator(".unconnected-list .connection-row")).toHaveCount(
    20,
  );
  await expect(page.locator(".connected-list .connection-row")).toHaveCount(1);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".unconnected-list .connection-row")).toHaveCount(
    20,
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".unconnected-list .connection-row")).toHaveCount(
    6,
  );
  await page
    .getByRole("textbox", { name: "搜索未相连技术" })
    .fill("Technique 47");
  await expect(page.locator(".unconnected-list .connection-row")).toHaveCount(
    1,
  );
  await expect(page.locator(".connection-pagination")).toContainText("1 / 1");
  await expect(page.locator(".connected-list .connection-row")).toHaveCount(1);
});

test("web notes retain Markdown modes and attachments while immersive editing is hidden", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "笔记库", exact: true }).click();
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记正文" })
    .fill("## 理解记录\n\n**保留修改**");
  await expect(page.locator(".md-preview strong")).toHaveText("保留修改");
  await expect(page.getByRole("button", { name: "沉浸编辑" })).toHaveCount(0);
  await expect(page.getByText("关联论文与技术节点（0）")).toBeVisible();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "笔记正文" })).toHaveValue(
    /保留修改/,
  );
});

test("pin button uses a dark active and light inactive state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { anistudyDesktop: object }).anistudyDesktop = {
      hide: () => {},
    };
  });
  await page.route("**/api/settings", (route) =>
    route.fulfill({ json: { noteAlwaysOnTop: false } }),
  );
  await page.route("**/api/preferences", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto("/?quick-notes=1");
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  const pin = page.getByRole("button", { name: "置顶", exact: true });
  await expect(pin).toHaveAttribute("aria-pressed", "false");
  const light = await pin.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => pin.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toEqual(light);
  await expect(pin).toHaveCSS("color", "rgb(255, 255, 255)");
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "false");
});
