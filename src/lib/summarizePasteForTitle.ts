import { Platform } from "react-native";

import { guessCodeLanguage } from "./guessCodeLanguage";
import { isSupabaseConfigured, supabase } from "./supabase";

const MAX_PASTE_CHARS = 8_000;

const SYSTEM_PROMPT =
  "You write very short note titles. Reply with a single line only: max 64 characters, no quotes, no newlines. Summarize what the pasted text is (topic, format, purpose). If it is code, mention language or task briefly.";

function getDirectChatConfig(): { url: string; key: string; model: string } | null {
  if (typeof process === "undefined") return null;
  const url = process.env.EXPO_PUBLIC_TITLE_AI_URL?.trim();
  const key = process.env.EXPO_PUBLIC_TITLE_AI_KEY?.trim();
  const model = process.env.EXPO_PUBLIC_TITLE_AI_MODEL?.trim();
  if (url && key && model) return { url, key, model };
  return null;
}

function parseTitleFromChatResponse(data: unknown): string | null {
  const raw =
    (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;
  return raw
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .split(/\r?\n/)[0]!
    .slice(0, 200);
}

/** Short title when no LLM or the request fails. */
export function heuristicTitleFromPaste(pasted: string): string {
  const t = pasted.trim();
  if (!t) return "";
  const lines = t.split(/\r?\n/);
  const lang = guessCodeLanguage(t);
  if (lines.length > 2 && lang !== "text") {
    const label = lang === "json" ? "JSON data" : `${lang} code`;
    return `${label} · ${lines.length} lines`;
  }
  const line = lines.find((l) => l.trim().length > 0)?.trim() ?? t;
  const one = line.replace(/\s+/g, " ");
  return one.length <= 72 ? one : `${one.slice(0, 69)}…`;
}

async function summarizeViaOpenAiCompatibleChat(
  slice: string,
  url: string,
  key: string,
  model: string,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: slice },
        ],
        max_tokens: 64,
        temperature: 0.25,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseTitleFromChatResponse(data);
  } catch {
    return null;
  }
}

/**
 * One-line note title from pasted content.
 *
 * **Optional LLM** (any OpenAI-compatible `/v1/chat/completions` API — Groq, Together, OpenRouter, local Ollama/LM Studio, etc.):
 * - **Web:** deploy Edge Function `summarize-title` and set Supabase secrets `TITLE_AI_URL`, `TITLE_AI_KEY`, `TITLE_AI_MODEL`.
 * - **Native (no function):** same three as `EXPO_PUBLIC_TITLE_AI_*` (key in the app bundle — prefer the Edge Function for production).
 *
 * If those are unset, or the request fails, uses `heuristicTitleFromPaste` only (no vendor required).
 */
export async function summarizePasteForTitle(pasted: string): Promise<string> {
  const t = pasted.trim();
  if (!t) return "";

  const slice = t.length > MAX_PASTE_CHARS ? `${t.slice(0, MAX_PASTE_CHARS)}\n…` : t;

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.functions.invoke<{ title?: string | null; skipped?: boolean }>(
      "summarize-title",
      { body: { text: slice } },
    );
    if (!error && typeof data?.title === "string" && data.title.trim() !== "") {
      return data.title.trim();
    }
  }

  if (Platform.OS !== "web") {
    const cfg = getDirectChatConfig();
    if (cfg) {
      const direct = await summarizeViaOpenAiCompatibleChat(slice, cfg.url, cfg.key, cfg.model);
      if (direct) return direct;
    }
  }

  return heuristicTitleFromPaste(pasted);
}
