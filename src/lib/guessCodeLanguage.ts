/**
 * Best-effort language guess from pasted source (heuristics, no ML).
 * Returns a fence label compatible with prismLanguage / UI (lowercase).
 */
export function guessCodeLanguage(raw: string): string {
  const code = raw.trim();
  if (!code) return "text";

  const head = code.slice(0, 12_000);
  const h = head;
  const t = code.trimStart();

  if (/^#!\s*\/[^\n]*\b(ba)?sh\b/m.test(code) || /^#!\s*\/usr\/bin\/env\s+(ba)?sh\b/m.test(code)) {
    return "bash";
  }
  if (/^#!\s*\/[^\n]*\bpython\d?\b/m.test(code)) return "python";
  if (/^#!\s*\/[^\n]*\bnode\b/m.test(code)) return "javascript";
  if (/^#!\s*\/[^\n]*\bruby\b/m.test(code)) return "ruby";

  if (/^FROM\s+\S+/im.test(t) && /^(RUN|CMD|ENTRYPOINT|WORKDIR|COPY|ADD|ENV|ARG|EXPOSE)\s+/im.test(h)) {
    return "docker";
  }

  if (/^---\s*(\n|$)/.test(t) || /^version:\s*["']?[23]/m.test(h) || /^services:\s*$/m.test(h)) {
    return "yaml";
  }

  if (/^\s*package\s+[\w.]+\s*;\s*\n/.test(h) && /\bfunc\s+main\s*\(/.test(h)) return "go";
  if (/\bfn\s+main\s*\(/.test(h) || /\blet\s+mut\s+\w+/.test(h) || /\bimpl\s+[\w<>]+\s+for\s+/.test(h)) {
    return "rust";
  }

  if (/^\s*SELECT\s+[\s\S]+?\s+FROM\s+/im.test(h) && /\b(WHERE|JOIN|GROUP|ORDER|LIMIT)\b/i.test(h)) {
    return "sql";
  }
  if (/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s+(INTO|TABLE|DATABASE|INDEX|VIEW)?/im.test(h)) {
    return "sql";
  }

  if (/^\s*<\?xml\s/i.test(h)) return "xml";
  if (/^\s*<!DOCTYPE\s+html/i.test(h) || /<\/(html|head|body|script|div)\s*>/i.test(h)) return "html";

  const maybeJson = code.trim();
  if (
    (maybeJson.startsWith("{") && maybeJson.includes("}")) ||
    (maybeJson.startsWith("[") && maybeJson.includes("]"))
  ) {
    try {
      JSON.parse(maybeJson.length > 100_000 ? maybeJson.slice(0, 100_000) : maybeJson);
      return "json";
    } catch {
      /* not JSON */
    }
  }

  if (/^\s*#include\s*[<"]/.test(h)) {
    if (/\bstd::|namespace\s+\w+/.test(h)) return "cpp";
    return "c";
  }

  if (/^\s*(def|class)\s+\w+[\s\S]*?:\s*(\n|$)/m.test(h) && /^\s*(import|from)\s+\w+/m.test(h)) {
    return "python";
  }
  if (/^\s*def\s+\w+\s*\([^)]*\)\s*:/m.test(h)) return "python";
  if (/^\s*class\s+\w+(\([^)]*\))?\s*:/m.test(h) && /\b(self|cls)\b/.test(h)) return "python";

  if (/^\s*package\s+[\w.]+\s*;/.test(h) && /\bpublic\s+class\s+/.test(h)) return "java";
  if (/^\s*fun\s+main\s*\(/.test(h) || (/^\s*fun\s+\w+/.test(h) && /\bval\s+\w+\s*[:=]/.test(h))) {
    return "kotlin";
  }
  if (/^\s*import\s+SwiftUI|struct\s+\w+\s*:\s*View/.test(h)) return "swift";

  if (/^\s*namespace\s+[\w.]+\s*;/.test(h) && /\b(public|private)\s+class\s+/.test(h)) return "csharp";

  if (/^[\w.#%-]+\s*\{/.test(h.split("\n")[0] ?? "") && /:\s*[^;{}]+;/.test(h) && /\{[\s\S]*\}/.test(h)) {
    return "css";
  }

  if (/^#{1,6}\s+\S/m.test(h) && (/^[-*+]\s+\S/m.test(h) || /\[[ x]\]\s/.test(h))) return "markdown";

  const tsStrong =
    /\b(interface|type)\s+\w+|\w+\s*:\s*(string|number|boolean|void|any|unknown|never)\b|\bas\s+const\b|\bsatisfies\b|<\s*\w+(\s*,\s*\w+)*\s*>/;
  const hasJs = /\b(const|let|var|function|class|import|export|async|await|=>)\b/.test(h);
  if (hasJs || /[;{}]\s*(\/\/|$)/m.test(h)) {
    if (
      tsStrong.test(h) ||
      /\b(import|export)\s+type\s+/.test(h) ||
      /:\s*\w+(\[\])?\s*(=|=>|,|\)|;)/.test(h)
    ) {
      if (/\b(jsx|React\.createElement|<\/?[A-Z]\w*)/.test(h)) return "tsx";
      return "typescript";
    }
    if (/<[A-Za-z][\w.]*(\s+\w+)?(\s*\/)?>/.test(h)) return "jsx";
    return "javascript";
  }

  if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b/i.test(h)) return "sql";

  return "text";
}
