import { test, expect } from "@playwright/test";

test("custom technology editor saves all information, attaches papers and updates both ends of a relation", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((s: { demo: boolean }) => s.demo).id;
  const w = await (await request.get(`/api/workspaces/${id}`)).json();
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    id,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.getByRole("button", { name: "新增", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "新增技术节点",
    exact: true,
  });
  await dialog
    .getByLabel("节点标题", { exact: true })
    .fill("Manual Test Technique");
  await dialog
    .getByLabel("英文标题", { exact: true })
    .fill("Manual Test Technique");
  await dialog.getByLabel("中文标题", { exact: true }).fill("自定义测试技术");
  await dialog.getByLabel("年份", { exact: true }).fill("1996");
  await dialog.getByLabel("技术种类", { exact: true }).fill("自定义组件");
  await dialog
    .getByLabel("研究方向", { exact: true })
    .fill("研究方法,基础知识");
  await dialog.getByLabel("重要性", { exact: true }).selectOption("minor");
  await dialog.getByLabel("学习状态", { exact: true }).selectOption("learned");
  await dialog
    .getByLabel("技术说明（Markdown）", { exact: true })
    .fill("**可手动编辑的说明**");
  await dialog
    .getByLabel("重要性判断理由", { exact: true })
    .fill("一个局部实现细节。");
  await dialog
    .getByLabel("隐藏节点（主要 / 极简模式）", { exact: true })
    .check();
  await dialog.getByLabel("搜索关联技术").fill(w.nodes[0].name);
  await dialog
    .getByLabel(`新节点与 ${w.nodes[0].name} 的关系`, { exact: true })
    .selectOption("incoming:Uses");
  await dialog.locator("summary").filter({ hasText: "论文关系" }).click();
  await dialog.getByLabel("搜索关联论文").fill(w.papers[0].title);
  await dialog
    .getByLabel(`与论文 ${w.papers[0].title} 的关系`, { exact: true })
    .selectOption("Uses");
  await dialog
    .getByLabel("在论文中的作用", { exact: true })
    .fill("组合论文中的信息。");
  await page.screenshot({ path: "test-results/create-technology.png" });
  await dialog
    .getByRole("button", { name: "创建技术节点", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const detail = page.getByRole("dialog", { name: "节点详情", exact: true });
  await expect(detail.locator("h2")).toHaveText("Manual Test Technique");
  const saved = await (await request.get(`/api/workspaces/${id}`)).json();
  const node = saved.nodes.find(
    (n: { englishName: string }) => n.englishName === "Manual Test Technique",
  );
  expect(node.year).toBe(1996);
  expect(node.importance).toBe("minor");
  expect(node.status).toBe("learned");
  expect(node.paperIds).toEqual([w.papers[0].id]);
  expect(
    saved.edges.some(
      (e: { source: string; target: string; relation: string }) =>
        e.source === w.nodes[0].id &&
        e.target === node.id &&
        e.relation === "Uses",
    ),
  ).toBe(true);
  await detail
    .locator(".connection-target")
    .filter({ hasText: w.nodes[0].name })
    .click();
  await expect(detail.locator("h2")).toHaveText(w.nodes[0].name);
  await expect(
    detail.locator(".connection-target").filter({ hasText: node.name }),
  ).toBeVisible();
  await request.delete(`/api/workspaces/${id}/nodes/${node.id}`);
});
