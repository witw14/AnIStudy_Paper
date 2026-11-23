import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeHighlight,
  checkAnnotationRevisions,
} from "../server/annotations.mjs";
const doc = {
  id: "d",
  blocks: [
    { id: "first", text: "abcdefghijklmnopqrstuvwxyz" },
    { id: "last", text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  ],
};
const annotation = (id, blockId, start, end, note, groupId) => ({
  id,
  documentId: "d",
  blockId,
  start,
  end,
  quote: doc.blocks.find((b) => b.id === blockId).text.slice(start, end),
  note,
  groupId,
  color: "yellow",
  revision: 1,
  createdAt: "2026-10-13T00:00:00Z",
});
const selection = (blockId, start, end) => ({
  blockId,
  start,
  end,
  quote: doc.blocks.find((b) => b.id === blockId).text.slice(start, end),
});
const revisions = (rows) =>
  rows.map((a) => ({ id: a.id, revision: a.revision }));
test("highlighting a larger range combines each existing multiline note in original reading order", () => {
  const rows = [
      annotation("c", "first", 18, 22, "笔记3段落1"),
      annotation("a", "first", 1, 4, "笔记1段落1\n段落2"),
      annotation("b", "first", 10, 14, "笔记2段落1"),
    ],
    before = structuredClone(rows);
  const result = mergeHighlight(
    rows,
    doc,
    [selection("first", 0, 24)],
    "green",
    revisions(rows),
  );
  assert.equal(result.annotations.length, 1);
  assert.equal(result.annotations[0].quote, doc.blocks[0].text.slice(0, 24));
  assert.equal(
    result.annotations[0].note,
    "笔记1段落1\n段落2\n笔记2段落1\n笔记3段落1",
  );
  assert.equal(result.annotations[0].color, "green");
  assert.deepEqual(rows, before);
});
test("highlighting a subset moves the note to the selection and preserves outside color without duplicating notes", () => {
  const rows = [annotation("a", "first", 1, 20, "Original note")];
  const result = mergeHighlight(
    rows,
    doc,
    [selection("first", 5, 10)],
    "blue",
    revisions(rows),
  );
  assert.deepEqual(
    result.annotations
      .filter((a) => !a.groupId)
      .map((a) => [a.start, a.end, a.note, a.color]),
    [
      [1, 5, "", "yellow"],
      [10, 20, "", "yellow"],
    ],
  );
  assert.equal(result.annotations.find((a) => a.groupId).note, "Original note");
  assert.deepEqual(result.removedIds, ["a"]);
});
test("cross-paragraph notes have one owner, preserve unselected group fragments and never duplicate on repeated highlighting", () => {
  const rows = [
    annotation("b", "last", 0, 10, "", "old-group"),
    annotation("a", "first", 0, 10, "One note", "old-group"),
  ];
  const result = mergeHighlight(
    rows,
    doc,
    [selection("last", 0, 12)],
    "pink",
    revisions(rows),
  );
  const leftover = result.annotations.find((a) => a.blockId === "first");
  assert.equal(leftover.note, "");
  assert.equal(leftover.groupId, undefined);
  const marked = result.annotations.find((a) => a.groupId);
  assert.equal(marked.note, "One note");
  const again = mergeHighlight(
    result.annotations,
    doc,
    [selection("first", 0, 12), selection("last", 0, 12)],
    "green",
    revisions(result.annotations),
  );
  assert.equal(again.annotations.length, 2);
  assert.equal(again.annotations[0].note, "One note");
  assert.equal(again.annotations[1].note, "");
  assert.equal(again.annotations[0].groupId, again.annotations[1].groupId);
});
test("stale revisions, invalid anchors, overlapping ranges and oversized notes abort without mutating originals", () => {
  const rows = [annotation("a", "first", 1, 20, "Original note")],
    before = structuredClone(rows);
  assert.throws(
    () =>
      mergeHighlight(rows, doc, [selection("first", 0, 22)], "yellow", [
        { id: "a", revision: 2 },
      ]),
    /其他窗口/,
  );
  assert.throws(
    () =>
      mergeHighlight(
        rows,
        doc,
        [{ ...selection("first", 0, 22), quote: "wrong" }],
        "yellow",
        revisions(rows),
      ),
    /位置/,
  );
  assert.throws(
    () =>
      mergeHighlight(
        rows,
        doc,
        [selection("first", 1, 5), selection("first", 2, 7)],
        "yellow",
        revisions(rows),
      ),
    /重叠/,
  );
  assert.throws(
    () =>
      mergeHighlight(
        rows.map((a) => ({ ...a, note: "x".repeat(20001) })),
        doc,
        [selection("first", 0, 22)],
        "yellow",
        revisions(rows),
      ),
    /20000/,
  );
  assert.throws(() => checkAnnotationRevisions(rows, []), /其他窗口/);
  assert.deepEqual(rows, before);
});
