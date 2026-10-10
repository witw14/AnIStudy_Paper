import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createApp } from "../server/app.mjs";

const dir = mkdtempSync(join(tmpdir(), "anistudy-operation-"));
let server, store, base;
let runModel = async () => "answer";
let runVerify = async (id) => ({
  title: `Paper ${id}`,
  authors: "Author",
  arxivId: id,
  year: 2024,
  summary: "abstract",
  verification: "verified",
  source: "arxiv",
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
before(async () => {
  const setup = createApp({
    acquisition: false,
    dataDir: dir,
    seed: false,
    model: (...args) => runModel(...args),
    verify: (...args) => runVerify(...args),
  });
  store = setup.store;
  server = setup.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
  assert.ok(basename(dir).startsWith("anistudy-operation-"));
  rmSync(dir, { recursive: true, force: true });
});
async function request(path, body, id, method) {
  const response = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(id ? { "X-AnIStudy-Operation": id } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    data: await response.json(),
    cache: response.headers.get("cache-control"),
  };
}
const progress = (wid, oid) => request(`/workspaces/${wid}/operations/${oid}`);

test(
  "live chat progress reflects model execution; per-turn times and actual usage persist without polluting model history",
  { timeout: 8000 },
  async () => {
    const w = store.create("Chat progress", "");
    const other = store.create("Other", "");
    const entered = deferred(),
      release = deferred();
    runModel = async (_, __, json, options) => {
      assert.equal(json, false);
      entered.resolve();
      await release.promise;
      options.onUsage({
        inputTokens: 100,
        outputTokens: 12,
        totalTokens: 112,
        reasoningTokens: 4,
      });
      return "第一轮回答";
    };
    const oid = randomUUID();
    const pending = request(
      `/workspaces/${w.id}/chat`,
      { mode: "research", message: "问题" },
      oid,
    );
    await entered.promise;
    try {
      const current = await progress(w.id, oid);
      assert.equal(current.data.current.phase, "model");
      assert.match(current.data.current.label, /正在调用大模型/);
      assert.equal(current.cache, "no-store");
      assert.equal((await progress(other.id, oid)).status, 404);
      assert.equal(store.get(w.id).messages.length, 0);
    } finally {
      release.resolve();
    }
    const result = await pending;
    assert.equal(result.status, 200);
    const [sent, answer] = result.data.messages;
    assert.ok(Date.parse(sent.time) < Date.parse(answer.time));
    assert.equal(sent.turnId, answer.turnId);
    assert.deepEqual(answer.tokenUsage, {
      inputTokens: 100,
      outputTokens: 12,
      totalTokens: 112,
      reasoningTokens: 4,
    });
    assert.ok(answer.durationMs >= 0);
    assert.deepEqual(store.get(w.id).messages, result.data.messages);
    assert.equal((await progress(w.id, oid)).data.status, "succeeded");
    runModel = async (_, history) => {
      assert.deepEqual(history.slice(1, -1), [
        { role: "user", content: "问题" },
        { role: "assistant", content: "第一轮回答" },
      ]);
      return "未返回 usage";
    };
    const next = await request(`/workspaces/${w.id}/chat`, {
      mode: "research",
      message: "再问",
    });
    assert.equal(next.status, 200);
    assert.equal(next.data.messages.at(-1).tokenUsage, null);
  },
);

test(
  "route progress advances from actual model calls to each paper verification and saving",
  { timeout: 8000 },
  async () => {
    const w = store.create("Route progress", "");
    const modelEntered = deferred(),
      modelRelease = deferred();
    const gates = [0, 1].map(() => ({
      entered: deferred(),
      release: deferred(),
    }));
    const ids = ["2401.12345", "2401.54321"];
    runModel = async () => {
      modelEntered.resolve();
      await modelRelease.promise;
      return {
        recommendations: ids.map((arxivId) => ({
          arxivId,
          title: `Paper ${arxivId}`,
          reason: "learning",
        })),
        routes: [
          {
            title: "路线",
            goal: "goal",
            stages: [
              {
                title: "阶段",
                capability: "理解",
                paperIds: ids,
                nodeIds: [],
                sideQuest: false,
              },
            ],
          },
        ],
      };
    };
    runVerify = async (id) => {
      const gate = gates[ids.indexOf(id)];
      gate.entered.resolve();
      await gate.release.promise;
      return {
        title: `Paper ${id}`,
        arxivId: id,
        authors: "Author",
        year: 2024,
        summary: "Abstract",
        source: "arxiv",
        verification: "verified",
      };
    };
    const oid = randomUUID();
    const pending = request(
      `/workspaces/${w.id}/routes/generate`,
      { goal: "learn" },
      oid,
    );
    try {
      await modelEntered.promise;
      assert.equal((await progress(w.id, oid)).data.current.phase, "model");
      modelRelease.resolve();
      for (let i = 0; i < 2; i++) {
        await gates[i].entered.promise;
        const current = (await progress(w.id, oid)).data.current;
        assert.equal(current.phase, "verification");
        assert.equal(current.current, i + 1);
        assert.equal(current.total, 2);
        assert.equal(current.detail, `Paper ${ids[i]}`);
        assert.equal(store.get(w.id).routes.length, 0);
        gates[i].release.resolve();
      }
    } finally {
      modelRelease.resolve();
      gates.forEach((g) => g.release.resolve());
    }
    assert.equal((await pending).status, 200);
    const result = (await progress(w.id, oid)).data;
    assert.equal(result.status, "succeeded");
    assert.deepEqual(
      result.steps.map((s) => s.phase),
      [
        "received",
        "planning",
        "model",
        "model-result",
        "validation",
        "verification",
        "verified",
        "verification",
        "verified",
        "saving",
        "done",
      ],
    );
    assert.equal(store.get(w.id).routes.length, 1);
  },
);

test("failed verification finishes progress without changing data; invalid and duplicate operation IDs are rejected", async () => {
  const w = store.create("Failed progress", "");
  runVerify = async () => {
    throw new Error("Verification unavailable");
  };
  const oid = randomUUID();
  const original = store.get(w.id);
  const failed = await request(
    `/workspaces/${w.id}/arxiv`,
    { input: "2401.12345" },
    oid,
  );
  assert.equal(failed.status, 500);
  assert.deepEqual(store.get(w.id), original);
  assert.equal((await progress(w.id, oid)).data.status, "failed");
  assert.equal(
    (await request(`/workspaces/${w.id}/arxiv`, { input: "2401.12345" }, oid))
      .status,
    409,
  );
  assert.equal(
    (
      await request(
        `/workspaces/${w.id}/arxiv`,
        { input: "2401.12345" },
        "bad-id",
      )
    ).status,
    400,
  );
  assert.equal((await progress(w.id, randomUUID())).status, 404);
});

test("organization recovery reports its real retry and fallback while retaining partial information", async () => {
  const w = store.create("Fallback", "");
  w.papers.push({
    id: "paper",
    title: "Local Paper",
    authors: "Author",
    summary: "Provided source abstract.",
    year: null,
    arxivId: null,
    inLibrary: true,
    status: "unlearned",
    verification: "unverified",
    source: "pdf",
    file: null,
    text: "",
  });
  store.put(w);
  runModel = async () => {
    throw new Error("Invalid model output");
  };
  const oid = randomUUID();
  const result = await request(
    `/workspaces/${w.id}/papers/paper/organize`,
    {},
    oid,
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.papers[0].organizationReport.quality, "fallback");
  const phases = (await progress(w.id, oid)).data.steps.map((s) => s.phase);
  for (const phase of [
    "model",
    "recovery",
    "retry",
    "fallback",
    "validation",
    "saving",
    "done",
  ])
    assert.ok(phases.includes(phase), phase);
  assert.ok(!phases.includes("verification"));
  assert.equal(result.data.nodes.length, 0);
});

test("chat display toggles persist independently, roundtrip config files, reject invalid types, and never delete usage", async () => {
  assert.equal((await request("/settings")).data.showChatTime, true);
  assert.equal((await request("/settings")).data.showChatTokens, true);
  await request(
    "/settings",
    { showChatTime: false, showChatTokens: true },
    undefined,
    "PUT",
  );
  assert.equal((await request("/settings")).data.showChatTime, false);
  assert.equal((await request("/settings")).data.showChatTokens, true);
  await request("/preferences", { showChatTokens: false }, undefined, "PATCH");
  const file = (await request("/preferences/export")).data;
  assert.equal(file.settings.showChatTime, false);
  assert.equal(file.settings.showChatTokens, false);
  await request(
    "/preferences",
    { showChatTime: true, showChatTokens: true },
    undefined,
    "PATCH",
  );
  assert.equal((await request("/preferences/import", file)).status, 200);
  assert.equal((await request("/settings")).data.showChatTime, false);
  assert.equal(
    (
      await request(
        "/preferences",
        { showChatTokens: "false", showChatTime: true },
        undefined,
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal((await request("/settings")).data.showChatTime, false);
  const w = store.create("Hidden metrics still recorded", "");
  runModel = async (_, __, ___, options) => {
    options.onUsage({ outputTokens: 0 });
    return "zero";
  };
  const result = await request(`/workspaces/${w.id}/chat`, {
    mode: "research",
    message: "hi",
  });
  assert.deepEqual(result.data.messages[1].tokenUsage, { outputTokens: 0 });
});
