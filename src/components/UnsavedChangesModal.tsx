import { FloppyDisk, PencilSimple, Trash, WarningCircle } from "phosphor-react-native";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

import { useIconSemantic } from "../theme/iconColors";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  saving?: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
};

/**
 * Cross-platform confirm dialog. React Native `Modal` + NativeWind — Headless UI is web-only and
 * does not support React Native; this matches the same “bring your own styles” idea.
 */
export function UnsavedChangesModal({
  visible,
  title,
  message,
  saving = false,
  onKeepEditing,
  onDiscard,
  onSave,
}: Props) {
  const icon = useIconSemantic();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepEditing}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-6"
        onPress={onKeepEditing}
        accessibilityRole="button"
        accessibilityLabel="Dismiss dialog"
      >
        <Pressable
          className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-3 flex-row items-start gap-3">
            <WarningCircle size={28} color="#ca8a04" weight="duotone" />
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</Text>
              <Text className="mt-1.5 text-sm leading-5 text-neutral-600 dark:text-neutral-400">{message}</Text>
            </View>
          </View>
          <View className="mt-5 flex-col gap-2">
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3.5 active:opacity-85 dark:bg-neutral-100"
              onPress={onSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={icon.onInverse} />
              ) : (
                <>
                  <FloppyDisk size={20} weight="bold" color={icon.onInverse} />
                  <Text className="font-semibold text-white dark:text-neutral-900">Save</Text>
                </>
              )}
            </Pressable>
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 active:opacity-80 dark:border-red-900 dark:bg-red-950"
              onPress={onDiscard}
              disabled={saving}
            >
              <Trash size={20} weight="bold" color={icon.danger} />
              <Text className="font-semibold text-red-800 dark:text-red-200">Discard changes</Text>
            </Pressable>
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3.5 active:bg-neutral-50 dark:border-neutral-600 dark:active:bg-neutral-800"
              onPress={onKeepEditing}
              disabled={saving}
            >
              <PencilSimple size={20} weight="bold" color={icon.fg} />
              <Text className="font-semibold text-neutral-800 dark:text-neutral-200">Keep editing</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
