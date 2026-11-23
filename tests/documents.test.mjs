import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pdfDocument,
  htmlDocument,
  paragraphLinks,
  installDocument,
} from "../server/documents.mjs";
import { retrievePassages, bindCitations } from "../server/retrieval.mjs";
import { mergePaper } from "../server/research.mjs";
import { htmlPaper, methodText } from "./reading-fixture.mjs";

test("HTML preserves outline, equations, tables, and controlled images while removing active content", () => {
  const pdf = pdfDocument([{ num: 4, text: methodText }], {
    file: "sample.pdf",
    version: "2401.12345v2",
  });
  const doc = htmlDocument(
    htmlPaper,
    "https://arxiv.org/html/2401.12345v2",
    pdf,
    { mapPages: true },
  );
  assert.equal(doc.source, "arxiv");
  assert.ok(doc.outline.some((o) => o.title === "2 Method"));
  const block = doc.blocks.find((b) => b.text === methodText);
  assert.equal(block.page, 4);
  assert.equal(doc.anchors["S2.p1"], block.id);
  const content = doc.blocks.map((b) => b.html).join("");
  assert.ok(content.includes("<math"));
  assert.ok(content.includes("<table"));
  assert.ok(
    content.includes("https://arxiv.org/html/x1.png") ||
      content.includes("https://arxiv.org/html/2401.12345v2/x1.png"),
  );
  for (const bad of [
    "<script",
    "javascript:",
    "onerror",
    "example.invalid",
    "<annotation",
    "readerInjected",
  ])
    assert.ok(!content.includes(bad), bad);
  assert.equal(
    htmlDocument(htmlPaper, "https://arxiv.org/html/2401.12345v2", pdf, {
      mapPages: false,
    }).blocks.find((b) => b.text === methodText).page,
    null,
  );
  assert.throws(() =>
    htmlDocument("<html>Challenge</html>", "https://arxiv.org/html/id", pdf),
  );
});
test("PDF conversion preserves actual page positions and versions; older annotations retain their source document", () => {
  const first = pdfDocument(
    [
      {
        num: 2,
        text: "2 Methods\n\nAttention Routing is used for feature combination.",
      },
    ],
    { file: "one.pdf" },
  );
  const paper = { document: first, annotations: [{ documentId: first.id }] };
  const next = pdfDocument(
    [{ num: 7, text: "A new version of the explanation." }],
    { file: "two.pdf" },
  );
  installDocument(paper, next);
  installDocument(paper, next);
  assert.equal(paper.documentHistory.length, 1);
  assert.equal(paper.documentHistory[0].id, first.id);
  assert.equal(first.blocks[1].page, 2);
  assert.match(first.warning, /PDF/);
  assert.equal(paper.annotations[0].documentId, first.id);
});
test("term mentions never create technology links; explicit useful associations can be removed", () => {
  const doc = htmlDocument(htmlPaper, "https://arxiv.org/html/2401.12345v2");
  const p = { id: "paper", document: doc };
  const w = {
    nodes: [
      {
        id: "attn",
        name: "注意力路由",
        englishName: "Attention Routing",
        paperIds: ["paper"],
      },
      { id: "cat", name: "CAT", paperIds: ["paper"] },
    ],
  };
  assert.deepEqual(paragraphLinks(w, p), []);
  const block = doc.blocks.find((b) => b.text === methodText);
  p.paragraphLinks = [
    {
      nodeId: "attn",
      documentId: doc.id,
      blockId: block.id,
      source: "ai",
      label: "正式讲解",
      quote: methodText,
    },
  ];
  const links = paragraphLinks(w, p);
  assert.equal(links.length, 1);
  assert.equal(links[0].label, "正式讲解");
  assert.ok(!links.some((l) => l.nodeId === "cat"));
  p.blockedParagraphLinks = [links[0]];
  assert.ok(
    !paragraphLinks(w, p).some(
      (l) => l.nodeId === links[0].nodeId && l.blockId === links[0].blockId,
    ),
  );
});
test("retrieval finds late relevant passages, includes neighbors, excludes candidates in Paper Mode, and binds only valid citations", () => {
  const doc = pdfDocument(
    [
      { num: 1, text: "Unrelated introductory content ".repeat(3000) },
      {
        num: 9,
        text: "9 Limitations\n\nThe method has limitations from dataset shifts and memory usage.\n\nFailure cases appear in unseen domains.",
      },
    ],
    { file: "late.pdf" },
  );
  const w = {
    nodes: [],
    papers: [
      { id: "p", title: "Long paper", inLibrary: true, document: doc },
      { id: "candidate", title: "Candidate", inLibrary: false, document: doc },
      { id: "other", title: "Other paper", inLibrary: true, document: doc },
    ],
  };
  const sources = retrievePassages(w, {
    mode: "paper",
    paperId: "p",
    query: "这个方法有什么局限？",
  });
  assert.ok(
    sources.some((s) => s.text.includes("dataset shifts") && s.page === 9),
  );
  assert.ok(sources.some((s) => s.text.includes("Failure cases")));
  assert.ok(sources.every((s) => s.paperId === "p"));
  const bound = bindCitations(
    "依据 [[cite:S1]]，错误编号 [[cite:S99]]。",
    sources,
  );
  assert.equal(bound.citations.length, 1);
  assert.ok(bound.content.includes("#source-S1"));
  assert.ok(bound.content.includes("出处未定位"));
  assert.ok(!bound.citations[0].text);
  assert.equal(
    bindCitations("变量 [S1] 不应被当作出处。", sources).content,
    "变量 [S1] 不应被当作出处。",
  );
  assert.ok(
    retrievePassages(w, { mode: "research", query: "局限" }).some(
      (s) => s.paperId === "other",
    ),
  );
  assert.ok(
    !retrievePassages(w, { mode: "research", query: "局限" }).some(
      (s) => s.paperId === "candidate",
    ),
  );
});
test("selected text near the end of a long HTML paragraph remains in the model context", () => {
  const doc = htmlDocument(
    `<article class="ltx_document"><h2>1 Method</h2><p>${"Introductory words ".repeat(5000)}Critical late observation about routing behavior.</p></article>`,
    "https://arxiv.org/html/2401.12345v2",
  );
  const block = doc.blocks.find((b) => b.kind === "paragraph"),
    start = block.text.indexOf("Critical late");
  const sources = retrievePassages(
    {
      nodes: [],
      papers: [{ id: "p", title: "Long", inLibrary: true, document: doc }],
    },
    {
      mode: "paper",
      paperId: "p",
      query: "解释选段",
      selection: {
        documentId: doc.id,
        blockId: block.id,
        start,
        end: start + 20,
      },
    },
  );
  assert.ok(sources[0].text.includes("Critical late"));
});
test("paper deduplication migrates source citations and keeps annotations, paragraph links and original PDF versions", () => {
  const aDoc = pdfDocument([{ num: 1, text: "Version one" }], {
    file: "a.pdf",
  });
  const bDoc = pdfDocument([{ num: 2, text: "Version two" }], {
    file: "b.pdf",
  });
  const a = {
      id: "a",
      file: "a.pdf",
      title: "A",
      status: "learning",
      document: aDoc,
      paperIds: [],
      inLibrary: true,
    },
    b = {
      id: "b",
      file: "b.pdf",
      title: "A",
      status: "unlearned",
      document: bDoc,
      annotations: [{ id: "mark", documentId: bDoc.id }],
      paragraphLinks: [
        { nodeId: "n", blockId: bDoc.blocks[0].id, documentId: bDoc.id },
      ],
    };
  const w = {
    papers: [a, b],
    nodes: [],
    edges: [],
    paperEdges: [],
    notes: [],
    routes: [],
    messages: [
      {
        paperId: "b",
        citations: [{ paperId: "b", documentId: bDoc.id }],
        retrievedSources: [{ paperId: "b" }],
      },
    ],
    suggestions: [],
  };
  mergePaper(w, a, b);
  assert.equal(a.file, "a.pdf");
  assert.equal(a.annotations[0].documentId, bDoc.id);
  assert.ok(a.documentHistory.some((d) => d.id === bDoc.id));
  assert.equal(a.paragraphLinks.length, 1);
  assert.equal(w.messages[0].citations[0].paperId, "a");
  assert.equal(w.messages[0].retrievedSources[0].paperId, "a");
});
