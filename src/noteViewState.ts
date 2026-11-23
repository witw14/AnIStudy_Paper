export type NoteViewMode =
  "edit" | "split-vertical" | "split-horizontal" | "preview";
export type PanePosition = {
  top: number;
  left: number;
  ratio: number;
  width: number;
  height: number;
  fontSize: number;
};
export type NoteViewState = {
  mode: NoteViewMode;
  fontSize: number;
  vertical: number;
  horizontal: number;
  editor?: PanePosition;
  preview?: PanePosition;
  lastPane: "editor" | "preview";
};

// Window-local memory deliberately expires when the program/page is closed.
// Keys include the workspace so identically named notes never share state.
const views = new Map<string, NoteViewState>();
export function noteViewState(key?: string): NoteViewState {
  const existing = key ? views.get(key) : undefined;
  if (existing) return existing;
  const state: NoteViewState = {
    mode: "edit",
    fontSize: 16,
    vertical: 0.5,
    horizontal: 0.5,
    lastPane: "editor",
  };
  if (key) views.set(key, state);
  return state;
}
