import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.mjs";
import { mergePaper } from "../server/research.mjs";
import { createStore } from "../server/store.mjs";
import {
  preferenceSchema,
  exportPreferences,
  importPreferences,
} from "../server/preferences.mjs";

let server, store, base, wid, paperIds, nodeIds;
const dir = mkdtempSync(join(tmpdir(), "anistudy-notes-"));
before(async () => {
  const setup = createApp({ dataDir: dir, acquisition: false });
  store = setup.store;
  const w = store.list()[0];
  wid = w.id;
  paperIds = w.papers.slice(0, 2).map((p) => p.id);
  nodeIds = w.nodes.slice(0, 2).map((n) => n.id);
  server = setup.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  store.db.close();
  rmSync(dir, { recursive: true, force: true });
});
async function request(path, body, method) {
  const response = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
const path = () => `/workspaces/${wid}/notes`;

test("manual node and paper visibility is persisted, scoped, survives data repair and migrates when papers are deduplicated", async () => {
  const w = store.create("Visibility", "");
  w.nodes = [{ id: "n", name: "N", importance: "major", paperIds: ["p"] }];
  w.papers = [{ id: "p", title: "P", text: "", inLibrary: true }];
  store.put(w);
  for (const collection of ["nodes", "papers"]) {
    const id = collection === "nodes" ? "n" : "p";
    const url = `/workspaces/${w.id}/${collection}/${id}`;
    assert.equal(
      (await request(url, { hiddenInGraph: true }, "PATCH")).data[collection][0]
        .hiddenInGraph,
      true,
    );
    assert.equal(
      (await request(url, { hiddenInGraph: "true" }, "PATCH")).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/workspaces/${wid}/${collection}/${id}`,
          { hiddenInGraph: false },
          "PATCH",
        )
      ).status,
      404,
    );
  }
  const persisted = createStore(dir, false);
  try {
    assert.equal(persisted.get(w.id).nodes[0].hiddenInGraph, true);
    assert.equal(persisted.get(w.id).papers[0].hiddenInGraph, true);
  } finally {
    persisted.db.close();
  }
  const fresh = store.get(w.id);
  fresh.nodes[0].hiddenInGraph = false;
  fresh.papers[0].hiddenInGraph = false;
  store.put(fresh);
  assert.equal(store.get(w.id).nodes[0].hiddenInGraph, true);
  assert.equal(store.get(w.id).papers[0].hiddenInGraph, true);
  fresh.papers.unshift({ id: "original", title: "P", text: "" });
  mergePaper(fresh, fresh.papers[0], fresh.papers[1]);
  store.put(fresh);
  assert.equal(store.get(w.id).papers[0].hiddenInGraph, true);
  const shown = await request(
    `/workspaces/${w.id}/papers/original`,
    { hiddenInGraph: false },
    "PATCH",
  );
  assert.equal(shown.data.papers[0].hiddenInGraph, false);
  const restored = store.get(w.id);
  restored.papers[0].hiddenInGraph = true;
  store.put(restored);
  assert.equal(store.get(w.id).papers[0].hiddenInGraph, false);
});

test("year-view configuration persists through both save endpoints and portable import, rejecting invalid limits", async () => {
  const values = { timelineAutoWrap: true, timelineColumnLimit: 3 };
  assert.equal((await request("/settings", values, "PUT")).status, 200);
  const saved = (await request("/settings")).data;
  assert.equal(saved.timelineAutoWrap, true);
  assert.equal(saved.timelineColumnLimit, 3);
  const exported = (await request("/preferences/export")).data;
  assert.equal(exported.settings.timelineColumnLimit, 3);
  await request(
    "/preferences",
    { timelineAutoWrap: false, timelineColumnLimit: 10 },
    "PATCH",
  );
  assert.equal((await request("/preferences/import", exported)).status, 200);
  assert.equal(store.settings().timelineColumnLimit, 3);
  for (const timelineColumnLimit of [0, -1, 101, 2.5, "2", null]) {
    assert.equal(
      (await request("/preferences", { timelineColumnLimit }, "PATCH")).status,
      400,
    );
    assert.equal(store.settings().timelineColumnLimit, 3);
  }
  await request(
    "/preferences",
    { timelineAutoWrap: false, timelineColumnLimit: 10 },
    "PATCH",
  );
});

test("manual node years validate and survive model updates, including explicitly unknown years", async () => {
  const w = store.create("Year editing", "");
  w.nodes = [{ id: "a", name: "A", year: null }];
  store.put(w);
  const url = `/workspaces/${w.id}/nodes/a`;
  const saved = await request(url, { year: 1997 }, "PATCH");
  assert.equal(saved.data.nodes[0].year, 1997);
  const fresh = store.get(w.id);
  fresh.nodes[0].year = 2020;
  store.put(fresh);
  assert.equal(store.get(w.id).nodes[0].year, 1997);
  for (const year of [0, 1997.5, 9999, "1997"])
    assert.equal((await request(url, { year }, "PATCH")).status, 400);
  assert.equal(
    (await request(url, { year: null }, "PATCH")).data.nodes[0].year,
    null,
  );
  const unknown = store.get(w.id);
  unknown.nodes[0].year = 2000;
  store.put(unknown);
  assert.equal(store.get(w.id).nodes[0].year, null);
});

test("connection edits replace a pair atomically in both directions and preserve manual removal", async () => {
  const w = store.create("Relations", "");
  w.nodes = ["a", "b", "c"].map((id) => ({ id, name: id }));
  w.edges = [
    { id: "old", source: "a", target: "b", relation: "Extends" },
    { id: "other", source: "b", target: "c", relation: "Uses" },
  ];
  store.put(w);
  const url = `/workspaces/${w.id}/nodes/a/connections/b`;
  const result = await request(
    url,
    { direction: "incoming", relation: "Uses" },
    "PUT",
  );
  assert.equal(result.status, 200);
  const edge = result.data.edges.find((e) => e.target === "a");
  assert.equal(edge.source, "b");
  assert.equal(edge.relation, "Uses");
  assert.equal(result.data.edges.length, 2);
  const reverse = await request(
    `/workspaces/${w.id}/nodes/b/connections/a`,
    { direction: "incoming", relation: "Extends" },
    "PUT",
  );
  assert(
    reverse.data.edges.some(
      (e) => e.source === "a" && e.target === "b" && e.relation === "Extends",
    ),
  );
  assert.equal(
    (await request(url, { direction: "incoming", relation: "Invented" }, "PUT"))
      .status,
    400,
  );
  assert.equal(
    (
      await request(
        `/workspaces/${w.id}/nodes/a/connections/a`,
        { direction: "incoming", relation: "Uses" },
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/workspaces/${w.id}/nodes/a/connections/foreign`,
        { direction: "incoming", relation: "Uses" },
        "PUT",
      )
    ).status,
    404,
  );
  await request(url, { direction: "incoming", relation: null }, "PUT");
  const fresh = store.get(w.id);
  fresh.edges.push({ id: "model", source: "a", target: "b", relation: "Uses" });
  store.put(fresh);
  assert.deepEqual(
    store.get(w.id).edges.map((e) => e.id),
    ["other"],
  );
  // Deleting a node also removes its manual relation overrides.
  await request(`/workspaces/${w.id}/nodes/a`, undefined, "DELETE");
  assert.equal(store.get(w.id).manualConnections.length, 0);
});
test("notes persist Markdown and many-to-many associations; stale windows cannot overwrite newer content", async () => {
  const draft = {
    title: "结构笔记",
    content: "## 我的理解\n\n**重点**",
    paperIds,
    nodeIds,
  };
  const created = await request(path(), draft);
  assert.equal(created.status, 201);
  const note = created.data.note;
  assert.equal(note.revision, 1);
  assert.deepEqual(store.get(wid).notes[0].paperIds, paperIds);
  const second = await request(path(), { ...draft, title: "第二篇" });
  assert.equal(second.status, 201);
  assert.equal(
    store.get(wid).notes.filter((n) => n.nodeIds.includes(nodeIds[0])).length,
    2,
  );
  const saved = await request(
    `${path()}/${note.id}`,
    { ...draft, content: "新版", revision: 1 },
    "PUT",
  );
  assert.equal(saved.data.note.revision, 2);
  const stale = await request(
    `${path()}/${note.id}`,
    { ...draft, content: "过期窗口", revision: 1 },
    "PUT",
  );
  assert.equal(stale.status, 409);
  assert.equal(store.get(wid).notes[0].content, "新版");
  const exportData = await request(`/workspaces/${wid}/export`);
  assert.equal(exportData.data.notes.length, 2);
});
test("attachment IDs are restricted to the note's workspace and updates are atomic", async () => {
  const other = store.create("独立空间", "");
  const bad = await request(`/workspaces/${other.id}/notes`, {
    title: "错误关联",
    paperIds,
  });
  assert.equal(bad.status, 400);
  assert.equal(store.get(other.id).notes.length, 0);
  const note = store.get(wid).notes[0];
  const rejected = await request(
    `/workspaces/${other.id}/notes/${note.id}`,
    { title: "x", content: "x", paperIds: [], nodeIds: [], revision: 2 },
    "PUT",
  );
  assert.equal(rejected.status, 404);
  const invalid = await request(
    `${path()}/${note.id}`,
    { title: "", content: "x", paperIds: [], nodeIds: [], revision: 2 },
    "PUT",
  );
  assert.equal(invalid.status, 400);
  assert.equal(store.get(wid).notes[0].content, "新版");
});
test("deduplication rewrites and deduplicates note links; object deletion only detaches", async () => {
  const w = store.get(wid),
    [keep, duplicate] = w.papers;
  const before = w.notes[0].revision;
  mergePaper(w, keep, duplicate);
  store.put(w);
  assert.deepEqual(store.get(wid).notes[0].paperIds, [keep.id]);
  assert.equal(store.get(wid).notes[0].revision, before + 1);
  const result = await request(
    `/workspaces/${wid}/nodes/${nodeIds[0]}`,
    undefined,
    "DELETE",
  );
  assert.equal(result.status, 200);
  assert.equal(result.data.notes.length, 2);
  assert(!result.data.notes[0].nodeIds.includes(nodeIds[0]));
  assert.equal(result.data.notes[0].content, "新版");
  const removed = await request(
    `${path()}/${result.data.notes[0].id}`,
    undefined,
    "DELETE",
  );
  assert.equal(removed.data.notes.length, 1);
  assert(removed.data.nodes.some((n) => n.id === nodeIds[1]));
  assert(removed.data.papers.some((p) => p.id === keep.id));
});
test("manual titles and Markdown bodies survive later model/store updates and title language selection", async () => {
  const nid = nodeIds[1],
    pid = paperIds[0];
  const node = await request(
    `/workspaces/${wid}/nodes/${nid}`,
    {
      englishName: "My title",
      chineseName: "我的技术",
      description: "**正文**",
      significance: "## 用途",
    },
    "PATCH",
  );
  assert.equal(node.data.nodes.find((n) => n.id === nid).name, "My title");
  await request("/preferences", { preferEnglishTerms: false }, "PATCH");
  const changed = await request(`/workspaces/${wid}`);
  assert.equal(changed.data.nodes.find((n) => n.id === nid).name, "我的技术");
  await request(
    `/workspaces/${wid}/papers/${pid}`,
    { title: "我的论文标题", summary: "# 阅读笔记" },
    "PATCH",
  );
  const w = store.get(wid);
  Object.assign(
    w.nodes.find((n) => n.id === nid),
    { englishName: "model overwrite", description: "model body" },
  );
  Object.assign(
    w.papers.find((p) => p.id === pid),
    { title: "model title", summary: "model summary" },
  );
  store.put(w);
  assert.equal(
    store.get(wid).nodes.find((n) => n.id === nid).description,
    "**正文**",
  );
  assert.equal(
    store.get(wid).papers.find((p) => p.id === pid).summary,
    "# 阅读笔记",
  );
});
test("shortcut preferences validate, export and import without exposing secrets", () => {
  const values = { noteShortcut: "Ctrl+Shift+N", noteAlwaysOnTop: true };
  assert.deepEqual(preferenceSchema.parse(values), values);
  for (const noteShortcut of [
    "I",
    "Shift+I",
    "Alt+Alt+I",
    "Alt+",
    "Ctrl+Delete",
  ])
    assert.throws(() => preferenceSchema.parse({ noteShortcut }));
  const exported = exportPreferences({ ...values, apiKey: "secret" });
  assert.equal(
    importPreferences(exported, {}).noteShortcut,
    values.noteShortcut,
  );
  assert(!JSON.stringify(exported).includes("secret"));
});
