import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { CodeBlock } from "../components/CodeBlock";
import { NoteBodyDisplay } from "../components/NoteBodyDisplay";
import { NoteMarkdown } from "../components/NoteMarkdown";
import { useAuth } from "../context/AuthContext";
import { formatNoteDate, noteSnapshot } from "../lib/noteSnapshot";
import { supabase } from "../lib/supabase";
import type { Note } from "../types/note";

const LANG_PRESETS = ["typescript", "tsx", "javascript", "python", "bash", "rust", "go", "text"] as const;

type ComposeTab = "edit" | "preview";

const SPLIT_MIN_WIDTH = 720;

type MobilePanel = "list" | "detail";

export function NotesScreen() {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_MIN_WIDTH;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("list");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isCodeSnippet, setIsCodeSnippet] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("typescript");
  const [composeTab, setComposeTab] = useState<ComposeTab>("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNote = useMemo(
    () => (selectedId ? notes.find((n) => n.id === selectedId) ?? null : null),
    [notes, selectedId],
  );

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error: qError } = await supabase
      .from("notes")
      .select("*")
      .order("updated_at", { ascending: false });

    if (qError) {
      setError(qError.message);
      setNotes([]);
    } else {
      setError(null);
      setNotes((data as Note[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId && !notes.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [notes, selectedId]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const resetComposeFields = () => {
    setTitle("");
    setBody("");
    setIsCodeSnippet(false);
    setCodeLanguage("typescript");
    setComposeTab("edit");
  };

  const openNewNote = () => {
    setSelectedId(null);
    setEditingNoteId(null);
    resetComposeFields();
    setComposing(true);
    if (!split) setMobilePanel("detail");
  };

  const openNote = (id: string) => {
    setSelectedId(id);
    setComposing(false);
    setEditingNoteId(null);
    if (!split) setMobilePanel("detail");
  };

  const goBackToList = () => {
    setEditingNoteId(null);
    setComposing(false);
    resetComposeFields();
    setMobilePanel("list");
  };

  const cancelCompose = () => {
    const wasNew = composing;
    setComposing(false);
    setEditingNoteId(null);
    resetComposeFields();
    if (!split) {
      if (wasNew || !selectedId) {
        setMobilePanel("list");
      } else {
        setMobilePanel("detail");
      }
    }
  };

  const startEditSelected = () => {
    if (!selectedNote) return;
    setComposing(false);
    setEditingNoteId(selectedNote.id);
    setTitle(selectedNote.title);
    setBody(selectedNote.body);
    setIsCodeSnippet(selectedNote.is_code_snippet === true);
    setCodeLanguage(selectedNote.code_language?.trim() || "typescript");
    setComposeTab("edit");
    if (!split) setMobilePanel("detail");
  };

  const confirmDeleteSelected = () => {
    if (!selectedNote) return;
    const label = selectedNote.title || "Untitled";
    const run = () => void deleteNote(selectedNote.id);

    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete "${label}"? This cannot be undone.`)) {
        run();
      }
      return;
    }

    Alert.alert("Delete note", `"${label}" will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: run },
    ]);
  };

  const deleteNote = async (id: string) => {
    setError(null);
    const { data, error: delError } = await supabase.from("notes").delete().eq("id", id).select("id");
    if (delError) {
      setError(delError.message);
      return;
    }
    if (!data?.length) {
      setError(
        "Could not delete this note (no rows removed). Check that you are signed in and RLS allows delete on public.notes.",
      );
      return;
    }
    if (selectedId === id) setSelectedId(null);
    if (editingNoteId === id) {
      setEditingNoteId(null);
      resetComposeFields();
    }
    setComposing(false);
    if (!split) setMobilePanel("list");
    void load();
  };

  const pasteAsCode = async () => {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    const lang = codeLanguage.trim() || "text";
    if (isCodeSnippet) {
      setBody((b) => (b.trim() ? `${b.trimEnd()}\n${text}` : text));
    } else {
      setBody((b) => {
        const fence = `\`\`\`${lang}\n${text.trimEnd()}\n\`\`\`\n`;
        return b.trim() ? `${b.trimEnd()}\n\n${fence}` : fence;
      });
    }
    setComposeTab("edit");
  };

  const onSave = async () => {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    const lang = codeLanguage.trim() || "text";
    const row = {
      title: title.trim() || (isCodeSnippet ? "Code snippet" : "Untitled"),
      body: body.trim(),
      is_code_snippet: isCodeSnippet,
      code_language: isCodeSnippet ? lang : "",
      updated_at: new Date().toISOString(),
    };

    if (editingNoteId) {
      const { error: updateError } = await supabase.from("notes").update(row).eq("id", editingNoteId);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setEditingNoteId(null);
      resetComposeFields();
      setSelectedId(editingNoteId);
      setComposing(false);
      if (!split) setMobilePanel("detail");
      void load();
      return;
    }

    const { data, error: insertError } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        ...row,
      })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    resetComposeFields();
    setComposing(false);
    if (data?.id) {
      setSelectedId(data.id as string);
      if (!split) setMobilePanel("detail");
    }
    void load();
  };

  const isComposeOpen = composing || editingNoteId !== null;

  const composeForm = (
    <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {editingNoteId ? "Edit note" : "New note"}
      </Text>
      <TextInput
        className="mb-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        placeholder="Title"
        placeholderTextColor="#a3a3a3"
        value={title}
        onChangeText={setTitle}
      />

      <View className="mb-3 flex-row items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        <View className="flex-1 pr-2">
          <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Save as code snippet</Text>
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">
            Raw code with a language label (syntax highlighting).
          </Text>
        </View>
        <Switch value={isCodeSnippet} onValueChange={setIsCodeSnippet} />
      </View>

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Language (fenced blocks & code notes)
      </Text>
      <TextInput
        className="mb-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        placeholder="e.g. typescript"
        placeholderTextColor="#a3a3a3"
        autoCapitalize="none"
        autoCorrect={false}
        value={codeLanguage}
        onChangeText={setCodeLanguage}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 flex-row">
        {LANG_PRESETS.map((l) => (
          <Pressable
            key={l}
            className={`mr-2 rounded-full border px-3 py-1.5 ${
              codeLanguage === l
                ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
                : "border-neutral-300 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800"
            }`}
            onPress={() => setCodeLanguage(l)}
          >
            <Text
              className={`text-xs font-medium ${
                codeLanguage === l
                  ? "text-white dark:text-neutral-900"
                  : "text-neutral-700 dark:text-neutral-200"
              }`}
            >
              {l}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View className="mb-2 flex-row gap-2">
        <Pressable
          className={`flex-1 items-center rounded-lg border py-2 ${
            composeTab === "edit"
              ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
          onPress={() => setComposeTab("edit")}
        >
          <Text
            className={`text-sm font-semibold ${
              composeTab === "edit"
                ? "text-white dark:text-neutral-900"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            Edit
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 items-center rounded-lg border py-2 ${
            composeTab === "preview"
              ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
          onPress={() => setComposeTab("preview")}
        >
          <Text
            className={`text-sm font-semibold ${
              composeTab === "preview"
                ? "text-white dark:text-neutral-900"
                : "text-neutral-700 dark:text-neutral-200"
            }`}
          >
            Preview
          </Text>
        </Pressable>
      </View>

      {composeTab === "edit" ? (
        <TextInput
          className="mb-2 min-h-[160px] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          placeholder={
            isCodeSnippet
              ? "Paste or type code…"
              : "Markdown: **bold**, `inline code`, lists, and ``` fenced blocks"
          }
          placeholderTextColor="#a3a3a3"
          multiline
          textAlignVertical="top"
          value={body}
          onChangeText={setBody}
        />
      ) : isCodeSnippet ? (
        <View className="mb-2 min-h-[160px]">
          {body.trim() ? (
            <CodeBlock code={body} language={codeLanguage} maxHeight={320} />
          ) : (
            <Text className="text-neutral-500 dark:text-neutral-400">Nothing to preview yet.</Text>
          )}
        </View>
      ) : (
        <View className="mb-2 min-h-[160px] rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900">
          {body.trim() ? (
            <NoteMarkdown>{body}</NoteMarkdown>
          ) : (
            <Text className="text-neutral-500 dark:text-neutral-400">Nothing to preview yet.</Text>
          )}
        </View>
      )}

      <View className="mb-3 flex-row flex-wrap gap-2">
        <Pressable
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 active:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:active:bg-neutral-800"
          onPress={() => void pasteAsCode()}
        >
          <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Paste as code</Text>
        </Pressable>
      </View>

      <View className="mb-3 flex-row gap-2">
        <Pressable
          className="flex-1 items-center rounded-lg border border-neutral-300 py-3 active:bg-neutral-100 dark:border-neutral-600 dark:active:bg-neutral-800"
          onPress={cancelCompose}
          disabled={saving}
        >
          <Text className="font-semibold text-neutral-900 dark:text-neutral-100">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-neutral-900 py-3 active:opacity-80 dark:bg-neutral-100"
          onPress={() => void onSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-semibold text-white dark:text-neutral-900">
              {editingNoteId ? "Save changes" : "Save note"}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );

  const detailPanel = isComposeOpen ? (
    composeForm
  ) : selectedNote ? (
    <ScrollView className="flex-1 px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
      <View className="mb-3 flex-row flex-wrap gap-2">
        <Pressable
          className="rounded-lg bg-neutral-900 px-4 py-2 active:opacity-80 dark:bg-neutral-100"
          onPress={startEditSelected}
        >
          <Text className="text-sm font-semibold text-white dark:text-neutral-900">Edit</Text>
        </Pressable>
        <Pressable
          className="rounded-lg border border-red-300 bg-white px-4 py-2 active:bg-red-50 dark:border-red-800 dark:bg-neutral-900 dark:active:bg-red-950"
          onPress={confirmDeleteSelected}
        >
          <Text className="text-sm font-semibold text-red-700 dark:text-red-300">Delete</Text>
        </Pressable>
      </View>
      <View className="mb-2 flex-row flex-wrap items-center gap-2">
        <Text className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {selectedNote.title || "Untitled"}
        </Text>
        {selectedNote.is_code_snippet ? (
          <View className="rounded bg-amber-100 px-2 py-0.5 dark:bg-amber-950">
            <Text className="text-xs font-medium text-amber-900 dark:text-amber-100">code</Text>
          </View>
        ) : null}
      </View>
      <Text className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        {formatNoteDate(selectedNote.updated_at)}
      </Text>
      <NoteBodyDisplay note={selectedNote} />
    </ScrollView>
  ) : (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-base text-neutral-600 dark:text-neutral-400">
        Select a note from the list or create a new one.
      </Text>
    </View>
  );

  const showList = split || mobilePanel === "list";
  const showDetail = split || mobilePanel === "detail";

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <View className="border-b border-neutral-200 px-4 pb-3 pt-14 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Dev Notes</Text>
          <Pressable
            className="rounded-lg bg-neutral-200 px-3 py-1.5 active:opacity-70 dark:bg-neutral-800"
            onPress={() => void signOut()}
          >
            <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Sign out</Text>
          </Pressable>
        </View>
        {user?.email ? (
          <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{user.email}</Text>
        ) : null}
      </View>

      {error ? (
        <View className="mx-4 mt-2 rounded-lg bg-red-100 p-3 dark:bg-red-950">
          <Text className="text-sm text-red-900 dark:text-red-100">{error}</Text>
        </View>
      ) : null}

      <View className="min-h-0 flex-1 flex-row">
        {showList ? (
          <View
            className={`border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 ${
              split ? "w-72 border-r" : "flex-1"
            }`}
          >
            <View className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <Pressable
                className="items-center rounded-lg bg-neutral-900 py-2.5 active:opacity-80 dark:bg-neutral-100"
                onPress={openNewNote}
              >
                <Text className="text-sm font-semibold text-white dark:text-neutral-900">New note</Text>
              </Pressable>
            </View>
            <FlatList
              className="flex-1"
              style={{ flex: 1 }}
              data={notes}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                <Text className="px-3 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No notes yet. Tap New note.
                </Text>
              }
              renderItem={({ item }) => {
                const active = item.id === selectedId && !isComposeOpen;
                return (
                  <Pressable
                    onPress={() => openNote(item.id)}
                    className={`border-b border-neutral-200 px-3 py-3 dark:border-neutral-800 ${
                      active ? "bg-white dark:bg-neutral-950" : "active:bg-neutral-200 dark:active:bg-neutral-800"
                    }`}
                  >
                    <View className="mb-1 flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100" numberOfLines={1}>
                        {item.title || "Untitled"}
                      </Text>
                      {item.is_code_snippet ? (
                        <View className="rounded bg-amber-200/80 px-1.5 py-0.5 dark:bg-amber-900/60">
                          <Text className="text-[10px] font-semibold uppercase text-amber-950 dark:text-amber-100">
                            code
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-xs leading-4 text-neutral-600 dark:text-neutral-400" numberOfLines={3}>
                      {noteSnapshot(item)}
                    </Text>
                    <Text className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
                      {formatNoteDate(item.updated_at)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        ) : null}

        {showDetail ? (
          <View className="min-h-0 flex-1 bg-neutral-50 dark:bg-neutral-950">
            {!split ? (
              <View className="border-b border-neutral-200 px-2 py-2 dark:border-neutral-800">
                <Pressable
                  onPress={goBackToList}
                  className="self-start rounded-lg px-3 py-2 active:bg-neutral-200 dark:active:bg-neutral-800"
                >
                  <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">← Notes</Text>
                </Pressable>
              </View>
            ) : null}
            {detailPanel}
          </View>
        ) : null}
      </View>
    </View>
  );
}
