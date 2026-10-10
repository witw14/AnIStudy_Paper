// Legacy IDs are translated only when already used by a node. They are not defaults.
const legacy = {
  directions: {
    Classification: "图像分类",
    Detection: "目标检测",
    Segmentation: "图像分割",
    Video: "视频",
    Multimodal: "多模态",
    NLP: "自然语言",
    General: "未分类",
  },
  categories: {
    Architecture: "架构",
    Component: "组件",
    "Training Method": "训练方法",
    "Data / Preprocessing": "数据处理",
    "Objective / Loss": "目标函数",
    Representation: "表征",
    Optimization: "优化",
    "Task / Paradigm": "任务范式",
    General: "未分类",
  },
};
const key = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function taxonomyLabel(value) {
  if (typeof value !== "string") return "";
  const label = value.trim().replace(/\s+/g, " ");
  return label.length <= 60 &&
    /[\p{L}\p{N}]/u.test(label) &&
    !/[\r\n<>]/.test(value)
    ? label
    : "";
}
const labels = (values) => [
  ...new Set(
    (Array.isArray(values) ? values : []).map(taxonomyLabel).filter(Boolean),
  ),
];
export function normalizeTaxonomy(input, limit = 20) {
  return Object.fromEntries(
    ["directions", "categories"].map((kind) => [
      kind,
      (Array.isArray(input?.[kind]) ? input[kind] : [])
        .slice(0, limit)
        .map((v) => {
          const name = taxonomyLabel(
            typeof v === "string" ? v : v?.name || v?.id,
          );
          return {
            id: taxonomyLabel(v?.id) || name,
            name,
            aliases: labels(v?.aliases).slice(0, 12),
          };
        })
        .filter((v) => v.name && v.id),
    ]),
  );
}
const names = (entry) =>
  [entry.id, entry.name, ...(entry.aliases || [])].map(key);
export function taxonomyFor(w) {
  const stored = normalizeTaxonomy(w.taxonomy, 1000);
  return Object.fromEntries(
    ["directions", "categories"].map((kind) => {
      const used = labels(
        w.nodes.flatMap((n) =>
          kind === "directions"
            ? n.directions?.length
              ? n.directions
              : [n.direction || "General"]
            : [n.category || "General"],
        ),
      );
      return [
        kind,
        used.map(
          (id) =>
            stored[kind].find((e) => e.id === id) || {
              id,
              name: legacy[kind][id] || id,
              aliases: [],
            },
        ),
      ];
    }),
  );
}
function register(w, kind, value, definitions) {
  const label = taxonomyLabel(value) || "General";
  const existing = w.taxonomy[kind];
  const proposed = definitions[kind]?.find((e) =>
    names(e).includes(key(label)),
  );
  const alternatives = proposed ? names(proposed) : [key(label)];
  let entry =
    existing.find((e) => names(e).includes(key(label))) ||
    existing.find((e) => names(e).some((v) => alternatives.includes(v)));
  if (entry) {
    const aliases = labels([
      ...(entry.aliases || []),
      label,
      ...(proposed ? [proposed.name, proposed.id, ...proposed.aliases] : []),
    ]);
    // An alias must never steal another existing category's identity.
    entry.aliases = aliases.filter(
      (a) => !existing.some((e) => e !== entry && names(e).includes(key(a))),
    );
    return entry.id;
  }
  entry = {
    id: proposed?.id || label,
    name: proposed?.name || legacy[kind][label] || label,
    aliases: labels([label, ...(proposed?.aliases || [])]),
  };
  existing.push(entry);
  return entry.id;
}
export function classifyNode(w, node, definitions = {}) {
  w.taxonomy ||= taxonomyFor(w);
  const normalized = normalizeTaxonomy(definitions);
  const raw = labels(
    node.directions?.length ? node.directions : [node.direction],
  );
  const directions = [
    ...new Set(
      (raw.length ? raw : ["General"]).map((v) =>
        register(w, "directions", v, normalized),
      ),
    ),
  ];
  return {
    category: register(w, "categories", node.category, normalized),
    directions,
    direction: directions[0],
  };
}
