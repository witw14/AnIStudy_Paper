import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "./api";
import type { ParagraphLink } from "./types";
export function PaperPassages({
  workspaceId,
  nodeId,
  onOpen,
}: {
  workspaceId: string;
  nodeId: string;
  onOpen: (p: ParagraphLink) => void;
}) {
  const [links, setLinks] = useState<ParagraphLink[]>([]);
  useEffect(() => {
    let active = true;
    void api<ParagraphLink[]>(
      `/workspaces/${workspaceId}/nodes/${nodeId}/passages`,
    )
      .then((v) => {
        if (active) setLinks(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [workspaceId, nodeId]);
  if (!links.length) return null;
  return (
    <section className="node-passages">
      <h4>原文关联段落</h4>
      {links.map((l) => (
        <button
          key={`${l.documentId}:${l.blockId}`}
          className="source-passage-button"
          onClick={() => onOpen(l)}
        >
          <span>
            <strong>{l.paperTitle}</strong>
            <small>
              {l.section}
              {l.page ? ` · PDF 第 ${l.page} 页` : ""}
            </small>
            <small>{l.snippet}</small>
          </span>
          <ArrowRight size={14} />
        </button>
      ))}
    </section>
  );
}
