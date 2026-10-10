import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createApp } from "../server/app.mjs";
import { textPdf } from "./pdf-fixture.mjs";
import { htmlPaper, methodText } from "./reading-fixture.mjs";

const dir = mkdtempSync(join(tmpdir(), "anistudy-reading-"));
let server,
  store,
  acquirer,
  base,
  pdfCalls = 0,
  htmlCalls = 0,
  modelCalls = 0,
  seen;
let pdfHandler = async () => textPdf(methodText),
  htmlHandler = async () => htmlPaper;
let modelHandler = async (_, messages, json) => {
  seen = messages;
  return json
    ? {
        summary: "基于当前资料的整理结果。",
        nodes: [],
        edges: [],
        paperEdges: [],
      }
    : "原文解释 [[cite:S1]]。无效出处 [[cite:S88]]。";
};
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
before(async () => {
  const setup = createApp({
    dataDir: dir,
    seed: false,
    verify: async (id) => ({
      title: "Controlled Reader Paper",
      authors: "Test Author",
      year: 2024,
      arxivId: id,
      arxivVersion: id.replace(/v\d+$/, "") + "v2",
      summary: "An abstract for controlled tests.",
      source: "arxiv",
      verification: "verified",
    }),
    downloadPdf: async (...args) => {
      pdfCalls++;
      return pdfHandler(...args);
    },
    downloadHtml: async (...args) => {
      htmlCalls++;
      return htmlHandler(...args);
    },
    model: async (...args) => {
      modelCalls++;
      return modelHandler(...args);
    },
  });
  store = setup.store;
  acquirer = setup.acquirer;
  server = setup.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  await acquirer.idle();
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
  assert.ok(basename(dir).startsWith("anistudy-reading-"));
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
let savedWorkspace, savedPaper, savedDocument;
test(
  "admission queues a single download, fills the same paper, preserves concurrent edits and notes, and creates native HTML/index state",
  { timeout: 10000 },
  async () => {
    const w = store.create("Download chain", "");
    savedWorkspace = w.id;
    const candidate = await request(`/workspaces/${w.id}/arxiv`, {
      input: "2401.12345",
      inLibrary: false,
    });
    const p = candidate.data.papers[0];
    savedPaper = p.id;
    assert.equal(pdfCalls, 0);
    const entered = gate(),
      release = gate();
    pdfHandler = async () => {
      entered.resolve();
      await release.promise;
      return textPdf(methodText);
    };
    const admitted = await request(
      `/workspaces/${w.id}/papers/${p.id}`,
      { inLibrary: true },
      "PATCH",
    );
    assert.equal(admitted.status, 200);
    await entered.promise;
    try {
      assert.equal(
        (await request(`/workspaces/${w.id}`)).data.papers[0].acquisition.state,
        "downloading",
      );
      await request(
        `/workspaces/${w.id}/papers/${p.id}`,
        { title: "My edited title" },
        "PATCH",
      );
      await request(`/workspaces/${w.id}/notes`, {
        title: "Preserved note",
        content: "Keep this",
        paperIds: [p.id],
        nodeIds: [],
      });
      await request(`/workspaces/${w.id}/papers/${p.id}/acquire`, {});
    } finally {
      release.resolve();
    }
    await acquirer.idle();
    const current = (await request(`/workspaces/${w.id}`)).data;
    assert.equal(current.papers.length, 1);
    assert.equal(current.papers[0].id, p.id);
    assert.equal(current.papers[0].title, "My edited title");
    assert.equal(current.notes[0].content, "Keep this");
    assert.equal(current.papers[0].acquisition.state, "ready");
    assert.equal(current.papers[0].htmlSource, "arxiv");
    assert.ok(current.papers[0].hasText);
    assert.ok(!current.papers[0].document);
    assert.equal(modelCalls, 0);
    assert.equal(pdfCalls, 1);
    assert.equal(htmlCalls, 1);
    const document = await request(
      `/workspaces/${w.id}/papers/${p.id}/document`,
    );
    savedDocument = document.data.document;
    assert.equal(document.status, 200);
    assert.ok(
      savedDocument.blocks.some((b) => b.text === methodText && b.page === 1),
    );
    const file = await fetch(base + `/workspaces/${w.id}/papers/${p.id}/file`);
    assert.equal(file.status, 200);
    assert.equal(
      Buffer.from(await file.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      "%PDF-",
    );
  },
);
test("annotations auto-save with revision checks and exact anchors; manual and automatic technology links are bidirectional and workspace scoped", async () => {
  const w = store.get(savedWorkspace);
  w.nodes.push({
    id: "tech",
    name: "Attention Routing",
    englishName: "Attention Routing",
    chineseName: "注意力路由",
    paperIds: [savedPaper],
    year: 2024,
    category: "Component",
    importance: "normal",
    status: "unlearned",
    description: "description",
    significance: "learning",
    evidence: "supported",
    direction: "General",
    provenance: "test",
  });
  store.put(w);
  const path = `/workspaces/${w.id}/papers/${savedPaper}`,
    block = savedDocument.blocks.find((b) => b.text === methodText),
    quote = block.text.slice(0, 17);
  const created = await request(path + "/annotations", {
    documentId: savedDocument.id,
    blockId: block.id,
    start: 0,
    end: 17,
    quote,
    color: "green",
    note: "initial",
    groupId: "controlled-group",
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.groupId, "controlled-group");
  const updated = await request(
    path + `/annotations/${created.data.id}`,
    { revision: 1, note: "saved annotation" },
    "PATCH",
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.revision, 2);
  assert.equal(
    (
      await request(
        path + `/annotations/${created.data.id}`,
        { revision: 1 },
        "DELETE",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        path + `/annotations/${created.data.id}`,
        { revision: 1, note: "stale" },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(path + "/annotations", {
        documentId: savedDocument.id,
        blockId: block.id,
        start: 0,
        end: 17,
        quote: "wrong",
      })
    ).status,
    409,
  );
  const anchor = {
    documentId: savedDocument.id,
    blockId: block.id,
    nodeId: "tech",
  };
  assert.equal((await request(path + "/paragraph-links", anchor)).status, 200);
  const passages = (await request(`/workspaces/${w.id}/nodes/tech/passages`))
    .data;
  assert.ok(
    passages.some((l) => l.blockId === block.id && l.paperId === savedPaper),
  );
  assert.equal(
    (await request(path + "/paragraph-links", anchor, "DELETE")).status,
    200,
  );
  assert.ok(
    !(await request(path + "/document")).data.links.some(
      (l) => l.blockId === block.id && l.nodeId === "tech",
    ),
  );
  await request(path + "/paragraph-links", anchor);
  const other = store.create("Other workspace", "");
  assert.equal(
    (await request(`/workspaces/${other.id}/papers/${savedPaper}/document`))
      .status,
    404,
  );
  assert.equal(
    (await request(path + "/paragraph-links", { ...anchor, nodeId: "foreign" }))
      .status,
    404,
  );
  assert.equal(
    (await request(path + "/document")).data.annotations[0].note,
    "saved annotation",
  );
});
test("paper chat uses actual retrieved text and anchors, saves validated clickable sources, and rejects foreign selections", async () => {
  const block = savedDocument.blocks.find((b) => b.text === methodText);
  const result = await request(`/workspaces/${savedWorkspace}/chat`, {
    mode: "paper",
    paperId: savedPaper,
    message: "请解释注意力路由",
    selection: {
      documentId: savedDocument.id,
      blockId: block.id,
      start: 0,
      end: 17,
    },
  });
  assert.equal(result.status, 200);
  const answer = result.data.messages.at(-1);
  assert.ok(answer.content.includes("#source-S1"));
  assert.ok(answer.content.includes("出处未定位"));
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0].blockId, block.id);
  assert.ok(seen[0].content.includes(methodText));
  assert.ok(!seen[0].content.includes('"html":'));
  assert.ok(!seen[0].content.includes("saved annotation"));
  const followup = await request(`/workspaces/${savedWorkspace}/chat`, {
    mode: "paper",
    paperId: savedPaper,
    message: "继续解释上一个选段",
  });
  assert.equal(followup.status, 200);
  assert.equal(seen[1].content, "请解释注意力路由");
  assert.equal(seen[2].role, "assistant");
  assert.equal(
    followup.data.messages.filter((m) => m.paperId === savedPaper).length,
    4,
  );
  assert.equal(
    (
      await request(`/workspaces/${savedWorkspace}/chat`, {
        mode: "paper",
        paperId: savedPaper,
        message: "invalid",
        selection: {
          documentId: "foreign",
          blockId: block.id,
          start: 0,
          end: 17,
        },
      })
    ).status,
    409,
  );
});
test("download failure remains visible and retry fills the existing record; absent HTML falls back without losing PDF or paper metadata", async () => {
  await request(
    "/preferences",
    { autoDownloadPapers: true, autoOrganizePapers: false },
    "PATCH",
  );
  const w = store.create("Failure fallback", "");
  pdfHandler = async () => {
    throw new Error("Download unavailable");
  };
  const imported = await request(`/workspaces/${w.id}/arxiv`, {
    input: "2401.54321",
  });
  const p = imported.data.papers[0];
  await acquirer.idle();
  assert.equal(store.get(w.id).papers[0].acquisition.state, "failed");
  assert.equal(store.get(w.id).papers[0].inLibrary, true);
  pdfHandler = async () => textPdf(methodText);
  htmlHandler = async () => {
    throw new Error("HTML unavailable");
  };
  pdfHandler = async () => Buffer.from("%PDF- corrupt content");
  await request(`/workspaces/${w.id}/papers/${p.id}/acquire`, {});
  await acquirer.idle();
  assert.equal(store.get(w.id).papers[0].file, null);
  assert.equal(store.get(w.id).papers[0].acquisition.state, "failed");
  pdfHandler = async () => textPdf(methodText);
  await request(`/workspaces/${w.id}/papers/${p.id}/acquire`, {});
  await acquirer.idle();
  const record = store.get(w.id).papers[0];
  assert.equal(record.id, p.id);
  assert.equal(record.document.source, "converted");
  assert.equal(record.acquisition.state, "ready");
  assert.ok(record.file);
  assert.match(record.document.warning, /可能缺失/);
  assert.equal(record.pdfVersion, "2401.54321v2");
  htmlHandler = async () => htmlPaper;
});
test("download and organization settings are independent, portable, and automatic organization can use existing abstract without downloading", async () => {
  await request(
    "/preferences",
    { autoDownloadPapers: false, autoOrganizePapers: true },
    "PATCH",
  );
  const beforePdf = pdfCalls,
    beforeModel = modelCalls;
  const w = store.create("Organize only", "");
  await request(`/workspaces/${w.id}/arxiv`, { input: "2401.99999" });
  await acquirer.idle();
  assert.equal(pdfCalls, beforePdf);
  assert.ok(modelCalls > beforeModel);
  const p = store.get(w.id).papers[0];
  assert.equal(p.file, null);
  assert.equal(p.autoOrganization.state, "complete");
  assert.ok(p.organizedAt);
  const file = (await request("/preferences/export")).data;
  assert.equal(file.settings.autoDownloadPapers, false);
  assert.equal(file.settings.autoOrganizePapers, true);
  await request(
    "/preferences",
    { autoDownloadPapers: true, autoOrganizePapers: false },
    "PATCH",
  );
  await request("/preferences/import", file);
  assert.equal((await request("/settings")).data.autoDownloadPapers, false);
  assert.equal(
    (
      await request(
        "/preferences",
        { autoDownloadPapers: "yes", autoOrganizePapers: false },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal((await request("/settings")).data.autoOrganizePapers, true);
  await request(
    "/preferences",
    { autoDownloadPapers: true, autoOrganizePapers: false },
    "PATCH",
  );
});
test("route-wide acquisition reuses cached documents and preserves candidate admission state", async () => {
  const w = store.get(savedWorkspace);
  w.routes.push({
    id: "r",
    title: "Route",
    goal: "Goal",
    selected: true,
    stages: [
      {
        title: "Stage",
        capability: "Learning",
        paperIds: [savedPaper],
        nodeIds: [],
        sideQuest: false,
      },
    ],
  });
  store.put(w);
  const beforePdf = pdfCalls;
  await request(`/workspaces/${w.id}/routes/r/acquire`, {});
  await acquirer.idle();
  assert.equal(pdfCalls, beforePdf);
  assert.equal(store.get(w.id).papers[0].id, savedPaper);
});
test("organization associates concepts with validated source paragraphs even when the generated title does not occur verbatim", async () => {
  const original = modelHandler;
  const block = savedDocument.blocks.find((b) => b.text === methodText);
  modelHandler = async (_, messages) => {
    const input = JSON.parse(messages.at(-1).content);
    assert.ok(input.paper.passages.some((p) => p.id === block.id));
    assert.equal(input.paper.text, undefined);
    return {
      summary: "A grounded organization.",
      nodes: [
        {
          name: "Evidence Composition",
          englishName: "Evidence Composition",
          chineseName: "证据组合",
          year: 2024,
          category: "Component",
          importance: "normal",
          description: "Combines features.",
          significance: "Understand the method.",
          directions: ["General"],
          necessary: true,
          relevance: "core",
          contribution: "Uses",
          sourceParagraphIds: [block.id, "foreign-block"],
          paperSummary: {
            role: "本文用该概念组合特征。",
            implementation: "本文采用学习得到的注意力权重。",
          },
        },
      ],
      edges: [],
      paperEdges: [],
    };
  };
  try {
    const response = await request(
      `/workspaces/${savedWorkspace}/papers/${savedPaper}/organize`,
      {},
    );
    assert.equal(response.status, 200);
    const node = response.data.nodes.find(
      (n) => n.englishName === "Evidence Composition",
    );
    assert.ok(node);
    const links = (
      await request(`/workspaces/${savedWorkspace}/nodes/${node.id}/passages`)
    ).data;
    assert.ok(links.some((l) => l.blockId === block.id && l.source === "ai"));
    assert.ok(!links.some((l) => l.blockId === "foreign-block"));
  } finally {
    modelHandler = original;
  }
});
