// One synthetic paper, an isolated database and a read-only provider config.
import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { writeFileSync } from "node:fs";
import { createApp } from "../server/app.mjs";
import { callModel } from "../server/services.mjs";
import { htmlDocument } from "../server/documents.mjs";
const db = new DatabaseSync(
  resolve(process.env.DATA_DIR || "data", "paper.sqlite"),
  { readOnly: true },
);
const settings = JSON.parse(
  db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body || "{}",
);
db.close();
const dir = resolve("test-results", `full-translation-live-${Date.now()}`);
const { app, store, acquirer } = createApp({
  dataDir: dir,
  seed: false,
  acquisition: false,
  model: (_, messages, json, options) =>
    callModel(settings, messages, json, options),
});
const w = store.create("Synthetic translation", "");
const html =
  '<article class="ltx_document"><h1>Controlled Technical Description</h1><p>Jacob Devlin uses the Transformer encoder to combine relevant features. LayerNorm preserves the relative scale. This synthetic text does not report an experiment.</p><p>The residual connection retains the original information.</p><math><mi>x</mi><mo>+</mo><mi>y</mi></math></article>';
const doc = htmlDocument(html, "https://arxiv.org/html/2401.12345v1", null, {
  mapPages: false,
});
w.papers.push({
  id: "synthetic",
  title: "Synthetic translation",
  authors: "Test Author",
  inLibrary: true,
  status: "unlearned",
  document: doc,
  summary: "Synthetic source",
  text: "",
});
store.put(w);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
try {
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/workspaces/${w.id}/papers/synthetic/translate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: doc.id }),
    },
  );
  const data = await response.json();
  const text =
    data.translation?.document?.blocks.map((b) => b.text).join("\n") || "";
  const result = {
    success:
      response.ok &&
      data.translation?.state === "complete" &&
      /[\u3400-\u9fff]/.test(text) &&
      text.includes("Jacob Devlin") &&
      text.includes("LayerNorm"),
    syntheticOnly: true,
    tokenUsage: data.translation?.tokenUsage,
    sourceCharacters: doc.blocks.reduce((n, b) => n + b.text.length, 0),
    translatedText: text,
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.success) process.exitCode = 1;
} finally {
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
}
