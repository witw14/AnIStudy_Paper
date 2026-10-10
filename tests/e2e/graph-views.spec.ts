import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function graphFixture(
  page: Page,
  request: APIRequestContext,
  minor = false,
) {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((w: { demo: boolean }) => w.demo).id;
  const data = await (await request.get(`/api/workspaces/${id}`)).json();
  const base = data.nodes[0];
  data.nodes = [
    "target",
    "required",
    "component",
    "inspiration",
    "extension",
    "improved",
    "replacement",
    "popular",
    "introduced",
    "isolated",
  ].map((id, i) => ({
    ...base,
    id,
    name: id,
    year: 2000 + i,
    category: i % 2 ? "Component" : "Architecture",
    directions: ["Classification"],
    direction: "Classification",
    paperIds: ["p"],
    importance: "major",
    evidence: id === "required" ? "missing" : "supported",
    status: i % 2 ? "unlearned" : "learned",
  }));
  data.nodes.find((n: { id: string }) => n.id === "isolated").paperIds = [];
  data.edges = [
    ["required", "target", "Requires"],
    ["component", "target", "Uses"],
    ["inspiration", "target", "Inspired by"],
    ["target", "extension", "Extends"],
    ["target", "improved", "Improves upon"],
    ["target", "replacement", "Replaces"],
    ["target", "popular", "Popularized by"],
    ["introduced", "target", "Introduced by"],
  ].map(([source, target, relation], i) => ({
    id: "edge-" + i,
    source,
    target,
    relation,
  }));
  data.routes = [];
  if (minor) {
    const target = data.nodes.find((n: { id: string }) => n.id === "target");
    target.importance = "minor";
    target.importanceReason = "硬件限制下的训练实现细节，影响局限于本篇实验。";
  }
  await page.route(`**/api/workspaces/${id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  return data;
}

test("minor techniques are hollow small rings with accessible hit targets in all views", async ({
  page,
  request,
}) => {
  await graphFixture(page, request, true);
  const node = page.locator('.graph-node[data-node-id="target"]');
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "7");
  await expect(node.locator(".node-shape")).toHaveAttribute("fill", "#fafbf9");
  await expect(node.locator(".node-symbol")).toHaveCount(0);
  await expect(node.locator(".node-hit-area")).toHaveAttribute("r", "22");
  await expect(node.locator(".node-learned-dot")).toHaveAttribute("r", "2.5");
  await node.locator(".node-hit-area").hover();
  await expect(node).toHaveClass(/active/);
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("重要性判断", { exact: true })).toBeVisible();
  await expect(
    page.getByText("硬件限制下的训练实现细节，影响局限于本篇实验。", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "以此技术为中心", exact: true })
    .click();
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "7");
  await expect(node).toHaveAttribute("data-focus", "true");
  await page.screenshot({
    path: "test-results/minor-node-focus.png",
    fullPage: true,
  });
});

test("both graph views pan with the left mouse button without selecting dragged nodes or scrolling the page", async ({
  page,
  request,
}) => {
  const data = await graphFixture(page, request);
  data.papers = Array.from({ length: 24 }, (_, i) => ({
    ...data.papers[0],
    id: `paper-${i}`,
    year: 1990 + i,
    inLibrary: true,
  }));
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  for (const name of ["技术图谱", "论文图谱"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByLabel("图谱窗口高度", { exact: true }).focus();
    await page.getByLabel("图谱窗口高度", { exact: true }).press("Home");
    const scroll = page.getByLabel("图谱滚动区域", { exact: true });
    await scroll.scrollIntoViewIfNeeded();
    await scroll.evaluate((el) => {
      el.scrollLeft = 100;
      el.scrollTop = 60;
    });
    const start = await scroll.evaluate((el) => ({
      left: el.scrollLeft,
      top: el.scrollTop,
    }));
    const pageY = await page.evaluate(
      () => document.querySelector(".main-scroll")?.scrollTop || window.scrollY,
    );
    const rect = (await scroll.boundingBox())!;
    await page.mouse.move(
      rect.x + Math.min(rect.width * 0.7, 400),
      rect.y + Math.min(rect.height * 0.6, 350),
    );
    await page.mouse.down();
    await page.mouse.move(
      rect.x + Math.min(rect.width * 0.7, 400) - 130,
      rect.y + Math.min(rect.height * 0.6, 350) - 80,
      { steps: 8 },
    );
    await page.mouse.up();
    const end = await scroll.evaluate((el) => ({
      left: el.scrollLeft,
      top: el.scrollTop,
    }));
    expect(end.left).toBeGreaterThan(start.left + 90);
    expect(end.top).toBeGreaterThan(start.top + 40);
    expect(
      await page.evaluate(
        () =>
          document.querySelector(".main-scroll")?.scrollTop || window.scrollY,
      ),
    ).toBe(pageY);
    await expect(page.getByRole("dialog", { name: "节点详情" })).toHaveCount(0);
  }
});

test("catalog is collapsed by default and checkbox groups filter by OR within groups and AND across groups", async ({
  page,
  request,
}) => {
  await graphFixture(page, request);
  const catalog = page.locator(".node-catalog");
  await expect(catalog).not.toHaveAttribute("open", "");
  await expect(catalog.locator(".node-list-card").first()).not.toBeVisible();
  await catalog.locator("summary").click();
  await expect(catalog.locator(".node-list-card")).toHaveCount(10);
  await catalog.getByLabel("待补足知识", { exact: true }).check();
  await expect(catalog.locator(".node-list-card")).toHaveCount(1);
  await expect(catalog.locator(".node-list-card")).toContainText("required");
  await catalog.getByLabel("架构", { exact: true }).check();
  await expect(catalog.locator(".node-list-card")).toHaveCount(0);
  await catalog.getByLabel("组件", { exact: true }).check();
  await expect(catalog.locator(".node-list-card")).toHaveCount(1);
  await catalog.getByLabel("已有资料支持", { exact: true }).check();
  await expect(catalog.locator(".node-list-card")).toHaveCount(10);
  await catalog.getByRole("button", { name: "清空筛选" }).click();
  await expect(catalog.locator("input:checked")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(catalog).not.toHaveAttribute("open", "");
});

test("cluster names and positions persist, focus opens through details and can switch center without changing records", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const data = await graphFixture(page, request);
  await expect(
    page.getByRole("img", { name: "技术关系聚类图谱" }),
  ).toBeVisible();
  const before = await page
    .locator(".graph-node")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((n) => [
          n.getAttribute("data-node-id"),
          [n.getAttribute("data-x"), n.getAttribute("data-y")],
        ]),
      ),
    );
  await page
    .getByRole("button", { name: /重命名技术群/ })
    .first()
    .click();
  await page.getByLabel("技术群名称", { exact: true }).fill("我的技术群");
  await page.getByRole("button", { name: "保存群名" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "重命名技术群 我的技术群", exact: true }),
  ).toBeAttached();
  data.nodes.push({ ...data.nodes[0], id: "new-node", name: "new node" });
  data.edges.push({
    id: "new-edge",
    source: "component",
    target: "new-node",
    relation: "Uses",
  });
  await page.reload();
  await expect(page.locator(".graph-node")).toHaveCount(data.nodes.length);
  const after = await page
    .locator(".graph-node")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((n) => [
          n.getAttribute("data-node-id"),
          [n.getAttribute("data-x"), n.getAttribute("data-y")],
        ]),
      ),
    );
  for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id]);
  await page.getByRole("button", { name: "查看 target", exact: true }).click();
  await page
    .getByRole("button", { name: "以此技术为中心", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "技术目标中心图谱" }),
  ).toBeVisible();
  await expect(page.locator('.graph-node[data-focus="true"]')).toHaveAttribute(
    "data-node-id",
    "target",
  );
  await expect(
    page.locator('.graph-node[data-node-id="isolated"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.graph-node[data-node-id="new-node"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.graph-region[data-region="prerequisites"]'),
  ).toContainText("必要前置");
  const shapes = await page
    .locator(".graph-edge")
    .evaluateAll((nodes) =>
      nodes.map((n) =>
        [
          n.getAttribute("stroke-width"),
          n.getAttribute("stroke-dasharray"),
          n.nextElementSibling?.getAttribute("class"),
        ].join("|"),
      ),
    );
  expect(new Set(shapes).size).toBe(8);
  await expect(page.locator(".edge-hollow-center")).toHaveCount(4); // two paths + their legend samples
  await page.getByRole("button", { name: "查看 target", exact: true }).hover();
  await expect(page.locator(".graph-edge.highlighted")).toHaveCount(8);
  await expect(page.locator(".edge-label")).toHaveCount(0);
  await page.getByRole("button", { name: "查看 target", exact: true }).focus();
  await expect(page.locator(".edge-label")).toHaveCount(0);
  await page.screenshot({ path: "test-results/target-focus.png" });
  await page
    .getByRole("button", { name: "查看 extension", exact: true })
    .click();
  await page
    .getByRole("button", { name: "以此技术为中心", exact: true })
    .click();
  await expect(page.locator('.graph-node[data-focus="true"]')).toHaveAttribute(
    "data-node-id",
    "extension",
  );
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await page.getByRole("button", { name: "退出目标中心", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "技术关系聚类图谱" }),
  ).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(11);
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "技术演化时间图谱" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关系聚类", exact: true }).click();
  await page.screenshot({ path: "test-results/relation-clusters.png" });
});

test("wheel scrolling stays inside graph at either boundary and when graph has no vertical overflow", async ({
  page,
  request,
}) => {
  await graphFixture(page, request);
  const area = page.getByLabel("图谱滚动区域", { exact: true });
  const main = page.locator(".main-content");
  await main.evaluate((el) => {
    el.scrollTop = 100;
  });
  await area.hover({ position: { x: 40, y: 100 } });
  await area.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  let outer = await main.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(120);
  expect(await main.evaluate((el) => el.scrollTop)).toBe(outer);
  await area.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(120);
  expect(await main.evaluate((el) => el.scrollTop)).toBe(outer);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => area.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "查看 isolated", exact: true })
    .click();
  await page
    .getByRole("button", { name: "以此技术为中心", exact: true })
    .click();
  expect(await area.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(
    true,
  );
  await area.hover({ position: { x: 40, y: 100 } });
  outer = await main.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(120);
  expect(await main.evaluate((el) => el.scrollTop)).toBe(outer);
});
