export const nodeDisplayNames = {
  all: "全部节点",
  main: "主要节点",
  minimal: "极简节点",
};
export type NodeDisplayMode = keyof typeof nodeDisplayNames;
type RatedNode = { importance: string; hiddenInGraph?: boolean };
export function isGraphNodeVisible(node: RatedNode, mode: NodeDisplayMode) {
  if (mode === "all") return true;
  if (node.hiddenInGraph) return false;
  return mode !== "minimal" || ["landmark", "major"].includes(node.importance);
}
export function paperGraphImportance(
  paperId: string,
  nodes: { importance: string; paperIds: string[] }[],
) {
  const ranks: Record<string, number> = {
    minor: 1,
    normal: 2,
    major: 3,
    landmark: 4,
  };
  const linked = nodes.filter((n) => n.paperIds.includes(paperId));
  return linked.reduce(
    (highest, n) =>
      (ranks[n.importance] || 0) > (ranks[highest] || 0)
        ? n.importance
        : highest,
    linked.length ? "minor" : "normal",
  );
}
