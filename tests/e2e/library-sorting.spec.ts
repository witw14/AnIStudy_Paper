import { test, expect } from "@playwright/test";

test("paper library supports all four sort orders, preserves filters and remembers the selected order", async ({
  page,
  request,
  context,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  const w = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  w.papers = [
    {
      ...w.papers[0],
      id: "a",
      title: "Paper A",
      year: 2012,
      addedAt: "2026-09-01T12:00:00Z",
      inLibrary: true,
      status: "learned",
    },
    {
      ...w.papers[0],
      id: "b",
      title: "Paper B",
      year: 2021,
      addedAt: "2026-08-01T12:00:00Z",
      inLibrary: true,
      status: "unlearned",
    },
    {
      ...w.papers[0],
      id: "c",
      title: "Paper C",
      year: null,
      addedAt: "2026-10-01T12:00:00Z",
      inLibrary: true,
      status: "learned",
    },
  ];
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    demo.id,
  );
  await page.route(`**/api/workspaces/${demo.id}`, (route) =>
    route.fulfill({ json: w }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /^论文库/ }).click();
  const sort = page.getByRole("combobox", { name: "论文排序", exact: true });
  const titles = page.locator(".paper-title");
  await expect(sort).toHaveValue("upload-desc");
  for (const [mode, order] of Object.entries({
    "upload-desc": ["Paper C", "Paper A", "Paper B"],
    "upload-asc": ["Paper B", "Paper A", "Paper C"],
    "year-desc": ["Paper B", "Paper A", "Paper C"],
    "year-asc": ["Paper C", "Paper A", "Paper B"],
  })) {
    await sort.selectOption(mode);
    await expect(titles).toHaveText(order);
  }
  await page.getByRole("button", { name: "已学习", exact: true }).click();
  await expect(titles).toHaveText(["Paper C", "Paper A"]);
  await page.getByRole("textbox", { name: "搜索论文" }).fill("Paper A");
  await expect(titles).toHaveText(["Paper A"]);
  await page.reload();
  await page.getByRole("button", { name: /^论文库/ }).click();
  await expect(sort).toHaveValue("year-asc");
  await expect(titles).toHaveText(["Paper C", "Paper A", "Paper B"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByRole("button", { name: "折叠侧栏", exact: true }).click();
  await expect(sort).toBeVisible();
  await expect(sort).toHaveValue("year-asc");
  await page.screenshot({ path: "test-results/library-sorting-mobile.png" });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
