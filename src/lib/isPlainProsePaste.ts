/**
 * Heuristic: pasted content is ordinary prose → insert without a markdown code fence.
 * Conservative: when unsure, returns false (keep paste-as-code behavior).
 */
export function isPlainProsePaste(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 20) return false;

  // Strong code / structured signals
  if (/^#!\s*\//m.test(t)) return false;
  if (/^FROM\s+\S+/im.test(t) && /^(RUN|CMD|WORKDIR|COPY|ADD)\s+/im.test(t)) return false;
  if (/^\s*(import|export)\s+[\w*{]/.test(t)) return false;
  if (/\b(const|var)\s+\w+\s*=/.test(t)) return false;
  if (/\blet\s+\w+\s*=/.test(t)) return false;
  if (/\bclass\s+[A-Za-z_$][\w$]*\s*(\{|extends|implements|<)/.test(t)) return false;
  if (/\bfunction\s*[\w$]*\s*\(/.test(t)) return false;
  if (/\)\s*=>|\s*=>\s*\{/.test(t)) return false;
  if (/\basync\s+function\b/.test(t)) return false;
  if (/\bawait\s+/.test(t)) return false;
  if (/^\s*SELECT\s+[\s\S]+?\s+FROM\s+/im.test(t)) return false;
  if (/^\s*(def|class)\s+\w+.*:\s*(\n|$)/m.test(t) && /^\s*(import|from)\s+\w+/m.test(t)) return false;
  if (/^\s*#include\s*[<"]/.test(t)) return false;
  if (/^\s*package\s+[\w.]+\s*;/.test(t) && /\b(public|private)\s+class\s+/.test(t)) return false;
  if (/^\s*<\?xml\s/i.test(t)) return false;
  if (/^\s*<!DOCTYPE\s+html/i.test(t)) return false;
  const maybeJson = t;
  if (
    (maybeJson.startsWith("{") && maybeJson.includes("}")) ||
    (maybeJson.startsWith("[") && maybeJson.includes("]"))
  ) {
    try {
      JSON.parse(maybeJson.length > 100_000 ? maybeJson.slice(0, 100_000) : maybeJson);
      return false;
    } catch {
      /* might be prose with braces */
    }
  }

  const nonSpace = t.replace(/\s/g, "").length || 1;
  const letters = (t.match(/[a-zA-Z]/g) ?? []).length;
  const letterRatio = letters / nonSpace;
  if (letterRatio < 0.58) return false;

  const codeish = (t.match(/[{};=<>[\]`]/g) ?? []).length;
  if (codeish >= 3) return false;

  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 12) return false;

  const sentenceBreaks = (t.match(/[.!?]["'']?\s+[A-ZÀ-ÖÅÆ]/g) ?? []).length;
  if (sentenceBreaks >= 1) return true;

  const conversational = (t.match(/\b(what|when|where|why|how|please|thanks|hello|hi|dear|regards|could you|would you|let me|i'm|i am|we are|they are)\b/gi) ?? []).length;
  if (conversational >= 2 && words >= 15) return true;

  const common = (t.match(
    /\b(the|and|was|were|been|have|has|had|with|from|this|that|they|them|their|your|about|would|could|should|there|into|also|very|just|only|even|because|which|while|after|before)\b/gi,
  ) ?? []).length;
  if (common >= 5 && words >= 22) return true;

  if (codeish <= 1 && letterRatio >= 0.72 && words >= 18) return true;

  return false;
}
