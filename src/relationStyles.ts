export type RelationStyle = {
  label: string;
  pattern: string;
  width: number;
  dash?: string;
  hollow?: boolean;
};

// Keep the same visual vocabulary in paper graphs, technology graphs and legends.
export const relationStyles: Record<string, RelationStyle> = {
  Uses: { label: "使用", pattern: "实线", width: 1.6 },
  Requires: { label: "依赖", pattern: "虚线", width: 1.6, dash: "9 5" },
  Extends: { label: "扩展", pattern: "中空线", width: 4.4, hollow: true },
  "Improves upon": {
    label: "改进",
    pattern: "中空虚线",
    width: 4.4,
    hollow: true,
    dash: "10 5",
  },
  "Inspired by": { label: "启发", pattern: "点线", width: 1.8, dash: "1 5" },
  "Introduced by": { label: "提出", pattern: "粗实线", width: 3.4 },
  "Popularized by": {
    label: "推广",
    pattern: "点划线",
    width: 1.6,
    dash: "9 4 1 4",
  },
  Replaces: {
    label: "替代",
    pattern: "长短划线",
    width: 1.6,
    dash: "10 3 3 3",
  },
};
export function relationStyle(relation: string): RelationStyle {
  return (
    relationStyles[relation] || {
      label: relation,
      pattern: "短虚线",
      width: 1.6,
      dash: "3 4",
    }
  );
}
