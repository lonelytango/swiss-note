import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT =
  "You write very short note titles. Reply with a single line only: max 64 characters, no quotes, no newlines. Summarize what the pasted text is (topic, format, purpose). If it is code, mention language or task briefly.";

function parseTitleFromChatResponse(data: unknown): string {
  const raw =
    (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return "";
  return raw
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .split(/\r?\n/)[0]!
    .slice(0, 200);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    /** Any OpenAI-compatible POST /v1/chat/completions endpoint (Groq, Together, OpenRouter, Ollama w/ OpenAI API, vLLM, etc.) */
    const chatUrl = Deno.env.get("TITLE_AI_URL")?.trim();
    const apiKey = Deno.env.get("TITLE_AI_KEY")?.trim();
    const model = Deno.env.get("TITLE_AI_MODEL")?.trim();

    if (!chatUrl || !apiKey || !model) {
      return new Response(JSON.stringify({ title: null as string | null, skipped: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as { text?: string };
    const rawText = typeof body.text === "string" ? body.text : "";
    const slice =
      rawText.length > 8000 ? `${rawText.slice(0, 8000)}\n…` : rawText;

    if (!slice.trim()) {
      return new Response(JSON.stringify({ title: "" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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

    if (!res.ok) {
      return new Response(JSON.stringify({ title: null as string | null }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const title = parseTitleFromChatResponse(data);

    return new Response(JSON.stringify({ title }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), title: null }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
