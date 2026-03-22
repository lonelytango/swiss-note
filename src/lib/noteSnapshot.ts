import type { Note } from "../types/note";

const MAX_LEN = 160;

/** Plain-text preview for list rows (not full markdown / code). */
export function noteSnapshot(note: Note): string {
  if (!note.body?.trim()) {
    return note.is_code_snippet ? "Empty snippet" : "Empty note";
  }

  if (note.is_code_snippet === true) {
    const first = note.body.split("\n").find((l) => l.trim().length > 0) ?? note.body;
    const oneLine = first.trim().replace(/\s+/g, " ");
    if (oneLine.length <= MAX_LEN) return oneLine;
    return `${oneLine.slice(0, MAX_LEN)}…`;
  }

  let t = note.body
    .replace(/```[\w-]*\n[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#\-`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (t.length <= MAX_LEN) return t || "Note";
  return `${t.slice(0, MAX_LEN)}…`;
}

export function formatNoteDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
