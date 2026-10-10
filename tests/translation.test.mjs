import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { createApp } from "../server/app.mjs";
import { htmlDocument, pdfDocument } from "../server/documents.mjs";
import { translationPlan, translatedDocument } from "../server/translation.mjs";
import { mergePaper } from "../server/research.mjs";
import { htmlPaper } from "./reading-fixture.mjs";

test("translation preserves formula/table structure and escapes model-generated text rather than executing HTML", () => {
  const doc = htmlDocument(
    htmlPaper,
    "https://arxiv.org/html/2401.12345v2",
    null,
    { mapPages: false },
  );
  const plan = translationPlan(doc);
  assert.ok(plan.segments.length > 0);
  assert.ok(
    !plan.segments.some(
      (s) => s.text === "y" || s.text === "x" || s.text === "n",
    ),
  );
  const translated = translatedDocument(
    doc,
    plan,
    Object.fromEntries(
      plan.segments.map((s) => [
        s.id,
        `中文 <script>evil()</script> ${s.text}`,
      ]),
    ),
  );
  assert.equal(translated.blocks.length, doc.blocks.length);
  assert.ok(translated.blocks.some((b) => b.html.includes("<math")));
  assert.ok(translated.blocks.some((b) => b.html.includes("<table")));
  assert.ok(!translated.blocks.some((b) => b.html.includes("<script>")));
  assert.ok(translated.blocks.some((b) => b.html.includes("&lt;script&gt;")));
  assert.notEqual(translated.id, doc.id);
});
const dir = mkdtempSync(join(tmpdir(), "anistudy-translation-"));
let server,
  store,
  acquirer,
  base,
  modelCalls = 0,
  failNext = false,
  seen = [];
before(async () => {
  const setup = createApp({
    dataDir: dir,
    seed: false,
    acquisition: false,
    model: async (_, messages, json, options) => {
      seen.push(messages);
      modelCalls++;
      if (messages[0].content.includes("AnIStudy_TRANSLATION")) {
        if (failNext) {
          failNext = false;
          throw new Error("Controlled translation failure");
        }
        const { segments } = JSON.parse(messages.at(-1).content);
        options?.onUsage?.({
          inputTokens: 100,
          outputTokens: 60,
          totalTokens: 160,
        });
        return {
          translations: segments.map((s) => ({
            id: s.id,
            text: "译文污染测试 " + s.text,
          })),
        };
      }
      if (json)
        return {
          recommendations: [],
          routes: [
            {
              title: "Reading",
              goal: "Study",
              stages: [
                {
                  title: "Read",
                  capability: "Understand",
                  paperIds: ["paper"],
                  nodeIds: [],
                  sideQuest: false,
                },
              ],
            },
          ],
        };
      return "回答原文 [[cite:S1]]";
    },
  });
  store = setup.store;
  acquirer = setup.acquirer;
  server = setup.app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  acquirer.close();
  await new Promise((r) => server.close(r));
  store.db.close();
  assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
  assert.ok(basename(dir).startsWith("anistudy-translation-"));
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
function paper(w, text = "Attention combines original features.") {
  const doc = pdfDocument([{ num: 1, text }], { file: null });
  const p = {
    id: "paper",
    title: "Test",
    authors: "Test Author",
    year: 2024,
    arxivId: "2401.12345",
    inLibrary: true,
    verification: "verified",
    summary: "Original summary",
    status: "unlearned",
    document: doc,
    text,
  };
  w.papers.push(p);
  store.put(w);
  return p;
}
let savedW, savedP;
test("full translation caches on the original paper, has actual token counts, and keeps translations out of chat and route-model context", async () => {
  const w = store.create("Translation", "");
  const p = paper(w);
  savedW = w.id;
  savedP = p;
  const endpoint = `/workspaces/${w.id}/papers/${p.id}`;
  const originalId = p.document.id;
  const translated = await request(endpoint + "/translate", {
    documentId: originalId,
  });
  assert.equal(translated.status, 200);
  assert.equal(translated.data.translation.state, "complete");
  assert.equal(translated.data.translation.tokenUsage.totalTokens, 160);
  const before = modelCalls;
  assert.equal(
    (await request(endpoint + "/translate", { documentId: originalId })).data
      .cached,
    true,
  );
  assert.equal(modelCalls, before);
  const publicPaper = (await request(`/workspaces/${w.id}`)).data.papers[0];
  assert.equal(publicPaper.fullTranslations, undefined);
  assert.equal(store.get(w.id).papers[0].document.id, originalId);
  assert.equal(store.get(w.id).papers[0].text, p.text);
  const data = (await request(endpoint + "/document")).data;
  assert.equal(data.translation.document.source, "translation");
  const chat = await request(`/workspaces/${w.id}/chat`, {
    mode: "paper",
    paperId: p.id,
    message: "Explain features",
  });
  assert.equal(chat.status, 200);
  assert.ok(!seen.at(-1)[0].content.includes("译文污染测试"));
  const routes = await request(`/workspaces/${w.id}/routes/generate`, {
    goal: "Study features",
  });
  assert.equal(routes.status, 200, JSON.stringify(routes.data));
  assert.ok(!JSON.stringify(seen.at(-1)).includes("译文污染测试"));
  assert.equal(
    (
      await request(endpoint + "/translate", {
        documentId: data.translation.document.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(endpoint + "/translate", {
        documentId: originalId,
        scope: "selection",
      })
    ).status,
    400,
  );
});
test("original and translated highlights are independent; translated anchors cannot enter chat retrieval or technology links", async () => {
  const path = `/workspaces/${savedW}/papers/${savedP.id}`;
  const d = (await request(path + "/document")).data,
    original = d.document.blocks[0],
    translated = d.translation.document.blocks[0];
  for (const [doc, b] of [
    [d.document, original],
    [d.translation.document, translated],
  ])
    assert.equal(
      (
        await request(path + "/annotations", {
          documentId: doc.id,
          blockId: b.id,
          start: 0,
          end: 4,
          quote: b.text.slice(0, 4),
          color: "yellow",
        })
      ).status,
      201,
    );
  const next = (await request(path + "/document")).data;
  assert.equal(next.annotations.length, 1);
  assert.equal(next.translationAnnotations.length, 1);
  const id = next.annotations[0].id;
  await request(path + `/annotations/${id}`, { revision: 1 }, "DELETE");
  assert.equal(
    (await request(path + "/document")).data.translationAnnotations.length,
    1,
  );
  assert.equal(
    (
      await request(path + "/paragraph-links", {
        documentId: d.translation.document.id,
        blockId: translated.id,
        nodeId: "invalid",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/workspaces/${savedW}/chat`, {
        mode: "paper",
        paperId: savedP.id,
        message: "Do not use translation",
        selection: {
          documentId: d.translation.document.id,
          blockId: translated.id,
          start: 0,
          end: 4,
        },
      })
    ).status,
    409,
  );
});
test("failed full translation saves completed batches, resumes only missing segments and preserves concurrent user edits", async () => {
  const w = store.create("Partial", "");
  const p = paper(
    w,
    Array.from(
      { length: 12 },
      (_, i) =>
        `Paragraph ${i}: ` +
        "Original method preserves important information. ".repeat(30),
    ).join("\n\n"),
  );
  // Pre-cache one source segment to exercise resume without an extra model call.
  const plan = translationPlan(p.document);
  p.fullTranslations = [
    {
      id: "partial",
      sourceDocumentId: p.document.id,
      state: "partial",
      pieces: { [plan.segments[0].id]: "已缓存段落" },
      completedSegments: 1,
      totalSegments: plan.segments.length,
    },
  ];
  store.put(w);
  failNext = true;
  const endpoint = `/workspaces/${w.id}/papers/${p.id}`;
  assert.equal(
    (await request(endpoint + "/translate", { documentId: p.document.id }))
      .status,
    500,
  );
  let current = store.get(w.id);
  assert.equal(current.papers[0].fullTranslations[0].state, "partial");
  assert.equal(
    current.papers[0].fullTranslations[0].pieces[plan.segments[0].id],
    "已缓存段落",
  );
  current.papers[0].userEdits = { title: "Edited title" };
  current.notes = [
    {
      id: "note",
      title: "Keep",
      content: "Keep",
      paperIds: [p.id],
      nodeIds: [],
      revision: 1,
    },
  ];
  store.put(current);
  const before = seen.length;
  const result = await request(endpoint + "/translate", {
    documentId: p.document.id,
  });
  assert.equal(result.status, 200);
  assert.ok(
    seen
      .slice(before)
      .every(
        (messages) =>
          !JSON.parse(messages.at(-1).content).segments.some(
            (s) => s.id === plan.segments[0].id,
          ),
      ),
  );
  current = store.get(w.id);
  assert.equal(current.papers[0].title, "Edited title");
  assert.equal(current.notes[0].content, "Keep");
});

test("same-paper merge preserves the completed translation and annotations on its separate view", () => {
  const w = store.get(savedW),
    keep = w.papers[0],
    other = structuredClone(keep);
  other.id = "duplicate";
  keep.fullTranslations = keep.fullTranslations.map((t) => ({
    ...t,
    state: "partial",
    completedSegments: 0,
    pieces: {},
    document: undefined,
  }));
  w.papers.push(other);
  mergePaper(w, keep, other);
  assert.equal(w.papers.length, 1);
  assert.equal(w.papers[0].fullTranslations[0].state, "complete");
  assert.ok(
    w.papers[0].annotations.some(
      (a) => a.documentId === other.fullTranslations[0].document.id,
    ),
  );
});
