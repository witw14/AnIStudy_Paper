import type { Paper, Tech } from "./types";

export function earliestLinkedPaper(node: Tech, papers: Paper[]) {
  const time = (paper: Paper) => {
    const value = Date.parse(paper.libraryAddedAt || paper.addedAt || "");
    return Number.isFinite(value) ? value : 0;
  };
  // Stable ties retain the library's insertion order, independent of its
  // current display sort and the order of IDs attached to the technology.
  return papers
    .filter((p) => p.inLibrary && node.paperIds.includes(p.id))
    .sort((a, b) => time(a) - time(b))[0];
}
