import { PDFParse } from "pdf-parse";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { uid } from "./seed.mjs";
import { arxivId } from "./services.mjs";
import { arxivBytes } from "./arxiv-network.mjs";
import {
  pdfDocument,
  htmlDocument,
  installDocument,
  htmlVersion,
  pdfVersionFromText,
} from "./documents.mjs";

export async function parsePdf(data) {
  const parser = new PDFParse({ data });
  try {
    return await parser.getText({ pageJoiner: "" });
  } finally {
    await parser.destroy();
  }
}
export const acquisitionBusy = (p) =>
  ["queued", "downloading", "extracting", "html", "indexing"].includes(
    p.acquisition?.state,
  ) || ["queued", "running"].includes(p.autoOrganization?.state);
export function createAcquisition({
  store,
  files,
  enabled = true,
  downloadPdf,
  downloadHtml,
  organize,
}) {
  const jobs = new Map(),
    pending = [];
  const abort = new AbortController();
  let running = false,
    stopped = false,
    idleResolvers = [];
  const find = (wid, pid) => {
    if (stopped) return {};
    const w = store.get(wid);
    return {
      w,
      p: w?.papers.find((p) => p.id === (w.paperAliases?.[pid] || pid)),
    };
  };
  function update(job, changes) {
    const { w, p } = find(job.wid, job.pid);
    if (!p || p.acquisitionJob !== job.id) return false;
    Object.assign(p, changes);
    store.put(w);
    return true;
  }
  function stage(job, state, label, detail = "") {
    update(job, {
      acquisition: {
        state,
        label,
        detail,
        updatedAt: new Date().toISOString(),
      },
    });
  }
  async function ensureDocument(wid, pid) {
    const { p } = find(wid, pid);
    if (!p) return null;
    if (p.document) return p.document;
    let result;
    if (p.file && existsSync(join(files, p.file)))
      result = await parsePdf(readFileSync(join(files, p.file)));
    else if (p.text) result = { pages: [], text: p.text };
    else return null;
    const doc = pdfDocument(result.pages, {
      file: p.file,
      version: p.pdfVersion || pdfVersionFromText(result.text, p.arxivId),
      text: result.text,
    });
    const fresh = find(wid, pid);
    if (!fresh.p) return null;
    if (fresh.p.document) return fresh.p.document;
    installDocument(fresh.p, doc);
    if (doc.version) fresh.p.pdfVersion = doc.version;
    store.put(fresh.w);
    return doc;
  }
  async function execute(job) {
    let { p } = find(job.wid, job.pid);
    if (!p) return;
    if (job.download) {
      try {
        let pdf,
          version = p.pdfVersion || p.arxivVersion || p.arxivId || "";
        if (!p.file || !existsSync(join(files, p.file))) {
          if (!p.arxivId)
            throw new Error("这篇论文没有可获取的 arXiv 编号，请上传 PDF。");
          const id = arxivId(version);
          stage(job, "downloading", "正在下载 PDF…", p.title);
          const bytes = downloadPdf
            ? await downloadPdf(id, abort.signal)
            : (
                await arxivBytes(
                  `https://arxiv.org/pdf/${id}`,
                  30 * 1024 * 1024,
                  abort.signal,
                )
              ).data;
          if (
            !Buffer.isBuffer(bytes) ||
            bytes.subarray(0, 5).toString() !== "%PDF-"
          )
            throw new Error("获取结果不是有效 PDF，未替换原论文。");
          stage(job, "extracting", "正在校验 PDF 并提取正文…", p.title);
          let parsed;
          try {
            parsed = await parsePdf(bytes);
          } catch {
            throw new Error("下载的 PDF 无法解析，请重试或手动上传。");
          }
          const fresh = find(job.wid, job.pid);
          if (!fresh.p || fresh.p.acquisitionJob !== job.id) return;
          const filename = uid() + ".pdf";
          writeFileSync(join(files, filename), bytes);
          Object.assign(fresh.p, {
            file: filename,
            pdfVersion: id,
            text: parsed.text,
            contentHash: createHash("sha256").update(bytes).digest("hex"),
            files: [...new Set([...(fresh.p.files || []), filename])],
          });
          installDocument(
            fresh.p,
            pdfDocument(parsed.pages, {
              file: filename,
              version: id,
              text: parsed.text,
            }),
          );
          store.put(fresh.w);
          p = find(job.wid, job.pid).p;
        }
        stage(job, "extracting", "正在提取正文并记录页码…", p.title);
        pdf = await ensureDocument(job.wid, job.pid);
        if (!pdf) throw new Error("PDF 已保存，但未能建立正文索引。");
        p = find(job.wid, job.pid).p;
        if (!p) return;
        if (p.arxivId && pdf.source !== "arxiv") {
          stage(
            job,
            "html",
            "正在获取 arXiv HTML…",
            "不可用时保留 PDF 文字转换视图",
          );
          try {
            const id = arxivId(p.pdfVersion || p.arxivVersion || p.arxivId);
            const result = downloadHtml
              ? await downloadHtml(id, abort.signal)
              : await arxivBytes(
                  `https://arxiv.org/html/${id}`,
                  10 * 1024 * 1024,
                  abort.signal,
                );
            const native = htmlDocument(
              typeof result === "string"
                ? result
                : result.data.toString("utf8"),
              result.url || `https://arxiv.org/html/${id}`,
              pdf,
              {
                mapPages: Boolean(
                  p.pdfVersion &&
                  p.pdfVersion ===
                    htmlVersion(result.url || `https://arxiv.org/html/${id}`),
                ),
              },
            );
            const fresh = find(job.wid, job.pid);
            if (!fresh.p || fresh.p.acquisitionJob !== job.id) return;
            installDocument(fresh.p, native);
            store.put(fresh.w);
            pdf = native;
          } catch (error) {
            if (abort.signal.aborted) return;
            // Original PDF remains readable even if HTML is absent or blocked.
            update(job, {
              htmlAcquisitionWarning:
                "未获得可用的官方 HTML，已保留 PDF 文字转换视图。",
            });
          }
        }
        stage(
          job,
          "indexing",
          "正在建立段落与位置索引…",
          `${pdf.blocks.length} 个正文片段`,
        );
        const fresh = find(job.wid, job.pid);
        if (!fresh.p) return;
        if (!fresh.p.text && pdf.blocks.length)
          fresh.p.text = pdf.blocks.map((b) => b.text).join("\n\n");
        store.put(fresh.w);
        stage(
          job,
          "ready",
          "原文已就绪",
          pdf.blocks.length
            ? `${pdf.source === "arxiv" ? "arXiv HTML" : "PDF 转换 HTML"} · ${pdf.blocks.length} 个片段`
            : "PDF 已保存，未提取到可检索文字；可阅读原始 PDF。",
        );
      } catch (error) {
        if (abort.signal.aborted) return;
        stage(job, "failed", "原文获取未完成", error.message);
      }
    }
    if (job.organize) {
      update(job, {
        autoOrganization: { state: "running", label: "正在自动整理论文…" },
      });
      try {
        await organize(job.wid, job.pid, {
          signal: abort.signal,
          onProgress: (_, label) =>
            update(job, { autoOrganization: { state: "running", label } }),
        });
        const current = find(job.wid, job.pid).p;
        update(job, {
          autoOrganization: {
            state:
              current?.organizationReport?.quality === "fallback"
                ? "failed"
                : "complete",
            label:
              current?.organizationReport?.quality === "fallback"
                ? "已保存保底信息，可手动重试整理"
                : "自动整理已完成",
          },
        });
      } catch {
        if (!abort.signal.aborted)
          update(job, {
            autoOrganization: {
              state: "failed",
              label: "自动整理未完成，可手动重试",
            },
          });
      }
    }
  }
  async function drain() {
    if (running || stopped) return;
    running = true;
    while (pending.length && !stopped) {
      const job = pending.shift();
      job.started = true;
      try {
        await execute(job);
      } catch (error) {
        if (!abort.signal.aborted) {
          stage(job, "failed", "原文获取未完成", error.message);
          if (job.organize)
            update(job, {
              autoOrganization: {
                state: "failed",
                label: "原文未就绪，整理尚未执行",
              },
            });
        }
      } finally {
        jobs.delete(job.key);
        if (job.afterDownload)
          enqueue(job.wid, job.pid, { download: true, organize: false });
      }
    }
    running = false;
    for (const resolve of idleResolvers.splice(0)) resolve();
  }
  function enqueue(
    wid,
    pid,
    { download = true, organize: shouldOrganize = false } = {},
  ) {
    if (!enabled || stopped || (!download && !shouldOrganize)) return;
    const { w, p } = find(wid, pid);
    if (!p) return;
    const key = `${wid}:${p.id}`;
    if (jobs.has(key)) {
      const existing = jobs.get(key);
      existing.organize ||= shouldOrganize;
      if (download && !existing.download) {
        if (existing.started) existing.afterDownload = true;
        else existing.download = true;
        p.acquisition = {
          state: "queued",
          label: "等待获取原文…",
          updatedAt: new Date().toISOString(),
        };
        store.put(w);
      }
      return;
    }
    const job = {
      wid,
      pid: p.id,
      key,
      id: uid(),
      download,
      organize: shouldOrganize,
    };
    jobs.set(key, job);
    pending.push(job);
    p.acquisitionJob = job.id;
    if (download)
      p.acquisition = {
        state: "queued",
        label: "等待获取原文…",
        updatedAt: new Date().toISOString(),
      };
    if (shouldOrganize)
      p.autoOrganization = { state: "queued", label: "等待自动整理…" };
    store.put(w);
    queueMicrotask(() => void drain());
  }
  return {
    enqueue,
    ensureDocument,
    auto(wid, pid) {
      const settings = store.settings();
      enqueue(wid, pid, {
        download: settings.autoDownloadPapers !== false,
        organize: settings.autoOrganizePapers === true,
      });
    },
    resume() {
      if (!enabled) return;
      for (const w of store.list())
        for (const p of w.papers)
          if (acquisitionBusy(p))
            enqueue(w.id, p.id, {
              download: [
                "queued",
                "downloading",
                "extracting",
                "html",
                "indexing",
              ].includes(p.acquisition?.state),
              organize: ["queued", "running"].includes(
                p.autoOrganization?.state,
              ),
            });
    },
    idle: () =>
      !running && !pending.length
        ? Promise.resolve()
        : new Promise((r) => idleResolvers.push(r)),
    close() {
      stopped = true;
      abort.abort();
      pending.splice(0);
    },
  };
}
