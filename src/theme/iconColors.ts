import { useColorScheme } from "react-native";

/** Consistent Phosphor `color` props for light / dark (NativeWind palette). */
export function useIconSemantic() {
  const dark = useColorScheme() === "dark";
  return {
    fg: dark ? "#fafafa" : "#171717",
    fgMuted: dark ? "#a3a3a3" : "#525252",
    fgSubtle: dark ? "#737373" : "#737373",
    onInverse: dark ? "#171717" : "#ffffff",
    danger: dark ? "#fca5a5" : "#b91c1c",
    primaryFill: dark ? "#fafafa" : "#171717",
    amber: dark ? "#fcd34d" : "#b45309",
  };
}
