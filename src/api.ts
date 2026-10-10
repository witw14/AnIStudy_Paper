export async function api<T>(
  url: string,
  body?: unknown,
  method?: string,
  options: { operationId?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(options.operationId
        ? { "X-AnIStudy-Operation": options.operationId }
        : {}),
    },
    signal: options.signal,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}
