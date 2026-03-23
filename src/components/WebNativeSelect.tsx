import { createElement } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { Platform, useColorScheme } from "react-native";

export type WebSelectOption = { value: string; label: string };

type Props = {
  /** Must match one of `options[].value` while controlled. */
  value: string;
  onValueChange: (value: string) => void;
  options: WebSelectOption[];
  ariaLabel?: string;
  /** Wrapper div (NativeWind className on web). */
  className?: string;
};

/**
 * Real HTML `<select>` for web only. On native returns null (use modal pickers instead).
 */
export function WebNativeSelect({ value, onValueChange, options, ariaLabel, className }: Props): ReactElement | null {
  const scheme = useColorScheme();
  const dark = scheme === "dark";

  if (Platform.OS !== "web") return null;

  const selectStyle = {
    width: "100%" as const,
    minHeight: 40,
    paddingLeft: 12,
    paddingRight: 28,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid" as const,
    borderColor: dark ? "#525252" : "#e5e5e5",
    backgroundColor: dark ? "#0a0a0a" : "#ffffff",
    color: dark ? "#fafafa" : "#171717",
    fontSize: 14,
    fontWeight: "500" as const,
    cursor: "pointer" as const,
    outlineStyle: "none" as const,
    WebkitAppearance: "none" as const,
    MozAppearance: "none" as const,
    appearance: "none" as const,
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 256 256'%3E%3Cpath fill='%23737373' d='M215.4 92.9A8 8 0 0 0 208 88H48a8 8 0 0 0-5.7 13.7l80 80a8 8 0 0 0 11.4 0l80-80a8 8 0 0 0 .7-8.8Z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 10px center",
  };

  const select = createElement(
    "select",
    {
      "aria-label": ariaLabel,
      value,
      style: selectStyle,
      onChange: (e: ChangeEvent<HTMLSelectElement>) => {
        onValueChange(e.target.value);
      },
    },
    options.map((o) => createElement("option", { key: o.value, value: o.value }, o.label)),
  );

  return createElement(
    "div",
    {
      className: className ?? "w-full min-w-0 flex-1",
      style: { minWidth: 140 },
    },
    select,
  );
}
