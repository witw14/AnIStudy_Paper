import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appearanceDefaults,
  preferenceSchema,
  exportPreferences,
  importPreferences,
} from "../server/preferences.mjs";
import { completeBilingualTitles } from "../server/organizer.mjs";
import { applyOrganization } from "../server/research.mjs";
import { assessImportance, applyImportance } from "../server/importance.mjs";
import { layoutGraph } from "../src/graphLayout.ts";
import { layoutClusters, layoutFocus } from "../src/relationshipLayouts.ts";

test("portable configuration roundtrips allowed settings and never exports credentials or research", () => {
  const original = {
    ...appearanceDefaults,
    apiKey: "SECRET",
    baseUrl: "https://first.example/v1",
    model: "model-a",
    preferEnglishTerms: false,
    preferences: "概念优先",
    deepThinking: "enabled",
    reasoningEffort: "high",
    chatEvidencePolicy: "strict",
    papers: [{ text: "private paper" }],
  };
  const file = exportPreferences(original);
  assert.ok(!JSON.stringify(file).includes("SECRET"));
  assert.ok(!JSON.stringify(file).includes("private paper"));
  assert.equal(importPreferences(file, original).apiKey, "SECRET");
  assert.equal(importPreferences(file, original).chatEvidencePolicy, "strict");
  assert.equal(exportPreferences({}).settings.chatEvidencePolicy, "supplement");
  file.settings.baseUrl = "https://second.example/v1";
  assert.equal(importPreferences(file, original).apiKey, "");
  assert.deepEqual(
    importPreferences(file, {}).nodeSizes,
    appearanceDefaults.nodeSizes,
  );
  assert.throws(() => importPreferences({ ...file, version: 2 }, original));
  assert.throws(() =>
    importPreferences({ ...file, settings: { apiKey: "injected" } }, original),
  );
  assert.throws(() =>
    preferenceSchema.parse({
      nodeSizes: { landmark: 999, major: 62, normal: 52, minor: 14 },
    }),
  );
  assert.throws(() => preferenceSchema.parse({ theme: "invalid" }));
});

test("bilingual title completion repairs missing languages and preserves useful extraction on model failure", async () => {
  const output = {
    nodes: [
      { name: "Patch Embedding", description: "Convert patches to tokens" },
    ],
    warnings: [],
  };
  let calls = 0;
  await completeBilingualTitles(output, {}, async (_, m) => {
    calls++;
    assert.match(m[0].content, /两个非空标题/);
    return {
      nodes: [
        { index: 0, englishName: "Patch Embedding", chineseName: "图像块嵌入" },
      ],
    };
  });
  assert.equal(output.nodes[0].englishName, "Patch Embedding");
  assert.equal(output.nodes[0].chineseName, "图像块嵌入");
  await completeBilingualTitles(output, {}, async () => {
    calls++;
  });
  assert.equal(calls, 1);
  const broken = {
    nodes: [{ name: "Attention", description: "useful" }],
    warnings: [],
  };
  await completeBilingualTitles(broken, {}, async () => {
    throw new Error("offline");
  });
  assert.equal(broken.nodes[0].description, "useful");
  assert.match(broken.warnings[0], /双语标题/);
});

test("manual importance survives organization, reassessment and concurrent grading changes", async () => {
  const paper = {
    id: "p",
    title: "Paper",
    summary: "summary",
    inLibrary: true,
  };
  const n = {
    id: "a",
    name: "Method",
    englishName: "Method",
    chineseName: "方法",
    importance: "minor",
    importanceSource: "manual",
    importanceReason: "用户设定",
    paperIds: ["p"],
    directions: ["General"],
    status: "learned",
  };
  const w = {
    name: "研究",
    nodes: [n],
    papers: [paper],
    edges: [],
    paperEdges: [],
    routes: [],
  };
  applyOrganization(w, paper, {
    nodes: [
      {
        ...n,
        importance: "landmark",
        importanceReason: "AI建议",
        existingNodeId: "a",
        description: "more detail",
        necessary: true,
        contribution: "Uses",
      },
    ],
    edges: [],
    paperEdges: [],
  });
  assert.equal(n.importance, "minor");
  assert.equal(n.importanceReason, "用户设定");
  assert.equal(n.status, "learned");
  assert.equal(n.description, "more detail");
  assert.deepEqual(
    await assessImportance(w, {}, async () => {
      throw new Error("Must not call for locked nodes");
    }),
    [],
  );
  const before = structuredClone(w);
  before.nodes[0].importanceSource = "ai";
  applyImportance(w, before, [{ id: "a", importance: "major" }]);
  assert.equal(n.importance, "minor");
});

test("custom node sizes propagate to every layout and preserve dense label separation", () => {
  const nodes = Array.from({ length: 9 }, (_, i) => ({
    id: String(i),
    name: "Long technical title for size validation with multiple lines",
    year: 2000,
    importance: "minor",
    radius: 64,
    paperIds: ["p"],
  }));
  const edges = nodes
    .slice(1)
    .map((n) => ({ source: "0", target: n.id, relation: "Requires" }));
  const spacing = { horizontal: 160, vertical: 120 };
  for (const layout of [
    layoutGraph(nodes, spacing),
    layoutClusters(nodes, edges, spacing),
    layoutFocus(nodes, edges, "0", spacing),
  ]) {
    const positions = [...layout.positions.values()];
    assert.equal(positions[0].r, 64);
    for (const a of positions)
      for (const b of positions)
        if (a.x === b.x && b.y > a.y)
          assert.ok(b.y - b.r > a.y + a.r + 25 + (a.lines.length - 1) * 17);
  }
});
