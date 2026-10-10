import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ context, request }) => {
  await request.patch("/api/preferences", {
    data: { chatEvidencePolicy: "supplement" },
  });
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  await context.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    demo.id,
  );
});

test.afterEach(async ({ request }) => {
  await request.patch("/api/preferences", {
    data: { chatEvidencePolicy: "supplement" },
  });
});

test("evidence policy appears only in configuration and stays saved across mode changes and reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.locator(".chat-panel").getByLabel("对话资料策略"),
  ).toHaveCount(0);
  await expect(page.locator(".chat-scope")).toHaveCount(0);
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const policy = dialog.getByLabel("对话资料策略", { exact: true });
  await expect(policy).toBeEnabled();
  await expect(policy).toHaveValue("supplement");
  await policy.selectOption("strict");
  await dialog
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Paper Mode", exact: true }).click();
  await page
    .getByRole("button", { name: "Research Context", exact: true })
    .click();
  await page.reload();
  expect(
    (await (await request.get("/api/settings")).json()).chatEvidencePolicy,
  ).toBe("strict");
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(policy).toHaveValue("strict");
});

test("bottom configuration save commits chat policy and its exported file can restore the policy", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const field = dialog.getByLabel("对话资料策略", { exact: true });
  await field.selectOption("strict");
  expect(
    (await (await request.get("/api/settings")).json()).chatEvidencePolicy,
  ).toBe("supplement");
  await dialog
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await (await request.get("/api/settings")).json()).chatEvidencePolicy,
  ).toBe("strict");
  await page.reload();
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(field).toHaveValue("strict");
  const downloading = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "导出个人配置", exact: true }).click();
  const file = JSON.parse(
    await readFile((await (await downloading).path())!, "utf8"),
  );
  expect(file.settings.chatEvidencePolicy).toBe("strict");
  expect(file.settings.apiKey).toBeUndefined();
  file.settings.chatEvidencePolicy = "supplement";
  await dialog.getByLabel("导入个人配置文件", { exact: true }).setInputFiles({
    name: "chat-policy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(
    dialog.getByRole("status", { name: "配置保存状态" }),
  ).toContainText("个人配置已导入");
  await expect(field).toHaveValue("supplement");
  expect(
    (await (await request.get("/api/settings")).json()).chatEvidencePolicy,
  ).toBe("supplement");
});

test("failed configuration save cannot change the persisted policy", async ({
  page,
  request,
}) => {
  await page.route("**/api/preferences", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 500,
          json: { error: "资料策略保存失败，请重试" },
        })
      : route.continue(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "偏好选项" });
  const policy = dialog.getByLabel("对话资料策略", { exact: true });
  await policy.selectOption("strict");
  await dialog
    .getByRole("button", { name: "保存偏好选项", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("资料策略保存失败");
  expect(
    (await (await request.get("/api/settings")).json()).chatEvidencePolicy,
  ).toBe("supplement");
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "偏好选项", exact: true }).click();
  await expect(policy).toHaveValue("supplement");
});
