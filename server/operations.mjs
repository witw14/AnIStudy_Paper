export function createOperations({
  now = Date.now,
  ttl = 10 * 60 * 1000,
  limit = 200,
} = {}) {
  const entries = new Map();
  const prune = () => {
    for (const [id, entry] of entries)
      if (now() - entry.updated > ttl) entries.delete(id);
  };
  return {
    begin(id, workspaceId) {
      prune();
      if (entries.has(id))
        throw Object.assign(new Error("操作标识已使用，请重试。"), {
          status: 409,
        });
      if (entries.size >= limit) {
        const finished = [...entries].find(
          ([, entry]) => entry.value.status !== "running",
        );
        if (finished) entries.delete(finished[0]);
        else
          throw Object.assign(new Error("当前操作过多，请稍后重试。"), {
            status: 503,
          });
      }
      const entry = {
        updated: now(),
        value: {
          id,
          workspaceId,
          status: "running",
          startedAt: new Date(now()).toISOString(),
          steps: [],
        },
      };
      entries.set(id, entry);
      const update = (phase, label, detail = "", counts) => {
        if (entry.value.status !== "running") return;
        entry.updated = now();
        const step = {
          phase,
          label: String(label).slice(0, 100),
          detail: String(detail).replace(/\s+/g, " ").slice(0, 300),
          time: new Date(now()).toISOString(),
          ...(counts &&
          Number.isInteger(counts.current) &&
          Number.isInteger(counts.total) &&
          counts.current > 0 &&
          counts.current <= counts.total
            ? { current: counts.current, total: counts.total }
            : {}),
        };
        entry.value.steps.push(step);
        entry.value.steps = entry.value.steps.slice(-20);
        entry.value.current = step;
      };
      update("received", "请求已接收");
      return {
        update,
        finish(ok) {
          if (entry.value.status !== "running") return;
          update(
            ok ? "done" : "failed",
            ok ? "操作完成" : "操作未完成",
            ok ? "结果已返回。" : "请查看错误提示。",
          );
          entry.value.status = ok ? "succeeded" : "failed";
        },
      };
    },
    get(id, workspaceId) {
      prune();
      const entry = entries.get(id);
      if (entry?.value.workspaceId === workspaceId)
        return structuredClone(entry.value);
    },
  };
}

export const operationPath =
  /^\/(?:chat|repair|reassess-importance|routes\/generate|arxiv|upload|papers\/[^/]+\/(?:organize|verify|translate))$/;
export const operationId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
