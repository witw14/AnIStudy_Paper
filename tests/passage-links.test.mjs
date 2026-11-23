import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyPassageLinks,
  curatedParagraphLinks,
  normalizeSourcePassages,
} from "../server/passage-links.mjs";

test("curated links validate quotes, reject summaries and generic tags, deduplicate roles and preserve manual choices", () => {
  const doc = {
    id: "d",
    blocks: [
      {
        id: "reason",
        section: "3.5 Encoding",
        kind: "paragraph",
        text: "In order to preserve token positions, we add positional information.",
      },
      {
        id: "formula",
        section: "3.5 Encoding",
        kind: "paragraph",
        text: "Position vectors are computed using sine and cosine functions.",
      },
      {
        id: "duplicate",
        section: "3.5 Encoding",
        kind: "paragraph",
        text: "Another paragraph discusses the same formula.",
      },
      {
        id: "summary",
        section: "7 Conclusion",
        kind: "paragraph",
        text: "In this work, we presented the Transformer, replacing recurrent layers with self-attention.",
      },
      {
        id: "manual",
        section: "1 Introduction",
        kind: "paragraph",
        text: "User selected background.",
      },
      {
        id: "reference",
        section: "References",
        kind: "paragraph",
        text: "Position vectors are computed using sine and cosine functions.",
      },
    ],
  };
  const w = {
    nodes: [
      {
        id: "n",
        name: "位置编码",
        englishName: "Positional Encoding",
        paperIds: ["p"],
      },
    ],
  };
  const p = {
    id: "p",
    paragraphLinks: [
      { nodeId: "n", documentId: "d", blockId: "manual", source: "manual" },
    ],
  };
  const selections = [
    ["reason", "引入原因"],
    ["formula", "计算公式"],
    ["duplicate", "计算公式"],
    ["summary", "正式讲解"],
    ["reference", "实现细节"],
  ].map(([blockId, label]) => ({
    blockId,
    label,
    quote: doc.blocks.find((b) => b.id === blockId).text,
  }));
  selections.push({ blockId: "foreign", label: "实验结果", quote: "invented" });
  selections.push({
    blockId: "duplicate",
    label: "问题和缺陷",
    quote: "not in the original",
  });
  selections.push({
    blockId: "duplicate",
    label: "整理关联",
    quote: doc.blocks[2].text,
  });
  const raw = { name: "POSITIONAL ENCODING", sourcePassages: selections };
  applyPassageLinks(w, p, doc, [raw]);
  const links = curatedParagraphLinks(w, p, doc);
  assert.deepEqual(
    links.map((l) => [l.blockId, l.label]),
    [
      ["manual", "手动关联"],
      ["reason", "引入原因"],
      ["formula", "计算公式"],
    ],
  );
  applyPassageLinks(w, p, doc, [raw]);
  assert.equal(p.paragraphLinks.length, 3);
  p.blockedParagraphLinks = [
    { nodeId: "n", documentId: "d", blockId: "formula" },
  ];
  assert.equal(curatedParagraphLinks(w, p, doc).length, 2);
  assert.deepEqual(
    normalizeSourcePassages({
      sourcePassages: [
        { blockId: "b", label: "过长的标签不应该能够保存到这里", quote: "a" },
      ],
    }),
    [],
  );
});

test("legacy AI tags are consolidated while term occurrences never create associations", () => {
  const doc = {
    id: "d",
    blocks: [
      {
        id: "a",
        section: "3 Method",
        kind: "paragraph",
        text: "This mechanism computes attention weights and combines relevant feature representations.",
      },
      {
        id: "b",
        section: "3 Method",
        kind: "paragraph",
        text: "The mechanism computes weighted feature vectors to combine learned representations.",
      },
      {
        id: "c",
        section: "2 Background",
        kind: "paragraph",
        text: "Self-Attention is mentioned here.",
      },
    ],
  };
  const w = { nodes: [{ id: "n", name: "Self-Attention", paperIds: ["p"] }] },
    p = {
      id: "p",
      paragraphLinks: doc.blocks.map((b) => ({
        nodeId: "n",
        documentId: "d",
        blockId: b.id,
        source: "ai",
      })),
    };
  assert.equal(curatedParagraphLinks(w, p, doc).length, 1);
  p.paragraphLinks = [];
  assert.deepEqual(curatedParagraphLinks(w, p, doc), []);
});
