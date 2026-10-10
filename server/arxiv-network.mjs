import { setTimeout as delay } from "node:timers/promises";
let tail = Promise.resolve(),
  last = 0;
export async function arxivRequest(action, signal) {
  const task = tail
    .catch(() => {})
    .then(async () => {
      const wait = Math.max(0, 3000 - (Date.now() - last));
      if (wait) await delay(wait, undefined, { signal });
      signal?.throwIfAborted();
      last = Date.now();
      return action();
    });
  tail = task.catch(() => {});
  return task;
}
export async function arxivBytes(url, maximum, signal) {
  return arxivRequest(async () => {
    let current = new URL(url);
    for (let i = 0; i < 4; i++) {
      if (
        current.protocol !== "https:" ||
        !["arxiv.org", "export.arxiv.org"].includes(current.hostname)
      )
        throw new Error("下载地址不属于 arXiv。");
      const response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.any([
          AbortSignal.timeout(90000),
          ...(signal ? [signal] : []),
        ]),
        headers: {
          "User-Agent": "AnIStudy-Paper/0.1 (local personal research reader)",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("arXiv 返回了无效跳转。");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(
          new Error(`arXiv 获取失败（${response.status}），可稍后重试。`),
          { upstreamStatus: response.status },
        );
      }
      if (Number(response.headers.get("content-length")) > maximum) {
        await response.body?.cancel();
        throw new Error("原文超过允许大小，请手动上传 PDF。");
      }
      const chunks = [];
      let length = 0;
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maximum)
            throw new Error("原文超过允许大小，请手动上传 PDF。");
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      return { data: Buffer.concat(chunks), url: current.href };
    }
    throw new Error("arXiv 跳转次数过多。");
  }, signal);
}
