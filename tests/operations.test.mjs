import { test } from "node:test";
import assert from "node:assert/strict";
import { createOperations, operationPath } from "../server/operations.mjs";

test("operation progress is workspace scoped, bounded, and immutable after completion", () => {
  let time = 0;
  const operations = createOperations({ now: () => time, ttl: 100, limit: 2 });
  const a = operations.begin("a", "one");
  assert.equal(operations.get("a", "two"), undefined);
  a.update("verification", "核验", "paper", { current: 1, total: 2 });
  assert.equal(operations.get("a", "one").current.total, 2);
  const snapshot = operations.get("a", "one");
  snapshot.current.label = "changed";
  assert.equal(operations.get("a", "one").current.label, "核验");
  assert.throws(() => operations.begin("a", "two"), { status: 409 });
  operations.begin("b", "one");
  assert.throws(() => operations.begin("c", "one"), { status: 503 });
  for (let i = 0; i < 30; i++) a.update("step", "step");
  assert.equal(operations.get("a", "one").steps.length, 20);
  a.finish(true);
  a.update("late", "late");
  a.finish(false);
  assert.equal(operations.get("a", "one").status, "succeeded");
  assert.equal(operations.get("a", "one").current.phase, "done");
  operations.begin("c", "one");
  assert.equal(operations.get("a", "one"), undefined);
  time = 101;
  assert.equal(operations.get("b", "one"), undefined);
});

test("only long-running POST paths are tracked, never notes or preference writes", () => {
  for (const p of [
    "/chat",
    "/upload",
    "/arxiv",
    "/repair",
    "/reassess-importance",
    "/routes/generate",
    "/papers/p/organize",
    "/papers/p/verify",
  ])
    assert.ok(operationPath.test(p));
  for (const p of [
    "/notes",
    "/notes/n",
    "/nodes/n",
    "/preferences",
    "/settings",
    "/operations/id",
  ])
    assert.ok(!operationPath.test(p));
});
