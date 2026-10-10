import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace } from "../server/seed.mjs";
import {
  extractMetadata,
  dedupePapers,
  samePaper,
  directionsFor,
  mergeRoutes,
  applyOrganization,
  migrateWorkspace,
} from "../server/research.mjs";
import { edgePath, layoutGraph } from "../src/graphLayout.ts";
const paper = (id, extra = {}) => ({
  id,
  title:
    "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
  year: null,
  status: "unlearned",
  inLibrary: true,
  verification: "candidate",
  text: "",
  file: null,
  ...extra,
});
const stage = (ids, extra = {}) => ({
  title: "stage",
  capability: "capability",
  paperIds: ids,
  nodeIds: [],
  sideQuest: false,
  ...extra,
});
test("publication year uses initial arXiv date, never PDF upload or revision date", () => {
  assert.equal(
    extractMetadata("arXiv:1409.1556v6 [cs.CV] 10 Apr 2015", "vgg.pdf").year,
    2014,
  );
  assert.equal(extractMetadata("Unknown text", "paper.pdf").year, null);
  assert.equal(
    extractMetadata(
      "Unknown text",
      "NIPS-2012-imagenet-classification-Paper.pdf",
    ).year,
    2012,
  );
  assert.equal(
    extractMetadata("A title\nReferences\narXiv:1706.03762", "unknown.pdf")
      .arxivId,
    null,
  );
});
test("same-paper matching handles punctuation, arXiv versions and avoids conflicting IDs", () => {
  assert.ok(
    samePaper(
      paper("a"),
      paper("b", {
        title:
          "An Image is Worth 16x16 Words Transformers for Image Recognition at Scale",
      }),
    ),
  );
  assert.ok(
    samePaper(
      paper("a", { arxivId: "2010.11929v2" }),
      paper("b", { arxivId: "2010.11929" }),
    ),
  );
  assert.equal(
    samePaper(
      paper("a", { arxivId: "2010.11929" }),
      paper("b", { arxivId: "2401.00001" }),
    ),
    false,
  );
});
test("deduplication retains local files, progress, verified metadata and every reference", () => {
  const w = emptyWorkspace("test");
  w.papers = [
    paper("local", { file: "local.pdf", text: "FULL TEXT", status: "learned" }),
    paper("online", {
      arxivId: "2010.11929",
      verification: "verified",
      year: 2020,
      inLibrary: false,
    }),
  ];
  w.nodes = [
    {
      id: "n",
      paperIds: ["local", "online"],
      paperRelations: [{ paperId: "online", relation: "Uses" }],
    },
  ];
  w.paperEdges = [{ id: "e", source: "online", target: "other" }];
  w.routes = [{ id: "r", stages: [stage(["online"])] }];
  w.messages = [{ paperId: "online" }];
  w.suggestions = [{ paperId: "online", node: { paperIds: ["online"] } }];
  dedupePapers(w);
  assert.equal(w.papers.length, 1);
  const p = w.papers[0];
  assert.equal(p.file, "local.pdf");
  assert.equal(p.text, "FULL TEXT");
  assert.equal(p.status, "learned");
  assert.equal(p.year, 2020);
  assert.equal(p.verification, "verified");
  assert.deepEqual(w.nodes[0].paperIds, ["local"]);
  assert.equal(w.paperEdges[0].source, "local");
  assert.equal(w.routes[0].stages[0].paperIds[0], "local");
  assert.equal(w.messages[0].paperId, "local");
  assert.equal(w.suggestions[0].node.paperIds[0], "local");
  assert.equal(w.paperAliases.online, "local");
});
test("directions normalize old prose, inherit classification and support multiple tasks", () => {
  const result = directionsFor(
    { name: "卷积特征", direction: "核心架构；被下游定位任务依赖。" },
    [{ title: "Image Classification with CNNs" }],
  );
  assert.ok(result.includes("Detection"));
  assert.ok(result.includes("Classification"));
  assert.deepEqual(
    directionsFor({ directions: ["Multimodal", "Classification"] }, []),
    ["Multimodal", "Classification"],
  );
});
test("near-identical routes merge, preserving selected state and unique side quests", () => {
  const a = {
    id: "a",
    title: "A",
    goal: "one",
    selected: false,
    stages: [stage(["a", "b", "c", "d", "e", "f"])],
  };
  const b = {
    id: "b",
    title: "B",
    goal: "two",
    selected: true,
    stages: [
      stage(["a", "b", "c", "d"]),
      stage(["b"], { sideQuest: true, capability: "necessary knowledge" }),
    ],
  };
  const merged = mergeRoutes([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].selected, true);
  assert.equal(merged[0].mergedCount, 2);
  assert.ok(merged[0].stages.some((s) => s.sideQuest));
  assert.ok(merged[0].alternativeGoals.includes("two"));
  const c = { ...b, id: "c", stages: [stage(["a", "g", "h", "i"])] };
  assert.equal(mergeRoutes([a, c]).length, 2);
});
test("automatic organization filters incidental details, merges bilingual aliases and resolves relation IDs", () => {
  const w = emptyWorkspace("test");
  const p = paper("p");
  w.papers = [p];
  const output = {
    nodes: [
      {
        name: "残差连接",
        englishName: "Residual Connection",
        chineseName: "残差连接",
        year: 2015,
        category: "Component",
        importance: "major",
        description: "Shortcut",
        significance: "Understanding deep networks",
        contribution: "Uses",
        necessary: true,
      },
      { name: "一个无关参数", necessary: false },
    ],
    edges: [],
    paperEdges: [],
  };
  applyOrganization(w, p, output);
  assert.equal(w.nodes.length, 1);
  assert.equal(w.nodes[0].name, "Residual Connection");
  assert.equal(p.organizationReport.skipped.length, 1);
  assert.ok(w.nodes[0].directions.includes("Classification"));
  const id = w.nodes[0].id;
  w.nodes[0].status = "learned";
  applyOrganization(
    w,
    p,
    {
      ...output,
      nodes: [
        { ...output.nodes[0], name: "Residual Connection", existingNodeId: id },
      ],
    },
    { preferEnglishTerms: false },
  );
  assert.equal(w.nodes.length, 1);
  assert.equal(w.nodes[0].name, "残差连接");
  assert.equal(w.nodes[0].status, "learned");
  assert.equal(w.suggestions.length, 0);
});
test("dense same-year graphs expand vertically and never fabricate unknown years", () => {
  const nodes = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    name: "Long technical label " + i + " with additional explanation",
    year: 2020,
    importance: "landmark",
  }));
  nodes.push({
    id: "unknown",
    name: "unknown",
    year: null,
    importance: "normal",
  });
  const layout = layoutGraph(nodes);
  assert.ok(layout.height > 3000);
  assert.ok(layout.years.includes(null));
  const positions = [...layout.positions.values()]
    .filter((p) => p.x === layout.yearX(0))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < positions.length; i++)
    assert.ok(positions[i].y - positions[i - 1].y >= 220);
});
test("right-to-left arrows terminate at the right rim of their target", () => {
  const a = { x: 500, y: 100, r: 39 },
    b = { x: 200, y: 200, r: 31 };
  assert.ok(edgePath(a, b).d.endsWith("234 200"));
  assert.ok(edgePath(b, a).d.endsWith("458 100"));
});
test("spacing controls independently set node distances with safe minimums", () => {
  const nodes = [
    { id: "a", name: "A", year: 2015, importance: "major" },
    { id: "b", name: "B", year: 2015, importance: "major" },
    { id: "c", name: "C", year: 2017, importance: "major" },
  ];
  const large = layoutGraph(nodes, { horizontal: 420, vertical: 360 });
  assert.equal(large.positions.get("c").x - large.positions.get("a").x, 420);
  assert.equal(large.positions.get("b").y - large.positions.get("a").y, 360);
  const small = layoutGraph(nodes, { horizontal: 1, vertical: 1 });
  assert.equal(small.positions.get("c").x - small.positions.get("a").x, 160);
  assert.equal(small.positions.get("b").y - small.positions.get("a").y, 120);
});
test("migration repairs prior upload-year bug and is idempotent", () => {
  const w = emptyWorkspace("test");
  w.papers = [
    paper("p", {
      source: "upload",
      year: 2026,
      title: "VGG",
      text: "arXiv:1409.1556v6 [cs.CV] 10 Apr 2015",
    }),
  ];
  assert.equal(migrateWorkspace(w), true);
  assert.equal(w.papers[0].year, 2014);
  assert.equal(migrateWorkspace(w), false);
});
