import { View } from "react-native";

import type { Note } from "../types/note";
import { CodeBlock } from "./CodeBlock";
import { NoteMarkdown } from "./NoteMarkdown";

type Props = {
  note: Note;
};

export function NoteBodyDisplay({ note }: Props) {
  if (note.is_code_snippet === true) {
    if (!note.body) return null;
    const lang = note.code_language?.trim() || "text";
    return (
      <View className="mt-2">
        <CodeBlock code={note.body} language={lang} maxHeight={560} />
      </View>
    );
  }

  if (!note.body) return null;

  return (
    <View className="mt-2">
      <NoteMarkdown>{note.body}</NoteMarkdown>
    </View>
  );
}
