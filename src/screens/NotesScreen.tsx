import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CaretLeft,
  CaretRight,
  Check,
  ClipboardText,
  Eye,
  NotePencil,
  Notepad,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
  X,
} from "phosphor-react-native";

import { CodeBlock } from "../components/CodeBlock";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { NoteBodyDisplay } from "../components/NoteBodyDisplay";
import { NoteMarkdown } from "../components/NoteMarkdown";
import { useAuth } from "../context/AuthContext";
import { applyPasteAsCode } from "../lib/applyPasteAsCode";
import { formatNoteDate, noteSnapshot } from "../lib/noteSnapshot";
import { heuristicTitleFromPaste, summarizePasteForTitle } from "../lib/summarizePasteForTitle";
import { inferFenceLanguageFromBody, wrapBodyWithLanguage } from "../lib/wrapBodyWithLanguage";
import { supabase } from "../lib/supabase";
import { useIconSemantic } from "../theme/iconColors";
import type { Note } from "../types/note";

const LANG_PRESETS = ["typescript", "tsx", "javascript", "python", "bash", "rust", "go", "text"] as const;

type ComposeTab = "edit" | "preview";

const SPLIT_MIN_WIDTH = 720;

type MobilePanel = "list" | "detail";

type PendingNav =
  | { kind: "newNote" }
  | { kind: "openNote"; id: string }
  | { kind: "goBackList" }
  | { kind: "cancelCompose"; wasNew: boolean; hadSelectedId: boolean };

type PersistResult =
  | { ok: true; kind: "update"; noteId: string }
  | { ok: true; kind: "insert"; note: Note }
  | { ok: false };

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
  const [codeLanguage, setCodeLanguage] = useState("typescript");
  const [composeTab, setComposeTab] = useState<ComposeTab>("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleSummarizing, setTitleSummarizing] = useState(false);
  const [unsavedModalVisible, setUnsavedModalVisible] = useState(false);

  const icon = useIconSemantic();

  const bodyInputRef = useRef<TextInput>(null);
  const titleFromPasteSeqRef = useRef(0);
  const composeSnapshotRef = useRef<{ title: string; body: string; codeLanguage: string } | null>(null);
  const pendingNavRef = useRef<PendingNav | null>(null);
  const bodyForPasteRef = useRef(body);
  const isCodeSnippetForPasteRef = useRef(false);

  const composeSnippetMode = useMemo(() => {
    if (!editingNoteId) return false;
    return notes.find((n) => n.id === editingNoteId)?.is_code_snippet === true;
  }, [editingNoteId, notes]);

  /** Before paint — avoids paste handling with a stale body vs DOM selection (useEffect runs too late). */
  useLayoutEffect(() => {
    bodyForPasteRef.current = body;
  }, [body]);
  useLayoutEffect(() => {
    isCodeSnippetForPasteRef.current = composeSnippetMode;
  }, [composeSnippetMode]);

  const restoreWebCursor = useCallback((pos: number) => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(
          '[data-testid="compose-note-body"]',
        ) as HTMLTextAreaElement | null;
        el?.focus();
        try {
          el?.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
    });
  }, []);

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

  const resetComposeFields = useCallback(() => {
    titleFromPasteSeqRef.current += 1;
    setTitleSummarizing(false);
    setTitle("");
    setBody("");
    setCodeLanguage("typescript");
    setComposeTab("edit");
    composeSnapshotRef.current = null;
  }, []);

  const isComposeOpen = composing || editingNoteId !== null;

  const isComposeDirty = useMemo(() => {
    if (!isComposeOpen) return false;
    const s = composeSnapshotRef.current;
    if (!s) return false;
    return (
      title.trim() !== s.title.trim() ||
      body !== s.body ||
      codeLanguage !== s.codeLanguage
    );
  }, [isComposeOpen, title, body, codeLanguage]);

  const flushComposeAndRunPending = useCallback(() => {
    const p = pendingNavRef.current;
    pendingNavRef.current = null;
    setUnsavedModalVisible(false);
    resetComposeFields();
    setEditingNoteId(null);
    setComposing(false);
    if (!p) return;
    switch (p.kind) {
      case "newNote":
        setSelectedId(null);
        setComposing(true);
        composeSnapshotRef.current = { title: "", body: "", codeLanguage: "typescript" };
        if (!split) setMobilePanel("detail");
        break;
      case "openNote":
        setSelectedId(p.id);
        if (!split) setMobilePanel("detail");
        break;
      case "goBackList":
        setMobilePanel("list");
        break;
      case "cancelCompose":
        if (!split) {
          if (p.wasNew || !p.hadSelectedId) setMobilePanel("list");
          else setMobilePanel("detail");
        }
        break;
    }
  }, [resetComposeFields, split]);

  const handleUnsavedKeepEditing = useCallback(() => {
    pendingNavRef.current = null;
    setUnsavedModalVisible(false);
  }, []);

  const handleUnsavedDiscard = useCallback(() => {
    flushComposeAndRunPending();
  }, [flushComposeAndRunPending]);

  const persistCompose = useCallback(async (): Promise<PersistResult> => {
    if (!user) return { ok: false };
    setSaving(true);
    setError(null);
    const lang = codeLanguage.trim() || "text";
    const saveAsSnippet =
      editingNoteId !== null &&
      notes.find((n) => n.id === editingNoteId)?.is_code_snippet === true;
    const row = {
      title: title.trim() || (saveAsSnippet ? "Code snippet" : "Untitled"),
      body: body.trim(),
      is_code_snippet: saveAsSnippet,
      code_language: saveAsSnippet ? lang : "",
      updated_at: new Date().toISOString(),
    };

    if (editingNoteId) {
      const id = editingNoteId;
      const { error: updateError } = await supabase.from("notes").update(row).eq("id", id);
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return { ok: false };
      }
      void load();
      return { ok: true, kind: "update", noteId: id };
    }

    const { data, error: insertError } = await supabase
      .from("notes")
      .insert({ user_id: user.id, ...row })
      .select()
      .single();

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return { ok: false };
    }
    if (!data) {
      setError("Note saved but no data returned from server.");
      void load();
      return { ok: false };
    }
    const newNote = data as Note;
    setNotes((prev) => {
      const rest = prev.filter((n) => n.id !== newNote.id);
      return [newNote, ...rest];
    });
    void load();
    return { ok: true, kind: "insert", note: newNote };
  }, [user, codeLanguage, editingNoteId, notes, title, body, load]);

  const handleUnsavedSave = useCallback(async () => {
    const r = await persistCompose();
    if (!r.ok) return;
    flushComposeAndRunPending();
  }, [persistCompose, flushComposeAndRunPending]);

  const onSave = useCallback(async () => {
    const r = await persistCompose();
    if (!r.ok) return;
    setEditingNoteId(null);
    resetComposeFields();
    setComposing(false);
    if (r.kind === "update") {
      setSelectedId(r.noteId);
    } else {
      setSelectedId(r.note.id);
    }
    if (!split) setMobilePanel("detail");
  }, [persistCompose, resetComposeFields, split]);

  const openNewNote = () => {
    const run = () => {
      setSelectedId(null);
      setEditingNoteId(null);
      resetComposeFields();
      setComposing(true);
      composeSnapshotRef.current = { title: "", body: "", codeLanguage: "typescript" };
      if (!split) setMobilePanel("detail");
    };
    if (isComposeOpen && isComposeDirty) {
      pendingNavRef.current = { kind: "newNote" };
      setUnsavedModalVisible(true);
      return;
    }
    run();
  };

  const openNote = (id: string) => {
    const run = () => {
      setSelectedId(id);
      setComposing(false);
      setEditingNoteId(null);
      resetComposeFields();
      if (!split) setMobilePanel("detail");
    };
    if (isComposeOpen && isComposeDirty) {
      pendingNavRef.current = { kind: "openNote", id };
      setUnsavedModalVisible(true);
      return;
    }
    run();
  };

  const goBackToList = () => {
    const run = () => {
      setEditingNoteId(null);
      setComposing(false);
      resetComposeFields();
      setMobilePanel("list");
    };
    if (isComposeOpen && isComposeDirty) {
      pendingNavRef.current = { kind: "goBackList" };
      setUnsavedModalVisible(true);
      return;
    }
    run();
  };

  const cancelCompose = () => {
    const wasNew = composing;
    const hadSelectedId = selectedId !== null;
    const run = () => {
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
    if (isComposeDirty) {
      pendingNavRef.current = { kind: "cancelCompose", wasNew, hadSelectedId };
      setUnsavedModalVisible(true);
      return;
    }
    run();
  };

  const startEditSelected = () => {
    if (!selectedNote) return;
    const codeLang =
      selectedNote.is_code_snippet === true
        ? selectedNote.code_language?.trim() || "typescript"
        : inferFenceLanguageFromBody(selectedNote.body) ?? "typescript";
    composeSnapshotRef.current = {
      title: selectedNote.title ?? "",
      body: selectedNote.body ?? "",
      codeLanguage: codeLang,
    };
    setComposing(false);
    setEditingNoteId(selectedNote.id);
    setTitle(selectedNote.title);
    setBody(selectedNote.body);
    setCodeLanguage(codeLang);
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

  const scheduleTitleFromPaste = useCallback((pasted: string) => {
    const seq = ++titleFromPasteSeqRef.current;
    setTitleSummarizing(true);
    void summarizePasteForTitle(pasted)
      .then((next) => {
        if (seq !== titleFromPasteSeqRef.current) return;
        setTitleSummarizing(false);
        if (!next) return;
        setTitle((prev) => (prev.trim() === "" ? next : prev));
      })
      .catch(() => {
        if (seq !== titleFromPasteSeqRef.current) return;
        setTitleSummarizing(false);
        const fallback = heuristicTitleFromPaste(pasted);
        if (!fallback) return;
        setTitle((prev) => (prev.trim() === "" ? fallback : prev));
      });
  }, []);

  const onLanguagePresetPress = useCallback(
    (lang: string) => {
      setCodeLanguage(lang);
      if (composeSnippetMode) return;
      const { nextBody, cursor } = wrapBodyWithLanguage(body, lang);
      setBody(nextBody);
      restoreWebCursor(cursor);
    },
    [body, composeSnippetMode, restoreWebCursor],
  );

  const pasteAsCode = async () => {
    setError(null);
    let text = "";
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch {
          setError("Could not read the clipboard. Allow paste permission or use Cmd/Ctrl+V in the body field.");
          return;
        }
      } else {
        setError("Could not read the clipboard.");
        return;
      }
    }
    if (!text) return;
    const { nextBody, cursor, detected } = applyPasteAsCode({
      body,
      pasted: text,
      isCodeSnippet: composeSnippetMode,
      range: null,
    });
    setCodeLanguage(detected);
    setBody(nextBody);
    setComposeTab("edit");
    restoreWebCursor(cursor);
    scheduleTitleFromPaste(text);
  };

  /** react-native-web drops `onPaste`; bind the DOM `paste` event on the textarea. */
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || composeTab !== "edit" || !isComposeOpen) return;

    const resolveTextarea = (): HTMLTextAreaElement | null => {
      const fromRef = bodyInputRef.current as unknown as HTMLTextAreaElement | null;
      if (fromRef && typeof fromRef.addEventListener === "function") return fromRef;
      if (typeof document !== "undefined") {
        return document.querySelector(
          '[data-testid="compose-note-body"]',
        ) as HTMLTextAreaElement | null;
      }
      return null;
    };

    let cancelled = false;
    let attachedTo: HTMLTextAreaElement | null = null;
    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 90;

    const onPasteDom = (e: Event) => {
      const ce = e as ClipboardEvent;
      const pasted = ce.clipboardData?.getData("text/plain") ?? "";
      if (!pasted) return;
      ce.preventDefault();
      ce.stopPropagation();
      const target = ce.target as HTMLTextAreaElement;
      /** Must match `selectionStart` / `selectionEnd` (controlled input can lag React state). */
      const b = typeof target.value === "string" ? target.value : bodyForPasteRef.current;
      const snippet = isCodeSnippetForPasteRef.current;
      const len = b.length;
      let start = typeof target.selectionStart === "number" ? target.selectionStart : len;
      let end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;
      start = Math.max(0, Math.min(start, len));
      end = Math.max(start, Math.min(end, len));
      const { nextBody, cursor, detected } = applyPasteAsCode({
        body: b,
        pasted,
        isCodeSnippet: snippet,
        range: { start, end },
      });
      bodyForPasteRef.current = nextBody;
      setCodeLanguage(detected);
      setBody(nextBody);
      setComposeTab("edit");
      restoreWebCursor(cursor);
      scheduleTitleFromPaste(pasted);
    };

    const tryAttach = () => {
      if (cancelled) return;
      const textarea = resolveTextarea();
      if (textarea) {
        attachedTo = textarea;
        textarea.addEventListener("paste", onPasteDom, true);
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        rafId = requestAnimationFrame(tryAttach);
      }
    };

    tryAttach();

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      attachedTo?.removeEventListener("paste", onPasteDom, true);
    };
  }, [composeTab, isComposeOpen, restoreWebCursor, scheduleTitleFromPaste]);

  const composeForm = (
    <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {editingNoteId ? "Edit note" : "New note"}
      </Text>
      <View className="mb-3">
        <TextInput
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          placeholder="Title (filled from pasted content when empty)"
          placeholderTextColor="#a3a3a3"
          value={title}
          onChangeText={setTitle}
        />
        {titleSummarizing ? (
          <View className="mt-1.5 flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#737373" />
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">Generating title…</Text>
          </View>
        ) : null}
      </View>

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {composeSnippetMode ? "Language (syntax highlight)" : "Language — wraps body in a code block"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 flex-row">
        {LANG_PRESETS.map((l) => (
          <Pressable
            key={l}
            className={`mr-2 rounded-full border px-3 py-1.5 ${
              codeLanguage === l
                ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
                : "border-neutral-300 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800"
            }`}
            onPress={() => onLanguagePresetPress(l)}
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
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border py-2 ${
            composeTab === "edit"
              ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
          onPress={() => setComposeTab("edit")}
        >
          <PencilSimple
            size={18}
            weight="bold"
            color={composeTab === "edit" ? icon.onInverse : icon.fgMuted}
          />
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
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border py-2 ${
            composeTab === "preview"
              ? "border-neutral-900 bg-neutral-900 dark:border-neutral-100 dark:bg-neutral-100"
              : "border-neutral-300 dark:border-neutral-600"
          }`}
          onPress={() => setComposeTab("preview")}
        >
          <Eye
            size={18}
            weight="bold"
            color={composeTab === "preview" ? icon.onInverse : icon.fgMuted}
          />
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
          ref={bodyInputRef}
          testID="compose-note-body"
          className="mb-2 min-h-[160px] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          placeholder={
            composeSnippetMode
              ? "Paste or type code… (Web: Cmd/Ctrl+V = paste as code)"
              : "Markdown… (Web: Cmd/Ctrl+V in this field pastes as a code block)"
          }
          placeholderTextColor="#a3a3a3"
          multiline
          textAlignVertical="top"
          value={body}
          onChangeText={setBody}
        />
      ) : composeSnippetMode ? (
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
          className="flex-row items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 active:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:active:bg-neutral-800"
          onPress={() => void pasteAsCode()}
        >
          <ClipboardText size={20} weight="duotone" color={icon.fg} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Paste as code</Text>
            <Text className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
              Web: Cmd/Ctrl+V in body too
            </Text>
          </View>
        </Pressable>
      </View>

      <View className="mb-3 flex-row gap-2">
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-neutral-300 py-3 active:bg-neutral-100 dark:border-neutral-600 dark:active:bg-neutral-800"
          onPress={cancelCompose}
          disabled={saving}
        >
          <X size={20} weight="bold" color={icon.fg} />
          <Text className="font-semibold text-neutral-900 dark:text-neutral-100">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-neutral-900 py-3 active:opacity-80 dark:bg-neutral-100"
          onPress={() => void onSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={icon.onInverse} />
          ) : (
            <>
              <Check size={20} weight="bold" color={icon.onInverse} />
              <Text className="font-semibold text-white dark:text-neutral-900">
                {editingNoteId ? "Save changes" : "Save note"}
              </Text>
            </>
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
          className="flex-row items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 active:opacity-80 dark:bg-neutral-100"
          onPress={startEditSelected}
        >
          <PencilSimple size={18} weight="bold" color={icon.onInverse} />
          <Text className="text-sm font-semibold text-white dark:text-neutral-900">Edit</Text>
        </Pressable>
        <Pressable
          className="flex-row items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 active:bg-red-50 dark:border-red-800 dark:bg-neutral-900 dark:active:bg-red-950"
          onPress={confirmDeleteSelected}
        >
          <Trash size={18} weight="bold" color={icon.danger} />
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
      <View className="mb-3">
        <Notepad size={48} weight="duotone" color={icon.fgSubtle} />
      </View>
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
          <View className="flex-row items-center gap-2">
            <NotePencil size={26} weight="duotone" color={icon.fg} />
            <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Dev Notes</Text>
          </View>
          <Pressable
            className="flex-row items-center gap-1.5 rounded-lg bg-neutral-200 px-3 py-1.5 active:opacity-70 dark:bg-neutral-800"
            onPress={() => void signOut()}
          >
            <SignOut size={18} weight="bold" color={icon.fg} />
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
                className="flex-row items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 active:opacity-80 dark:bg-neutral-100"
                onPress={openNewNote}
              >
                <Plus size={20} weight="bold" color={icon.onInverse} />
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
                <View className="items-center px-3 py-10">
                  <View className="mb-2">
                    <NotePencil size={40} weight="duotone" color={icon.fgSubtle} />
                  </View>
                  <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                    No notes yet. Tap New note.
                  </Text>
                </View>
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
                      <Text className="min-w-0 flex-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100" numberOfLines={1}>
                        {item.title || "Untitled"}
                      </Text>
                      <View className="flex-row items-center gap-1">
                        {item.is_code_snippet ? (
                          <View className="rounded bg-amber-200/80 px-1.5 py-0.5 dark:bg-amber-900/60">
                            <Text className="text-[10px] font-semibold uppercase text-amber-950 dark:text-amber-100">
                              code
                            </Text>
                          </View>
                        ) : null}
                        <CaretRight size={16} weight="bold" color={icon.fgSubtle} />
                      </View>
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
                  accessibilityRole="button"
                  accessibilityLabel="Back to notes list"
                  className="flex-row items-center gap-1 self-start rounded-lg px-2 py-2 active:bg-neutral-200 dark:active:bg-neutral-800"
                >
                  <CaretLeft size={22} weight="bold" color={icon.fg} />
                  <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Notes</Text>
                </Pressable>
              </View>
            ) : null}
            {detailPanel}
          </View>
        ) : null}
      </View>

      <UnsavedChangesModal
        visible={unsavedModalVisible}
        title="Unsaved changes"
        message={
          editingNoteId
            ? "Save your edits before leaving, or discard them."
            : "Save this note before leaving, or discard the draft."
        }
        saving={saving}
        onKeepEditing={handleUnsavedKeepEditing}
        onDiscard={handleUnsavedDiscard}
        onSave={() => void handleUnsavedSave()}
      />
    </View>
  );
}
