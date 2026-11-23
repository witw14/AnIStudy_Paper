import { ConnectionsEditor } from "./ConnectionsEditor";
import type { Workspace, Paper } from "./types";
export function ConnectedPapers({
  w,
  paper,
  onSelect,
  onSave,
}: {
  w: Workspace;
  paper: Paper;
  onSelect: (id: string) => void;
  onSave: (
    id: string,
    data: { relation: string | null; direction: string },
  ) => Promise<unknown>;
}) {
  return (
    <ConnectionsEditor
      kind="论文"
      itemId={paper.id}
      items={w.papers.map((p) => ({
        id: p.id,
        name: p.title,
        search: `${p.title} ${p.authors} ${p.arxivId || ""}`,
      }))}
      edges={w.paperEdges}
      onSelect={onSelect}
      onSave={onSave}
    />
  );
}
