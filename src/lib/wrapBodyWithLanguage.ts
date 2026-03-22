/** Entire trimmed body is one fenced block: optional info string on opening line, then inner, then closing ``` */
const SINGLE_FENCE = /^`{3}([^\n]*)\n([\s\S]*?)\n`{3}\s*$/;

export type WrapBodyResult = { nextBody: string; cursor: number };

/** First ```lang opening line in the body (markdown), for syncing UI. */
export function inferFenceLanguageFromBody(body: string): string | null {
  const m = body.match(/```([\w.#+\-]*)\s*\n/);
  const g = m?.[1]?.trim();
  return g && g.length > 0 ? g : null;
}

/**
 * If the body is one code fence, change its language; otherwise wrap the whole body in a new fence.
 * Empty body becomes an empty fenced block with the cursor inside.
 */
export function wrapBodyWithLanguage(body: string, lang: string): WrapBodyResult {
  const trimmed = body.trim();
  const fence = SINGLE_FENCE.exec(trimmed);

  if (fence) {
    const inner = fence[2];
    const nextBody = `\`\`\`${lang}\n${inner}\n\`\`\`\n`;
    return { nextBody, cursor: nextBody.length };
  }

  if (!trimmed) {
    const nextBody = `\`\`\`${lang}\n\n\`\`\`\n`;
    const cursor = 3 + lang.length + 1;
    return { nextBody, cursor };
  }

  const nextBody = `\`\`\`${lang}\n${trimmed}\n\`\`\`\n`;
  return { nextBody, cursor: nextBody.length };
}
