/** Map fence labels / DB language to a Prism grammar bundled in prism-react-renderer. */
export function normalizePrismLanguage(raw: string): string {
  const x = raw.trim().toLowerCase() || "plaintext";
  const aliases: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "plaintext",
    bash: "plaintext",
    shell: "plaintext",
    zsh: "plaintext",
    yml: "yaml",
    md: "markdown",
    text: "plaintext",
    txt: "plaintext",
    /** Slim Prism bundle: approximate for highlighting */
    docker: "javascript",
    dockerfile: "javascript",
    csharp: "javascript",
    cs: "javascript",
    kt: "kotlin",
    kts: "kotlin",
  };
  const resolved = aliases[x] ?? x;
  const supported = new Set([
    "typescript",
    "tsx",
    "javascript",
    "jsx",
    "json",
    "css",
    "markup",
    "html",
    "xml",
    "svg",
    "python",
    "rust",
    "go",
    "java",
    "kotlin",
    "swift",
    "cpp",
    "c",
    "sql",
    "markdown",
    "plaintext",
    "diff",
    "yaml",
    "ruby",
  ]);
  if (supported.has(resolved)) return resolved;
  return "plaintext";
}
