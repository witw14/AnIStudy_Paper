import { test, expect, _electron as electron } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve, join } from "node:path";
import { createDesktopBridge } from "../../server/desktop.mjs";

test("production entry connects to the server and unregisters on shutdown", async () => {
  test.skip(process.platform !== "win32", "Windows helper");
  mkdirSync("test-results/desktop", { recursive: true });
  const dir = mkdtempSync(resolve("test-results/desktop/bridge-"));
  const bridge = createDesktopBridge(dir);
  try {
    await bridge.start("http://127.0.0.1:4319", {
      noteShortcut: "Ctrl+Alt+F9",
    });
    expect(bridge.status()).toMatchObject({
      available: true,
      registered: true,
      shortcut: "Ctrl+Alt+F9",
    });
    await bridge.configure({
      noteShortcut: "Ctrl+Alt+F10",
      noteAlwaysOnTop: true,
    });
    expect(bridge.status()).toMatchObject({
      registered: true,
      shortcut: "Ctrl+Alt+F10",
      alwaysOnTop: true,
    });
  } finally {
    bridge.close();
  }
  await expect.poll(() => bridge.status().available).toBe(false);
});

test("Windows helper registers, rebinds and releases global shortcuts; quick window hides and stays on top", async () => {
  test.skip(
    process.platform !== "win32",
    "Windows global shortcut integration",
  );
  mkdirSync("test-results/desktop", { recursive: true });
  const profile = mkdtempSync(resolve("test-results/desktop/profile-"));
  const env = {
    ...process.env,
    ANISTUDY_URL: "http://127.0.0.1:4319",
    ANISTUDY_DESKTOP_PROFILE: profile,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [resolve("tests/desktop/harness.cjs")],
    env,
  });
  try {
    const send = (command: object) =>
      app.evaluate(
        (_, value) =>
          (
            globalThis as unknown as {
              sendNoteCommand: (command: object) => void;
            }
          ).sendNoteCommand(value),
        command,
      );
    await send({
      id: 1,
      method: "configure",
      shortcut: "Ctrl+Alt+F11",
      alwaysOnTop: false,
    });
    await expect
      .poll(() =>
        app.evaluate(({ globalShortcut }) =>
          globalShortcut.isRegistered("Ctrl+Alt+F11"),
        ),
      )
      .toBe(true);
    await send({ id: 2, method: "open" });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      (globalThis as any).noteCursorEvents = [];
      BrowserWindow.getAllWindows()[0].webContents.on(
        "cursor-changed",
        (_event, type, image) => {
          const pixels = image?.toBitmap();
          let darkPixels = 0,
            lightPixels = 0;
          if (pixels)
            for (let i = 0; i < pixels.length; i += 4) {
              if (pixels[i + 3] > 200) {
                if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 100)
                  darkPixels++;
                if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 220)
                  lightPixels++;
              }
            }
          (globalThis as any).noteCursorEvents.push({
            type,
            darkPixels,
            lightPixels,
            png: image?.toPNG().toString("base64"),
          });
        },
      );
    });
    await expect(page.locator(".quick-notes > header")).toHaveCount(0);
    await page.getByRole("button", { name: "新建笔记", exact: true }).click();
    await page.getByRole("button", { name: "笔记操作：未命名笔记" }).click();
    await page.getByRole("menuitem", { name: "重命名" }).click();
    await page.getByRole("textbox", { name: "笔记标题" }).fill("桌面窗口笔记");
    await page.getByRole("textbox", { name: "笔记标题" }).press("Enter");
    await page
      .getByRole("textbox", { name: "笔记正文" })
      .fill("## 原生窗口中的 Markdown\n\n**保存内容**");
    await expect(page.locator(".note-save-state")).toHaveText("已保存");
    const assertVisibleTextCursor = async () => {
      await page.getByRole("button", { name: "加粗", exact: true }).hover();
      await page
        .getByRole("textbox", { name: "笔记正文", exact: true })
        .hover();
      await expect
        .poll(() =>
          app.evaluate(() => (globalThis as any).noteCursorEvents.at(-1)?.type),
        )
        .toBe("custom");
      const cursor = await app.evaluate(() =>
        (globalThis as any).noteCursorEvents.at(-1),
      );
      expect(cursor.darkPixels).toBeGreaterThan(10);
      expect(cursor.lightPixels).toBeGreaterThan(10);
    };
    for (let i = 0; i < 3; i++) {
      await assertVisibleTextCursor();
      await page
        .getByRole("textbox", { name: "笔记正文", exact: true })
        .press("End");
      await page
        .getByRole("textbox", { name: "笔记正文", exact: true })
        .press("a");
      await assertVisibleTextCursor();
    }
    await page.getByRole("textbox", { name: "笔记正文" }).press("Control+s");
    await expect(page.locator(".note-save-state")).toHaveText("已保存");
    await expect(page.getByRole("button", { name: "沉浸编辑" })).toHaveCount(0);
    await page.getByRole("button", { name: "收起笔记侧栏" }).click();
    await expect(
      page.getByRole("complementary", { name: "笔记侧栏" }),
    ).toBeHidden();
    await assertVisibleTextCursor();
    const cursorImage = await app.evaluate(
      () => (globalThis as any).noteCursorEvents.at(-1).png,
    );
    await test.info().attach("native-note-text-cursor", {
      body: Buffer.from(cursorImage, "base64"),
      contentType: "image/png",
    });
    await page.getByRole("button", { name: "展开笔记侧栏" }).click();
    await send({
      id: 3,
      method: "configure",
      shortcut: "Ctrl+Alt+F12",
      alwaysOnTop: true,
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isAlwaysOnTop(),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        app.evaluate(({ globalShortcut }) =>
          globalShortcut.isRegistered("Ctrl+Alt+F12"),
        ),
      )
      .toBe(true);
    expect(
      await app.evaluate(({ globalShortcut }) =>
        globalShortcut.isRegistered("Ctrl+Alt+F11"),
      ),
    ).toBe(false);
    expect(
      await page.evaluate(
        () => typeof (window as unknown as { require?: unknown }).require,
      ),
    ).toBe("undefined");
    await page.screenshot({ path: join(profile, "quick-notes.png") });
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
      )
      .toBe(false);
    await send({ id: 4, method: "open" });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
      )
      .toBe(true);
    await expect(
      page.locator('.quick-note-card[data-selected="true"] > strong'),
    ).toHaveText("桌面窗口笔记");
    await assertVisibleTextCursor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].isVisible(),
        ),
      )
      .toBe(false);
    expect(
      await app.evaluate(({ globalShortcut }) =>
        globalShortcut.isRegistered("Ctrl+Alt+F12"),
      ),
    ).toBe(true);
  } finally {
    // Test cleanup must not prompt for a synthetic draft if an assertion failed
    // during the typing loop. Production still retains its normal draft guard.
    for (const page of app.windows())
      if (!page.isClosed())
        await page.evaluate(() => {
          window.addEventListener(
            "beforeunload",
            (event) => event.stopImmediatePropagation(),
            { capture: true },
          );
        });
    await app.close();
  }
});
