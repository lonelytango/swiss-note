import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { X } from "phosphor-react-native";

import { useIconSemantic } from "../theme/iconColors";

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function PickerModal({ visible, title, onClose, children }: Props) {
  const icon = useIconSemantic();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Dismiss" />
        <View className="max-h-[75%] rounded-t-2xl border-t border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="rounded-full p-1.5 hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700"
            >
              <X size={22} weight="bold" color={icon.fgMuted} />
            </Pressable>
          </View>
          <ScrollView
            className="px-2 pb-6 pt-1"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
