import { ConnectionsEditor } from "./ConnectionsEditor";
import type { Workspace, Tech } from "./types";
export { technologyRelationOptions } from "./ConnectionsEditor";
export function ConnectedTechnologies({
  w,
  node,
  onSelect,
  onSave,
}: {
  w: Workspace;
  node: Tech;
  onSelect: (id: string) => void;
  onSave: (
    id: string,
    data: { relation: string | null; direction: string },
  ) => Promise<unknown>;
}) {
  return (
    <ConnectionsEditor
      kind="技术"
      itemId={node.id}
      items={w.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        search: `${n.name} ${n.englishName || ""} ${n.chineseName || ""}`,
      }))}
      edges={w.edges}
      onSelect={onSelect}
      onSave={onSave}
    />
  );
}
