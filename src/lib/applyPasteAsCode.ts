import { guessCodeLanguage } from "./guessCodeLanguage";

type Range = { start: number; end: number };

export type PasteAsCodeResult = {
  nextBody: string;
  cursor: number;
  detected: string;
};

/**
 * Insert clipboard text as a fenced code block (markdown) or raw lines (snippet).
 * `range: null` = append at end (toolbar button). Otherwise replace [start, end).
 */
export function applyPasteAsCode(args: {
  body: string;
  pasted: string;
  isCodeSnippet: boolean;
  range: Range | null;
}): PasteAsCodeResult {
  const { body, pasted, isCodeSnippet, range } = args;
  const detected = guessCodeLanguage(pasted);

  if (!range) {
    if (isCodeSnippet) {
      const nextBody = body.trim() ? `${body.trimEnd()}\n${pasted}` : pasted;
      return { nextBody, cursor: nextBody.length, detected };
    }
    const fence = `\`\`\`${detected}\n${pasted.trimEnd()}\n\`\`\`\n`;
    const nextBody = body.trim() ? `${body.trimEnd()}\n\n${fence}` : fence;
    return { nextBody, cursor: nextBody.length, detected };
  }

  const { start, end } = range;
  const before = body.slice(0, start);
  const after = body.slice(end);

  if (isCodeSnippet) {
    const join = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const insertion = join + pasted;
    const nextBody = before + insertion + after;
    return { nextBody, cursor: before.length + insertion.length, detected };
  }

  const fence = `\`\`\`${detected}\n${pasted.trimEnd()}\n\`\`\`\n`;
  const needGap = before.trim().length > 0 && !before.endsWith("\n\n");
  const prefix = needGap ? "\n\n" : "";
  const insertion = prefix + fence;
  const nextBody = before + insertion + after;
  return { nextBody, cursor: before.length + insertion.length, detected };
}
