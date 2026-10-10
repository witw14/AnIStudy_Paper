import { useEffect, useState } from "react";
import type { Paper, Settings } from "./types";
import { LoaderCircle } from "lucide-react";
export function AcquisitionSettings({
  settings,
  formId,
  disabled,
}: {
  settings: Settings;
  formId: string;
  disabled?: boolean;
}) {
  const [download, setDownload] = useState(
    settings.autoDownloadPapers !== false,
  );
  const [organize, setOrganize] = useState(
    settings.autoOrganizePapers === true,
  );
  useEffect(
    () => setDownload(settings.autoDownloadPapers !== false),
    [settings.autoDownloadPapers],
  );
  useEffect(
    () => setOrganize(settings.autoOrganizePapers === true),
    [settings.autoOrganizePapers],
  );
  return (
    <section className="acquisition-settings">
      <h3>论文原文与自动整理</h3>
      <label className="motion-option">
        <input
          type="checkbox"
          name="autoDownloadPapers"
          value="true"
          form={formId}
          checked={download}
          disabled={disabled}
          onChange={(e) => setDownload(e.target.checked)}
        />
        加入论文库后自动获取原文
      </label>
      <label className="motion-option">
        <input
          type="checkbox"
          name="autoOrganizePapers"
          value="true"
          form={formId}
          checked={organize}
          disabled={disabled}
          onChange={(e) => setOrganize(e.target.checked)}
        />
        加入论文库后自动 AI 整理
      </label>
      <p className="muted">
        获取 PDF、HTML 与普通文本提取不调用大模型。AI
        整理会消耗模型用量；两项独立控制，随“保存偏好选项”生效。关闭自动下载后仍可手动获取原文。
      </p>
    </section>
  );
}
export function paperIsAcquiring(p: Paper) {
  return (
    ["queued", "downloading", "extracting", "html", "indexing"].includes(
      p.acquisition?.state || "",
    ) || ["queued", "running"].includes(p.autoOrganization?.state || "")
  );
}
export function PaperAcquisition({ paper }: { paper: Paper }) {
  if (!paper.acquisition && !paper.autoOrganization) return null;
  return (
    <div
      className={`paper-acquisition ${paper.acquisition?.state === "failed" ? "failed" : ""}`}
      role="status"
      aria-label="原文获取状态"
    >
      {paperIsAcquiring(paper) && <LoaderCircle size={13} className="spin" />}
      <span>
        {paper.acquisition?.label}
        {paper.acquisition?.detail && <small>{paper.acquisition.detail}</small>}
        {paper.autoOrganization && (
          <small>{paper.autoOrganization.label}</small>
        )}
      </span>
    </div>
  );
}
