import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { SourceCitation } from "./types";
type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };
function remarkNoteBreaks() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type === "text" && child.value?.includes("\n"))
          return child.value
            .split("\n")
            .flatMap((value, index) => [
              ...(index ? [{ type: "break" }] : []),
              { type: "text", value },
            ]);
        visit(child);
        return [child];
      });
    }
    visit(tree);
  };
}
export function Markdown({
  children,
  citations = [],
  onCitation,
  preserveLineBreaks = false,
}: {
  children: string;
  citations?: SourceCitation[];
  onCitation?: (source: SourceCitation) => void;
  preserveLineBreaks?: boolean;
}) {
  const content = children
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`)
    .replace(/\\\((.*?)\\\)/g, (_, math) => `$${math}$`);
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkMath,
          ...(preserveLineBreaks ? [remarkNoteBreaks] : []),
        ]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
        components={{
          a: ({ children, href }) => {
            if (href?.startsWith("#source-")) {
              const citation = citations.find(
                (s) => `#source-${s.id}` === href,
              );
              return citation && onCitation ? (
                <button
                  className="source-citation"
                  title={`${citation.paperTitle} · ${citation.section}${citation.page ? ` · PDF 第 ${citation.page} 页` : ""}`}
                  onClick={() => onCitation(citation)}
                >
                  {citation.section}
                  {citation.page ? ` · PDF 第 ${citation.page} 页` : ""}
                </button>
              ) : (
                <span>{children}</span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          img: ({ alt }) => <span>{alt || "图片"}</span>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
