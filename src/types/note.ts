export type NoteCategory = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type Tag = {
  id: string;
  user_id: string;
  label: string;
  color: string;
  created_at: string;
};

/** Junction row from Supabase nested select `note_tags (tag:tags (*))`. */
export type NoteTagRow = {
  tag: Tag | null;
};

export type Note = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
  /** When true, `body` is raw code (not parsed as markdown). */
  is_code_snippet?: boolean;
  code_language?: string | null;
  category_id?: string | null;
  category?: NoteCategory | null;
  note_tags?: NoteTagRow[] | null;
};
