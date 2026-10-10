import { api } from "./api";
import type { OperationProgress } from "./types";

export const isProgressOperation = (path: string) =>
  /^\/(?:chat|repair|reassess-importance|routes\/generate|arxiv|upload|papers\/[^/]+\/(?:organize|verify))$/.test(
    path,
  );

// One request at a time, with a disposable timer and fetch. Never estimate phases.
export function observeOperation(
  workspaceId: string,
  operationId: string,
  onProgress: (progress: OperationProgress) => void,
) {
  const controller = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const poll = async () => {
    try {
      const progress = await api<OperationProgress>(
        `/workspaces/${workspaceId}/operations/${operationId}`,
        undefined,
        "GET",
        { signal: controller.signal },
      );
      if (stopped) return;
      onProgress(progress);
      if (progress.status !== "running") return;
    } catch {
      // The POST may not have arrived yet, or polling may be unavailable.
      // The original request remains responsible for result/error handling.
    }
    if (!stopped) timer = setTimeout(poll, 450);
  };
  timer = setTimeout(poll, 150);
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller.abort();
  };
}
