import { uid } from "./seed.mjs";
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
export function checkAnnotationRevisions(rows, expected) {
  if (
    rows.length !== expected.length ||
    rows.some(
      (a) => !expected.some((e) => e.id === a.id && e.revision === a.revision),
    )
  )
    throw fail("标注已在其他窗口更新，请重新选择后重试；原有笔记仍保留。");
}
export function mergeHighlight(rows, doc, selections, color, expected) {
  checkAnnotationRevisions(rows, expected);
  const order = new Map(doc.blocks.map((b, i) => [b.id, i]));
  const parts = [...selections].sort(
    (a, b) => order.get(a.blockId) - order.get(b.blockId) || a.start - b.start,
  );
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i],
      block = doc.blocks.find((b) => b.id === s.blockId);
    if (
      !block ||
      s.start < 0 ||
      s.end <= s.start ||
      s.end > block.text.length ||
      block.text.slice(s.start, s.end) !== s.quote
    )
      throw fail("选段位置已变化，请重新选择原文。");
    if (i && parts[i - 1].blockId === s.blockId && parts[i - 1].end > s.start)
      throw fail("同一选区不能包含重叠片段。", 400);
  }
  const overlaps = (a) =>
    parts.some(
      (s) => s.blockId === a.blockId && s.start < a.end && s.end > a.start,
    );
  const groups = new Set(
    rows
      .filter(overlaps)
      .map((a) => a.groupId)
      .filter(Boolean),
  );
  const affected = rows.filter(
    (a) => overlaps(a) || (a.groupId && groups.has(a.groupId)),
  );
  const note = [...affected]
    .sort(
      (a, b) =>
        order.get(a.blockId) - order.get(b.blockId) ||
        a.start - b.start ||
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
    )
    .map((a) => a.note)
    .filter((n) => n.trim())
    .join("\n");
  if (note.length > 20000)
    throw fail(
      "合并后的笔记超过 20000 字符，请先缩短笔记；原有标注未改变。",
      400,
    );
  const time = new Date().toISOString(),
    groupId = uid();
  const preserved = [];
  for (const a of affected) {
    let ranges = [{ start: a.start, end: a.end }];
    for (const s of parts.filter((s) => s.blockId === a.blockId))
      ranges = ranges.flatMap((r) =>
        s.start >= r.end || s.end <= r.start
          ? [r]
          : [
              ...(s.start > r.start ? [{ start: r.start, end: s.start }] : []),
              ...(s.end < r.end ? [{ start: s.end, end: r.end }] : []),
            ],
      );
    const block = doc.blocks.find((b) => b.id === a.blockId);
    for (const r of ranges) {
      const { groupId: oldGroup, ...original } = a;
      preserved.push({
        ...original,
        ...r,
        id: uid(),
        revision: 1,
        note: "",
        quote: block.text.slice(r.start, r.end),
        updatedAt: time,
      });
    }
  }
  const added = parts.map((s, i) => ({
    ...s,
    documentId: doc.id,
    id: uid(),
    groupId,
    color,
    note: i === 0 ? note : "",
    revision: 1,
    createdAt: time,
    updatedAt: time,
  }));
  const removedIds = affected.map((a) => a.id);
  return {
    annotations: [
      ...rows.filter((a) => !removedIds.includes(a.id)),
      ...preserved,
      ...added,
    ],
    removedIds,
  };
}
