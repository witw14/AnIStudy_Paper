import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeImportance,
  assessImportance,
  applyImportance,
} from "../server/importance.mjs";
import { normalizeOrganization } from "../server/organizer.mjs";
import { radiusFor, layoutGraph, edgePath } from "../src/graphLayout.ts";
import { layoutClusters, layoutFocus } from "../src/relationshipLayouts.ts";

const grade = (importance, role, impact, durability = "enduring") => ({
  importance,
  importanceReason: "具体贡献与影响范围的判断。",
  importanceAssessment: {
    role,
    impact,
    durability,
    evidence: "提供资料中的方法及后续影响依据。",
  },
});
test("grading separates necessary implementation details and supporting methods from field breakthroughs", () => {
  assert.equal(
    normalizeImportance(grade("landmark", "implementation_detail", "field"))
      .importance,
    "minor",
  );
  assert.equal(
    normalizeImportance(
      grade("major", "supporting_method", "branch", "superseded"),
    ).importance,
    "normal",
  );
  assert.equal(
    normalizeImportance(grade("landmark", "key_method", "branch")).importance,
    "major",
  );
  assert.equal(
    normalizeImportance(grade("landmark", "paradigm", "field", "historical"))
      .importance,
    "landmark",
  );
  assert.equal(
    normalizeImportance(grade("major", "key_method", "uncertain")).importance,
    "normal",
  );
  assert.equal(
    normalizeImportance({ importance: "landmark" }).importance,
    "normal",
  );
  assert.equal(
    normalizeImportance({
      ...grade("major", "key_method", "field"),
      importanceReason: "",
    }).importance,
    "normal",
  );
  const value = normalizeImportance(
    grade("minor", "supporting_method", "local", "superseded"),
  );
  assert.equal(value.importance, "minor");
  assert.ok(value.importanceReason);
});

test("organization keeps useful minor nodes and their grading reasons without hardcoding technique names", () => {
  const output = normalizeOrganization({
    summary: "有效摘要",
    nodes: [
      {
        name: "A useful hardware adaptation",
        description: "A necessary implementation detail",
        necessary: true,
        relevance: "core",
        ...grade("major", "implementation_detail", "local"),
      },
    ],
  });
  assert.equal(output.nodes[0].importance, "minor");
  assert.equal(output.nodes[0].necessary, true);
  assert.match(output.nodes[0].importanceReason, /实现细节/);
});

test("reassessment batches existing nodes, avoids anchoring to old grades, and rejects incomplete output", async () => {
  const w = {
    name: "study",
    nodes: Array.from({ length: 17 }, (_, i) => ({
      id: String(i),
      name: "method" + i,
      importance: "landmark",
      paperIds: [],
    })),
    papers: [],
  };
  let calls = 0;
  const model = async (_, messages) => {
    calls++;
    const input = JSON.parse(messages[1].content);
    assert.ok(!Object.hasOwn(input.nodes[0], "importance"));
    return {
      nodes: input.nodes.map((n) => ({
        id: n.id,
        ...grade("normal", "supporting_method", "local"),
      })),
    };
  };
  assert.equal((await assessImportance(w, {}, model)).length, 17);
  assert.equal(calls, 2);
  await assert.rejects(
    assessImportance(w, {}, async () => ({ nodes: [] })),
    /不完整/,
  );
  await assert.rejects(
    assessImportance(w, {}, async () => ({
      nodes: [{ id: "0", importance: "minor" }],
    })),
    /不完整/,
  );
});

test("applying assessments preserves concurrent status edits, relationships and new nodes, skipping changed content", () => {
  const original = {
    nodes: [
      {
        id: "a",
        name: "A",
        importance: "major",
        status: "unlearned",
        paperIds: ["p"],
      },
      { id: "b", name: "B", importance: "major" },
    ],
    edges: [{ source: "a", target: "b" }],
    papers: [{ id: "p", file: "paper.pdf" }],
  };
  const fresh = structuredClone(original);
  fresh.nodes[0].status = "learned";
  fresh.nodes[1].description = "updated during model call";
  fresh.nodes.push({ id: "new", importance: "landmark" });
  applyImportance(fresh, original, [
    {
      id: "a",
      ...normalizeImportance(grade("minor", "implementation_detail", "local")),
    },
    { id: "b", importance: "normal" },
  ]);
  assert.equal(fresh.nodes[0].importance, "minor");
  assert.equal(fresh.nodes[0].status, "learned");
  assert.equal(fresh.nodes[1].importance, "major");
  assert.equal(fresh.nodes[2].importance, "landmark");
  assert.equal(fresh.importanceReport.updated, 1);
  assert.equal(fresh.importanceReport.skipped, 1);
  assert.deepEqual(fresh.edges, original.edges);
  assert.deepEqual(fresh.papers, original.papers);
});

test("all layouts use the tiny minor radius and right-to-left edges terminate at its right rim", () => {
  const nodes = [
    { id: "a", name: "detail", importance: "minor", year: 2000, paperIds: [] },
    { id: "b", name: "method", importance: "major", year: 2020, paperIds: [] },
  ];
  const edges = [{ source: "a", target: "b", relation: "Requires" }];
  assert.equal(radiusFor("minor"), 7);
  assert.equal(radiusFor("normal"), 26);
  const layouts = [
    layoutGraph(nodes),
    layoutClusters(nodes, edges),
    layoutFocus(nodes, edges, "b"),
  ];
  for (const layout of layouts) assert.equal(layout.positions.get("a").r, 7);
  const shape = edgePath(
    { x: 300, y: 100, r: 31 },
    { x: 100, y: 100, r: 7 },
    0,
  );
  // Existing three-pixel clearance keeps the arrowhead outside the tiny ring.
  assert.match(shape.d, /110[ ,]100$/);
});
