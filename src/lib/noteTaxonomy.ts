import { supabase } from "./supabase";
import type { Note, Tag } from "../types/note";

export function getNoteTags(note: Note): Tag[] {
  const rows = note.note_tags;
  if (!rows?.length) return [];
  return rows.map((r) => r.tag).filter((t): t is Tag => t != null);
}

export function tagIdsKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

/** Replace junction rows for a note. Returns an error message or null on success. */
export async function syncNoteTags(noteId: string, tagIds: string[]): Promise<string | null> {
  const { error: delErr } = await supabase.from("note_tags").delete().eq("note_id", noteId);
  if (delErr) return delErr.message;
  if (tagIds.length === 0) return null;
  const { error: insErr } = await supabase.from("note_tags").insert(
    tagIds.map((tag_id) => ({ note_id: noteId, tag_id })),
  );
  return insErr?.message ?? null;
}
