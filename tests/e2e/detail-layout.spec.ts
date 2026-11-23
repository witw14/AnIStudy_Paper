import { test, expect } from "@playwright/test";

test("details keep the requested order, edit technical sections independently, and edit paper years and reciprocal paper relationships", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json(),
    id = spaces.find((s: { demo: boolean }) => s.demo).id;
  const original = await (await request.get(`/api/workspaces/${id}`)).json();
  const node = original.nodes[0],
    [a, b] = original.papers;
  const previous = original.paperEdges.find(
    (e: { source: string; target: string }) =>
      (e.source === a.id && e.target === b.id) ||
      (e.source === b.id && e.target === a.id),
  );
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    id,
  );
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await page.locator(`.graph-node[data-node-id="${node.id}"]`).click();
    const detail = page.getByRole("dialog", { name: "节点详情", exact: true });
    await expect(
      detail.locator(".detail-icon,.eyebrow,.importance-editor,.evidence-note"),
    ).toHaveCount(0);
    await expect(
      detail.getByRole("button", { name: "加入学习路线", exact: true }),
    ).toHaveCount(0);
    const order = await detail
      .locator(
        "h2,.detail-tag-heading,.detail-status,.detail-main-actions,.attached-notes,h4,.detail-footer",
      )
      .evaluateAll((elements) =>
        elements.map((e) =>
          e.tagName === "H4" ? e.textContent : e.className || e.tagName,
        ),
      );
    expect(order).toEqual([
      "H2",
      "detail-tag-heading",
      "detail-status",
      "detail-main-actions",
      "attached-notes",
      "关联笔记",
      "是什么",
      "为什么值得理解",
      "重要性判断",
      "关键论文",
      "相连技术",
      "detail-footer",
    ]);
    const tags = await detail.locator(".detail-tag-heading").boundingBox(),
      pencil = await detail
        .getByRole("button", { name: "编辑标签", exact: true })
        .boundingBox();
    expect(pencil!.y).toBeGreaterThanOrEqual(tags!.y);
    expect(pencil!.y + pencil!.height).toBeLessThanOrEqual(
      tags!.y + tags!.height + 1,
    );
    await detail
      .getByRole("button", { name: "编辑是什么", exact: true })
      .click();
    await detail
      .getByRole("textbox", { name: "是什么", exact: true })
      .fill("**独立编辑的技术说明**");
    await expect(
      detail.getByRole("heading", { name: "为什么值得理解", exact: true }),
    ).toBeVisible();
    await detail.getByRole("button", { name: "保存修改", exact: true }).click();
    await detail
      .getByRole("button", { name: "编辑重要性判断", exact: true })
      .click();
    await detail
      .getByRole("textbox", { name: "重要性判断", exact: true })
      .fill("用户补充的判断依据。");
    await detail.getByRole("button", { name: "保存修改", exact: true }).click();
    expect(
      (await (await request.get(`/api/workspaces/${id}`)).json()).nodes.find(
        (n: { id: string }) => n.id === node.id,
      ).importanceReason,
    ).toBe("用户补充的判断依据。");
    await page.screenshot({
      path: "test-results/technology-details-layout.png",
    });
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await page.getByRole("button", { name: /^论文库/ }).click();
    await page.getByRole("button", { name: a.title, exact: true }).click();
    await expect(
      detail.getByRole("button", { name: "打开PDF", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "打开HTML", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "论文对话", exact: true }),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "整理论文技术", exact: true }),
    ).toBeVisible();
    await expect(
      detail.locator(".verify-form,.detail-icon,.eyebrow"),
    ).toHaveCount(0);
    const paperOrder = await detail
      .locator(
        "h2,.paper-year-editor,.editable-heading h4,.detail-status,.paper-reading-actions,.detail-main-actions,.paper-document-status h4,.connections-heading h4,.detail-key-technologies h4,.detail-footer",
      )
      .evaluateAll((elements) =>
        elements.map((e) =>
          e.tagName === "H4" ? e.textContent : e.className || e.tagName,
        ),
      );
    expect(paperOrder).toEqual([
      "paper-detail-title",
      "paper-year-editor",
      "阅读导览",
      "detail-status",
      "paper-reading-actions",
      "detail-main-actions",
      "论文状态",
      "相连论文",
      "关键技术",
      "detail-footer",
    ]);
    await detail
      .getByRole("button", { name: "编辑论文年份", exact: true })
      .click();
    await detail.getByLabel("论文年份", { exact: true }).fill("1993");
    await detail.getByRole("button", { name: "保存年份", exact: true }).click();
    await expect(detail.locator(".authors")).toContainText("1993");
    await detail
      .getByRole("button", { name: "编辑相连论文", exact: true })
      .click();
    await detail
      .getByLabel(`${b.title} 的关系`, { exact: true })
      .selectOption("incoming:Extends");
    await detail
      .locator(".connected-papers .connection-target")
      .filter({ hasText: b.title })
      .click();
    await expect(detail.locator("h2")).toHaveText(b.title);
    expect(await detail.evaluate((e) => e.scrollTop)).toBe(0);
    await detail
      .getByRole("button", { name: "编辑相连论文", exact: true })
      .click();
    await expect(
      detail.getByLabel(`${a.title} 的关系`, { exact: true }),
    ).toHaveValue("outgoing:Extends");
    await page.screenshot({ path: "test-results/paper-details-layout.png" });
    await detail
      .getByLabel(`${a.title} 的关系`, { exact: true })
      .selectOption("none");
    expect(
      (
        await (await request.get(`/api/workspaces/${id}`)).json()
      ).paperEdges.some(
        (e: { source: string; target: string }) =>
          (e.source === a.id && e.target === b.id) ||
          (e.source === b.id && e.target === a.id),
      ),
    ).toBe(false);
  } finally {
    await request.patch(`/api/workspaces/${id}/papers/${a.id}`, {
      data: { year: a.year },
    });
    await request.patch(`/api/workspaces/${id}/nodes/${node.id}`, {
      data: {
        description: node.description,
        importanceReason: node.importanceReason || "",
      },
    });
    await request.put(
      `/api/workspaces/${id}/papers/${a.id}/connections/${b.id}`,
      {
        data: {
          relation: previous?.relation || null,
          direction: previous?.source === a.id ? "outgoing" : "incoming",
        },
      },
    );
  }
});
