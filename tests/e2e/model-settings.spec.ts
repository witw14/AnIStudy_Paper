import { test, expect } from "@playwright/test";

test("separate settings expose both entries, save independent task reasoning, and preserve preferences", async ({
  page,
  request,
}) => {
  const old = await (await request.get("/api/settings")).json();
  await request.put("/api/settings", {
    data: {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-flash",
      theme: "ocean",
      deepThinking: "enabled",
      reasoningEffort: "high",
    },
  });
  try {
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "打开偏好选项", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "打开模型设置", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "模型设置", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "模型设置", exact: true });
    await dialog.locator('input[name="model"]').focus();
    await page.waitForTimeout(1800);
    await expect(dialog.locator('input[name="model"]')).toBeFocused();
    await dialog
      .getByLabel("路线规划深度思考", { exact: true })
      .selectOption("enabled");
    await dialog
      .getByLabel("路线规划思考强度", { exact: true })
      .selectOption("max");
    await dialog
      .getByLabel("论文整理深度思考", { exact: true })
      .selectOption("enabled");
    await dialog
      .getByLabel("论文整理思考强度", { exact: true })
      .selectOption("low");
    await dialog
      .getByLabel("全文翻译深度思考", { exact: true })
      .selectOption("disabled");
    await expect(
      dialog.getByLabel("全文翻译思考强度", { exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", { name: "保存模型设置", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const saved = await (await request.get("/api/settings")).json();
    expect(saved.taskReasoning.routes).toEqual({
      deepThinking: "enabled",
      reasoningEffort: "max",
    });
    expect(saved.taskReasoning.organization).toEqual({
      deepThinking: "enabled",
      reasoningEffort: "low",
    });
    expect(saved.taskReasoning.translation.deepThinking).toBe("disabled");
    expect(saved.deepThinking).toBe("enabled");
    expect(saved.reasoningEffort).toBe("high");
    expect(saved.theme).toBe("ocean");
    await page.getByRole("button", { name: "偏好选项", exact: true }).click();
    const prefs = page.getByRole("dialog", { name: "偏好选项", exact: true });
    await expect(prefs.getByLabel("模型名称", { exact: true })).toHaveCount(0);
    await prefs
      .getByRole("button", { name: "保存偏好选项", exact: true })
      .click();
    await expect(prefs).not.toBeVisible();
    expect(
      (await (await request.get("/api/settings")).json()).taskReasoning,
    ).toEqual(saved.taskReasoning);
    await page.reload();
    await page
      .getByRole("button", { name: "打开模型设置", exact: true })
      .click();
    await expect(
      dialog.getByLabel("路线规划思考强度", { exact: true }),
    ).toHaveValue("max");
    await dialog
      .locator('input[name="baseUrl"]')
      .fill("https://unknown.example/v1");
    await expect(
      dialog.getByLabel("路线规划深度思考", { exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByText(/尚未确认支持思考参数/)).toBeVisible();
  } finally {
    await request.put("/api/settings", { data: old });
  }
});
test("input/output charts switch seven/thirty days and show exact daily category usage on hover and keyboard focus", async ({
  page,
}) => {
  await page.route("**/api/usage?**", (route) => {
    const days = Number(
      new URL(route.request().url()).searchParams.get("days"),
    );
    const zero = {
      inputTokens: 0,
      outputTokens: 0,
      missingInputRecords: 0,
      missingOutputRecords: 0,
    };
    const categories = {
      translation: "翻译",
      chat: "对话",
      organization: "整理",
      routes: "路线",
      maintenance: "资料维护",
      other: "其他",
    };
    const daily = Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.UTC(2026, 9, 9) - (days - 1 - i) * 864e5)
        .toISOString()
        .slice(0, 10);
      const factor = (i % 7) + 1;
      return {
        ...zero,
        date,
        records: 4,
        inputTokens: factor * 1000,
        outputTokens: factor * 400,
        categories: {
          translation: {
            ...zero,
            inputTokens: factor * 400,
            outputTokens: factor * 160,
          },
          chat: {
            ...zero,
            inputTokens: factor * 300,
            outputTokens: factor * 120,
          },
          organization: {
            ...zero,
            inputTokens: factor * 200,
            outputTokens: factor * 80,
          },
          routes: {
            ...zero,
            inputTokens: factor * 100,
            outputTokens: factor * 40,
          },
          maintenance: zero,
          other: zero,
        },
      };
    });
    return route.fulfill({
      json: {
        days,
        daily,
        categories,
        timezone: "Asia/Shanghai",
        initializedAt: new Date().toISOString(),
        legacyRecords: 0,
        totals: {
          ...zero,
          inputTokens: daily.reduce((n, d) => n + d.inputTokens, 0),
          outputTokens: daily.reduce((n, d) => n + d.outputTokens, 0),
        },
        tasks: [],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "模型设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "模型设置", exact: true });
  const input = dialog.getByRole("group", { name: "输入每日柱状图" }),
    output = dialog.getByRole("group", { name: "输出每日柱状图" });
  await expect(input.getByRole("button")).toHaveCount(7);
  await expect(output.getByRole("button")).toHaveCount(7);
  await input.getByRole("button").nth(3).hover();
  const tooltip = dialog.getByRole("tooltip");
  await expect(tooltip).toContainText("4,000 tokens");
  await expect(tooltip).toContainText("翻译");
  await expect(tooltip).toContainText("1,600 tokens");
  await expect(tooltip).toContainText("整理");
  await expect(tooltip).toContainText("路线");
  await page.screenshot({ path: "test-results/model-token-usage.png" });
  await dialog.getByRole("button", { name: "最近一个月", exact: true }).click();
  await expect(input.getByRole("button")).toHaveCount(30);
  await expect(output.getByRole("button")).toHaveCount(30);
  await output.getByRole("button").last().focus();
  await expect(tooltip).toContainText("800 tokens");
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "最近七天", exact: true }).click();
  await input.getByRole("button").first().click();
  await expect(tooltip).toBeVisible();
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: "test-results/model-token-usage-mobile.png" });
});
test("activity lists dated route, organization and translation tasks with total tokens and filters", async ({
  page,
}) => {
  await page.route("**/api/tasks?workspaceId=**", (route) =>
    route.fulfill({
      json: [
        {
          id: "r",
          workspaceId: "w",
          category: "routes",
          title: "Synthetic learning goal",
          status: "succeeded",
          startedAt: "2026-10-09T02:00:00Z",
          finishedAt: "2026-10-09T02:05:12Z",
          calls: 1,
          totalTokens: 1234,
          missingTotalRecords: 0,
        },
        {
          id: "o",
          workspaceId: "w",
          category: "organization",
          title: "Synthetic organized paper",
          status: "succeeded",
          startedAt: "2026-10-09T03:00:00Z",
          finishedAt: "2026-10-09T03:05:18Z",
          calls: 2,
          totalTokens: 4567,
          missingTotalRecords: 0,
        },
        {
          id: "t",
          workspaceId: "w",
          category: "translation",
          title: "Synthetic translated paper",
          status: "succeeded",
          startedAt: "2026-10-09T04:00:00Z",
          finishedAt: "2026-10-09T04:05:25Z",
          calls: 3,
          totalTokens: 9876,
          missingTotalRecords: 0,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "查看动态", exact: true }).click();
  const activity = page.getByRole("dialog", { name: "动态", exact: true });
  await expect(activity.locator(".activity-task")).toHaveCount(3);
  await expect(activity).toContainText("1,234 tokens");
  await expect(activity).toContainText("9,876 tokens");
  await expect(activity.locator("time").first()).toHaveAttribute(
    "datetime",
    "2026-10-09T02:05:12Z",
  );
  await activity
    .getByLabel("筛选动态类型", { exact: true })
    .selectOption("translation");
  await expect(activity.locator(".activity-task")).toHaveCount(1);
  await page.screenshot({ path: "test-results/task-activity.png" });
});
