import { test, expect } from "@playwright/test";
import { textPdf } from "../pdf-fixture.mjs";
test("core research workflow and persistent isolated workspace", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "每一步探索，都有迹可循。." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/overview.png", fullPage: true });
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 Residual Connection", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "节点详情" });
  await expect(
    drawer.getByRole("heading", { name: "Residual Connection", exact: true }),
  ).toBeVisible();
  await drawer.getByLabel("学习状态").selectOption("learning");
  await expect(page.locator(".busy-indicator")).toHaveCount(0);
  await drawer.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "学习档案", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Residual Connection", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("记忆内容", { exact: true })
    .fill("需要重新理解残差连接的梯度传播");
  await page.getByRole("button", { name: "记下来", exact: true }).click();
  await expect(
    page.getByText("需要重新理解残差连接的梯度传播", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "学习档案", exact: true }).click();
  await expect(
    page.getByText("需要重新理解残差连接的梯度传播", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "查看动态" }).click();
  await page.getByText("整理详情与旧建议", { exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Class Token", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "设为重要", exact: true }).click();
  await expect(page.getByText("知识地图已整理就绪")).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "新建研究空间", exact: true }).click();
  await page.getByLabel("空间名称").fill("独立 NLP 研究");
  await page.getByLabel("研究目标").fill("探索语言表示学习");
  await page.getByRole("button", { name: "创建空间", exact: true }).click();
  await expect(page.getByText("让第一篇论文成为起点")).toBeVisible();
  await page.getByRole("button", { name: "学习档案", exact: true }).click();
  await expect(page.getByText("需要重新理解残差连接的梯度传播")).toHaveCount(0);
  await page.getByRole("button", { name: "导入论文", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("选择 PDF 文件", { exact: true }).setInputFiles({
    name: "test-research.pdf",
    mimeType: "application/pdf",
    buffer: textPdf(),
  });
  await page.getByRole("button", { name: "上传并保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "test-research", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "test-research", exact: true })
    .click();
  await expect(
    page.getByText("已提取 PDF 文本，可用于论文对话", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "打开模型设置", exact: true }).click();
  await expect(page.getByLabel("模型名称")).toBeVisible();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  expect(errors).toEqual([]);
});
test("narrow screen provides usable navigation and chat controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("button", { name: "折叠侧栏" }).click();
  await page.getByRole("button", { name: "切换对话面板" }).click();
  await page.getByRole("button", { name: "收起对话" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
