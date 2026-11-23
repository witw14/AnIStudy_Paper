import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronRight,
  FileText,
  Focus,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { EditableText } from "./EditableText";
import { Markdown } from "./Markdown";
import { NoteLinks } from "./Notes";
import { NodeTags, PaperYear } from "./InfoEditors";
import { ConnectedTechnologies } from "./ConnectedTechnologies";
import { ConnectedPapers } from "./ConnectedPapers";
import { PaperPassages } from "./PaperPassages";
import { PaperAcquisition, paperIsAcquiring } from "./AcquisitionSettings";
import {
  categoryColor,
  type Workspace,
  type Tech,
  type Paper,
  type Settings,
} from "./types";
import type { ReaderLocation } from "./PaperReader";
import "./nodeDetails.css";

type Common = {
  w: Workspace;
  busy: boolean;
  statusControl: ReactNode;
  onSave: (path: string, data: unknown, method?: string) => Promise<unknown>;
  onSelect: (kind: "paper" | "node", id: string) => void;
  onNote: (id: string) => void;
  onReader: (location: ReaderLocation) => void;
  onDelete: () => void;
};
export function TechnologyDetails({
  w,
  node,
  settings,
  busy,
  statusControl,
  onSave,
  onSelect,
  onNote,
  onReader,
  onDelete,
  onCenter,
  onQuote,
  onCreateNote,
  onHide,
}: Common & {
  node: Tech;
  settings: Settings;
  onCenter: () => void;
  onQuote: () => void;
  onCreateNote: () => void;
  onHide: (value: boolean) => void;
}) {
  const alternate =
    settings.preferEnglishTerms !== false ? node.chineseName : node.englishName;
  const papers = node.paperIds
    .map((id) => w.papers.find((p) => p.id === id))
    .filter((p): p is Paper => !!p);
  return (
    <>
      <EditableText
        label="技术标题"
        fields={[
          {
            name: "englishName",
            label: "英文标题",
            value: node.englishName || node.name,
          },
          {
            name: "chineseName",
            label: "中文标题",
            value: node.chineseName || node.name,
          },
        ]}
        onSave={(data) => onSave(`/nodes/${node.id}`, data, "PATCH")}
      >
        <h2>{node.name}</h2>
      </EditableText>
      {alternate && alternate !== node.name && (
        <p className="node-alternate-title">{alternate}</p>
      )}
      <NodeTags
        node={node}
        w={w}
        onSave={(data) => onSave(`/nodes/${node.id}`, data, "PATCH")}
      />
      <div className="detail-status">
        <span>你的学习状态</span>
        {statusControl}
      </div>
      <div className="detail-main-actions">
        <button className="primary" onClick={onCenter}>
          <Focus size={15} />
          以此技术为中心
        </button>
        <button className="secondary" onClick={onQuote}>
          <MessageSquare size={15} />
          引用并打开对话
        </button>
      </div>
      <NoteLinks
        w={w}
        kind="node"
        id={node.id}
        onOpen={onNote}
        onCreate={onCreateNote}
        disabled={busy}
      />
      <EditableText
        label="是什么"
        heading="是什么"
        markdown
        fields={[
          { name: "description", label: "是什么", value: node.description },
        ]}
        onSave={(data) => onSave(`/nodes/${node.id}`, data, "PATCH")}
      >
        <Markdown>{node.description}</Markdown>
      </EditableText>
      <EditableText
        label="为什么值得理解"
        heading="为什么值得理解"
        markdown
        fields={[
          {
            name: "significance",
            label: "为什么值得理解",
            value: node.significance,
          },
        ]}
        onSave={(data) => onSave(`/nodes/${node.id}`, data, "PATCH")}
      >
        <Markdown>{node.significance}</Markdown>
      </EditableText>
      <EditableText
        label="重要性判断"
        heading="重要性判断"
        markdown
        fields={[
          {
            name: "importanceReason",
            label: "重要性判断",
            value: node.importanceReason || "",
          },
        ]}
        onSave={(data) => onSave(`/nodes/${node.id}`, data, "PATCH")}
      >
        <Markdown>{node.importanceReason || ""}</Markdown>
      </EditableText>
      {!!papers.length && (
        <section className="detail-key-papers">
          <h4>关键论文</h4>
          {papers.map((p) => (
            <button
              className="related-paper"
              key={p.id}
              onClick={() => onSelect("paper", p.id)}
            >
              <FileText size={17} />
              <span>
                {p.title}
                <small>
                  {p.year ?? "年份待识别"} ·{" "}
                  {p.inLibrary ? "已在论文库" : "待加入论文库"}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </section>
      )}
      <ConnectedTechnologies
        w={w}
        node={node}
        onSelect={(id) => onSelect("node", id)}
        onSave={(id, data) =>
          onSave(`/nodes/${node.id}/connections/${id}`, data, "PUT")
        }
      />
      <PaperPassages
        workspaceId={w.id}
        nodeId={node.id}
        onOpen={(l) =>
          onReader({
            paperId: l.paperId!,
            documentId: l.documentId,
            blockId: l.blockId,
            format: "html",
          })
        }
      />
      <div className="detail-footer">
        <button className="danger-text" onClick={onDelete}>
          <Trash2 size={13} />
          删除节点
        </button>
        <label className="node-hide-option">
          <input
            aria-label="隐藏节点"
            type="checkbox"
            checked={!!node.hiddenInGraph}
            disabled={busy}
            onChange={(e) => onHide(e.target.checked)}
          />
          隐藏节点
        </label>
      </div>
    </>
  );
}

export function PaperDetails({
  w,
  paper,
  busy,
  statusControl,
  onSave,
  onSelect,
  onNote,
  onReader,
  onDelete,
  arxivLink,
  onChat,
  onOrganize,
  onAcquire,
  onAdmit,
}: Common & {
  paper: Paper;
  arxivLink: ReactNode;
  onChat: () => void;
  onOrganize: () => void;
  onAcquire: () => void;
  onAdmit: () => void;
}) {
  const techniques = w.nodes.filter((n) => n.paperIds.includes(paper.id));
  return (
    <>
      <EditableText
        label="论文标题"
        fields={[{ name: "title", label: "论文标题", value: paper.title }]}
        onSave={(data) => onSave(`/papers/${paper.id}`, data, "PATCH")}
      >
        <h2 className="paper-detail-title">{paper.title}</h2>
      </EditableText>
      <PaperYear
        year={paper.year}
        onSave={(data) => onSave(`/papers/${paper.id}`, data, "PATCH")}
      >
        <p className="authors">
          {[paper.authors, paper.year ?? "年份待识别"]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </PaperYear>
      {arxivLink}
      <EditableText
        label="阅读导览"
        heading="阅读导览"
        markdown
        fields={[
          { name: "summary", label: "阅读导览正文", value: paper.summary },
        ]}
        onSave={(data) => onSave(`/papers/${paper.id}`, data, "PATCH")}
      >
        <Markdown>{paper.summary}</Markdown>
      </EditableText>
      <div className="detail-status">
        <span>你的学习状态</span>
        {statusControl}
      </div>
      <div className="paper-reading-actions">
        <button
          disabled={!paper.file}
          onClick={() => onReader({ paperId: paper.id, format: "pdf" })}
        >
          <BookOpen size={15} />
          打开PDF
        </button>
        <button onClick={() => onReader({ paperId: paper.id, format: "html" })}>
          <FileText size={15} />
          打开HTML
        </button>
        {(paper.arxivId || paper.file) && (
          <button
            disabled={busy || paperIsAcquiring(paper)}
            onClick={onAcquire}
          >
            <ArrowDownToLine size={14} />
            获取原文
          </button>
        )}
      </div>
      {!paper.inLibrary && (
        <button className="primary full-width" onClick={onAdmit}>
          <Plus size={15} />
          加入论文库
        </button>
      )}
      <div className="detail-main-actions">
        <button className="primary" onClick={onChat}>
          <MessageSquare size={15} />
          论文对话
        </button>
        <button
          className="secondary"
          disabled={busy || paperIsAcquiring(paper) || !paper.inLibrary}
          onClick={onOrganize}
        >
          <Sparkles size={15} />
          整理论文技术
        </button>
      </div>
      <NoteLinks w={w} kind="paper" id={paper.id} onOpen={onNote} />
      <section className="paper-document-status">
        <h4>论文状态</h4>
        <div className="evidence-note">
          {paper.hasText
            ? "已提取正文"
            : paper.hasDocument
              ? "已获取原文"
              : paper.file
                ? "PDF 未提取文本"
                : "仅摘要"}
          {paper.organizedAt && <span> · 已整理技术</span>}
        </div>
        <PaperAcquisition paper={paper} />
      </section>
      <ConnectedPapers
        w={w}
        paper={paper}
        onSelect={(id) => onSelect("paper", id)}
        onSave={(id, data) =>
          onSave(`/papers/${paper.id}/connections/${id}`, data, "PUT")
        }
      />
      {!!techniques.length && (
        <section className="detail-key-technologies">
          <h4>关键技术</h4>
          <div className="related-nodes paper-technologies">
            {techniques.map((n) => {
              const link =
                  n.paperRelations?.find(
                    (r) => r.paperId === paper.id && r.summary,
                  ) || n.paperRelations?.find((r) => r.paperId === paper.id),
                relation = link?.relation || n.contribution;
              return (
                <button
                  className="paper-tech-card"
                  key={n.id}
                  data-tech-id={n.id}
                  onClick={() => onSelect("node", n.id)}
                >
                  <span className="paper-tech-heading">
                    <span
                      aria-hidden="true"
                      style={{ color: categoryColor(n.category) }}
                    >
                      ●
                    </span>
                    <strong>{n.name}</strong>
                    {relation && <small>{relation}</small>}
                    <ArrowRight size={13} />
                  </span>
                  {link?.summary && (
                    <span className="paper-tech-summary">
                      {link.summary.role} {link.summary.implementation}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="detail-footer">
        <button className="danger-text" onClick={onDelete}>
          <Trash2 size={13} />
          删除论文
        </button>
      </div>
    </>
  );
}
