import type { Message } from "./types";

export type ChatRequest = {
  message: string;
  mode: "paper" | "research";
  paperId?: string;
  selections?: {
    documentId: string;
    blockId: string;
    start: number;
    end: number;
  }[];
};
export type LocalChatMessage = Message & {
  workspaceId: string;
  delivery: "sending" | "failed";
  request: ChatRequest;
  deliveryError?: string;
};
export function conversationMessages(
  saved: Message[],
  local: LocalChatMessage[],
) {
  // A workspace refresh can see the completed turn before its POST returns.
  // Suppress the optimistic copy in that short interval without persisting it.
  return [
    ...saved,
    ...local.filter(
      (pending) =>
        !saved.some(
          (m) =>
            m.role === "user" &&
            m.mode === pending.mode &&
            m.paperId === pending.paperId &&
            m.content === pending.content &&
            Date.parse(m.time) >= Date.parse(pending.time),
        ),
    ),
  ];
}
