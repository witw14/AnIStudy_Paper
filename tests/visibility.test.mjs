import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGraphNodeVisible,
  paperGraphImportance,
} from "../src/nodeVisibility.ts";

test("node display modes distinguish manual hiding from importance without losing ordinary nodes in main mode", () => {
  for (const importance of ["landmark", "major", "normal", "minor"]) {
    for (const hiddenInGraph of [true, false, undefined]) {
      const node = { importance, hiddenInGraph };
      assert.equal(isGraphNodeVisible(node, "all"), true);
      assert.equal(isGraphNodeVisible(node, "main"), !hiddenInGraph);
      assert.equal(
        isGraphNodeVisible(node, "minimal"),
        !hiddenInGraph && ["landmark", "major"].includes(importance),
      );
    }
  }
});

test("minimal paper visibility derives from the highest linked technology grade without inventing grades for unorganized papers", () => {
  const nodes = [
    { importance: "minor", paperIds: ["a", "b"] },
    { importance: "normal", paperIds: ["b", "c"] },
    { importance: "major", paperIds: ["c", "d"] },
    { importance: "landmark", paperIds: ["d"] },
  ];
  assert.deepEqual(
    ["a", "b", "c", "d", "unknown"].map((id) =>
      paperGraphImportance(id, nodes),
    ),
    ["minor", "normal", "major", "landmark", "normal"],
  );
  assert.equal(
    isGraphNodeVisible(
      { importance: paperGraphImportance("unknown", nodes) },
      "minimal",
    ),
    false,
  );
});
