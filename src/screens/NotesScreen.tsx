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
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  ClipboardText,
  Eye,
  MagnifyingGlass,
  NotePencil,
  Notepad,
  PencilSimple,
  Plus,
  SignOut,
  Trash,
  X,
} from "phosphor-react-native";

import { CodeBlock } from "../components/CodeBlock";
import { NotesFilterBar } from "../components/NotesFilterBar";
import { PickerModal } from "../components/PickerModal";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { NoteBodyDisplay } from "../components/NoteBodyDisplay";
import { NoteMarkdown } from "../components/NoteMarkdown";
import { WebNativeSelect } from "../components/WebNativeSelect";
import { useAuth } from "../context/AuthContext";
import { applyPasteAsCode } from "../lib/applyPasteAsCode";
import { formatNoteDate, noteSnapshot } from "../lib/noteSnapshot";
import { heuristicTitleFromPaste, summarizePasteForTitle } from "../lib/summarizePasteForTitle";
import { getNoteTags, syncNoteTags, tagIdsKey } from "../lib/noteTaxonomy";
import { inferFenceLanguageFromBody, wrapBodyWithLanguage } from "../lib/wrapBodyWithLanguage";
import { supabase } from "../lib/supabase";
import { useIconSemantic } from "../theme/iconColors";
import type { FilterCategoryValue } from "../components/NotesFilterBar";
import type { Note, NoteCategory, Tag } from "../types/note";

const LANG_PRESETS = ["typescript", "tsx", "javascript", "python", "bash", "rust", "go", "text"] as const;

const TAG_COLOR_PRESETS = [
  "#737373",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
] as const;

/** Web `<select>` / compose flow: open “create new” UI (not stored as category_id / tag id). */
const COMPOSE_NEW_CATEGORY_OPTION = "__compose_new_category__";
const COMPOSE_NEW_TAG_OPTION = "__compose_new_tag__";

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
  const userId = user?.id ?? null;
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_MIN_WIDTH;

  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filterCategory, setFilterCategory] = useState<FilterCategoryValue>("all");
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [listSearchQuery, setListSearchQuery] = useState("");
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

  const [composeCategoryId, setComposeCategoryId] = useState<string | null>(null);
  const [composeTagIds, setComposeTagIds] = useState<string[]>([]);
  const [composeCategoryPickerVisible, setComposeCategoryPickerVisible] = useState(false);
  const [composeTagPickerVisible, setComposeTagPickerVisible] = useState(false);
  const [webComposeTagAddKey, setWebComposeTagAddKey] = useState(0);
  const [webCategorySelectKey, setWebCategorySelectKey] = useState(0);
  const [composeShowNewCategoryForm, setComposeShowNewCategoryForm] = useState(false);
  const [composeShowNewTagForm, setComposeShowNewTagForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLOR_PRESETS[0]);

  const icon = useIconSemantic();

  const bodyInputRef = useRef<TextInput>(null);
  const titleFromPasteSeqRef = useRef(0);
  const composeSnapshotRef = useRef<{
    title: string;
    body: string;
    codeLanguage: string;
    categoryId: string | null;
    tagIdsKey: string;
  } | null>(null);
  const pendingNavRef = useRef<PendingNav | null>(null);
  const bodyForPasteRef = useRef(body);
  const isCodeSnippetForPasteRef = useRef(false);

  const composeSnippetMode = useMemo(() => {
    if (!editingNoteId) return false;
    return notes.find((n) => n.id === editingNoteId)?.is_code_snippet === true;
  }, [editingNoteId, notes]);

  const displayNotes = useMemo(() => {
    let list = notes;
    const q = listSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((n) => {
        const t = (n.title ?? "").toLowerCase();
        const b = (n.body ?? "").toLowerCase();
        return t.includes(q) || b.includes(q);
      });
    }
    if (filterCategory === "uncategorized") {
      list = list.filter((n) => !n.category_id);
    } else if (filterCategory !== "all") {
      list = list.filter((n) => n.category_id === filterCategory);
    }
    if (filterTagId) {
      list = list.filter((n) => getNoteTags(n).some((t) => t.id === filterTagId));
    }
    return list;
  }, [notes, listSearchQuery, filterCategory, filterTagId]);

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
    if (!userId) {
      setNotes([]);
      setCategories([]);
      setTags([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [catRes, tagRes, notesRes] = await Promise.all([
      supabase.from("note_categories").select("*").order("name", { ascending: true }),
      supabase.from("tags").select("*").order("label", { ascending: true }),
      supabase
        .from("notes")
        .select("*, category:note_categories (*), note_tags (tag:tags (*))")
        .order("updated_at", { ascending: false }),
    ]);

    if (notesRes.error) {
      setError(notesRes.error.message);
      setNotes([]);
    } else {
      setError(null);
      setNotes((notesRes.data as Note[]) ?? []);
    }
    if (!catRes.error) setCategories((catRes.data as NoteCategory[]) ?? []);
    if (!tagRes.error) setTags((tagRes.data as Tag[]) ?? []);

    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotes([]);
      setCategories([]);
      setTags([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [userId, load]);

  useEffect(() => {
    if (selectedId && !notes.some((n) => n.id === selectedId)) {
      setSelectedId(null);
    }
  }, [notes, selectedId]);

  useEffect(() => {
    if (composeCategoryPickerVisible) setComposeShowNewCategoryForm(false);
  }, [composeCategoryPickerVisible]);

  useEffect(() => {
    if (composeTagPickerVisible) setComposeShowNewTagForm(false);
  }, [composeTagPickerVisible]);

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
    setComposeCategoryId(null);
    setComposeTagIds([]);
    setNewCategoryName("");
    setNewTagLabel("");
    setNewTagColor(TAG_COLOR_PRESETS[0]);
    setComposeCategoryPickerVisible(false);
    setComposeTagPickerVisible(false);
    setWebComposeTagAddKey(0);
    setWebCategorySelectKey(0);
    setComposeShowNewCategoryForm(false);
    setComposeShowNewTagForm(false);
    composeSnapshotRef.current = null;
  }, []);

  const isComposeOpen = composing || editingNoteId !== null;

  const isComposeDirty = useMemo(() => {
    if (!isComposeOpen) return false;
    const s = composeSnapshotRef.current;
    if (!s) return false;
    const cat = composeCategoryId ?? null;
    const snapCat = s.categoryId ?? null;
    return (
      title.trim() !== s.title.trim() ||
      body !== s.body ||
      codeLanguage !== s.codeLanguage ||
      cat !== snapCat ||
      tagIdsKey(composeTagIds) !== s.tagIdsKey
    );
  }, [isComposeOpen, title, body, codeLanguage, composeCategoryId, composeTagIds]);

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
        composeSnapshotRef.current = {
          title: "",
          body: "",
          codeLanguage: "typescript",
          categoryId: null,
          tagIdsKey: "",
        };
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
      category_id: composeCategoryId,
      updated_at: new Date().toISOString(),
    };

    if (editingNoteId) {
      const id = editingNoteId;
      const { error: updateError } = await supabase.from("notes").update(row).eq("id", id);
      if (updateError) {
        setSaving(false);
        setError(updateError.message);
        return { ok: false };
      }
      const tagErr = await syncNoteTags(id, composeTagIds);
      setSaving(false);
      if (tagErr) {
        setError(tagErr);
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

    if (insertError) {
      setSaving(false);
      setError(insertError.message);
      return { ok: false };
    }
    if (!data) {
      setSaving(false);
      setError("Note saved but no data returned from server.");
      void load();
      return { ok: false };
    }
    const newNote = data as Note;
    const tagErr = await syncNoteTags(newNote.id, composeTagIds);
    setSaving(false);
    if (tagErr) {
      setError(tagErr);
      void load();
      return { ok: false };
    }
    setNotes((prev) => {
      const rest = prev.filter((n) => n.id !== newNote.id);
      return [newNote, ...rest];
    });
    void load();
    return { ok: true, kind: "insert", note: newNote };
  }, [user, codeLanguage, editingNoteId, notes, title, body, composeCategoryId, composeTagIds, load]);

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
      composeSnapshotRef.current = {
        title: "",
        body: "",
        codeLanguage: "typescript",
        categoryId: null,
        tagIdsKey: "",
      };
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
    const tids = getNoteTags(selectedNote).map((t) => t.id);
    composeSnapshotRef.current = {
      title: selectedNote.title ?? "",
      body: selectedNote.body ?? "",
      codeLanguage: codeLang,
      categoryId: selectedNote.category_id ?? null,
      tagIdsKey: tagIdsKey(tids),
    };
    setComposing(false);
    setEditingNoteId(selectedNote.id);
    setTitle(selectedNote.title);
    setBody(selectedNote.body);
    setCodeLanguage(codeLang);
    setComposeCategoryId(selectedNote.category_id ?? null);
    setComposeTagIds(tids);
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

  const composeCategoryLabel = useMemo(() => {
    if (!composeCategoryId) return "Uncategorized";
    return categories.find((c) => c.id === composeCategoryId)?.name ?? "Category";
  }, [composeCategoryId, categories]);

  const sortedComposeCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const sortedComposeTags = useMemo(
    () => [...tags].sort((a, b) => a.label.localeCompare(b.label)),
    [tags],
  );

  const createCategoryFromInput = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || !user) return;
    const { data, error: insErr } = await supabase
      .from("note_categories")
      .insert({ user_id: user.id, name: trimmed })
      .select()
      .single();
    if (insErr) {
      setError(insErr.message);
      return;
    }
    if (data) {
      const c = data as NoteCategory;
      setCategories((prev) =>
        [...prev.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setComposeCategoryId(c.id);
      setNewCategoryName("");
      setComposeShowNewCategoryForm(false);
      setComposeCategoryPickerVisible(false);
      setError(null);
    }
  }, [newCategoryName, user]);

  const createTagFromInput = useCallback(async () => {
    const label = newTagLabel.trim();
    if (!label || !user) return;
    const { data, error: insErr } = await supabase
      .from("tags")
      .insert({ user_id: user.id, label, color: newTagColor })
      .select()
      .single();
    if (insErr) {
      setError(insErr.message);
      return;
    }
    if (data) {
      const t = data as Tag;
      setTags((prev) =>
        [...prev.filter((x) => x.id !== t.id), t].sort((a, b) => a.label.localeCompare(b.label)),
      );
      setComposeTagIds((prev) => (prev.includes(t.id) ? prev : [...prev, t.id]));
      setNewTagLabel("");
      setComposeShowNewTagForm(false);
      setComposeTagPickerVisible(false);
      setError(null);
    }
  }, [newTagLabel, newTagColor, user]);

  const addComposeTag = useCallback((id: string) => {
    setComposeTagIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeComposeTag = useCallback((id: string) => {
    setComposeTagIds((prev) => prev.filter((x) => x !== id));
  }, []);

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
    <ScrollView
      className="flex-1 px-4 sm:px-6"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View className="w-full max-w-xl self-start pt-5 pb-10">
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

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Category</Text>
      {Platform.OS === "web" ? (
        <View className="mb-3">
          <WebNativeSelect
            key={webCategorySelectKey}
            className="w-full"
            value={composeCategoryId ?? ""}
            onValueChange={(v) => {
              if (v === COMPOSE_NEW_CATEGORY_OPTION) {
                setComposeShowNewCategoryForm(true);
                setWebCategorySelectKey((k) => k + 1);
                return;
              }
              setComposeCategoryId(v === "" ? null : v);
              setComposeShowNewCategoryForm(false);
            }}
            options={[
              { value: "", label: "Uncategorized" },
              ...sortedComposeCategories.map((c) => ({ value: c.id, label: c.name })),
              { value: COMPOSE_NEW_CATEGORY_OPTION, label: "New category…" },
            ]}
            ariaLabel="Note category"
          />
          {composeShowNewCategoryForm ? (
            <View className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/70">
              <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                New category
              </Text>
              <Text className="mb-2 text-xs leading-snug text-neutral-600 dark:text-neutral-400">
                Saves and assigns this category to the note.
              </Text>
              <TextInput
                className="mb-3 max-w-md w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="Category name"
                placeholderTextColor="#a3a3a3"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                onSubmitEditing={() => void createCategoryFromInput()}
              />
              <View className="flex-row flex-wrap items-center gap-2">
                <Pressable
                  className="self-start rounded-lg bg-neutral-900 px-4 py-2 active:opacity-90 dark:bg-neutral-100"
                  onPress={() => void createCategoryFromInput()}
                  accessibilityRole="button"
                  accessibilityLabel="Create category and assign to this note"
                >
                  <Text className="text-sm font-semibold text-white dark:text-neutral-900">Create & assign</Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-neutral-300 px-4 py-2 active:opacity-90 dark:border-neutral-600"
                  onPress={() => {
                    setNewCategoryName("");
                    setComposeShowNewCategoryForm(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close new category"
                >
                  <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          className="mb-3 flex-row items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5 active:opacity-90 dark:border-neutral-700 dark:bg-neutral-900"
          onPress={() => setComposeCategoryPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Choose category"
        >
          <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{composeCategoryLabel}</Text>
          <CaretDown size={18} weight="bold" color={icon.fgMuted} />
        </Pressable>
      )}

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Tags</Text>
      <View className="mb-2 flex-row flex-wrap gap-2">
        {composeTagIds.map((tid) => {
          const t = tags.find((x) => x.id === tid);
          if (!t) return null;
          return (
            <Pressable
              key={tid}
              onPress={() => removeComposeTag(tid)}
              className="flex-row items-center gap-1.5 rounded-full border border-neutral-300 bg-white py-1 pl-2.5 pr-1.5 active:opacity-90 dark:border-neutral-600 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel={`Remove tag ${t.label}`}
            >
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
              <Text className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{t.label}</Text>
              <X size={14} weight="bold" color={icon.fgMuted} />
            </Pressable>
          );
        })}
      </View>
      {Platform.OS === "web" ? (
        <View className="mb-3">
          <WebNativeSelect
            key={webComposeTagAddKey}
            className="w-full"
            value=""
            onValueChange={(v) => {
              if (v === COMPOSE_NEW_TAG_OPTION) {
                setComposeShowNewTagForm(true);
                setWebComposeTagAddKey((k) => k + 1);
                return;
              }
              if (v) {
                addComposeTag(v);
                setWebComposeTagAddKey((k) => k + 1);
              }
            }}
            options={[
              { value: "", label: "Add existing tag…" },
              ...sortedComposeTags
                .filter((t) => !composeTagIds.includes(t.id))
                .map((t) => ({ value: t.id, label: t.label })),
              { value: COMPOSE_NEW_TAG_OPTION, label: "New tag…" },
            ]}
            ariaLabel="Add tag from list"
          />
          {composeShowNewTagForm ? (
            <View className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/70">
              <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                New tag
              </Text>
              <Text className="mb-2 text-xs leading-snug text-neutral-600 dark:text-neutral-400">
                Create a reusable tag (label + color), then add it to this note.
              </Text>
              <TextInput
                className="mb-2 max-w-md w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="Tag label"
                placeholderTextColor="#a3a3a3"
                value={newTagLabel}
                onChangeText={setNewTagLabel}
              />
              <Text className="mb-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">Color</Text>
              <View className="mb-3 flex-row flex-wrap gap-2">
                {TAG_COLOR_PRESETS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setNewTagColor(c)}
                    className={`h-9 w-9 rounded-full border-2 ${
                      newTagColor === c ? "border-neutral-900 dark:border-neutral-100" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    accessibilityLabel={`Tag color ${c}`}
                  />
                ))}
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Pressable
                  className="self-start rounded-lg bg-neutral-900 px-4 py-2 active:opacity-90 dark:bg-neutral-100"
                  onPress={() => void createTagFromInput()}
                  accessibilityRole="button"
                  accessibilityLabel="Create tag and add to this note"
                >
                  <Text className="text-sm font-semibold text-white dark:text-neutral-900">Create & add</Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-neutral-300 px-4 py-2 active:opacity-90 dark:border-neutral-600"
                  onPress={() => {
                    setNewTagLabel("");
                    setComposeShowNewTagForm(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Close new tag"
                >
                  <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Pressable
          className="mb-3 self-start rounded-lg border border-neutral-300 bg-white px-3 py-2 active:opacity-90 dark:border-neutral-600 dark:bg-neutral-900"
          onPress={() => setComposeTagPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Add tag"
        >
          <Text className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Add tag…</Text>
        </Pressable>
      )}

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {composeSnippetMode ? "Language (syntax highlight)" : "Language — wraps body in a code block"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 flex-row">
        {LANG_PRESETS.map((l) => (
          <Pressable
            key={l}
            className={`mr-2 rounded-full border px-3 py-1.5 active:opacity-85 ${
              codeLanguage === l
                ? "border-neutral-900 bg-neutral-900 hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:hover:bg-neutral-200"
                : "border-neutral-300 bg-neutral-50 hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:border-neutral-500 dark:hover:bg-neutral-700"
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
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border py-2 active:opacity-90 ${
            composeTab === "edit"
              ? "border-neutral-900 bg-neutral-900 hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:hover:bg-neutral-200"
              : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
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
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg border py-2 active:opacity-90 ${
            composeTab === "preview"
              ? "border-neutral-900 bg-neutral-900 hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:hover:bg-neutral-200"
              : "border-neutral-300 hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
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

      <View className="mb-2 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Pressable
          className="min-w-0 max-w-80 flex-row items-center gap-3 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 hover:border-neutral-400 hover:bg-neutral-50 active:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
          onPress={() => void pasteAsCode()}
        >
          <ClipboardText size={20} weight="duotone" color={icon.fg} />
          <View className="min-w-0 shrink">
            <Text className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Paste as code</Text>
            <Text className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
              Web: Cmd/Ctrl+V in body too
            </Text>
          </View>
        </Pressable>
        <View className="flex-row flex-wrap items-center justify-end gap-2">
          {!split ? (
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-lg border border-neutral-300 px-5 py-2.5 hover:border-neutral-400 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:border-neutral-500 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 dark:disabled:opacity-50"
              onPress={cancelCompose}
              disabled={saving}
            >
              <X size={20} weight="bold" color={icon.fg} />
              <Text className="font-semibold text-neutral-900 dark:text-neutral-100">Cancel</Text>
            </Pressable>
          ) : null}
          <Pressable
            className="flex-row items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 py-2.5 transition-colors duration-150 hover:bg-neutral-800 active:opacity-90 disabled:opacity-50 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:active:opacity-90 dark:disabled:opacity-50"
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
      </View>
      </View>
    </ScrollView>
  );

  const detailPanel = isComposeOpen ? (
    composeForm
  ) : selectedNote ? (
    <ScrollView className="flex-1 px-4 pb-8 pt-2" keyboardShouldPersistTaps="handled">
      <View className="mb-3 flex-row flex-wrap gap-2">
        <Pressable
          className="flex-row items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 transition-colors duration-150 hover:bg-neutral-800 active:opacity-90 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:active:opacity-90"
          onPress={startEditSelected}
        >
          <PencilSimple size={18} weight="bold" color={icon.onInverse} />
          <Text className="text-sm font-semibold text-white dark:text-neutral-900">Edit</Text>
        </Pressable>
        <Pressable
          className="flex-row items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 hover:border-red-400 hover:bg-red-50 active:bg-red-100 dark:border-red-800 dark:bg-neutral-900 dark:hover:border-red-700 dark:hover:bg-red-950/80 dark:active:bg-red-950"
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
      {selectedNote.category?.name || getNoteTags(selectedNote).length > 0 ? (
        <View className="mb-3 flex-row flex-wrap items-center gap-2">
          {selectedNote.category?.name ? (
            <View className="rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-1 dark:border-neutral-600 dark:bg-neutral-800">
              <Text className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {selectedNote.category.name}
              </Text>
            </View>
          ) : null}
          {getNoteTags(selectedNote).map((t) => (
            <View
              key={t.id}
              className="flex-row items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-2.5 py-1 dark:border-neutral-600 dark:bg-neutral-900"
            >
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
              <Text className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{t.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
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

  const showInitialNotesLoader = loading && notes.length === 0;

  return (
    <View className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      <View className="border-b border-neutral-200 px-4 pb-3 pt-14 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <NotePencil size={26} weight="duotone" color={icon.fg} />
            <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Dev Notes</Text>
          </View>
          <Pressable
            className="flex-row items-center gap-1.5 rounded-lg bg-neutral-200 px-3 py-1.5 hover:bg-neutral-300 active:opacity-80 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:opacity-90"
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

      {showInitialNotesLoader ? (
        <View className="flex-1 items-center justify-center gap-2 px-6 pb-12">
          <ActivityIndicator size="small" color="#a3a3a3" />
          <Text className="text-xs text-neutral-500 dark:text-neutral-400">Loading notes…</Text>
        </View>
      ) : (
      <>
      <NotesFilterBar
        categories={categories}
        tags={tags}
        filterCategory={filterCategory}
        filterTagId={filterTagId}
        onFilterCategory={setFilterCategory}
        onFilterTagId={setFilterTagId}
      />
      <View className="min-h-0 flex-1 flex-row">
        {showList ? (
          <View
            className={`border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 ${
              split ? "w-72 border-r" : "flex-1"
            }`}
          >
            <View className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <Pressable
                className="flex-row items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 transition-colors duration-150 hover:bg-neutral-800 active:opacity-90 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:active:opacity-90"
                onPress={openNewNote}
              >
                <Plus size={20} weight="bold" color={icon.onInverse} />
                <Text className="text-sm font-semibold text-white dark:text-neutral-900">New note</Text>
              </Pressable>
            </View>
            <View className="border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
              <View className="flex-row items-center rounded-lg border border-neutral-200 bg-white px-2.5 dark:border-neutral-600 dark:bg-neutral-950">
                <MagnifyingGlass size={18} weight="bold" color={icon.fgMuted} />
                <TextInput
                  className="min-h-[40px] flex-1 py-2 pl-2 text-sm text-neutral-900 dark:text-neutral-100"
                  placeholder="Search notes…"
                  placeholderTextColor="#a3a3a3"
                  value={listSearchQuery}
                  onChangeText={setListSearchQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search notes"
                />
                {listSearchQuery.length > 0 ? (
                  <Pressable
                    onPress={() => setListSearchQuery("")}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    className="rounded-full p-1 hover:bg-neutral-200 active:bg-neutral-300 dark:hover:bg-neutral-700 dark:active:bg-neutral-600"
                  >
                    <X size={18} weight="bold" color={icon.fgMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <FlatList
              className="flex-1"
              style={{ flex: 1 }}
              data={displayNotes}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              ListEmptyComponent={
                notes.length === 0 ? (
                  <View className="items-center px-3 py-10">
                    <View className="mb-2">
                      <NotePencil size={40} weight="duotone" color={icon.fgSubtle} />
                    </View>
                    <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                      No notes yet. Tap New note.
                    </Text>
                  </View>
                ) : (
                  <View className="items-center px-3 py-10">
                    <View className="mb-2">
                      <MagnifyingGlass size={40} weight="duotone" color={icon.fgSubtle} />
                    </View>
                    <Text className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                      No notes match your search.
                    </Text>
                  </View>
                )
              }
              renderItem={({ item }) => {
                const active = item.id === selectedId && !isComposeOpen;
                return (
                  <Pressable
                    onPress={() => openNote(item.id)}
                    className={`border-b border-neutral-200 px-3 py-3 transition-colors duration-100 dark:border-neutral-800 ${
                      active
                        ? "bg-white hover:bg-neutral-50 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                        : "hover:bg-neutral-200/80 active:bg-neutral-200 dark:hover:bg-neutral-800/80 dark:active:bg-neutral-800"
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
                    <View className="mt-1 flex-row flex-wrap items-center gap-2">
                      {item.category?.name ? (
                        <Text className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                          {item.category.name}
                        </Text>
                      ) : null}
                      <View className="flex-row items-center gap-1">
                        {getNoteTags(item)
                          .slice(0, 6)
                          .map((t) => (
                            <View
                              key={t.id}
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: t.color }}
                              accessibilityLabel={t.label}
                            />
                          ))}
                      </View>
                    </View>
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
                  className="flex-row items-center gap-1 self-start rounded-lg px-2 py-2 hover:bg-neutral-200 active:bg-neutral-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
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
      </>
      )}

      <PickerModal
        visible={composeCategoryPickerVisible && Platform.OS !== "web"}
        title={composeShowNewCategoryForm ? "New category" : "Category"}
        onClose={() => {
          setComposeCategoryPickerVisible(false);
          setComposeShowNewCategoryForm(false);
        }}
      >
        {composeShowNewCategoryForm ? (
          <>
            <Pressable
              className="mx-2 mb-2 flex-row items-center gap-2 rounded-lg px-3 py-2 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => setComposeShowNewCategoryForm(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to categories"
            >
              <CaretLeft size={20} weight="bold" color={icon.fgMuted} />
              <Text className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Categories</Text>
            </Pressable>
            <View className="mx-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/70">
              <Text className="mb-2 text-xs leading-snug text-neutral-600 dark:text-neutral-400">
                Saves and assigns this category to the note.
              </Text>
              <TextInput
                className="mb-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="Category name"
                placeholderTextColor="#a3a3a3"
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                onSubmitEditing={() => void createCategoryFromInput()}
              />
              <View className="flex-row flex-wrap items-center gap-2">
                <Pressable
                  className="rounded-lg bg-neutral-900 px-4 py-2 active:opacity-90 dark:bg-neutral-100"
                  onPress={() => void createCategoryFromInput()}
                  accessibilityRole="button"
                  accessibilityLabel="Create category and assign to this note"
                >
                  <Text className="text-sm font-semibold text-white dark:text-neutral-900">Create & assign</Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-neutral-300 px-4 py-2 active:opacity-90 dark:border-neutral-600"
                  onPress={() => {
                    setNewCategoryName("");
                    setComposeShowNewCategoryForm(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            <Pressable
              className="mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => {
                setComposeCategoryId(null);
                setComposeCategoryPickerVisible(false);
              }}
            >
              <Text className="text-base text-neutral-900 dark:text-neutral-100">Uncategorized</Text>
            </Pressable>
            {sortedComposeCategories.map((c) => (
              <Pressable
                key={c.id}
                className={`mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800 ${
                  composeCategoryId === c.id ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
                onPress={() => {
                  setComposeCategoryId(c.id);
                  setComposeCategoryPickerVisible(false);
                }}
              >
                <Text className="text-base text-neutral-900 dark:text-neutral-100">{c.name}</Text>
              </Pressable>
            ))}
            <Pressable
              className="mx-2 mb-1 rounded-lg border border-dashed border-neutral-300 px-3 py-3 active:bg-neutral-100 dark:border-neutral-600 dark:active:bg-neutral-800"
              onPress={() => setComposeShowNewCategoryForm(true)}
              accessibilityRole="button"
              accessibilityLabel="Create new category"
            >
              <Text className="text-base font-medium text-neutral-700 dark:text-neutral-200">New category…</Text>
            </Pressable>
          </>
        )}
      </PickerModal>

      <PickerModal
        visible={composeTagPickerVisible && Platform.OS !== "web"}
        title={composeShowNewTagForm ? "New tag" : "Tags"}
        onClose={() => {
          setComposeTagPickerVisible(false);
          setComposeShowNewTagForm(false);
        }}
      >
        {composeShowNewTagForm ? (
          <>
            <Pressable
              className="mx-2 mb-2 flex-row items-center gap-2 rounded-lg px-3 py-2 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => setComposeShowNewTagForm(false)}
              accessibilityRole="button"
              accessibilityLabel="Back to tags"
            >
              <CaretLeft size={20} weight="bold" color={icon.fgMuted} />
              <Text className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Tags</Text>
            </Pressable>
            <View className="mx-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/70">
              <Text className="mb-2 text-xs leading-snug text-neutral-600 dark:text-neutral-400">
                Create a reusable tag (label + color), then add it to this note.
              </Text>
              <TextInput
                className="mb-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-neutral-900 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
                placeholder="Tag label"
                placeholderTextColor="#a3a3a3"
                value={newTagLabel}
                onChangeText={setNewTagLabel}
              />
              <Text className="mb-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400">Color</Text>
              <View className="mb-3 flex-row flex-wrap gap-2">
                {TAG_COLOR_PRESETS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setNewTagColor(c)}
                    className={`h-9 w-9 rounded-full border-2 ${
                      newTagColor === c ? "border-neutral-900 dark:border-neutral-100" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    accessibilityLabel={`Tag color ${c}`}
                  />
                ))}
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Pressable
                  className="rounded-lg bg-neutral-900 px-4 py-2 active:opacity-90 dark:bg-neutral-100"
                  onPress={() => void createTagFromInput()}
                  accessibilityRole="button"
                  accessibilityLabel="Create tag and add to this note"
                >
                  <Text className="text-sm font-semibold text-white dark:text-neutral-900">Create & add</Text>
                </Pressable>
                <Pressable
                  className="rounded-lg border border-neutral-300 px-4 py-2 active:opacity-90 dark:border-neutral-600"
                  onPress={() => {
                    setNewTagLabel("");
                    setComposeShowNewTagForm(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            <Text className="mx-3 mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Tap a tag to add it. Remove tags from the note editor with the chip ×.
            </Text>
            {sortedComposeTags.map((t) => {
              const on = composeTagIds.includes(t.id);
              return (
                <Pressable
                  key={t.id}
                  className={`mx-2 mb-1 flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800 ${
                    on ? "bg-neutral-50 dark:bg-neutral-800/80" : ""
                  }`}
                  onPress={() => addComposeTag(t.id)}
                >
                  <View className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <Text className="flex-1 text-base text-neutral-900 dark:text-neutral-100">{t.label}</Text>
                  {on ? (
                    <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">On note</Text>
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              className="mx-2 mb-1 rounded-lg border border-dashed border-neutral-300 px-3 py-3 active:bg-neutral-100 dark:border-neutral-600 dark:active:bg-neutral-800"
              onPress={() => setComposeShowNewTagForm(true)}
              accessibilityRole="button"
              accessibilityLabel="Create new tag"
            >
              <Text className="text-base font-medium text-neutral-700 dark:text-neutral-200">New tag…</Text>
            </Pressable>
          </>
        )}
      </PickerModal>

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
