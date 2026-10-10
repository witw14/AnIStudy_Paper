import { test } from "node:test";
import assert from "node:assert/strict";
import { scopedContext } from "../server/services.mjs";

function workspace() {
  return {
    name: "Current space",
    papers: [
      {
        id: "current",
        title: "Current paper",
        authors: "A",
        year: 2020,
        arxivId: "2010.12345",
        summary: "Current abstract",
        inLibrary: true,
        status: "learning",
        verification: "verified",
        text: "Current PDF text",
      },
      {
        id: "other",
        title: "Other collected paper",
        summary: "Other abstract",
        inLibrary: true,
        text: "Other private PDF",
      },
      {
        id: "candidate",
        title: "Candidate paper",
        authors: "B",
        year: 2021,
        summary: "Candidate abstract",
        inLibrary: false,
        text: "Candidate private PDF",
      },
    ],
    nodes: [
      {
        id: "method",
        name: "Method",
        paperIds: ["current"],
        status: "unlearned",
      },
    ],
    edges: [{ source: "method", target: "prerequisite", relation: "Requires" }],
    paperEdges: [{ source: "current", target: "candidate", relation: "Uses" }],
    routes: [
      {
        id: "active",
        selected: true,
        stages: [{ paperIds: ["current", "candidate", "missing"] }],
      },
      {
        id: "alternative",
        selected: false,
        stages: [{ paperIds: ["other", "missing"] }],
      },
    ],
    memories: [{ text: "Research-only memory" }],
  };
}

test("Paper context includes selected metadata and text without library, candidate, graph, route or memory leakage", () => {
  const w = workspace();
  const context = scopedContext(w, "paper", "current");
  assert.deepEqual(Object.keys(context), ["paper"]);
  assert.equal(context.paper.authors, "A");
  assert.equal(context.paper.year, 2020);
  assert.equal(context.paper.verification, "verified");
  assert.equal(context.paper.text, "Current PDF text");
  assert.equal(context.paper.status, "learning");
  assert.ok(!JSON.stringify(context).includes("Other"));
  assert.ok(!JSON.stringify(context).includes("Candidate"));
  assert.ok(!JSON.stringify(context).includes("Research-only memory"));
  assert.throws(() => scopedContext(w, "paper", "candidate"));
  assert.throws(() => scopedContext(w, "paper", "foreign-id"));
});

test("Research context distinguishes library from candidates, selected plans from alternatives and unresolved route IDs", () => {
  const w = workspace();
  const context = scopedContext(w, "research", "current");
  assert.deepEqual(
    context.papers.map((p) => p.id),
    ["current", "other"],
  );
  assert.equal(context.papers[0].text, "Current PDF text");
  assert.equal(context.papers[1].text, undefined);
  assert.deepEqual(
    context.candidatePapers.map((p) => p.id),
    ["candidate"],
  );
  assert.equal(context.candidatePapers[0].summary, "Candidate abstract");
  assert.equal(context.candidatePapers[0].inLibrary, false);
  assert.equal(context.candidatePapers[0].text, undefined);
  assert.deepEqual(
    context.routes.map((r) => r.selected),
    [true, false],
  );
  assert.deepEqual(context.unresolvedRoutePaperIds, ["missing"]);
  assert.deepEqual(context.edges, w.edges);
  assert.deepEqual(context.paperEdges, w.paperEdges);
  assert.ok(!JSON.stringify(context).includes("Other private PDF"));
  assert.ok(!JSON.stringify(context).includes("Candidate private PDF"));
  assert.equal(
    w.papers[2].text,
    "Candidate private PDF",
    "context construction does not alter stored papers",
  );
});

test("chat contexts bound selected text and disclose incomplete extraction instead of presenting summaries as full papers", () => {
  const w = workspace();
  w.papers[0].text = "x".repeat(70000);
  const paper = scopedContext(w, "paper", "current").paper;
  assert.equal(paper.text.length, 65000);
  assert.match(paper.sourceScope, /截断/);
  const research = scopedContext(w, "research", "current");
  assert.equal(research.papers[0].text.length, 35000);
  assert.match(research.papers[0].sourceScope, /不完整/);
  w.papers[0].text = "";
  assert.match(
    scopedContext(w, "paper", "current").paper.sourceScope,
    /仅摘要/,
  );
});
