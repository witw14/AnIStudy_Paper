import { test, expect } from "@playwright/test";

test("domain categories and graph height stay isolated between workspaces", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((w: { demo: boolean }) => w.demo);
  const base = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  const medical = {
    ...base,
    id: "medical-test",
    name: "生物传感",
    demo: false,
    nodes: [
      {
        ...base.nodes[0],
        id: "lfa",
        name: "Lateral flow assay",
        category: "assay",
        direction: "poc",
        directions: ["poc"],
      },
    ],
    edges: [],
    taxonomy: {
      directions: [{ id: "poc", name: "即时诊断" }],
      categories: [{ id: "assay", name: "检测平台" }],
    },
  };
  const empty = {
    ...medical,
    id: "empty-test",
    name: "新领域",
    nodes: [],
    taxonomy: { directions: [], categories: [] },
  };
  await page.route("**/api/workspaces", (route) =>
    route.fulfill({
      json: [medical, empty, demo].map((w) => ({
        id: w.id,
        name: w.name,
        demo: w.demo,
      })),
    }),
  );
  await page.route("**/api/workspaces/medical-test", (route) =>
    route.fulfill({ json: medical }),
  );
  await page.route("**/api/workspaces/empty-test", (route) =>
    route.fulfill({ json: empty }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(page.getByRole("button", { name: /^即时诊断/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^图像分类/ })).toHaveCount(0);
  await expect(page.locator(".category-legend")).toContainText("检测平台");
  await page.getByRole("button", { name: /^即时诊断/ }).click();
  await expect(page.locator(".graph-node")).toHaveCount(1);
  const height = page.getByRole("slider", { name: "图谱窗口高度" });
  await height.focus();
  await height.press("Home");
  await expect(height).toHaveValue("360");
  await page
    .getByRole("button", { name: "查看 Lateral flow assay", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "节点详情" })).toContainText(
    "检测平台",
  );
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.screenshot({ path: "test-results/domain-taxonomy.png" });
  await page
    .getByLabel("切换研究空间", { exact: true })
    .selectOption("empty-test");
  await expect(page.locator(".graph-tabs button")).toHaveCount(1);
  await expect(height).toHaveValue("982");
  await page.getByLabel("切换研究空间", { exact: true }).selectOption(demo.id);
  await expect(page.getByRole("button", { name: /^图像分类/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^即时诊断/ })).toHaveCount(0);
  await page
    .getByLabel("切换研究空间", { exact: true })
    .selectOption("medical-test");
  await expect(height).toHaveValue("360");
  await expect(page.locator(".graph-node")).toHaveCount(1);
});

test("spacing sliders support dragging, persist after reload and stay independent per graph", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  const horizontal = page.getByRole("slider", { name: "横向节点间距" });
  const vertical = page.getByRole("slider", { name: "纵向节点间距" });
  const bounds = (await horizontal.boundingBox())!;
  await page.mouse.move(bounds.x + 18, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width - 8,
    bounds.y + bounds.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  const horizontalValue = await horizontal.inputValue();
  expect(Number(horizontalValue)).toBeGreaterThan(350);
  await vertical.focus();
  await vertical.press("End");
  await expect(vertical).toHaveValue("420");
  const left = Number(
    await page
      .locator('.graph-node[data-node-id="cnn"]')
      .getAttribute("data-x"),
  );
  const right = Number(
    await page
      .locator('.graph-node[data-node-id="residual"]')
      .getAttribute("data-x"),
  );
  expect(right - left).toEqual(Number(horizontalValue));
  const top = Number(
    await page
      .locator('.graph-node[data-node-id="bn-tech"]')
      .getAttribute("data-y"),
  );
  const bottom = Number(
    await page
      .locator('.graph-node[data-node-id="residual"]')
      .getAttribute("data-y"),
  );
  expect(bottom - top).toBe(420);
  await page.reload();
  await expect(horizontal).toHaveValue(horizontalValue);
  await expect(vertical).toHaveValue("420");
  await page.getByRole("button", { name: "论文图谱", exact: true }).click();
  await expect(horizontal).toHaveValue("270");
  await expect(vertical).toHaveValue("220");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(horizontal).toHaveValue(horizontalValue);
  await page.getByRole("button", { name: "重置节点间距" }).click();
  await expect(horizontal).toHaveValue("270");
  await expect(vertical).toHaveValue("220");
  await page.screenshot({ path: "test-results/spacing-controls.png" });
});

test("compact spacing and graph viewport adapt to browser size", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  const horizontal = page.getByRole("slider", { name: "横向节点间距" });
  const vertical = page.getByRole("slider", { name: "纵向节点间距" });
  await horizontal.focus();
  await horizontal.press("Home");
  await vertical.focus();
  await vertical.press("Home");
  await expect(horizontal).toHaveValue("160");
  await expect(vertical).toHaveValue("120");
  await expect(page.locator(".graph-spacing .zoom-controls")).toBeVisible();
  await expect(page.locator(".graph-bottom .zoom-controls")).toHaveCount(0);
  for (const size of [
    { width: 1512, height: 982 },
    { width: 1250, height: 760 },
    { width: 800, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const box = (await page.locator(".graph-card").boundingBox())!;
        return Math.round(box.height);
      })
      .toBe(size.height);
    const scroll = (await page.locator(".graph-scroll").boundingBox())!;
    expect(scroll.height).toBeGreaterThan(60);
  }
  await page.setViewportSize({ width: 1512, height: 982 });
  const heightSlider = page.getByRole("slider", { name: "图谱窗口高度" });
  await expect(heightSlider).toHaveValue("982");
  const initialBox = (await page.locator(".graph-card").boundingBox())!;
  expect(initialBox.y + initialBox.height).toBeGreaterThan(982);
  await heightSlider.focus();
  await heightSlider.press("Home");
  await expect(heightSlider).toHaveValue("360");
  await expect
    .poll(async () =>
      Math.round((await page.locator(".graph-card").boundingBox())!.height),
    )
    .toBe(360);
  await page.reload();
  await expect(heightSlider).toHaveValue("360");
  await page.getByRole("button", { name: "论文图谱", exact: true }).click();
  await expect(heightSlider).toHaveValue("982");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(heightSlider).toHaveValue("360");
  await page.getByRole("button", { name: "恢复默认图谱高度" }).click();
  await expect(heightSlider).toHaveValue("982");
  await page.screenshot({ path: "test-results/compact-viewport.png" });
});

test("chat thinking controls persist and disable effort when thinking is off", async ({
  page,
}) => {
  let settings = {
    deepThinking: "auto",
    reasoningEffort: "auto",
    reasoningCapabilities: { supported: true, efforts: ["low", "high", "max"] },
  };
  await page.route("**/api/settings", (route) =>
    route.fulfill({ json: settings }),
  );
  await page.route("**/api/preferences", (route) => {
    settings = { ...settings, ...route.request().postDataJSON() };
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/");
  const thinking = page.getByLabel("深度思考", { exact: true });
  const effort = page.getByLabel("思考强度", { exact: true });
  await thinking.selectOption("enabled");
  await expect(thinking).toHaveValue("enabled");
  await effort.selectOption("max");
  await expect(effort).toHaveValue("max");
  await page.reload();
  await expect(thinking).toHaveValue("enabled");
  await expect(effort).toHaveValue("max");
  await thinking.selectOption("disabled");
  await expect(effort).toBeDisabled();
  await thinking.selectOption("enabled");
  await expect(effort).toBeEnabled();
  await page.screenshot({ path: "test-results/thinking-controls.png" });
});

test("hover isolates graph relations, dense labels do not collide and reverse arrows attach correctly", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((w: { demo: boolean }) => w.demo).id;
  const data = await (await request.get(`/api/workspaces/${id}`)).json();
  const base = data.nodes.find((n: { id: string }) => n.id === "residual");
  for (let i = 0; i < 9; i++)
    data.nodes.push({
      ...base,
      id: "dense-" + i,
      name: "Very Long Technical Component Label Number " + i,
      year: 2015,
    });
  data.edges.push({
    id: "reverse",
    source: "vit-tech",
    target: "residual",
    relation: "Requires",
  });
  await page.route(`**/api/workspaces/${id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect(page.locator(".edge-label")).toHaveCount(0);
  const node = page.getByRole("button", {
    name: "查看 Residual Connection",
    exact: true,
  });
  await node.scrollIntoViewIfNeeded();
  await node.hover();
  await expect(page.locator(".graph-edge.highlighted")).toHaveCount(3);
  await expect(page.locator(".edge-label")).toHaveCount(0);
  await expect(page.locator(".graph-node.related")).toHaveCount(4);
  const overlap = await page.locator(".knowledge-graph").evaluate((svg) => {
    const rects = Array.from(svg.querySelectorAll(".node-label")).map((n) =>
      (n as SVGGraphicsElement).getBBox(),
    );
    return rects.some((a, i) =>
      rects
        .slice(i + 1)
        .some(
          (b) =>
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y,
        ),
    );
  });
  expect(overlap).toBe(false);
  const reverse = page.locator(
    '.graph-edge[data-source="vit-tech"][data-target="residual"]',
  );
  const targetX = Number(await node.getAttribute("data-x"));
  const path = await reverse.getAttribute("d");
  const end = path!.trim().split(/[ ,]+/).slice(-2).map(Number);
  expect(end[0]).toBeGreaterThan(targetX);
  await page.screenshot({ path: "test-results/graph-hover.png" });
  await page.getByRole("heading", { level: 1 }).hover();
  await expect(page.locator(".edge-label")).toHaveCount(0);
  await page.getByRole("button", { name: /^图像分类/ }).click();
  await expect(
    page.getByRole("button", { name: "查看 Residual Connection", exact: true }),
  ).toHaveCount(1);
});

test("assistant messages render markdown, tables and mathematics while filtering active HTML", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((w: { demo: boolean }) => w.demo).id;
  const data = await (await request.get(`/api/workspaces/${id}`)).json();
  data.messages = [
    {
      id: "markdown",
      role: "assistant",
      mode: "research",
      time: new Date().toISOString(),
      content:
        "## 论文理解\n\n**残差连接**与 [原论文](https://arxiv.org/abs/1512.03385)\n\n- 第一项\n- 第二项\n\n| 方法 | 年份 |\n| --- | --- |\n| ResNet | 2015 |\n\n```python\nx = 1\n```\n\n\\[y = F(x) + x\\]\n\n<script>window.injected = true</script>",
    },
  ];
  await page.route(`**/api/workspaces/${id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  const markdown = page.locator(".message.assistant .markdown");
  await expect(markdown.locator("h2")).toHaveText("论文理解");
  await expect(markdown.locator("strong")).toHaveText("残差连接");
  await expect(markdown.locator("table")).toBeVisible();
  await expect(markdown.locator("pre code")).toContainText("x = 1");
  await expect(markdown.locator(".katex")).toHaveCount(1);
  await expect(markdown.locator("li")).toHaveCount(2);
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await page.screenshot({ path: "test-results/markdown.png" });
});

test("English terminology preference saves without model credentials", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开偏好选项", exact: true }).click();
  const checkbox = page.getByRole("checkbox", { name: "保留英文专有名词" });
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/settings")).json()).preferEnglishTerms,
    )
    .toBe(false);
  await checkbox.check();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/settings")).json()).preferEnglishTerms,
    )
    .toBe(true);
});
