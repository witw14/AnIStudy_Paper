import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createStore } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { createUsageLedger, aggregateUsage } from "../server/usage-ledger.mjs";
import { settingsForTask } from "../server/reasoning.mjs";
import { callModel } from "../server/services.mjs";
import { pdfDocument } from "../server/documents.mjs";
import {
  exportPreferences,
  importPreferences,
} from "../server/preferences.mjs";

function temporary() {
  return mkdtempSync(join(tmpdir(), "anistudy-usage-"));
}
function cleanup(dir) {
  assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
  assert.ok(basename(dir).startsWith("anistudy-usage-"));
  rmSync(dir, { recursive: true, force: true });
}

test("daily usage respects timezone boundaries, includes zero days and missing values, and aggregates failed/retried calls without double-counting reasoning", () => {
  const row = (id, finished_at, category, counts) => ({
    id,
    task_id: category,
    workspace_id: "w",
    category,
    finished_at,
    task_status: "succeeded",
    source: "live",
    ...counts,
  });
  const rows = [
    row("a", "2026-10-08T16:01:00Z", "translation", {
      input_tokens: 100,
      output_tokens: 40,
      total_tokens: 140,
      reasoning_tokens: 15,
    }),
    row("b", "2026-10-08T15:59:00Z", "chat", {
      input_tokens: 20,
      output_tokens: 5,
      total_tokens: 25,
    }),
    {
      ...row("c", "2026-10-09T01:00:00Z", "translation", {
        input_tokens: 50,
        output_tokens: null,
        total_tokens: null,
      }),
      task_status: "failed",
    },
    row("d", "2026-09-30T12:00:00Z", "routes", {
      input_tokens: 200,
      output_tokens: 30,
    }),
  ];
  const weekly = aggregateUsage(rows, {
    days: 7,
    timezone: "Asia/Shanghai",
    now: Date.parse("2026-10-09T03:00:00Z"),
  });
  assert.equal(weekly.daily.length, 7);
  assert.equal(weekly.daily[0].date, "2026-10-03");
  assert.equal(weekly.daily.at(-2).categories.chat.inputTokens, 20);
  assert.equal(weekly.daily.at(-1).inputTokens, 150);
  assert.equal(weekly.daily.at(-1).outputTokens, 40);
  assert.equal(weekly.daily.at(-1).missingOutputRecords, 1);
  assert.deepEqual(weekly.totals, {
    inputTokens: 170,
    outputTokens: 45,
    missingInputRecords: 0,
    missingOutputRecords: 1,
  });
  const translation = weekly.tasks.find((t) => t.category === "translation");
  assert.equal(translation.calls, 2);
  assert.equal(translation.totalTokens, 140);
  assert.equal(translation.missingTotalRecords, 1);
  assert.equal(translation.status, "failed");
  const monthly = aggregateUsage(rows, {
    days: 30,
    timezone: "Asia/Shanghai",
    now: Date.parse("2026-10-09T03:00:00Z"),
  });
  assert.equal(monthly.daily.length, 30);
  assert.equal(monthly.totals.inputTokens, 370);
});
test("legacy migration is idempotent, preserves original data, and task history distinguishes missing usage and interrupted jobs", (t) => {
  const dir = temporary();
  const store = createStore(dir, false);
  t.after(() => {
    store.db.close();
    cleanup(dir);
  });
  const w = store.create("History", "");
  w.messages = [
    {
      id: "m",
      role: "assistant",
      time: "2026-10-08T10:00:00Z",
      tokenUsage: { inputTokens: 9, outputTokens: 4, totalTokens: 13 },
      content: "Private text",
    },
  ];
  w.routes = [
    { id: "old-route", title: "Legacy plan", goal: "Learn", stages: [] },
  ];
  w.papers = [
    {
      id: "p",
      title: "Test",
      organizedAt: "2026-10-07T10:00:00Z",
      fullTranslations: [
        {
          id: "tr",
          sourceDocumentId: "d",
          state: "complete",
          updatedAt: "2026-10-08T12:00:00Z",
          tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        },
      ],
    },
  ];
  store.put(w);
  const before = JSON.stringify(store.get(w.id));
  let ledger = createUsageLedger(store);
  const legacyRoute = ledger.tasks(w.id).find((t) => t.category === "routes");
  assert.equal(legacyRoute.startedAt, "");
  assert.equal(legacyRoute.totalTokens, null);
  assert.equal(ledger.rows("2026").length, 2);
  assert.equal(
    ledger.tasks(w.id).find((t) => t.category === "organization").totalTokens,
    null,
  );
  ledger.begin(
    { taskId: "interrupted", workspaceId: w.id, category: "translation" },
    "In progress",
  );
  ledger = createUsageLedger(store);
  assert.equal(ledger.rows("2026").length, 2);
  assert.equal(
    ledger.tasks(w.id).find((t) => t.id === "interrupted").status,
    "interrupted",
  );
  assert.equal(JSON.stringify(store.get(w.id)), before);
  assert.ok(!JSON.stringify(ledger.tasks(w.id)).includes("Private text"));
});
test("task reasoning remains independent of chat, is portable without secrets, and applies to JSON requests only for configured task calls", async (t) => {
  const taskReasoning = {
    routes: { deepThinking: "enabled", reasoningEffort: "max" },
    organization: { deepThinking: "enabled", reasoningEffort: "low" },
    translation: { deepThinking: "disabled", reasoningEffort: "high" },
  };
  const settings = {
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-v4-pro",
    apiKey: "private",
    deepThinking: "enabled",
    reasoningEffort: "high",
    taskReasoning,
  };
  assert.equal(settingsForTask(settings, "chat"), settings);
  assert.equal(
    settingsForTask(settings, "organization").reasoningEffort,
    "low",
  );
  assert.equal(
    settingsForTask(settings, "translation").deepThinking,
    "disabled",
  );
  const exported = exportPreferences(settings);
  assert.deepEqual(
    importPreferences(exported, settings).taskReasoning,
    taskReasoning,
  );
  assert.ok(!JSON.stringify(exported).includes("private"));
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
    );
  });
  await callModel(settingsForTask(settings, "routes"), [], true, {
    reasoningScenario: "routes",
  });
  assert.equal(bodies[0].thinking.type, "enabled");
  assert.equal(bodies[0].reasoning_effort, "max");
  assert.equal(bodies[0].response_format.type, "json_object");
  await callModel(settingsForTask(settings, "translation"), [], true, {
    reasoningScenario: "translation",
  });
  assert.equal(bodies[1].thinking.type, "disabled");
  assert.equal(bodies[1].reasoning_effort, undefined);
  await callModel(
    { ...settings, baseUrl: "https://unknown.example/v1" },
    [],
    true,
    { reasoningScenario: "routes" },
  );
  assert.equal(bodies[2].thinking, undefined);
});
test("paid malformed model replies still report actual usage before JSON validation fails", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "invalid JSON" } }],
          usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        }),
      ),
  );
  let usage;
  await assert.rejects(() =>
    callModel(
      { baseUrl: "http://localhost/v1", model: "test", apiKey: "test" },
      [],
      true,
      { onUsage: (u) => (usage = u) },
    ),
  );
  assert.deepEqual(usage, {
    inputTokens: 10,
    outputTokens: 3,
    totalTokens: 13,
  });
});
async function fixture(t, model) {
  const dir = temporary();
  const setup = createApp({
    dataDir: dir,
    seed: false,
    acquisition: false,
    model,
  });
  const server = setup.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    setup.acquirer.close();
    await new Promise((r) => server.close(r));
    setup.store.db.close();
    cleanup(dir);
  });
  const request = async (path, body, method) => {
    const r = await fetch(
      `http://127.0.0.1:${server.address().port}/api${path}`,
      {
        method: method || (body ? "POST" : "GET"),
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    return { status: r.status, data: await r.json() };
  };
  return { ...setup, request };
}
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    const result = await fn();
    if (result) return result;
    await delay(25);
  }
  throw new Error("Task did not settle");
}
test("background translation responds immediately, survives absent browser requests, shares one job, records batches and resumes failures", async (t) => {
  let release,
    calls = 0,
    fail = false;
  let gate = new Promise((r) => (release = r));
  t.after(() => release());
  const seen = [];
  const { store, request } = await fixture(
    t,
    async (settings, m, json, options) => {
      calls++;
      seen.push(settings);
      await gate;
      options.onUsage({ inputTokens: 100, outputTokens: 60, totalTokens: 160 });
      const { segments } = JSON.parse(m.at(-1).content);
      if (fail) {
        fail = false;
        return { translations: [] };
      }
      return {
        translations: segments.map((s) => ({
          id: s.id,
          text: "中文 " + s.text,
        })),
      };
    },
  );
  const taskReasoning = {
    routes: { deepThinking: "auto", reasoningEffort: "auto" },
    organization: { deepThinking: "auto", reasoningEffort: "auto" },
    translation: { deepThinking: "disabled", reasoningEffort: "low" },
  };
  store.saveSettings({
    model: "test",
    apiKey: "private",
    deepThinking: "enabled",
    reasoningEffort: "max",
    taskReasoning,
  });
  const w = store.create("Background", ""),
    text =
      "A synthetic scientific paragraph for testing background translation. ".repeat(
        150,
      );
  const doc = pdfDocument([{ num: 1, text }], { file: null });
  w.papers.push({
    id: "p",
    title: "Synthetic",
    authors: "Test",
    year: 2026,
    text,
    document: doc,
    inLibrary: true,
    status: "unlearned",
  });
  store.put(w);
  const endpoint = `/workspaces/${w.id}/papers/p/translate`;
  const first = await request(endpoint, {
    documentId: doc.id,
    background: true,
  });
  assert.equal(first.status, 202);
  const second = await request(endpoint, {
    documentId: doc.id,
    background: true,
  });
  assert.equal(second.data.taskId, first.data.taskId);
  const active = (await request("/tasks")).data.find(
    (t) => t.id === first.data.taskId,
  );
  assert.equal(active.status, "running");
  assert.equal(active.paperId, "p");
  assert.equal(calls, 1);
  // No browser-side polling or long HTTP request is needed for completion.
  release();
  await until(
    () => store.get(w.id).papers[0].fullTranslations?.[0]?.state === "complete",
  );
  const completed = (await request("/tasks")).data.find(
    (t) => t.id === first.data.taskId,
  );
  assert.equal(completed.status, "succeeded");
  assert.ok(completed.finishedAt);
  assert.ok(calls > 1);
  assert.equal(completed.totalTokens, calls * 160);
  assert.equal(seen[0].deepThinking, "disabled");
  assert.equal(seen[0].reasoningEffort, "low");
  const usage = (await request("/usage")).data;
  assert.equal(usage.totals.inputTokens, calls * 100);
  assert.equal(usage.totals.outputTokens, calls * 60);
  const before = calls;
  assert.equal(
    (await request(endpoint, { documentId: doc.id, background: true })).data
      .cached,
    true,
  );
  assert.equal(calls, before);
  assert.equal((await request("/usage?days=90")).status, 400);
  assert.equal((await request("/usage?timezone=wrong")).status, 400);
  assert.ok(!JSON.stringify(usage).includes("private"));
  assert.ok(!JSON.stringify(usage).includes("synthetic scientific paragraph"));
  const fresh = store.get(w.id);
  fresh.papers[0].fullTranslations = [];
  store.put(fresh);
  fail = true;
  const failed = await request(endpoint, {
    documentId: doc.id,
    background: true,
  });
  await until(
    async () =>
      (await request("/tasks")).data.find((t) => t.id === failed.data.taskId)
        ?.status === "failed",
  );
  const failedTask = (await request("/tasks")).data.find(
    (t) => t.id === failed.data.taskId,
  );
  assert.equal(failedTask.totalTokens, 160);
  const retry = await request(endpoint, {
    documentId: doc.id,
    background: true,
  });
  await until(
    async () =>
      (await request("/tasks")).data.find((t) => t.id === retry.data.taskId)
        ?.status === "succeeded",
  );
  assert.equal((await request("/usage")).data.totals.inputTokens, calls * 100);
});
test("route and organization calls use separate scenario defaults; task timestamps and usage persist independently of preferences", async (t) => {
  const seen = [];
  const { store, request } = await fixture(t, async (s, m, json, options) => {
    seen.push(s);
    options?.onUsage({ inputTokens: 50, outputTokens: 20, totalTokens: 70 });
    if (m[0].content.includes("recommendations:"))
      return {
        recommendations: [],
        routes: [
          {
            title: "Plan",
            goal: "Learn",
            stages: [
              {
                title: "Read",
                capability: "Understand",
                paperIds: ["p"],
                nodeIds: [],
                sideQuest: false,
              },
            ],
          },
        ],
      };
    return { summary: "概念解释。", nodes: [], edges: [], paperEdges: [] };
  });
  const taskReasoning = {
    routes: { deepThinking: "enabled", reasoningEffort: "max" },
    organization: { deepThinking: "disabled", reasoningEffort: "low" },
    translation: { deepThinking: "auto", reasoningEffort: "auto" },
  };
  await request(
    "/settings",
    {
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-flash",
      apiKey: "test",
      taskReasoning,
    },
    "PUT",
  );
  const w = store.create("Tasks", "");
  w.papers.push({
    id: "p",
    title: "Synthetic",
    authors: "Test",
    year: 2026,
    text: "Conceptual methods.",
    summary: "Original",
    inLibrary: true,
    status: "unlearned",
    verification: "verified",
  });
  store.put(w);
  assert.equal(
    (await request(`/workspaces/${w.id}/routes/generate`, { goal: "Learn" }))
      .status,
    200,
  );
  assert.equal(seen[0].reasoningEffort, "max");
  assert.equal(
    (await request(`/workspaces/${w.id}/papers/p/organize`, {})).status,
    200,
  );
  assert.equal(seen.at(-1).deepThinking, "disabled");
  const tasks = (await request(`/tasks?workspaceId=${w.id}`)).data;
  assert.equal(tasks.length, 2);
  for (const task of tasks) {
    assert.equal(task.status, "succeeded");
    assert.equal(task.totalTokens, task.calls * 70);
    assert.ok(Number.isFinite(Date.parse(task.finishedAt)));
  }
  await request(
    "/preferences",
    { theme: "ocean", preferences: "中文" },
    "PATCH",
  );
  assert.deepEqual(
    (await request("/settings")).data.taskReasoning,
    taskReasoning,
  );
  assert.equal((await request("/settings")).data.model, "deepseek-flash");
  const bodyBefore = JSON.stringify(store.get(w.id));
  assert.equal(
    (
      await request(
        "/settings",
        {
          taskReasoning: {
            ...taskReasoning,
            translation: { deepThinking: "bad", reasoningEffort: "low" },
          },
        },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(JSON.stringify(store.get(w.id)), bodyBefore);
});
