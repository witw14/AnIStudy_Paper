export type GraphNode = {
  id: string;
  name: string;
  year: number | null;
  importance: string;
  radius?: number;
};
export const radiusFor = (importance: string) =>
  ({ landmark: 39, major: 31, normal: 26, minor: 7 })[importance] || 26;
export const nodeRadius = (node: GraphNode) =>
  Number.isFinite(node.radius)
    ? Math.max(4, Math.min(64, node.radius!))
    : radiusFor(node.importance);
export function wrapLabel(text: string, maxWidth = 190) {
  const tokens = text.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+\s*/g) || [];
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const token of tokens) {
    const chunkLength = Math.max(1, Math.floor(maxWidth / 6.3));
    for (const chunk of token.length > chunkLength
      ? token.match(new RegExp(`.{1,${chunkLength}}`, "g")) || []
      : [token]) {
      const size = [...chunk].reduce(
        (sum, c) => sum + (/[\u3400-\u9fff]/.test(c) ? 12 : 6.3),
        0,
      );
      if (width + size > maxWidth && line) {
        lines.push(line.trim());
        line = "";
        width = 0;
      }
      line += chunk;
      width += size;
    }
  }
  if (line) lines.push(line.trim());
  return lines.length > 4
    ? [...lines.slice(0, 3), lines[3].slice(0, 26) + "…"]
    : lines;
}
export const defaultSpacing = { horizontal: 270, vertical: 220 };
export function layoutGraph(
  nodes: GraphNode[],
  spacing = defaultSpacing,
  options: { autoWrap?: boolean; maxNodesPerColumn?: number } = {},
) {
  const yearOf = (n: GraphNode) =>
    Number.isInteger(n.year) && n.year! > 0 ? n.year : null;
  const years = [...new Set(nodes.map(yearOf))].sort(
    (a, b) => (a ?? 9999) - (b ?? 9999),
  );
  const horizontal = Math.max(160, Math.min(480, spacing.horizontal));
  const vertical = Math.max(120, Math.min(420, spacing.vertical));
  const limit = options.autoWrap
    ? Math.max(1, Math.min(100, Math.floor(options.maxNodesPerColumn || 10)))
    : Infinity;
  const columns = years.flatMap((year) => {
    const group = nodes
      .filter((n) => yearOf(n) === year)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const count = Math.ceil(group.length / limit) || 1;
    return Array.from({ length: count }, (_, index) => ({
      year,
      index,
      count,
      nodes: Number.isFinite(limit)
        ? group.slice(index * limit, (index + 1) * limit)
        : group,
    }));
  });
  const width = Math.max(520, (columns.length - 1) * horizontal + 250);
  const positions = new Map<
    string,
    { x: number; y: number; r: number; lines: string[] }
  >();
  const step = horizontal;
  columns.forEach((column, i) =>
    column.nodes.forEach((n, j, column) => {
      const previous = j ? positions.get(column[j - 1].id) : undefined;
      positions.set(n.id, {
        x: 125 + i * step,
        y: previous
          ? previous.y +
            Math.max(
              vertical,
              previous.r + 24 + previous.lines.length * 17 + nodeRadius(n) + 12,
            )
          : 105 + (i % 2) * 35,
        r: nodeRadius(n),
        lines: wrapLabel(n.name, Math.min(190, horizontal - 24)),
      });
    }),
  );
  const height = Math.max(
    470,
    ...[...positions.values()].map(
      (p) => p.y + p.r + p.lines.length * 17 + 110,
    ),
  );
  return {
    years,
    columns,
    width,
    height,
    positions,
    yearX: (i: number) => 125 + i * step,
  };
}
export function edgePath(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number },
  lane = 0,
) {
  if (a.x === b.x) {
    const outer = a.x + 115 + lane * 20;
    return {
      d: `M ${a.x + a.r + 2} ${a.y} C ${outer} ${a.y}, ${outer} ${b.y}, ${b.x + b.r + 3} ${b.y}`,
      x: outer - 20,
      y: (a.y + b.y) / 2,
    };
  }
  const sign = b.x > a.x ? 1 : -1;
  const sx = a.x + sign * (a.r + 2),
    tx = b.x - sign * (b.r + 3),
    mid = (sx + tx) / 2;
  return {
    d: `M ${sx} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${tx} ${b.y}`,
    x: mid,
    y: (a.y + b.y) / 2,
  };
}
