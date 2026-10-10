import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutClusters, layoutFocus } from "../src/relationshipLayouts.ts";
const node = (id, more = {}) => ({
  id,
  name: id,
  year: 2020,
  importance: "major",
  category: "Component",
  paperIds: [],
  ...more,
});
const edge = (source, target, relation = "Uses") => ({
  source,
  target,
  relation,
});
test("clusters group related nodes across years, keep isolated nodes separate and remain deterministic", () => {
  const nodes = [
    node("a", { year: 1960 }),
    node("b", { year: 2026 }),
    node("c"),
    node("d"),
    node("isolated"),
  ];
  const edges = [edge("a", "b"), edge("c", "d")];
  const result = layoutClusters(nodes, edges);
  assert.equal(
    result.regions.find((g) => g.nodeIds.includes("a")).nodeIds.includes("b"),
    true,
  );
  assert.deepEqual(
    result.regions.find((g) => g.nodeIds.includes("isolated")).nodeIds,
    ["isolated"],
  );
  assert.deepEqual(
    layoutClusters([...nodes].reverse(), edges).positions,
    result.positions,
  );
  const updated = layoutClusters(
    [...nodes, node("new")],
    [...edges, edge("b", "new")],
    undefined,
    result.memory,
  );
  for (const n of nodes)
    assert.deepEqual(updated.positions.get(n.id), result.positions.get(n.id));
  const afterDelete = layoutClusters(
    nodes.filter((n) => n.id !== "a"),
    edges,
    undefined,
    result.memory,
  );
  assert.deepEqual(afterDelete.positions.get("b"), result.positions.get("b"));
});
test("shared paper evidence groups techniques without treating every node as a cross-group hub", () => {
  const nodes = Array.from({ length: 8 }, (_, i) =>
    node(`paper-${i}`, { paperIds: ["p"] }),
  );
  const result = layoutClusters(nodes, []);
  assert.equal(result.regions.length, 1);
  assert.equal(result.regions[0].nodeIds.length, 8);
});
test("focus roles distinguish prerequisites from uses, inspiration and successors, without duplicate nodes", () => {
  const nodes = [
    "target",
    "required",
    "component",
    "inspired",
    "extension",
    "replacement",
    "remote",
  ].map((id) => node(id));
  const edges = [
    edge("required", "target", "Requires"),
    edge("component", "target", "Uses"),
    edge("inspired", "target", "Inspired by"),
    edge("target", "extension", "Extends"),
    edge("target", "replacement", "Replaces"),
    edge("required", "target", "Uses"),
    edge("remote", "extension"),
  ];
  const result = layoutFocus(nodes, edges, "target");
  assert.deepEqual(
    result.regions.find((g) => g.id === "prerequisites").nodeIds,
    ["required"],
  );
  assert.deepEqual(result.regions.find((g) => g.id === "components").nodeIds, [
    "target",
    "component",
  ]);
  assert.deepEqual(
    result.regions.find((g) => g.id === "developments").nodeIds,
    ["extension"],
  );
  assert.deepEqual(result.regions.find((g) => g.id === "related").nodeIds, [
    "inspired",
    "replacement",
  ]);
  assert.equal(result.positions.has("remote"), false);
  assert.equal(new Set(result.regions.flatMap((g) => g.nodeIds)).size, 6);
  assert.ok(
    result.positions.get("required").x < result.positions.get("target").x,
  );
  assert.ok(
    result.positions.get("extension").x > result.positions.get("target").x,
  );
  assert.ok(
    result.positions.get("replacement").y > result.positions.get("target").y,
  );
  assert.equal(layoutFocus(nodes, edges, "deleted").positions.size, 0);
});
test("dense clustered and focus layouts keep node and label bounds separate at minimum spacing", () => {
  const nodes = Array.from({ length: 17 }, (_, i) =>
    node(`n${i}`, {
      name: "Very long technical node with a long label " + i,
      paperIds: ["p"],
      importance: "landmark",
    }),
  );
  const edges = nodes.slice(1).map((n) => edge(n.id, "n0", "Requires"));
  for (const layout of [
    layoutClusters(nodes, edges, { horizontal: 160, vertical: 120 }),
    layoutFocus(nodes, edges, "n0", { horizontal: 160, vertical: 120 }),
  ]) {
    const boxes = [...layout.positions.values()].map((p) => ({
      x: p.x - 70,
      y: p.y - p.r,
      w: 140,
      h: p.r * 2 + 25 + p.lines.length * 17,
    }));
    assert.equal(
      boxes.some((a, i) =>
        boxes
          .slice(i + 1)
          .some(
            (b) =>
              a.x < b.x + b.w &&
              a.x + a.w > b.x &&
              a.y < b.y + b.h &&
              a.y + a.h > b.y,
          ),
      ),
      false,
    );
  }
});
