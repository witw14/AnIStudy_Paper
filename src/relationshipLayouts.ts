import {
  nodeRadius,
  wrapLabel,
  defaultSpacing,
  type GraphNode,
} from "./graphLayout.ts";

type Node = GraphNode & { category?: string; paperIds?: string[] };
type Edge = { source: string; target: string; relation: string };
type Position = { x: number; y: number; r: number; lines: string[] };
export type Region = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nodeIds: string[];
};
export type ClusterMemory = { groups: { id: string; nodeIds: string[] }[] };
const spacingFor = (s: typeof defaultSpacing, nodes: Node[]) => ({
  x: Math.max(160, Math.min(480, s.horizontal)),
  y: Math.max(
    190,
    Math.min(420, s.vertical),
    ...nodes.map((n) => nodeRadius(n) * 2 + 104),
  ),
});
const position = (n: Node, x: number, y: number, step: number): Position => ({
  x,
  y,
  r: nodeRadius(n),
  lines: wrapLabel(n.name, Math.min(190, step - 24)),
});

export function layoutClusters(
  nodes: Node[],
  edges: Edge[],
  spacing = defaultSpacing,
  previous: ClusterMemory = { groups: [] },
  categoryNames: Record<string, string> = {},
  routes: { stages: { nodeIds: string[] }[] }[] = [],
) {
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((n) => n.id));
  const weights = new Map<string, Map<string, number>>();
  const directNeighbors = new Map<string, Set<string>>();
  const add = (a: string, b: string, weight: number) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return;
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      if (!weights.has(x)) weights.set(x, new Map());
      const row = weights.get(x)!;
      row.set(y, (row.get(y) || 0) + weight);
    }
  };
  edges.forEach((e) => {
    add(e.source, e.target, e.relation === "Inspired by" ? 2 : 4);
    if (e.source !== e.target && ids.has(e.source) && ids.has(e.target))
      for (const [a, b] of [
        [e.source, e.target],
        [e.target, e.source],
      ]) {
        if (!directNeighbors.has(a)) directNeighbors.set(a, new Set());
        directNeighbors.get(a)!.add(b);
      }
  });
  for (let i = 0; i < ordered.length; i++)
    for (let j = i + 1; j < ordered.length; j++) {
      const shared = (ordered[i].paperIds || []).filter((id) =>
        ordered[j].paperIds?.includes(id),
      ).length;
      if (shared) add(ordered[i].id, ordered[j].id, Math.min(3, shared * 1.5));
    }
  for (const r of routes)
    for (const stage of r.stages) {
      const members = [...new Set(stage.nodeIds)].filter((id) => ids.has(id));
      for (let i = 0; i < members.length; i++)
        for (let j = i + 1; j < members.length; j++)
          add(members[i], members[j], 0.5);
    }
  const degree = (id: string) => weights.get(id)?.size || 0;
  const hubs = new Set(
    ordered
      .filter(
        (n) =>
          (directNeighbors.get(n.id)?.size || 0) >=
          Math.max(6, Math.ceil(nodes.length * 0.35)),
      )
      .map((n) => n.id),
  );
  const known = new Set<string>();
  // Tombstones retain slots after deletion; new nodes never displace existing nodes.
  const groups = previous.groups.map((g) => ({
    id: g.id,
    nodeIds: [...g.nodeIds],
  }));
  groups.forEach((g) => g.nodeIds.forEach((id) => known.add(id)));
  const fresh = ordered.filter((n) => !known.has(n.id));
  const unassigned: string[] = [];
  for (const n of fresh) {
    let best: (typeof groups)[number] | undefined;
    let score = 0;
    if (!hubs.has(n.id))
      for (const g of groups) {
        if (g.nodeIds.length >= 9 || g.nodeIds.some((id) => hubs.has(id)))
          continue;
        const affinity =
          g.nodeIds.reduce(
            (sum, id) => sum + (weights.get(n.id)?.get(id) || 0),
            0,
          ) / Math.sqrt(g.nodeIds.length);
        if (affinity > score && affinity >= 1.5) {
          score = affinity;
          best = g;
        }
      }
    if (best) best.nodeIds.push(n.id);
    else unassigned.push(n.id);
  }
  const chunks = unassigned.map((id) => [id]);
  for (;;) {
    let best: [number, number] | null = null;
    let score = 1.49;
    for (let i = 0; i < chunks.length; i++)
      for (let j = i + 1; j < chunks.length; j++) {
        if (
          chunks[i].length + chunks[j].length > 9 ||
          [...chunks[i], ...chunks[j]].some((id) => hubs.has(id))
        )
          continue;
        const strength =
          chunks[i].reduce(
            (s, a) =>
              s +
              chunks[j].reduce((t, b) => t + (weights.get(a)?.get(b) || 0), 0),
            0,
          ) /
          (chunks[i].length * chunks[j].length);
        if (strength > score) {
          best = [i, j];
          score = strength;
        }
      }
    if (!best) break;
    chunks[best[0]].push(...chunks[best[1]]);
    chunks.splice(best[1], 1);
  }
  for (const chunk of chunks) {
    chunk.sort((a, b) => degree(b) - degree(a) || a.localeCompare(b));
    groups.push({ id: `cluster-${[...chunk].sort()[0]}`, nodeIds: chunk });
  }
  const { x, y } = spacingFor(spacing, nodes),
    cellW = x * 3 + 70,
    cellH = y * 3 + 110;
  const positions = new Map<string, Position>();
  const regions: Region[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  groups.forEach((g, index) => {
    const members = g.nodeIds.filter((id) => ids.has(id));
    if (!members.length) return;
    const gx = 30 + (index % 2) * (cellW + 50),
      gy = 30 + Math.floor(index / 2) * (cellH + 50);
    const counts = new Map<string, number>();
    members.forEach((id) => {
      const c = nodeMap.get(id)!.category || "General";
      counts.set(c, (counts.get(c) || 0) + 1);
    });
    const category = [...counts].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0];
    const label = members.some((id) => hubs.has(id))
      ? "跨群连接技术"
      : members.length === 1
        ? "独立技术"
        : `${categoryNames[category] || category || "相关技术"}技术群`;
    regions.push({
      id: g.id,
      label,
      x: gx,
      y: gy,
      width: cellW,
      height: cellH,
      nodeIds: members,
    });
    g.nodeIds.forEach((id, slot) => {
      const n = nodeMap.get(id);
      if (n)
        positions.set(
          id,
          position(
            n,
            gx + 105 + (slot % 3) * x,
            gy + 115 + Math.floor(slot / 3) * y,
            x,
          ),
        );
    });
  });
  return {
    positions,
    regions,
    memory: { groups },
    width: Math.max(520, ...regions.map((r) => r.x + r.width + 30)),
    height: Math.max(470, ...regions.map((r) => r.y + r.height + 30)),
  };
}

export function layoutFocus(
  nodes: Node[],
  edges: Edge[],
  targetId: string,
  spacing = defaultSpacing,
) {
  const target = nodes.find((n) => n.id === targetId);
  const { x, y } = spacingFor(spacing, nodes);
  const roles: Record<string, string[]> = {
    prerequisites: [],
    components: [],
    developments: [],
    related: [],
  };
  const priorities: Record<string, number> = {
    prerequisites: 0,
    components: 1,
    developments: 2,
    related: 3,
  };
  const assigned = new Map<string, string>();
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges) {
    if (e.source !== targetId && e.target !== targetId) continue;
    const incoming = e.target === targetId,
      other = incoming ? e.source : e.target;
    if (other === targetId || !ids.has(other)) continue;
    let role = "related";
    if (incoming && e.relation === "Requires") role = "prerequisites";
    else if (incoming && e.relation === "Uses") role = "components";
    else if (
      !incoming &&
      ["Extends", "Improves upon", "Uses", "Requires"].includes(e.relation)
    )
      role = "developments";
    if (
      !assigned.has(other) ||
      priorities[role] < priorities[assigned.get(other)!]
    )
      assigned.set(other, role);
  }
  [...assigned]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([id, role]) => roles[role].push(id));
  const map = new Map(nodes.map((n) => [n.id, n]));
  const positions = new Map<string, Position>();
  const regions: Region[] = [];
  if (!target) return { positions, regions, width: 520, height: 470 };
  const topHeight =
    Math.max(
      1,
      roles.prerequisites.length,
      roles.components.length + 1,
      roles.developments.length,
    ) *
      y +
    120;
  const column = (id: string, label: string, ids: string[], col: number) => {
    regions.push({
      id,
      label,
      nodeIds: ids,
      x: 30 + col * x,
      y: 30,
      width: x - 12,
      height: topHeight,
    });
    ids.forEach((id, i) =>
      positions.set(
        id,
        position(map.get(id)!, 30 + col * x + (x - 12) / 2, 145 + i * y, x),
      ),
    );
  };
  column("prerequisites", "必要前置 · Requires", roles.prerequisites, 0);
  column(
    "components",
    "当前技术与核心组成",
    [targetId, ...roles.components],
    1,
  );
  column("developments", "后续使用与发展", roles.developments, 2);
  if (roles.related.length) {
    const bottom = topHeight + 90;
    regions.push({
      id: "related",
      label: "相关、来源与替代技术",
      nodeIds: roles.related,
      x: 30,
      y: bottom,
      width: 3 * x - 12,
      height: Math.ceil(roles.related.length / 3) * y + 120,
    });
    roles.related.forEach((id, i) =>
      positions.set(
        id,
        position(
          map.get(id)!,
          30 + (i % 3) * x + (x - 12) / 2,
          bottom + 115 + Math.floor(i / 3) * y,
          x,
        ),
      ),
    );
  }
  return {
    positions,
    regions,
    width: 3 * x + 60,
    height: Math.max(...regions.map((r) => r.y + r.height)) + 30,
  };
}
