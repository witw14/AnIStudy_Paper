import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorkspace } from "../server/seed.mjs";
import { normalizeOrganization } from "../server/organizer.mjs";
import { applyOrganization, refreshDirections } from "../server/research.mjs";
import { taxonomyFor } from "../server/taxonomy.mjs";
import { applyRepairs } from "../server/repair.mjs";

const proposal = {
  summary: "医学检测综述",
  taxonomy: {
    directions: [
      {
        id: "diagnostics",
        name: "即时诊断",
        aliases: ["Point-of-care diagnostics", "即时检测"],
      },
    ],
    categories: [
      { id: "assay", name: "检测平台", aliases: ["Assay platform"] },
    ],
  },
  nodes: [
    {
      name: "Lateral flow assay",
      description: "疾病诊断的纸基检测平台",
      category: "assay",
      directions: ["diagnostics"],
      necessary: true,
    },
  ],
};
function space(name = "医学诊断") {
  const w = emptyWorkspace(name);
  w.papers.push({ id: "p", title: "LFA review", inLibrary: true });
  return w;
}
test("new spaces have no preset taxonomy and medical categories survive normalization and refresh", () => {
  const w = space();
  assert.deepEqual(taxonomyFor(w), { directions: [], categories: [] });
  applyOrganization(w, w.papers[0], normalizeOrganization(proposal));
  refreshDirections(w);
  assert.deepEqual(w.nodes[0].directions, ["diagnostics"]);
  assert.equal(w.nodes[0].category, "assay");
  assert.equal(taxonomyFor(w).directions[0].name, "即时诊断");
  assert.equal(taxonomyFor(w).categories[0].name, "检测平台");
  assert.deepEqual(taxonomyFor(space("计算机视觉")), {
    directions: [],
    categories: [],
  });
});
test("repeated bilingual category labels reuse IDs without growing taxonomy", () => {
  const w = space();
  applyOrganization(w, w.papers[0], normalizeOrganization(proposal));
  const repeated = normalizeOrganization({
    ...proposal,
    nodes: [
      {
        ...proposal.nodes[0],
        category: "Assay platform",
        directions: ["Point-of-care diagnostics"],
      },
    ],
  });
  applyOrganization(w, w.papers[0], repeated);
  assert.equal(w.nodes.length, 1);
  assert.equal(w.taxonomy.directions.length, 1);
  assert.equal(w.taxonomy.categories.length, 1);
  assert.deepEqual(w.nodes[0].directions, ["diagnostics"]);
  assert.equal(w.nodes[0].category, "assay");
});
test("irrelevant skipped nodes cannot create empty categories, reorganization can correct old assignments", () => {
  const w = space();
  applyOrganization(
    w,
    w.papers[0],
    normalizeOrganization({
      ...proposal,
      nodes: [{ ...proposal.nodes[0], necessary: false }],
    }),
  );
  assert.deepEqual(taxonomyFor(w), { directions: [], categories: [] });
  applyOrganization(
    w,
    w.papers[0],
    normalizeOrganization({
      ...proposal,
      nodes: [
        {
          ...proposal.nodes[0],
          category: "Architecture",
          directions: ["Classification"],
        },
      ],
    }),
  );
  applyOrganization(w, w.papers[0], normalizeOrganization(proposal));
  assert.deepEqual(w.nodes[0].directions, ["diagnostics"]);
  assert.equal(taxonomyFor(w).directions.length, 1);
  assert.equal(taxonomyFor(w).directions[0].name, "即时诊断");
});
test("repair flow also accepts and preserves domain-specific types and directions", () => {
  const w = space();
  applyOrganization(w, w.papers[0], normalizeOrganization(proposal));
  applyRepairs(w, {
    papers: [],
    taxonomy: {
      directions: [{ id: "diagnostics", name: "即时诊断" }],
      categories: [{ id: "材料化学", name: "材料化学" }],
    },
    nodes: [
      {
        id: w.nodes[0].id,
        englishName: "Lateral flow assay",
        chineseName: "侧向层析检测",
        category: "材料化学",
        directions: ["diagnostics"],
      },
    ],
  });
  assert.equal(taxonomyFor(w).categories[0].name, "材料化学");
  assert.deepEqual(w.nodes[0].directions, ["diagnostics"]);
});
