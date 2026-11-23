import {
  test,
  expect,
  type Locator,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";

const content =
  "### 三级标题\n\n#### 四级标题\n\n第一行\n第二行\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\n" +
  Array.from(
    { length: 180 },
    (_, i) =>
      `## 第 ${i} 节\n\n这是第 ${i} 个段落，用来检查独立滚动、字号变化和笔记之间的阅读位置。${"更多内容。".repeat(6)}`,
  ).join("\n\n");
async function setup(
  page: Page,
  request: APIRequestContext,
  context: BrowserContext,
  quick: boolean,
) {
  const spaces = await (await request.get("/api/workspaces")).json();
  const w = await (
    await request.get(
      `/api/workspaces/${spaces.find((s: { demo: boolean }) => s.demo).id}`,
    )
  ).json();
  for (const note of w.notes || [])
    await request.delete(`/api/workspaces/${w.id}/notes/${note.id}`);
  const notes = [];
  for (const title of ["第一篇阅读笔记", "第二篇阅读笔记"])
    notes.push(
      (
        await (
          await request.post(`/api/workspaces/${w.id}/notes`, {
            data: { title, content },
          })
        ).json()
      ).note,
    );
  await context.addInitScript((id) => {
    localStorage.setItem("anistudy.workspace", id);
    localStorage.setItem("anistudy.quick-space", id);
  }, w.id);
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.goto(quick ? "/?quick-notes=1" : "/");
  if (!quick)
    await page.getByRole("button", { name: "笔记库", exact: true }).click();
  const first = page.locator(`[data-note-id="${notes[0].id}"]`),
    second = page.locator(`[data-note-id="${notes[1].id}"]`);
  await first.click({ position: { x: 15, y: 48 } });
  return {
    w,
    notes,
    first,
    second,
    editor: page.getByRole("textbox", { name: "笔记正文" }),
    preview: page.locator(".md-preview"),
  };
}
async function scrollToRatio(pane: Locator, ratio: number) {
  await pane.evaluate(
    (el, progress) =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.scrollTop = (el.scrollHeight - el.clientHeight) * progress;
            el.dispatchEvent(new Event("scroll", { bubbles: true }));
            resolve();
          }),
        ),
      ),
    ratio,
  );
}
const progress = (pane: Locator) =>
  pane.evaluate(
    (el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight),
  );

for (const quick of [true, false]) {
  const surface = quick ? "quick" : "web";
  test(`${surface} notes distinguish headings and soft line breaks, share font controls and offer both draggable split directions`, async ({
    page,
    request,
    context,
  }) => {
    const { editor, preview } = await setup(page, request, context, quick);
    await expect(
      page.getByRole("button", { name: "编辑", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(preview).toBeHidden();
    await page.getByRole("button", { name: "预览", exact: true }).click();
    const sizes = await preview.evaluate((el) =>
      ["h3", "h4"].map((tag) =>
        parseFloat(getComputedStyle(el.querySelector(tag)!).fontSize),
      ),
    );
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    await expect(
      preview.locator("p").filter({ hasText: "第一行" }).locator("br"),
    ).toHaveCount(1);
    await expect(preview.locator("pre br")).toHaveCount(0);
    await page.getByRole("button", { name: "竖分栏", exact: true }).click();
    const divider = page.getByRole("separator", { name: "调整编辑与预览分栏" });
    await expect(divider).toHaveAttribute("aria-orientation", "vertical");
    const originalWidth = (await editor.boundingBox())!.width,
      box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 50);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 50);
    await page.mouse.up();
    expect((await editor.boundingBox())!.width).toBeGreaterThan(
      originalWidth + 60,
    );
    await page.getByRole("button", { name: "增大字号" }).click();
    await expect(page.getByLabel("当前字号", { exact: true })).toHaveText(
      "18px",
    );
    await expect(editor).toHaveCSS("font-size", "18px");
    await expect(preview.locator(".markdown")).toHaveCSS("font-size", "18px");
    await expect(preview).toHaveCSS("overflow-y", "auto");
    const previewBefore = await preview.evaluate((el) => el.scrollTop);
    await scrollToRatio(editor, 0.3);
    expect(await preview.evaluate((el) => el.scrollTop)).toBe(previewBefore);
    const editorBefore = await editor.evaluate((el) => el.scrollTop);
    await scrollToRatio(preview, 0.6);
    expect(await editor.evaluate((el) => el.scrollTop)).toBe(editorBefore);
    await page.getByRole("button", { name: "横分栏", exact: true }).click();
    await expect(divider).toHaveAttribute("aria-orientation", "horizontal");
    const originalHeight = (await editor.boundingBox())!.height,
      row = (await divider.boundingBox())!;
    await page.mouse.move(row.x + 50, row.y + row.height / 2);
    await page.mouse.down();
    await page.mouse.move(row.x + 50, row.y + 70);
    await page.mouse.up();
    expect((await editor.boundingBox())!.height).toBeGreaterThan(
      originalHeight + 40,
    );
    await page.screenshot({ path: `test-results/${surface}-note-split.png` });
  });

  test(`${surface} notes remember each note's mode, pane positions, font size and split ratio throughout window use`, async ({
    page,
    request,
    context,
  }) => {
    const { editor, preview, first, second } = await setup(
      page,
      request,
      context,
      quick,
    );
    await scrollToRatio(editor, 0.35);
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await expect.poll(() => progress(preview)).toBeCloseTo(0.35, 2);
    await page.getByRole("button", { name: "竖分栏", exact: true }).click();
    await scrollToRatio(editor, 0.4);
    await scrollToRatio(preview, 0.65);
    await page.getByRole("button", { name: "横分栏", exact: true }).click();
    await page.getByRole("button", { name: "增大字号" }).click();
    await scrollToRatio(editor, 0.4);
    await scrollToRatio(preview, 0.65);
    const divider = page.getByRole("separator", { name: "调整编辑与预览分栏" });
    await divider.press("ArrowDown");
    const split = await divider.getAttribute("aria-valuenow");
    await second.click({ position: { x: 15, y: 48 } });
    await expect(
      page.getByRole("button", { name: "编辑", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("当前字号", { exact: true })).toHaveText(
      "16px",
    );
    await scrollToRatio(editor, 0.2);
    await first.click({ position: { x: 15, y: 48 } });
    await expect(
      page.getByRole("button", { name: "横分栏", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("当前字号", { exact: true })).toHaveText(
      "18px",
    );
    await expect(divider).toHaveAttribute("aria-valuenow", split!);
    await expect.poll(() => progress(editor)).toBeCloseTo(0.4, 2);
    await expect.poll(() => progress(preview)).toBeCloseTo(0.65, 2);
    await page.getByRole("button", { name: "预览", exact: true }).click();
    await scrollToRatio(preview, 0.7);
    await second.click({ position: { x: 15, y: 48 } });
    await expect.poll(() => progress(editor)).toBeCloseTo(0.2, 2);
    await first.click({ position: { x: 15, y: 48 } });
    await expect(
      page.getByRole("button", { name: "预览", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => progress(preview)).toBeCloseTo(0.7, 2);
    if (!quick) {
      await page.getByRole("button", { name: "空间总览", exact: true }).click();
      await page.getByRole("button", { name: "笔记库", exact: true }).click();
      await expect.poll(() => progress(preview)).toBeCloseTo(0.7, 2);
    }
  });

  test(`${surface} whole note cards select notes and their ellipsis menus offer rename and delete on the right`, async ({
    page,
    request,
    context,
  }) => {
    const { first, second, notes, w } = await setup(
      page,
      request,
      context,
      quick,
    );
    await second.click({ position: { x: 15, y: 48 } });
    await expect(
      second.getByRole("button", { name: notes[1].title, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await first
      .getByRole("button", { name: `笔记操作：${notes[0].title}` })
      .click();
    const menu = page.getByRole("menu", { name: "笔记操作", exact: true });
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    expect((await menu.boundingBox())!.x).toBeGreaterThan(
      (await first.boundingBox())!.x + 160,
    );
    await menu.getByRole("menuitem", { name: "重命名" }).click();
    await first
      .getByRole("textbox", { name: "笔记标题" })
      .fill("菜单中的新标题");
    await first.getByRole("textbox", { name: "笔记标题" }).press("Enter");
    await expect
      .poll(
        async () =>
          (
            await (await request.get(`/api/workspaces/${w.id}`)).json()
          ).notes.find((n: { id: string }) => n.id === notes[0].id)?.title,
      )
      .toBe("菜单中的新标题");
    await second
      .getByRole("button", { name: `笔记操作：${notes[1].title}` })
      .click();
    page.once("dialog", (d) => void d.accept());
    await menu.getByRole("menuitem", { name: "删除笔记" }).click();
    await expect(second).toHaveCount(0);
    if (quick)
      await expect(
        page.getByText("关联论文与技术节点（0）", { exact: true }),
      ).toHaveCount(0);
    else
      await expect(
        page.getByText("关联论文与技术节点（0）", { exact: true }),
      ).toBeVisible();
  });
}
