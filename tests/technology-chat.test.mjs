import { test } from "node:test";
import assert from "node:assert/strict";
import { earliestLinkedPaper } from "../src/technologyChat.ts";

test("technology quotes select the earliest library admission, independent of publication year, candidate creation or attached-ID order", () => {
  const papers = [
    { id: "unrelated", inLibrary: true, addedAt: "1999-01-01" },
    { id: "candidate", inLibrary: false, addedAt: "2000-01-01" },
    {
      id: "late",
      inLibrary: true,
      addedAt: "2001-01-01",
      libraryAddedAt: "2025-01-01",
      year: 2010,
    },
    { id: "early", inLibrary: true, addedAt: "2024-01-01", year: 2024 },
  ];
  const node = { paperIds: ["late", "candidate", "missing", "early"] };
  assert.equal(earliestLinkedPaper(node, papers).id, "early");
  assert.deepEqual(
    papers.map((p) => p.id),
    ["unrelated", "candidate", "late", "early"],
  );
  assert.equal(
    earliestLinkedPaper({ paperIds: ["candidate", "missing"] }, papers),
    undefined,
  );
});

test("technology quotes keep stable library order for legacy timestamps and equal admissions", () => {
  const papers = [
    { id: "first", inLibrary: true },
    { id: "second", inLibrary: true, addedAt: "invalid" },
  ];
  const node = { paperIds: ["second", "first"] };
  assert.equal(earliestLinkedPaper(node, papers).id, "first");
  for (const p of papers) p.addedAt = "2024-01-01";
  assert.equal(earliestLinkedPaper(node, papers).id, "first");
});
