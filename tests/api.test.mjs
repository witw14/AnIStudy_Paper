import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { arxivId, scopedContext } from "../server/services.mjs";
import { createStore } from "../server/store.mjs";
import { textPdf } from "./pdf-fixture.mjs";

let server, store, base;
const dir = mkdtempSync(join(tmpdir(), "anistudy-test-"));
let modelResult = "这是一条测试回答";
let seenMessages;
let seenSettings;
const metadata = {
  title: "Verified Research Paper",
  authors: "Researcher",
  year: 2024,
  arxivId: "2401.12345",
  summary: "A verified abstract.",
  verification: "verified",
  source: "arxiv",
  verifiedAt: new Date().toISOString(),
};
before(async () => {
  const setup = createApp({
    acquisition: false,
    dataDir: dir,
    seed: true,
    model: async (s, m) => {
      seenMessages = m;
      seenSettings = s;
      if (modelResult instanceof Error) throw modelResult;
      return modelResult;
    },
    verify: async (input) => {
      if (input === "bad") throw new Error("Verification failed");
      return { ...metadata, arxivId: arxivId(input) };
    },
  });
  store = setup.store;
  server = setup.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
async function request(path, body, method) {
  const r = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}

test("importance reassessment backs up the workspace, persists reasons, and leaves data intact on incomplete responses", async () => {
  const w = store.create("Importance review", "");
  w.nodes = [
    {
      id: "detail",
      name: "Implementation detail",
      importance: "major",
      status: "learned",
      paperIds: [],
    },
  ];
  store.put(w);
  modelResult = {
    nodes: [
      {
        id: "detail",
        importance: "minor",
        importanceReason: "实现细节，贡献范围局部。",
        importanceAssessment: {
          role: "implementation_detail",
          impact: "local",
          durability: "uncertain",
          evidence: "论文描述硬件适配。",
        },
      },
    ],
  };
  const result = await request(`/workspaces/${w.id}/reassess-importance`, {});
  assert.equal(result.status, 200);
  assert.equal(result.data.nodes[0].importance, "minor");
  assert.equal(result.data.nodes[0].status, "learned");
  assert.equal(result.data.importanceReport.updated, 1);
  assert.match(seenMessages[0].content, /入图必要性/);
  const backup = readdirSync(join(dir, "backups")).find((name) =>
    name.startsWith(w.id + "-before-importance-"),
  );
  assert.equal(
    JSON.parse(readFileSync(join(dir, "backups", backup), "utf8")).nodes[0]
      .importance,
    "major",
  );
  const saved = store.get(w.id);
  modelResult = { nodes: [] };
  const incomplete = await request(
    `/workspaces/${w.id}/reassess-importance`,
    {},
  );
  assert.equal(incomplete.status, 500);
  assert.deepEqual(store.get(w.id), saved);
  modelResult = "这是一条测试回答";
});

test("personal settings routes validate imports atomically, exclude keys from export and preserve manual grades", async () => {
  const settings = store.settings();
  store.saveSettings({
    ...settings,
    apiKey: "private-test-key",
    baseUrl: "https://original.example/v1",
    model: "model-a",
  });
  const preferences = {
    theme: "ocean",
    nodeSizes: { landmark: 100, major: 80, normal: 50, minor: 12 },
    reduceMotion: true,
  };
  assert.equal(
    (await request("/preferences", preferences, "PATCH")).status,
    200,
  );
  const exported = await request("/preferences/export");
  assert.equal(exported.data.settings.theme, "ocean");
  assert.ok(!JSON.stringify(exported.data).includes("private-test-key"));
  const before = store.settings();
  const invalid = await request("/preferences/import", {
    ...exported.data,
    settings: { ...exported.data.settings, nodeSizes: { landmark: 999 } },
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(store.settings(), before);
  const file = structuredClone(exported.data);
  file.settings.theme = "violet";
  assert.equal((await request("/preferences/import", file)).status, 200);
  assert.equal(store.settings().apiKey, "private-test-key");
  file.settings.baseUrl = "https://different.example/v1";
  await request("/preferences/import", file);
  assert.equal(store.settings().apiKey, "");
  const w = store.create("Manual priority", "");
  w.nodes = [
    {
      id: "tech",
      name: "tech",
      importance: "landmark",
      paperIds: [],
      status: "learned",
    },
  ];
  store.put(w);
  const changed = await request(
    `/workspaces/${w.id}/nodes/tech`,
    { importance: "normal" },
    "PATCH",
  );
  assert.equal(changed.data.nodes[0].importanceSource, "manual");
  assert.equal(changed.data.nodes[0].status, "learned");
  await request(`/workspaces/${w.id}/reassess-importance`, {});
  assert.equal(store.get(w.id).nodes[0].importance, "normal");
  await request(
    `/workspaces/${w.id}/nodes/tech`,
    { importanceSource: "ai" },
    "PATCH",
  );
  assert.equal(store.get(w.id).nodes[0].importanceSource, "ai");
  store.saveSettings(settings);
});

test("save-all settings persists appearance and model together, works without AI configuration, and rejects invalid values atomically", async () => {
  const original = store.settings();
  store.saveSettings({});
  const appearance = {
    nodeSizes: { landmark: 90, major: 70, normal: 44, minor: 18 },
    theme: "amber",
    reduceMotion: true,
    preferEnglishTerms: false,
  };
  assert.equal((await request("/settings", appearance, "PUT")).status, 200);
  assert.deepEqual(store.settings().nodeSizes, appearance.nodeSizes);
  const full = {
    ...appearance,
    baseUrl: "https://example.test/v1",
    model: "model",
    apiKey: "private-key",
  };
  assert.equal((await request("/settings", full, "PUT")).status, 200);
  await request(
    "/settings",
    { ...appearance, nodeSizes: { ...appearance.nodeSizes, normal: 40 } },
    "PUT",
  );
  assert.equal(store.settings().apiKey, "private-key");
  assert.equal(store.settings().model, "model");
  const previous = store.settings();
  assert.equal(
    (
      await request(
        "/settings",
        { ...full, nodeSizes: { ...appearance.nodeSizes, minor: 999 } },
        "PUT",
      )
    ).status,
    400,
  );
  assert.deepEqual(store.settings(), previous);
  store.saveSettings(original);
});

test("strict arXiv URL parsing rejects unrelated domains and malformed IDs", () => {
  assert.equal(arxivId("https://arxiv.org/abs/1706.03762v2"), "1706.03762v2");
  assert.equal(arxivId("https://arxiv.org/pdf/1706.03762.pdf"), "1706.03762");
  assert.throws(() => arxivId("https://evil.test/1706.03762"));
  assert.throws(() => arxivId("bogus"));
});
test("workspace isolation applies to entities, chat context, and server routes", async () => {
  const first = store.list().find((w) => w.demo);
  const { data: second } = await request("/workspaces", {
    name: "Isolated workspace",
  });
  const denied = await request(
    `/workspaces/${second.id}/nodes/${first.nodes[0].id}`,
    { status: "learned" },
    "PATCH",
  );
  assert.equal(denied.status, 404);
  assert.throws(() => scopedContext(second, "paper", first.papers[0].id));
  await request(`/workspaces/${second.id}/chat`, {
    mode: "research",
    message: "hello",
  });
  assert.ok(!seenMessages[0].content.includes("Residual"));
  assert.equal(store.get(first.id).messages.length, 0);
  assert.equal(store.get(second.id).messages.length, 2);
});
test("status changes survive a separate database connection", async () => {
  const w = store.list().find((w) => w.demo);
  const result = await request(
    `/workspaces/${w.id}/nodes/${w.nodes[0].id}`,
    { status: "unlearned" },
    "PATCH",
  );
  assert.equal(result.status, 200);
  const another = createStore(dir, false);
  assert.equal(another.get(w.id).nodes[0].status, "unlearned");
  another.db.close();
});
test("candidate merge deduplicates references without growing the main graph", async () => {
  const w = store.list().find((w) => w.demo);
  const count = w.nodes.length;
  const result = await request(
    `/workspaces/${w.id}/suggestions/${w.suggestions[0].id}`,
    { action: "merge", targetId: "patch" },
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.nodes.length, count);
  assert.equal(result.data.suggestions[0].state, "accepted");
  assert.deepEqual(result.data.nodes.find((n) => n.id === "patch").paperIds, [
    "vit",
  ]);
  const duplicate = await request(
    `/workspaces/${w.id}/suggestions/${w.suggestions[0].id}`,
    { action: "accept" },
  );
  assert.equal(duplicate.status, 400);
});
test("organizer automatically applies key techniques and repeated organization is idempotent", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = {
    summary: "已整理的摘要",
    nodes: [
      {
        name: "A new technique",
        year: 2020,
        category: "Component",
        importance: "normal",
        description: "Description",
        significance: "Value",
        direction: "Classification",
        contribution: "Uses",
        relevance: "primary",
      },
    ],
    edges: [],
    paperEdges: [],
  };
  const r = await request(`/workspaces/${w.id}/papers/vit/organize`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.nodes.length, w.nodes.length + 1);
  const n = r.data.nodes.find((n) => n.name === "A new technique");
  assert.ok(n);
  assert.equal(n.contribution, "Uses");
  assert.equal(n.evidence, "supported");
  assert.equal(r.data.suggestions.length, w.suggestions.length);
  const again = await request(`/workspaces/${w.id}/papers/vit/organize`, {});
  assert.equal(again.data.nodes.length, r.data.nodes.length);
});
test("organization persists per-paper technology explanations while merging the same technical node", async () => {
  const w = store.create("Paper-specific explanations", "");
  w.papers = [
    {
      id: "first",
      title: "First paper",
      summary: "A classification method.",
      inLibrary: true,
    },
    {
      id: "second",
      title: "Second paper",
      summary: "A detection method.",
      inLibrary: true,
    },
  ];
  store.put(w);
  try {
    const summaries = [
      {
        role: "本文用此方法提取分类特征。",
        implementation: "以编码器连接分类头实现。",
      },
      {
        role: "本文用此方法定位目标。",
        implementation: "以多尺度特征连接检测头实现。",
      },
    ];
    for (const [index, p] of w.papers.entries()) {
      modelResult = {
        summary: p.summary,
        nodes: [
          {
            name: "Shared Encoder",
            englishName: "Shared Encoder",
            chineseName: "共用编码器",
            description: "可复用编码方法。",
            importance: "normal",
            necessary: true,
            relevance: "core",
            contribution: "Uses",
            paperSummary: summaries[index],
          },
        ],
      };
      const result = await request(
        `/workspaces/${w.id}/papers/${p.id}/organize`,
        {},
      );
      assert.equal(result.status, 200);
      assert.equal(result.data.nodes.length, 1);
      assert.deepEqual(
        result.data.nodes[0].paperRelations.find((r) => r.paperId === p.id)
          .summary,
        summaries[index],
      );
      assert.match(
        seenMessages[0].content,
        /paperSummary:\{role,implementation\}/,
      );
    }
    const another = createStore(dir, false);
    try {
      assert.deepEqual(
        Object.fromEntries(
          another
            .get(w.id)
            .nodes[0].paperRelations.map((r) => [r.paperId, r.summary]),
        ),
        {
          first: summaries[0],
          second: summaries[1],
        },
      );
    } finally {
      another.db.close();
    }
  } finally {
    modelResult = "Test response";
  }
});

test("admitting a candidate records its library admission independently of candidate creation and preserves first admission", async () => {
  const w = store.create("Admission times", "");
  w.papers = [
    {
      id: "candidate",
      title: "Candidate",
      addedAt: "2000-01-01",
      inLibrary: false,
    },
  ];
  store.put(w);
  const before = Date.now();
  const admitted = await request(
    `/workspaces/${w.id}/papers/candidate`,
    { inLibrary: true },
    "PATCH",
  );
  const p = admitted.data.papers[0];
  assert.equal(p.addedAt, "2000-01-01");
  assert.ok(Date.parse(p.libraryAddedAt) >= before);
  await request(
    `/workspaces/${w.id}/papers/candidate`,
    { inLibrary: false },
    "PATCH",
  );
  const readmitted = await request(
    `/workspaces/${w.id}/papers/candidate`,
    { inLibrary: true },
    "PATCH",
  );
  assert.equal(readmitted.data.papers[0].libraryAddedAt, p.libraryAddedAt);
});

test("route validation blocks invented IDs atomically", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = {
    routes: [
      {
        title: "Invalid route",
        goal: "goal",
        stages: [
          {
            title: "stage",
            capability: "capability",
            paperIds: ["invented"],
            nodeIds: [],
            sideQuest: false,
          },
        ],
      },
    ],
  };
  const result = await request(`/workspaces/${w.id}/routes/generate`, {
    goal: "vision",
  });
  assert.equal(result.status, 422);
  assert.equal(store.get(w.id).routes.length, w.routes.length);
});
test("arXiv recommendations are verified before route admission", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = {
    recommendations: [
      { arxivId: "2401.12345", title: metadata.title, reason: "必要前置" },
    ],
    routes: [
      {
        title: "Valid route",
        goal: "goal",
        stages: [
          {
            title: "stage",
            capability: "capability",
            paperIds: ["2401.12345"],
            nodeIds: [],
            sideQuest: true,
          },
        ],
      },
    ],
  };
  const result = await request(`/workspaces/${w.id}/routes/generate`, {
    goal: "a direction",
  });
  assert.equal(result.status, 200);
  const p = result.data.papers.find((p) => p.arxivId === "2401.12345");
  assert.equal(p.verification, "verified");
  assert.equal(p.inLibrary, false);
  assert.deepEqual(result.data.routes.at(-1).stages[0].paperIds, [p.id]);
});
test("mismatched recommended titles never enter the workspace", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = {
    recommendations: [
      { arxivId: "2401.22222", title: "Invented wrong title", reason: "test" },
    ],
    routes: [
      {
        title: "bad",
        goal: "bad",
        stages: [
          {
            title: "x",
            capability: "x",
            paperIds: ["2401.22222"],
            nodeIds: [],
            sideQuest: false,
          },
        ],
      },
    ],
  };
  const result = await request(`/workspaces/${w.id}/routes/generate`, {
    goal: "test",
  });
  assert.equal(result.status, 422);
  assert.equal(store.get(w.id).papers.length, w.papers.length);
});
test("API keys never appear in settings reads", async () => {
  await request(
    "/settings",
    {
      baseUrl: "https://example.org/v1",
      model: "test",
      apiKey: "private-secret",
    },
    "PUT",
  );
  const r = await request("/settings");
  assert.equal(r.data.hasKey, true);
  assert.ok(!JSON.stringify(r.data).includes("private-secret"));
  await request("/settings/key", undefined, "DELETE");
  assert.equal((await request("/settings")).data.hasKey, false);
});
test("deleting papers cleans route links and evidence support", async () => {
  const w = store.list().find((w) => w.demo);
  const result = await request(
    `/workspaces/${w.id}/papers/vit`,
    undefined,
    "DELETE",
  );
  assert.equal(result.status, 200);
  assert.ok(
    result.data.nodes
      .filter((n) => n.id === "patch")
      .every((n) => n.evidence === "missing"),
  );
  assert.ok(
    !result.data.routes.some((r) =>
      r.stages.some((s) => s.paperIds.includes("vit")),
    ),
  );
  assert.ok(
    !result.data.suggestions.some((s) => s.node?.paperIds.includes("vit")),
  );
});
test("cross-origin writes are rejected", async () => {
  const r = await fetch(base + "/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://another-site.example",
    },
    body: JSON.stringify({ name: "unwanted" }),
  });
  assert.equal(r.status, 403);
});
test("malformed nodes do not discard a valid summary or damage the graph", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = { summary: "summary", nodes: [{ name: "invalid" }] };
  const r = await request(`/workspaces/${w.id}/papers/resnet/organize`, {});
  assert.equal(r.status, 200);
  assert.deepEqual(store.get(w.id).nodes, w.nodes);
  assert.equal(r.data.papers.find((p) => p.id === "resnet").summary, "summary");
  assert.equal(
    r.data.papers.find((p) => p.id === "resnet").organizationReport.quality,
    "partial",
  );
  assert.equal(store.get(w.id).suggestions.length, w.suggestions.length);
});

test("organization discovers persistent taxonomy within its own workspace only", async () => {
  const w = store.create("生物传感", "即时诊断与材料");
  const other = store.create("语言学习", "");
  w.papers.push({
    id: "assay",
    title: "LFA review",
    text: "Lateral flow assays",
    summary: "",
    inLibrary: true,
  });
  store.put(w);
  modelResult = {
    summary: "医学诊断技术",
    taxonomy: {
      directions: [{ id: "poc", name: "即时诊断", aliases: ["Point-of-care"] }],
      categories: [{ id: "assays", name: "检测平台" }],
    },
    nodes: [
      {
        name: "LFA",
        englishName: "Lateral flow assay",
        chineseName: "侧向层析检测",
        description: "疾病即时检测平台",
        category: "assays",
        directions: ["poc"],
      },
    ],
  };
  const first = await request(`/workspaces/${w.id}/papers/assay/organize`, {});
  assert.equal(first.status, 200);
  assert.equal(first.data.taxonomy.directions[0].name, "即时诊断");
  assert.equal(first.data.taxonomy.categories[0].name, "检测平台");
  const context = JSON.parse(seenMessages[1].content);
  assert.equal(context.workspace.name, "生物传感");
  assert.deepEqual(context.existingTaxonomy, {
    directions: [],
    categories: [],
  });
  modelResult.nodes[0].directions = ["Point-of-care"];
  const second = await request(`/workspaces/${w.id}/papers/assay/organize`, {});
  assert.equal(second.data.nodes.length, 1);
  assert.deepEqual(second.data.nodes[0].directions, ["poc"]);
  assert.equal(
    JSON.parse(seenMessages[1].content).existingTaxonomy.directions.length,
    1,
  );
  const isolated = await request(`/workspaces/${other.id}`);
  assert.deepEqual(isolated.data.taxonomy, { directions: [], categories: [] });
  const reopened = createStore(dir, false);
  assert.equal(reopened.get(w.id).taxonomy.categories[0].name, "检测平台");
  reopened.db.close();
  modelResult = "Test response";
});

test("total model failure saves an explicit fallback and leaves existing graph intact", async () => {
  const w = store.create("Fallback test", "");
  w.papers.push({
    id: "fallback",
    title: "Example paper",
    text: "Published on 17 March 2026\nOriginal paper content available for fallback.",
    summary: "",
    inLibrary: true,
    year: null,
  });
  store.put(w);
  modelResult = new Error("Simulated provider outage");
  const r = await request(`/workspaces/${w.id}/papers/fallback/organize`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.papers[0].organizationReport.quality, "fallback");
  assert.match(r.data.papers[0].summary, /Original paper content/);
  assert.equal(r.data.papers[0].year, 2026);
  assert.equal(r.data.nodes.length, 0);
  modelResult = "Test response";
});

test("chat thinking preferences persist, reach model and preserve credentials", async () => {
  const previous = store.settings();
  store.saveSettings({
    ...previous,
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    apiKey: "test-secret",
  });
  const r = await request(
    "/preferences",
    { deepThinking: "enabled", reasoningEffort: "max" },
    "PATCH",
  );
  assert.equal(r.status, 200);
  const settings = await request("/settings");
  assert.equal(settings.data.reasoningCapabilities.supported, true);
  assert.equal(settings.data.reasoningEffort, "max");
  assert.equal(settings.data.apiKey, undefined);
  const w = store.create("Thinking test", "");
  modelResult = "Test response";
  await request(`/workspaces/${w.id}/chat`, {
    mode: "research",
    message: "hello",
  });
  assert.equal(seenSettings.deepThinking, "enabled");
  assert.equal(seenSettings.reasoningEffort, "max");
  assert.equal(seenSettings.apiKey, "test-secret");
  store.saveSettings(previous);
});

test("both chat modes allow labeled supplementary knowledge by default and immediately honor policy changes with existing history", async () => {
  const previous = store.settings();
  const { chatEvidencePolicy, ...legacy } = previous;
  store.saveSettings(legacy);
  const w = store.create("Chat policy", "");
  w.papers.push({ ...metadata, id: "source", inLibrary: true });
  store.put(w);
  try {
    assert.equal(
      (await request("/settings")).data.chatEvidencePolicy,
      "supplement",
    );
    modelResult = "**无资料支撑｜领域知识**\n\n补充说明。";
    for (const mode of ["paper", "research"]) {
      const result = await request(`/workspaces/${w.id}/chat`, {
        mode,
        paperId: "source",
        message: "解释被引用的外部论文",
      });
      assert.equal(result.status, 200);
      assert.match(
        seenMessages[0].content,
        /当前资料策略：资料优先，允许补充知识/,
      );
      assert.match(seenMessages[0].content, /无资料支撑/);
      assert.match(
        seenMessages[0].content,
        /空间实际状态，只根据当前结构化记录判断/,
      );
      assert.equal(result.data.messages.at(-1).content, modelResult);
    }
    await request("/preferences", { chatEvidencePolicy: "strict" }, "PATCH");
    for (const mode of ["paper", "research"]) {
      await request(`/workspaces/${w.id}/chat`, {
        mode,
        paperId: "source",
        message: "现在只用资料回答",
      });
      assert.match(seenMessages[0].content, /当前资料策略：严格依据资料/);
      assert.doesNotMatch(seenMessages[0].content, /当前资料策略：资料优先/);
      assert.equal(
        seenMessages.length,
        4,
        "existing conversation history is retained",
      );
      assert.match(
        seenMessages[0].content,
        /历史中曾经拒答或使用其他资料策略，不影响本次策略/,
      );
    }
    await request(
      "/preferences",
      { chatEvidencePolicy: "supplement" },
      "PATCH",
    );
    await request(`/workspaces/${w.id}/chat`, {
      mode: "research",
      message: "继续补充背景",
    });
    assert.match(seenMessages[0].content, /当前资料策略：资料优先/);
    assert.equal(store.get(w.id).nodes.length, 0);
    assert.equal(store.get(w.id).routes.length, 0);
  } finally {
    store.saveSettings(previous);
    modelResult = "Test response";
  }
});

test("chat policy saves through both configuration endpoints, roundtrips export and import and rejects invalid values atomically", async () => {
  const previous = store.settings();
  store.saveSettings({ ...previous, apiKey: "policy-test-secret" });
  try {
    assert.equal(
      (await request("/settings", { chatEvidencePolicy: "strict" }, "PUT"))
        .status,
      200,
    );
    const publicSettings = (await request("/settings")).data;
    assert.equal(publicSettings.chatEvidencePolicy, "strict");
    assert.equal(publicSettings.apiKey, undefined);
    const file = (await request("/preferences/export")).data;
    assert.equal(file.settings.chatEvidencePolicy, "strict");
    assert.ok(!JSON.stringify(file).includes("policy-test-secret"));
    await request(
      "/preferences",
      { chatEvidencePolicy: "supplement" },
      "PATCH",
    );
    assert.equal((await request("/preferences/import", file)).status, 200);
    assert.equal(store.settings().chatEvidencePolicy, "strict");
    const saved = store.settings();
    assert.equal(
      (
        await request(
          "/preferences",
          { chatEvidencePolicy: "invalid", theme: "amber" },
          "PATCH",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/settings",
          { chatEvidencePolicy: "invalid", model: "replaced" },
          "PUT",
        )
      ).status,
      400,
    );
    file.settings.chatEvidencePolicy = "invalid";
    file.settings.theme = "amber";
    assert.equal((await request("/preferences/import", file)).status, 400);
    assert.deepEqual(store.settings(), saved);
    assert.equal(store.settings().apiKey, "policy-test-secret");
  } finally {
    store.saveSettings(previous);
  }
});
test("PDF upload extracts real text, stores file, and isolates access", async () => {
  const w = store.list().find((w) => w.demo);
  const form = new FormData();
  form.set("file", new Blob([textPdf()]), "research.pdf");
  form.set("title", "Local research");
  const r = await fetch(`${base}/workspaces/${w.id}/upload`, {
    method: "POST",
    body: form,
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  const p = data.papers.find((p) => p.title === "Local research");
  assert.equal(p.hasText, true);
  assert.ok(
    store
      .get(w.id)
      .papers.find((v) => v.id === p.id)
      .text.includes("attention"),
  );
  const file = await fetch(`${base}/workspaces/${w.id}/papers/${p.id}/file`);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  const other = store.list().find((w) => !w.demo);
  assert.equal(
    (await request(`/workspaces/${other.id}/papers/${p.id}/file`)).status,
    404,
  );
  const attach = new FormData();
  attach.set(
    "file",
    new Blob([textPdf("Replacement full text")]),
    "replacement.pdf",
  );
  attach.set("paperId", "resnet");
  const attached = await fetch(`${base}/workspaces/${w.id}/upload`, {
    method: "POST",
    body: attach,
  });
  assert.equal(attached.status, 200);
  assert.equal((await attached.json()).papers.length, data.papers.length);
  assert.ok(
    store
      .get(w.id)
      .papers.find((p) => p.id === "resnet")
      .text.includes("Replacement"),
  );
});
test("non-PDF uploads are rejected", async () => {
  const w = store.list().find((w) => w.demo);
  const form = new FormData();
  form.set("file", new Blob(["not a pdf"]), "fake.pdf");
  const r = await fetch(`${base}/workspaces/${w.id}/upload`, {
    method: "POST",
    body: form,
  });
  assert.equal(r.status, 400);
});
test("paper conversations exclude other papers and research-mode history", async () => {
  const w = store.list().find((w) => w.demo);
  modelResult = "Scoped response";
  await request(`/workspaces/${w.id}/chat`, {
    mode: "research",
    message: "research secret",
  });
  await request(`/workspaces/${w.id}/chat`, {
    mode: "paper",
    paperId: "resnet",
    message: "Explain this paper",
  });
  assert.ok(!JSON.stringify(seenMessages).includes("research secret"));
  assert.ok(!seenMessages[0].content.includes("Swin Transformer"));
  assert.ok(seenMessages[0].content.includes("Replacement full text"));
});

test("PDF and arXiv import converge on one record in both import orders", async () => {
  for (const onlineFirst of [true, false]) {
    const { data: w } = await request("/workspaces", {
      name: "Identity " + onlineFirst,
    });
    if (onlineFirst)
      await request(`/workspaces/${w.id}/arxiv`, { input: "2401.12345" });
    const form = new FormData();
    form.set(
      "file",
      new Blob([textPdf("Verified Research Paper full text")]),
      "local.pdf",
    );
    form.set("title", metadata.title);
    const uploaded = await fetch(`${base}/workspaces/${w.id}/upload`, {
      method: "POST",
      body: form,
    });
    assert.equal(uploaded.status, 200);
    if (!onlineFirst)
      await request(`/workspaces/${w.id}/arxiv`, { input: "2401.12345" });
    let current = (await request(`/workspaces/${w.id}`)).data;
    assert.equal(current.papers.length, 1);
    assert.equal(current.papers[0].year, 2024);
    assert.equal(current.papers[0].verification, "verified");
    assert.equal(current.papers[0].hasText, true);
    const repeat = new FormData();
    repeat.set(
      "file",
      new Blob([textPdf("Verified Research Paper full text")]),
      "renamed.pdf",
    );
    await fetch(`${base}/workspaces/${w.id}/upload`, {
      method: "POST",
      body: repeat,
    });
    current = (await request(`/workspaces/${w.id}`)).data;
    assert.equal(current.papers.length, 1);
  }
});
test("English terminology preference changes displayed names without losing aliases or credentials", async () => {
  const w = store.list().find((w) => w.demo);
  w.nodes[0].englishName = "Deep CNN";
  w.nodes[0].chineseName = "深度卷积网络";
  store.put(w);
  const before = store.settings();
  await request("/preferences", { preferEnglishTerms: false }, "PATCH");
  const chinese = await request(`/workspaces/${w.id}`);
  assert.equal(chinese.data.nodes[0].name, "深度卷积网络");
  assert.equal(store.settings().apiKey, before.apiKey);
  await request("/preferences", { preferEnglishTerms: true }, "PATCH");
  const english = await request(`/workspaces/${w.id}`);
  assert.equal(english.data.nodes[0].name, "Deep CNN");
  assert.equal(english.data.nodes[0].chineseName, "深度卷积网络");
});
