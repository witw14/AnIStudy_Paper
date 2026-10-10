import type { Paper } from "./types";

export const librarySortOptions = {
  "upload-desc": "上传时间：新 → 旧",
  "upload-asc": "上传时间：旧 → 新",
  "year-desc": "论文年份：新 → 旧 → 未识别",
  "year-asc": "论文年份：未识别 → 旧 → 新",
};
export type LibrarySort = keyof typeof librarySortOptions;
export function sortLibraryPapers(papers: Paper[], mode: LibrarySort) {
  const addedTime = (p: Paper) => {
    const time = Date.parse(p.addedAt || "");
    return Number.isFinite(time) ? time : 0;
  };
  const year = (p: Paper) =>
    Number.isInteger(p.year) && p.year! > 0 ? p.year! : 0;
  return [...papers].sort((a, b) => {
    const order =
      mode === "year-desc"
        ? year(b) - year(a)
        : mode === "year-asc"
          ? year(a) - year(b)
          : mode === "upload-asc"
            ? addedTime(a) - addedTime(b)
            : addedTime(b) - addedTime(a);
    return (
      order ||
      a.title.localeCompare(b.title, "zh-CN") ||
      a.id.localeCompare(b.id)
    );
  });
}
