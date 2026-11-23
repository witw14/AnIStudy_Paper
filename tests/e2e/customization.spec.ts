import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const defaults = {
  theme: "forest",
  nodeSizes: { landmark: 78, major: 62, normal: 52, minor: 14 },
  reduceMotion: false,
  preferEnglishTerms: true,
  timelineAutoWrap: false,
  timelineColumnLimit: 10,
  chatEvidencePolicy: "supplement",
};
test.beforeEach(async ({ context, request }) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    demo.id,
  );
});
test.afterEach(async ({ request }) => {
  await request.patch("/api/preferences", { data: defaults });
});

test("year wrapping saves from the bottom button and applies the node limit in technology and paper timelines", async ({
  page,
  request,
}) => {
  await request.patch("/api/preferences", { data: defaults });
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  const w = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  w.nodes = Array.from({ length: 5 }, (_, i) => ({
    ...w.nodes[0],
    id: `wrap-${i}`,
    name: `技术 ${i}`,
    englishName: `Technique ${i}`,
    chineseName: `技术 ${i}`,
    year: 2020,
  }));
  w.edges = [];
  w.papers = Array.from({ length: 5 }, (_, i) => ({
    ...w.papers[0],
    id: `paper-${i}`,
    title: `Paper ${i}`,
    short: `Paper ${i}`,
    year: 2020,
  }));
  w.paperEdges = [];
  await page.route(`**/api/workspaces/${demo.id}`, (route) =>
    route.fulfill({ json: w }),
  );
  const columnCounts = () =>
    page.locator(".graph-node").evaluateAll((nodes) => {
      const columns: Record<string, number> = {};
      for (const node of nodes) {
        const x = node.getAttribute("data-x")!;
        columns[x] = (columns[x] || 0) + 1;
      }
      return Object.values(columns);
    });
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect.poll(columnCounts).toEqual([5]);
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const wrap = dialog.getByRole("checkbox", {
    name: "年份浏览自动换列",
    exact: true,
  });
  const limit = dialog.getByRole("spinbutton", {
    name: "单列最大节点数",
    exact: true,
  });
  await expect(wrap).not.toBeChecked();
  await expect(limit).toBeDisabled();
  await wrap.check();
  await limit.fill("2");
  await dialog
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(columnCounts).toEqual([2, 2, 1]);
  await expect(page.locator(".year-label")).toHaveText([
    "2020 · 1/3",
    "2020 · 2/3",
    "2020 · 3/3",
  ]);
  await page.reload();
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect.poll(columnCounts).toEqual([2, 2, 1]);
  await page.screenshot({ path: "test-results/timeline-wrapped.png" });
  await page.getByRole("button", { name: "论文图谱", exact: true }).click();
  await expect.poll(columnCounts).toEqual([2, 2, 1]);
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(wrap).toBeChecked();
  await expect(limit).toHaveValue("2");
  await wrap.uncheck();
  await dialog
    .getByRole("button", { name: "保存外观配置", exact: true })
    .click();
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("已保存");
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await expect.poll(columnCounts).toEqual([5]);
});

test("bottom save commits all appearance values even with empty AI fields and survives reopening and reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const sizes = { landmark: 90, major: 70, normal: 44, minor: 18 };
  for (const [name, value] of [
    ["里程碑", 90],
    ["重要", 70],
    ["普通", 44],
    ["次要", 18],
  ] as const)
    await dialog
      .getByRole("slider", { name: `${name}节点直径` })
      .fill(String(value));
  await dialog.getByRole("button", { name: "暖砂金", exact: true }).click();
  await dialog.getByLabel("减少界面动效", { exact: true }).check();
  await expect(dialog.locator('input[name="baseUrl"]')).toHaveCount(0);
  await expect(dialog.locator('input[name="model"]')).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = await (await request.get("/api/settings")).json();
  expect(saved.nodeSizes).toEqual(sizes);
  expect(saved.theme).toBe("amber");
  expect(saved.reduceMotion).toBe(true);
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(
    dialog.getByRole("slider", { name: "里程碑节点直径" }),
  ).toHaveValue("90");
  await expect(
    dialog.getByRole("slider", { name: "次要节点直径" }),
  ).toHaveValue("18");
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "amber");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(
    page.locator('.graph-node[data-node-id="cnn"] .node-shape'),
  ).toHaveAttribute("r", "35");
  const exported = await (await request.get("/api/preferences/export")).json();
  expect(exported.settings.nodeSizes).toEqual(sizes);
});

test("mobile gear keeps configuration usable and can edit model API settings", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await (await request.get("/api/settings")).json();
  let publicSettings = original;
  let saved: Record<string, unknown> = {};
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      publicSettings = {
        ...original,
        baseUrl: saved.baseUrl,
        model: saved.model,
        hasKey: true,
      };
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: publicSettings });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型设置" });
  await expect(dialog).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: "test-results/customization-mobile.png" });
  await dialog
    .locator('input[name="baseUrl"]')
    .fill("https://model.example/v1");
  await dialog.locator('input[name="model"]').fill("custom-research-model");
  await dialog.locator('input[name="apiKey"]').fill("fictional-test-key");
  await dialog
    .getByRole("button", { name: "保存模型设置", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(saved.baseUrl).toBe("https://model.example/v1");
  expect(saved.model).toBe("custom-research-model");
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  await expect(dialog.locator('input[name="model"]')).toHaveValue(
    "custom-research-model",
  );
  await expect(dialog.locator('input[name="apiKey"]')).toHaveValue("");
});

test("gear configuration saves custom diameters and theme across reloads and all layouts", async ({
  page,
  request,
}) => {
  await request.patch("/api/preferences", { data: defaults });
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const slider = dialog.getByRole("slider", { name: "重要节点直径" });
  await slider.fill("96");
  await dialog.getByRole("button", { name: "海洋蓝", exact: true }).click();
  await dialog.getByLabel("减少界面动效", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "保存外观配置", exact: true })
    .click();
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("外观配置已保存");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await expect(
    dialog.getByRole("button", { name: "保存外观配置", exact: true }),
  ).toHaveCSS("background-color", "rgb(40, 103, 150)");
  await page.screenshot({ path: "test-results/customization-ocean.png" });
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  const node = page.locator('.graph-node[data-node-id="cnn"]');
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "48");
  await page.getByRole("button", { name: "时间轴", exact: true }).click();
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "48");
  await node.click();
  await page
    .getByRole("button", { name: "以此技术为中心", exact: true })
    .click();
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "48");
  await page.reload();
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await expect(node.locator(".node-shape")).toHaveAttribute("r", "48");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduce-motion",
    "true",
  );
  await page.screenshot({ path: "test-results/theme-ocean-graph.png" });
});

test("manual priority choices persist and can return control to AI", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((w: { demo: boolean }) => w.demo).id;
  const workspace = await (await request.get(`/api/workspaces/${id}`)).json();
  const original = workspace.nodes.find((n: { id: string }) => n.id === "cnn");
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    const node = page.locator('.graph-node[data-node-id="cnn"]');
    await node.click();
    const detail = page.getByRole("dialog", { name: "节点详情" });
    await detail.getByRole("button", { name: "编辑标签", exact: true }).click();
    await detail.getByLabel("节点级别", { exact: true }).selectOption("minor");
    await detail.getByRole("button", { name: "保存标签", exact: true }).click();
    expect(
      (await (await request.get(`/api/workspaces/${id}`)).json()).nodes.find(
        (n: { id: string }) => n.id === "cnn",
      ).importanceSource,
    ).toBe("manual");
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await expect(node.locator(".node-shape")).toHaveAttribute("r", "7");
    await page.reload();
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await expect(node.locator(".node-shape")).toHaveAttribute("r", "7");
    await node.click();
    await detail.getByRole("button", { name: "编辑标签", exact: true }).click();
    await detail
      .getByRole("button", { name: "允许 AI 重新定级", exact: true })
      .click();
    expect(
      (await (await request.get(`/api/workspaces/${id}`)).json()).nodes.find(
        (n: { id: string }) => n.id === "cnn",
      ).importanceSource,
    ).toBe("ai");
  } finally {
    await request.patch(`/api/workspaces/${id}/nodes/cnn`, {
      data: { importance: original.importance },
    });
    await request.patch(`/api/workspaces/${id}/nodes/cnn`, {
      data: { importanceSource: "ai" },
    });
  }
});

test("personal configuration downloads, imports and rejects invalid files without losing saved preferences", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "导出个人配置", exact: true }).click();
  const download = await downloading;
  const file = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(file.format).toBe("anistudy-personal-config");
  expect(file.settings.apiKey).toBeUndefined();
  file.settings.theme = "violet";
  file.settings.preferEnglishTerms = false;
  file.settings.nodeSizes.minor = 24;
  const input = dialog.getByLabel("导入个人配置文件", { exact: true });
  await input.setInputFiles({
    name: "config.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("个人配置已导入");
  await expect(
    dialog.getByRole("slider", { name: "次要节点直径" }),
  ).toHaveValue("24");
  await expect(
    dialog.getByRole("checkbox", { name: "保留英文专有名词" }),
  ).not.toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "violet");
  await input.setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{invalid"),
  });
  await expect(dialog.getByRole("alert")).toContainText("无法解析");
  expect((await (await request.get("/api/settings")).json()).theme).toBe(
    "violet",
  );
  await dialog
    .getByRole("button", { name: "恢复默认外观", exact: true })
    .click();
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("已恢复默认");
  await expect(
    dialog.getByRole("slider", { name: "次要节点直径" }),
  ).toHaveValue("14");
});
