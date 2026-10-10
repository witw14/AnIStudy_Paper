// Real arXiv smoke check in a separate database. Never reads user settings or papers.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createApp } from "../server/app.mjs";
const dir = resolve("test-results", `acquisition-live-${Date.now()}`);
const { app, store, acquirer } = createApp({ dataDir: dir, seed: false });
store.saveSettings({ autoDownloadPapers: false, autoOrganizePapers: false });
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const w = store.create("Synthetic acquisition check", "");
let timer;
try {
  const imported = await fetch(base + `/workspaces/${w.id}/arxiv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: process.argv[2] || "1706.03762" }),
  });
  const result = await imported.json();
  if (!imported.ok) throw new Error(result.error);
  const p = result.papers[0];
  acquirer.enqueue(w.id, p.id, { download: true, organize: false });
  let previous = "";
  timer = setInterval(() => {
    const current = store.get(w.id).papers[0];
    if (current.acquisition?.state !== previous) {
      previous = current.acquisition?.state;
      process.stdout.write(
        JSON.stringify({ stage: previous, label: current.acquisition?.label }) +
          "\n",
      );
    }
  }, 400);
  await acquirer.idle();
  const final = store.get(w.id).papers[0];
  const summary = {
    success: final.acquisition?.state === "ready",
    status: final.acquisition,
    paperId: final.arxivId,
    pdfVersion: final.pdfVersion,
    source: final.document?.source,
    blocks: final.document?.blocks.length,
    pdfPages: new Set(
      final.document?.pdfBlocks.map((b) => b.page).filter(Boolean),
    ).size,
    outline: final.document?.outline.length,
    nativeMappedBlocks: final.document?.blocks.filter((b) => b.page).length,
    syntheticDatabase: true,
    modelCalled: false,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(summary, null, 2));
  process.stdout.write(JSON.stringify(summary) + "\n");
  if (!summary.success) process.exitCode = 1;
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      success: false,
      error: error.message,
      syntheticDatabase: true,
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  clearInterval(timer);
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
}
