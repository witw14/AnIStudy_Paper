import { chromium } from "@playwright/test";
import express from "express";
import { resolve, join } from "node:path";
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../server/app.mjs";
const directories = readdirSync("test-results")
  .filter((n) => /^acquisition-live-\d+$/.test(n))
  .sort();
const directory = resolve("test-results", directories.at(-1) || "missing");
const { app, store, acquirer } = createApp({
  dataDir: directory,
  seed: false,
  acquisition: false,
});
const w = store.list().find((w) => w.name === "Synthetic acquisition check");
const paper = w?.papers.find((p) => p.document?.source === "arxiv");
if (!paper) throw new Error("Run the acquisition smoke check first.");
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_, res) => res.sendFile(resolve("dist/index.html")));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    w.id,
  );
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: /^论文库/ }).click();
  await page.getByRole("button", { name: paper.title, exact: true }).click();
  await page.getByRole("button", { name: "阅读 HTML", exact: true }).click();
  const reader = page.getByRole("dialog", { name: "论文原文阅读" });
  await reader.locator(".reading-block").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const figure = paper.document.blocks.find((b) => b.kind === "figure");
  if (figure)
    await reader
      .locator(`[data-block-id="${figure.id}"]`)
      .scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".reading-block img")).some(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    null,
    { timeout: 15000 },
  );
  mkdirSync("test-results/reader-live", { recursive: true });
  await page.screenshot({ path: "test-results/reader-live/native-paper.png" });
  const summary = {
    syntheticDatabase: true,
    mathElements: await reader.locator("math").count(),
    figures: await reader.locator("figure").count(),
    outline: paper.document.outline.length,
    overflow: await reader.evaluate((el) => el.scrollWidth > el.clientWidth),
    loadedImages: await reader
      .locator("img")
      .evaluateAll((images) => images.filter((i) => i.naturalWidth > 0).length),
  };
  writeFileSync(
    "test-results/reader-live/result.json",
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary));
} finally {
  await browser.close();
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
}
