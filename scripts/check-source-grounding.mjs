import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createApp } from "../server/app.mjs";
import { callModel } from "../server/services.mjs";
import { pdfDocument } from "../server/documents.mjs";
const db = new DatabaseSync(
  resolve(process.env.DATA_DIR || "data", "paper.sqlite"),
  { readOnly: true },
);
const settings = JSON.parse(
  db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body || "{}",
);
db.close();
const dir = resolve("test-results", `source-grounding-live-${Date.now()}`);
const { app, store, acquirer } = createApp({
  dataDir: dir,
  seed: false,
  acquisition: false,
  model: (_, messages, json, options) =>
    callModel(
      { ...settings, deepThinking: "disabled", reasoningEffort: "auto" },
      messages,
      json,
      options,
    ),
});
const w = store.create("Synthetic grounding check", "");
const text =
  "Attention Routing combines relevant features using learned attention weights. The method preserves residual information and reduces unnecessary feature mixing during training.";
w.papers.push({
  id: "synthetic",
  title: "Synthetic method description",
  authors: "Test Author",
  year: null,
  arxivId: null,
  summary: "Controlled source description.",
  source: "test",
  verification: "unverified",
  inLibrary: true,
  file: null,
  text,
  status: "unlearned",
  document: pdfDocument([{ num: null, text }], {}),
});
w.nodes.push({
  id: "routing",
  name: "Attention Routing",
  englishName: "Attention Routing",
  chineseName: "注意力路由",
  paperIds: ["synthetic"],
});
store.put(w);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
try {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/workspaces/${w.id}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "paper",
        paperId: "synthetic",
        message:
          "仅依据给定原文，用两句话解释注意力路由的作用与实现，并引用原文出处。",
      }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(new Error("模型检查未完成。"), {
      status: response.status,
    });
  const reply = result.messages.at(-1);
  const organized = await fetch(
    `http://127.0.0.1:${server.address().port}/api/workspaces/${w.id}/papers/synthetic/organize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const organization = await organized.json();
  const links = store.get(w.id).papers[0].paragraphLinks || [];
  const summary = {
    success:
      reply.citations.length > 0 &&
      organized.ok &&
      links.some((l) => l.source === "ai"),
    organized: organized.ok,
    linkedTechnologyParagraphs: links.filter((l) => l.source === "ai").length,
    validatedSources: reply.citations.length,
    locations: reply.citations.map((s) => ({
      section: s.section,
      page: s.page,
    })),
    tokenUsage: reply.tokenUsage,
    syntheticContextOnly: true,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "result.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  if (!summary.success) process.exitCode = 1;
} catch (error) {
  console.log(
    JSON.stringify({
      success: false,
      status: error.status || null,
      syntheticContextOnly: true,
    }),
  );
  process.exitCode = 1;
} finally {
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
}
