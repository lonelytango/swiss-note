import { Platform, type ColorSchemeName } from "react-native";

type MarkdownStyleMap = Record<string, Record<string, unknown>>;

const mono = Platform.select({
  ios: { fontFamily: "Menlo" },
  android: { fontFamily: "monospace" },
  default: { fontFamily: "monospace" },
});

export function buildMarkdownStyles(scheme: ColorSchemeName): MarkdownStyleMap {
  const isDark = scheme === "dark";
  const fg = isDark ? "#fafafa" : "#171717";
  const muted = isDark ? "#a3a3a3" : "#737373";
  const codeBg = isDark ? "#262626" : "#f5f5f5";
  const codeBorder = isDark ? "#404040" : "#d4d4d4";
  const link = isDark ? "#93c5fd" : "#2563eb";
  const quoteBg = isDark ? "#262626" : "#f5f5f5";

  return {
    body: { color: fg, fontSize: 15, lineHeight: 22 },
    paragraph: { marginTop: 4, marginBottom: 4, color: fg },
    heading1: { color: fg, fontSize: 24, fontWeight: "700", marginTop: 8, marginBottom: 4 },
    heading2: { color: fg, fontSize: 20, fontWeight: "700", marginTop: 8, marginBottom: 4 },
    heading3: { color: fg, fontSize: 17, fontWeight: "600", marginTop: 6, marginBottom: 4 },
    heading4: { color: fg, fontSize: 16, fontWeight: "600", marginTop: 4 },
    heading5: { color: fg, fontSize: 14, fontWeight: "600" },
    heading6: { color: muted, fontSize: 13, fontWeight: "600" },
    strong: { fontWeight: "700", color: fg },
    em: { fontStyle: "italic", color: fg },
    s: { textDecorationLine: "line-through", color: muted },
    link: { color: link, textDecorationLine: "underline" },
    blockquote: {
      backgroundColor: quoteBg,
      borderLeftColor: isDark ? "#525252" : "#d4d4d4",
      borderLeftWidth: 4,
      marginVertical: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { color: fg },
    code_inline: {
      ...mono,
      backgroundColor: codeBg,
      borderColor: codeBorder,
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      color: fg,
      fontSize: 14,
    },
    code_block: {
      ...mono,
      backgroundColor: codeBg,
      borderColor: codeBorder,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      color: fg,
      fontSize: 13,
      lineHeight: 20,
    },
    fence: {
      ...mono,
      backgroundColor: codeBg,
      borderColor: codeBorder,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      color: fg,
      fontSize: 13,
      lineHeight: 20,
      marginVertical: 8,
    },
    hr: { backgroundColor: codeBorder, height: 1, marginVertical: 12 },
  };
}
