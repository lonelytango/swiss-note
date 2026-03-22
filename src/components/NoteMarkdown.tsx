import Markdown from "react-native-markdown-display";
import { useMemo } from "react";
import { useColorScheme, View } from "react-native";

import { buildMarkdownStyles } from "../theme/markdownStyles";
import { CodeBlock } from "./CodeBlock";

type Props = {
  children: string;
};

function trimTrailingNewline(content: string) {
  if (typeof content === "string" && content.charAt(content.length - 1) === "\n") {
    return content.substring(0, content.length - 1);
  }
  return content;
}

export function NoteMarkdown({ children: md }: Props) {
  const scheme = useColorScheme();
  const mdStyles = useMemo(() => buildMarkdownStyles(scheme), [scheme]);

  const rules = useMemo(
    () => ({
      fence: (node: { key: string; content: string; sourceInfo?: string }) => {
        const content = trimTrailingNewline(node.content);
        const lang = (node.sourceInfo || "text").trim();
        return (
          <View key={node.key} style={{ marginVertical: 8 }}>
            <CodeBlock code={content} language={lang} />
          </View>
        );
      },
      code_block: (node: { key: string; content: string }) => {
        const content = trimTrailingNewline(node.content);
        return (
          <View key={node.key} style={{ marginVertical: 8 }}>
            <CodeBlock code={content} language="plaintext" />
          </View>
        );
      },
    }),
    [],
  );

  return (
    <Markdown style={mdStyles} rules={rules} mergeStyle>
      {md}
    </Markdown>
  );
}
