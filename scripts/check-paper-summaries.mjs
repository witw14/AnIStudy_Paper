// Uses synthetic paper text and an isolated scratch workspace. Real settings
// are read-only, and the credential stays in memory rather than the scratch DB.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.mjs";
import { callModel } from "../server/services.mjs";

const db = new DatabaseSync(
  resolve(process.env.DATA_DIR || "data", "paper.sqlite"),
  { readOnly: true },
);
const settings = JSON.parse(
  db.prepare("SELECT body FROM settings WHERE id='global'").get()?.body || "{}",
);
db.close();
if (!settings.apiKey || !settings.baseUrl || !settings.model)
  throw new Error("Configure a model before the optional live check.");
const scratch = mkdtempSync(join(tmpdir(), "anistudy-summary-check-"));
let server;
const { app, store } = createApp({
  dataDir: scratch,
  seed: false,
  model: (_, messages, json) => callModel(settings, messages, json),
});
try {
  const w = store.create("Synthetic summary check", "测试本文特定技术概括");
  w.papers.push({
    id: "synthetic-paper",
    title: "Synthetic Feature Classifier",
    inLibrary: true,
    summary: "",
    verification: "local",
    text: "Synthetic Feature Classifier\nAbstract\nThis synthetic test paper classifies feature maps using DemoPool and DemoGate. DemoPool computes the mean along the spatial dimensions of each channel, producing a fixed-length vector for a linear classification head. DemoGate learns a sigmoid weight for each channel and multiplies these weights with the pooled vector to emphasize channels useful for classification. The test text does not discuss the training optimizer or the first publication year of either technique.",
  });
  store.put(w);
  server = app.listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/workspaces/${w.id}/papers/synthetic-paper/organize`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  const result = await response.json();
  assert.equal(response.status, 200);
  const summaries = result.nodes.map((n) => ({
    name: n.name,
    summary: n.paperRelations.find((r) => r.paperId === "synthetic-paper")
      ?.summary,
  }));
  const output = resolve("test-results", "paper-summaries-live");
  mkdirSync(output, { recursive: true });
  writeFileSync(
    join(output, "summaries.json"),
    JSON.stringify(
      { report: result.papers[0].organizationReport, summaries },
      null,
      2,
    ),
    "utf8",
  );
  assert.ok(summaries.length > 0);
  for (const entry of summaries) {
    assert.ok(entry.summary?.role && entry.summary?.implementation);
    assert.doesNotMatch(
      entry.summary.role + entry.summary.implementation,
      /尚未提取|整理结果未提供/,
    );
  }
  console.log(
    `Live organization: ${summaries.length} linked technologies each have a role and implementation sentence.`,
  );
} finally {
  if (server) await new Promise((done) => server.close(done));
  store.db.close();
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  assert.ok(basename(scratch).startsWith("anistudy-summary-check-"));
  rmSync(scratch, { recursive: true, force: true });
}
