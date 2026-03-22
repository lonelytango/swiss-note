import { Highlight, themes, type PrismTheme } from "prism-react-renderer";
import { Platform, ScrollView, Text, useColorScheme, View, type TextStyle } from "react-native";

import { normalizePrismLanguage } from "../lib/prismLanguage";

type Props = {
  code: string;
  language: string;
  maxHeight?: number;
};

/** Prism themes use CSS-ish objects; keep only what RN `Text` accepts. */
function pickTokenStyle(style: unknown): TextStyle {
  if (!style || typeof style !== "object") return {};
  const s = style as Record<string, unknown>;
  const out: TextStyle = {};
  if (typeof s.color === "string") out.color = s.color;
  if (s.fontStyle === "italic" || s.fontStyle === "normal") {
    out.fontStyle = s.fontStyle;
  }
  if (
    s.fontWeight === "bold" ||
    s.fontWeight === "normal" ||
    s.fontWeight === "100" ||
    s.fontWeight === "200" ||
    s.fontWeight === "300" ||
    s.fontWeight === "400" ||
    s.fontWeight === "500" ||
    s.fontWeight === "600" ||
    s.fontWeight === "700" ||
    s.fontWeight === "800" ||
    s.fontWeight === "900"
  ) {
    out.fontWeight = s.fontWeight as TextStyle["fontWeight"];
  }
  if (
    s.textDecorationLine === "underline" ||
    s.textDecorationLine === "line-through" ||
    s.textDecorationLine === "none"
  ) {
    out.textDecorationLine = s.textDecorationLine as TextStyle["textDecorationLine"];
  }
  if (typeof s.opacity === "number") out.opacity = s.opacity;
  return out;
}

export function CodeBlock({ code, language, maxHeight = 480 }: Props) {
  const scheme = useColorScheme();
  /** vsLight / vsDark use rgb/hex — `oneLight` uses hsl() which RN often drops on native. */
  const theme: PrismTheme = scheme === "dark" ? themes.vsDark : themes.vsLight;
  const lang = normalizePrismLanguage(language.trim());

  const mono = Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  });

  const plainColor =
    (typeof theme.plain.color === "string" && theme.plain.color) ||
    (scheme === "dark" ? "#D4D4D4" : "#000000");
  const bg =
    (typeof theme.plain.backgroundColor === "string" && theme.plain.backgroundColor) ||
    (scheme === "dark" ? "#1E1E1E" : "#FFFFFF");

  return (
    <View className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
      {language.trim() ? (
        <View className="border-b border-neutral-200 bg-neutral-100 px-2 py-1 dark:border-neutral-600 dark:bg-neutral-800">
          <Text className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{language.trim()}</Text>
        </View>
      ) : null}
      <ScrollView style={{ maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator>
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
          <Highlight theme={theme} code={code.trimEnd()} language={lang}>
            {({ tokens, getTokenProps }) => (
              <View style={{ padding: 12, backgroundColor: bg }}>
                {tokens.map((line, i) => (
                  <Text
                    key={i}
                    style={{
                      fontFamily: mono,
                      fontSize: 13,
                      lineHeight: 20,
                      color: plainColor,
                    }}
                  >
                    {line.map((token, key) => {
                      const props = getTokenProps({ token });
                      const tokenStyle = pickTokenStyle(props.style);
                      return (
                        <Text key={key} style={tokenStyle}>
                          {props.children}
                        </Text>
                      );
                    })}
                  </Text>
                ))}
              </View>
            )}
          </Highlight>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
