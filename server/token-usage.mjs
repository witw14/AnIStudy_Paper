export function tokenUsage(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const output = {};
  for (const [field, value] of [
    ["inputTokens", raw.prompt_tokens],
    ["outputTokens", raw.completion_tokens],
    ["totalTokens", raw.total_tokens],
    ["reasoningTokens", raw.completion_tokens_details?.reasoning_tokens],
  ])
    if (Number.isSafeInteger(value) && value >= 0) output[field] = value;
  return Object.keys(output).length ? output : null;
}
