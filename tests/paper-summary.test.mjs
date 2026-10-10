import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOrganization } from "../server/organizer.mjs";
import { applyOrganization, mergePaper } from "../server/research.mjs";
import { emptyWorkspace } from "../server/seed.mjs";

const node = {
  name: "Shared Method",
  englishName: "Shared Method",
  chineseName: "共用方法",
  description: "一种可复用方法。",
  importance: "normal",
  contribution: "Uses",
  necessary: true,
};
const output = (paperSummary) =>
  normalizeOrganization({
    summary: "论文摘要",
    nodes: [{ ...node, paperSummary }],
  });

test("the same technology retains independent two-sentence explanations for each paper across reorganization and deduplication", () => {
  const w = emptyWorkspace("Summaries");
  const a = {
    id: "a",
    title: "First paper",
    inLibrary: true,
    addedAt: "2020-01-01",
  };
  const b = {
    id: "b",
    title: "Second paper",
    inLibrary: true,
    addedAt: "2024-01-01",
  };
  w.papers = [a, b];
  const first = {
    role: "用于第一篇论文的分类任务。",
    implementation: "将输入转换为分类特征。",
  };
  const second = {
    role: "用于第二篇论文的检测任务。",
    implementation: "复用特征并连接检测头。",
  };
  applyOrganization(w, a, output(first));
  applyOrganization(w, b, output(second));
  assert.equal(w.nodes.length, 1);
  const n = w.nodes[0];
  assert.equal(
    n.paperSummary,
    undefined,
    "paper-specific prose is not a global technology field",
  );
  const summaries = () =>
    Object.fromEntries(n.paperRelations.map((r) => [r.paperId, r.summary]));
  assert.deepEqual(summaries(), { a: first, b: second });
  applyOrganization(
    w,
    a,
    output({
      role: "用于第一篇论文的改进分类任务。",
      implementation: "以改进结构生成分类特征。",
    }),
  );
  assert.deepEqual(summaries().b, second);
  assert.equal(n.paperRelations.length, 2);
  const duplicate = { ...b, id: "b-copy", libraryAddedAt: "2025-01-01" };
  w.papers.push(duplicate);
  applyOrganization(
    w,
    duplicate,
    output({ role: "检测概括。", implementation: "检测实现。" }),
  );
  mergePaper(w, b, duplicate);
  assert.ok(n.paperRelations.every((r) => r.paperId !== "b-copy"));
  assert.ok(n.paperRelations.some((r) => r.summary.role === "检测概括。"));
  assert.equal(b.libraryAddedAt, "2024-01-01");
});

test("missing or partial explanations preserve valid prior prose and useful nodes while reporting source limitations", () => {
  const w = emptyWorkspace("Incomplete summaries");
  const p = { id: "a", title: "Paper", inLibrary: true };
  w.papers = [p];
  const missing = output();
  assert.match(missing.warnings.join(" "), /两句概括不完整/);
  applyOrganization(w, p, missing);
  assert.equal(w.nodes.length, 1);
  assert.match(w.nodes[0].paperRelations[0].summary.implementation, /未提供/);
  applyOrganization(
    w,
    p,
    output({ role: "这是本文作用", implementation: "这是本文实现。" }),
  );
  applyOrganization(
    w,
    p,
    output({ role: "更新的本文作用。其他冗余句子。", implementation: null }),
  );
  assert.deepEqual(w.nodes[0].paperRelations[0].summary, {
    role: "更新的本文作用。",
    implementation: "这是本文实现。",
  });
  applyOrganization(w, p, missing);
  assert.deepEqual(w.nodes[0].paperRelations[0].summary, {
    role: "更新的本文作用。",
    implementation: "这是本文实现。",
  });
});
