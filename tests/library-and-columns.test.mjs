import { test } from "node:test";
import assert from "node:assert/strict";
import { sortLibraryPapers } from "../src/librarySorting.ts";
import { layoutGraph } from "../src/graphLayout.ts";

test("library sorting orders upload dates and publication years independently, including unknown years", () => {
  const papers = [
    { id: "a", title: "A", year: 2012, addedAt: "2026-09-01T12:00:00Z" },
    { id: "b", title: "B", year: 2021, addedAt: "2026-08-01T12:00:00Z" },
    { id: "c", title: "C", year: null, addedAt: "2026-10-01T12:00:00Z" },
    { id: "d", title: "D", year: null, addedAt: "invalid" },
  ];
  for (const [mode, expected] of Object.entries({
    "upload-desc": ["c", "a", "b", "d"],
    "upload-asc": ["d", "b", "a", "c"],
    "year-desc": ["b", "a", "c", "d"],
    "year-asc": ["c", "d", "a", "b"],
  }))
    assert.deepEqual(
      sortLibraryPapers(papers, mode).map((p) => p.id),
      expected,
    );
  assert.deepEqual(
    papers.map((p) => p.id),
    ["a", "b", "c", "d"],
  );
});

test("year columns wrap only when enabled, preserve every node and keep labels separated at minimum spacing", () => {
  const nodes = Array.from({ length: 7 }, (_, i) => ({
    id: `n${i}`,
    name: "较长的技术标题需要在最小间距下完整换行避免拥挤" + i,
    year: i < 5 ? 2020 : null,
    importance: "landmark",
    radius: 64,
  }));
  const spacing = { horizontal: 160, vertical: 120 };
  const original = structuredClone(nodes);
  const normal = layoutGraph(nodes, spacing, { maxNodesPerColumn: 2 });
  assert.deepEqual(
    normal.columns.map((c) => c.nodes.length),
    [5, 2],
  );
  const wrapped = layoutGraph(nodes, spacing, {
    autoWrap: true,
    maxNodesPerColumn: 2,
  });
  assert.deepEqual(
    wrapped.columns.map((c) => [c.year, c.nodes.length]),
    [
      [2020, 2],
      [2020, 2],
      [2020, 1],
      [null, 2],
    ],
  );
  assert.equal(wrapped.positions.size, nodes.length);
  assert.ok(wrapped.height < normal.height);
  for (const column of wrapped.columns) {
    const positions = column.nodes.map((n) => wrapped.positions.get(n.id));
    assert.equal(new Set(positions.map((p) => p.x)).size, 1);
    for (let i = 1; i < positions.length; i++) {
      const [a, b] = [positions[i - 1], positions[i]];
      assert.ok(b.y - b.r > a.y + a.r + 25 + (a.lines.length - 1) * 17);
    }
  }
  assert.deepEqual(nodes, original);
  const single = layoutGraph(nodes, spacing, {
    autoWrap: true,
    maxNodesPerColumn: 1,
  });
  assert.equal(single.columns.length, nodes.length);
  assert.equal(layoutGraph([], spacing, { autoWrap: true }).columns.length, 0);
});
