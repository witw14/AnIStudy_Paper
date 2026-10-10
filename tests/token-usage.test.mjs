import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenUsage } from "../server/token-usage.mjs";
import { callModel } from "../server/services.mjs";

test("token counts use actual nonnegative API integers, without inference or coercion", () => {
  assert.equal(tokenUsage(undefined), null);
  assert.equal(tokenUsage([]), null);
  assert.equal(
    tokenUsage({
      prompt_tokens: "123",
      completion_tokens: -1,
      total_tokens: 1.5,
    }),
    null,
  );
  assert.deepEqual(
    tokenUsage({
      prompt_tokens: 4,
      completion_tokens: 0,
      total_tokens: 4,
      completion_tokens_details: { reasoning_tokens: 0 },
      internal: "private",
    }),
    { inputTokens: 4, outputTokens: 0, totalTokens: 4, reasoningTokens: 0 },
  );
  assert.deepEqual(tokenUsage({ prompt_tokens: 30, total_tokens: 50 }), {
    inputTokens: 30,
    totalTokens: 50,
  });
  assert.equal(
    tokenUsage({ completion_tokens: Number.MAX_SAFE_INTEGER + 1 }),
    null,
  );
});

test("model calls preserve text/JSON responses and report sanitized or missing API usage", async (t) => {
  let content = "回答";
  let rawUsage = {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    completion_tokens_details: { reasoning_tokens: 7 },
  };
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
          usage: rawUsage,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  const settings = {
    baseUrl: "http://localhost/v1",
    model: "test",
    apiKey: "test",
    deepThinking: "disabled",
  };
  let usage;
  assert.equal(
    await callModel(settings, [], false, { onUsage: (u) => (usage = u) }),
    "回答",
  );
  assert.deepEqual(usage, {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    reasoningTokens: 7,
  });
  content = '{"summary":"整理"}';
  rawUsage = undefined;
  assert.deepEqual(
    await callModel(settings, [], true, { onUsage: (u) => (usage = u) }),
    { summary: "整理" },
  );
  assert.equal(usage, null);
  assert.deepEqual(await callModel(settings, [], true), { summary: "整理" });
});
