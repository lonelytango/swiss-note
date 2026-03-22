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
};
