function sentence(value) {
  if (typeof value !== "string") return "";
  const clean = value.trim().replace(/\s+/g, " ").slice(0, 700);
  if (!clean) return "";
  const first = clean.match(/^[\s\S]*?[。！？]/)?.[0] || clean;
  return /[。！？.!?]$/.test(first) ? first : first + "。";
}

export function normalizePaperSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const role = sentence(value.role);
  const implementation = sentence(value.implementation);
  if (role || implementation) return { role, implementation };
}

export function linkedPaperSummary(value, previous) {
  return {
    role:
      value?.role || previous?.role || "该技术已关联到本文，具体作用尚未提取。",
    implementation:
      value?.implementation ||
      previous?.implementation ||
      "当前整理结果未提供它在本文的实现说明。",
  };
}
