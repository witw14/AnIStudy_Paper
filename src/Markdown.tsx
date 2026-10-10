import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { SourceCitation } from "./types";
export function Markdown({
  children,
  citations = [],
  onCitation,
}: {
  children: string;
  citations?: SourceCitation[];
  onCitation?: (source: SourceCitation) => void;
}) {
  const content = children
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`)
    .replace(/\\\((.*?)\\\)/g, (_, math) => `$${math}$`);
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
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
