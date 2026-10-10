import { test, expect } from "@playwright/test";

test("top navigation switches workspaces and pages, stays synchronized with the sidebar, and preserves the page across spaces", async ({
  page,
  request,
  context,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  const created = await (
    await request.post("/api/workspaces", {
      data: { name: "材料研究 · 导航验证", description: "测试空间" },
    })
  ).json();
  await context.addInitScript((id) => {
    if (!localStorage.getItem("anistudy.workspace"))
      localStorage.setItem("anistudy.workspace", id);
  }, demo.id);
  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: "顶部导航",
    exact: true,
  });
  const space = navigation.getByRole("combobox", {
    name: "顶部切换研究空间",
    exact: true,
  });
  const currentPage = navigation.getByRole("combobox", {
    name: "顶部切换页面",
    exact: true,
  });
  await expect(navigation.locator(".breadcrumb-brand")).toHaveText("AnIStudy");
  await expect(space).toHaveValue(demo.id);
  await expect(space).toHaveAttribute("title", demo.name);
  await expect(currentPage).toHaveValue("home");
  await currentPage.selectOption({ label: "论文图谱" });
  await expect(
    page.getByRole("heading", { name: /^论文图谱/, level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".sidebar nav button.active")).toContainText(
    "论文图谱",
  );
  await space.selectOption(created.id);
  await expect(page.getByLabel("切换研究空间", { exact: true })).toHaveValue(
    created.id,
  );
  await expect(space).toHaveAttribute("title", created.name);
  await expect(currentPage).toHaveValue("papers");
  await expect(
    page.getByRole("heading", { name: /^论文图谱/, level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("anistudy.workspace")),
  ).toBe(created.id);
  await currentPage.selectOption({ label: "笔记库" });
  await expect(
    page.getByRole("heading", { name: /^笔记库/, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "学习路线", exact: true }).click();
  await expect(currentPage).toHaveValue("routes");
  await page.getByLabel("切换研究空间", { exact: true }).selectOption(demo.id);
  await expect(space).toHaveValue(demo.id);
  await expect(currentPage).toHaveValue("routes");
  await page.getByRole("button", { name: "折叠侧栏", exact: true }).click();
  await currentPage.selectOption({ label: "空间总览" });
  await space.selectOption(created.id);
  await expect(
    page.getByText("让第一篇论文成为起点", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/top-navigation-desktop.png" });
  await page.reload();
  await expect(space).toHaveValue(created.id);
});

test("all three navigation fields remain usable on narrow screens, with long workspace names contained", async ({
  page,
  request,
  context,
}) => {
  const created = await (
    await request.post("/api/workspaces", {
      data: {
        name: "跨学科材料研究与复杂系统建模的长期学习研究空间 · 超长名称验证",
      },
    })
  ).json();
  await context.addInitScript((id) => {
    if (!localStorage.getItem("anistudy.workspace"))
      localStorage.setItem("anistudy.workspace", id);
  }, created.id);
  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: "顶部导航",
    exact: true,
  });
  const space = navigation.getByRole("combobox", {
    name: "顶部切换研究空间",
    exact: true,
  });
  const currentPage = navigation.getByRole("combobox", {
    name: "顶部切换页面",
    exact: true,
  });
  await expect(space).toHaveValue(created.id);
  for (const width of [1512, 1024, 900, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 390)
      await page.getByRole("button", { name: "折叠侧栏", exact: true }).click();
    await expect(navigation.locator(".breadcrumb-brand")).toBeVisible();
    await expect(space).toBeVisible();
    await expect(currentPage).toBeVisible();
    expect(
      await navigation.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await page
        .locator(".topbar")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await currentPage.selectOption({ label: "论文库" });
    await expect(
      page.getByRole("heading", { name: /^论文库/, level: 1 }),
    ).toBeVisible();
  }
  await page.screenshot({ path: "test-results/top-navigation-mobile.png" });
  await currentPage.focus();
  await currentPage.press("Home");
  await expect(currentPage).toHaveValue("home");
});
