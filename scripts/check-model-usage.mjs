// Send a short synthetic source only. Read the real credential in memory and
// never write it, real research, or real workspace settings to the fixture DB.
import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { callModel } from "../server/services.mjs";
import { htmlDocument } from "../server/documents.mjs";
const db = new DatabaseSync(
  resolve(process.env.DATA_DIR || "data", "paper.sqlite"),
  { readOnly: true },
);
const original = JSON.parse(
  db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body || "{}",
);
db.close();
assert.ok(
  original.apiKey && original.baseUrl && original.model,
  "Model configuration is required",
);
const dir = resolve("test-results", `model-usage-live-${Date.now()}`);
const { app, store, acquirer } = createApp({
  dataDir: dir,
  seed: false,
  acquisition: false,
  model: (settings, messages, json, options) =>
    callModel(
      { ...original, ...settings, apiKey: original.apiKey },
      messages,
      json,
      options,
    ),
});
store.saveSettings({
  baseUrl: original.baseUrl,
  model: original.model,
  taskReasoning: {
    routes: { deepThinking: "auto", reasoningEffort: "auto" },
    organization: { deepThinking: "auto", reasoningEffort: "auto" },
    translation: { deepThinking: "disabled", reasoningEffort: "low" },
  },
});
const w = store.create("Synthetic usage verification", "");
const doc = htmlDocument(
  '<article class="ltx_document"><h1>Synthetic Technical Description</h1><p>A Transformer encoder combines relevant features. LayerNorm preserves the relative scale. This synthetic text does not report an experiment.</p></article>',
  "https://arxiv.org/html/2401.12345v1",
  null,
  { mapPages: false },
);
w.papers.push({
  id: "synthetic",
  title: "Synthetic usage verification",
  authors: "Test",
  inLibrary: true,
  status: "unlearned",
  document: doc,
  summary: "Synthetic",
  text: "",
});
store.put(w);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const request = async (path, body) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return { status: r.status, data };
};
try {
  const start = Date.now();
  const submitted = await request(
    `/workspaces/${w.id}/papers/synthetic/translate`,
    { documentId: doc.id, background: true },
  );
  assert.equal(submitted.status, 202);
  let task;
  while (Date.now() - start < 360000) {
    task = (await request(`/tasks?workspaceId=${w.id}`)).data.find(
      (t) => t.id === submitted.data.taskId,
    );
    if (task?.status !== "running") break;
    await delay(500);
  }
  assert.equal(task?.status, "succeeded", task?.error);
  const usage = (await request("/usage")).data;
  assert.equal(usage.totals.inputTokens, task.inputTokens || 0);
  assert.equal(usage.totals.outputTokens, task.outputTokens || 0);
  assert.equal(task.calls, 1);
  const result = {
    success: true,
    syntheticOnly: true,
    model: original.model,
    background: true,
    thinking: "disabled",
    durationMs: Date.now() - start,
    completedAt: task.finishedAt,
    calls: task.calls,
    inputTokens: task.inputTokens,
    outputTokens: task.outputTokens,
    totalTokens: task.totalTokens,
    missingTotalRecords: task.missingTotalRecords,
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
}
