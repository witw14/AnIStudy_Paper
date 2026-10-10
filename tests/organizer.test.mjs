import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrganization,
  recoverObject,
  organizeResiliently,
} from "../server/organizer.mjs";
import { extractMetadata, applyOrganization } from "../server/research.mjs";
import { emptyWorkspace } from "../server/seed.mjs";
import { reasoningBody } from "../server/reasoning.mjs";
import { callModel } from "../server/services.mjs";

const node = {
  name: "Lateral flow assay (LFA)",
  englishName: "Lateral flow assay (LFA)",
  year: null,
  category: "Architecture",
  importance: "major",
  description: "论文使用的侧向层析检测平台。",
  significance: "理解本文的前置知识。",
  relevance: "prerequisite",
  necessary: true,
  contribution: "Uses",
};
const paper = {
  id: "p",
  title: "Review",
  summary: "",
  text: "Cite this: Lab Chip, 2026, 26, 2394\nReceived 5th December 2025\nPublished on 17 March 2026\nLateral flow assays (LFAs) are diagnostic platforms.",
};

test("review nodes accept unknown years, preserving existing known years on merge", () => {
  const result = normalizeOrganization({
    summary: "综述",
    metadata: { year: "2026", authors: ["A", { name: "B" }] },
    nodes: [node, null, { ...node, name: "bad", description: null }],
    edges: [{ source: node.name, target: "bad", relation: "invented" }],
  });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0].year, null);
  assert.equal(result.metadata.year, 2026);
  assert.equal(result.metadata.authors, "A, B");
  assert.equal(result.edges.length, 0);
  const w = emptyWorkspace("review");
  w.papers.push(paper);
  applyOrganization(w, paper, result);
  assert.equal(w.nodes[0].year, null);
  w.nodes[0].year = 1984;
  applyOrganization(w, paper, result);
  assert.equal(w.nodes.length, 1);
  assert.equal(w.nodes[0].year, 1984);
});

test("partial JSON retains only complete summary, metadata and nodes", () => {
  const raw = `Here is JSON: {"summary":"A \\"quoted\\" summary", "metadata":{"year":2026},"nodes":[${JSON.stringify(node)},{"name":"unfinished`;
  const recovered = recoverObject(raw);
  assert.equal(recovered.summary, 'A "quoted" summary');
  assert.equal(recovered.metadata.year, 2026);
  assert.equal(recovered.nodes.length, 1);
  assert.deepEqual(recoverObject(null), {});
  assert.equal(
    recoverObject('```json\n{"summary":"ok","nodes":[]}\n```').summary,
    "ok",
  );
});

test("malformed model JSON with useful fields does not need another request", async () => {
  const result = await organizeResiliently({
    paper,
    settings: {},
    initial: async () => {
      throw Object.assign(new Error("bad JSON"), {
        rawContent: '{"summary":"有效摘要","nodes":[',
      });
    },
    model: async () => {
      throw new Error("should not retry");
    },
  });
  assert.equal(result.summary, "有效摘要");
  assert.equal(result.quality, "partial");
  assert.equal(result.recovered, true);
});

test("simplified retry saves useful information and repeated total failure falls back to source", async () => {
  let calls = 0;
  const result = await organizeResiliently({
    paper,
    settings: {},
    initial: async () => null,
    model: async () => {
      calls++;
      return { summary: "恢复的综述摘要", nodes: [] };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.recovered, true);
  assert.equal(result.summary, "恢复的综述摘要");
  const fallback = await organizeResiliently({
    paper,
    settings: {},
    initial: async () => {
      throw new Error("timeout");
    },
    model: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(fallback.quality, "fallback");
  assert.ok(fallback.summary.includes("原文摘录"));
  assert.ok(fallback.summary.includes("Lateral flow assays"));
  assert.equal(fallback.metadata.year, 2026);
  assert.equal(fallback.nodes.length, 0);
  const prior = await organizeResiliently({
    paper: { ...paper, summary: "已经整理的可靠摘要" },
    settings: {},
    initial: async () => null,
    model: async () => null,
  });
  assert.equal(prior.summary, "已经整理的可靠摘要");
});

test("authorization failures do not incur retry and publication year is not received year", async () => {
  const result = await organizeResiliently({
    paper,
    settings: {},
    initial: async () => {
      throw Object.assign(new Error("auth"), { upstreamStatus: 401 });
    },
    model: async () => assert.fail("no retry for invalid credentials"),
  });
  assert.equal(result.quality, "fallback");
  assert.equal(extractMetadata(paper.text, "d5lc01124h.pdf").year, 2026);
  assert.equal(
    extractMetadata("Received 2025\nAccepted 2026", "review.pdf").year,
    null,
  );
});

test("reasoning controls map to supported provider parameters without leaking into JSON organization", async () => {
  const settings = {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    deepThinking: "enabled",
    reasoningEffort: "max",
  };
  assert.deepEqual(reasoningBody(settings), {
    thinking: { type: "enabled" },
    reasoning_effort: "max",
  });
  assert.deepEqual(reasoningBody({ ...settings, deepThinking: "disabled" }), {
    thinking: { type: "disabled" },
  });
  assert.deepEqual(
    reasoningBody({ ...settings, baseUrl: "https://unknown.example/v1" }),
    {},
  );
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '"reply"' } }] }),
    );
  };
  try {
    await callModel({ ...settings, apiKey: "test" }, [], false);
    assert.equal(body.reasoning_effort, "max");
    assert.equal(body.thinking.type, "enabled");
    await callModel({ ...settings, apiKey: "test" }, [], true);
    assert.equal(body.thinking, undefined);
    assert.equal(body.reasoning_effort, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
