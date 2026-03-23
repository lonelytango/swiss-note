import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { CaretDown } from "phosphor-react-native";

import { useIconSemantic } from "../theme/iconColors";
import type { NoteCategory, Tag } from "../types/note";
import { PickerModal } from "./PickerModal";
import { WebNativeSelect } from "./WebNativeSelect";

export type FilterCategoryValue = "all" | "uncategorized" | string;

const CATEGORY_ALL = "__all__";
const CATEGORY_UNCAT = "__uncategorized__";
const TAG_ALL = "__all__";

function categoryToSelectValue(f: FilterCategoryValue): string {
  if (f === "all") return CATEGORY_ALL;
  if (f === "uncategorized") return CATEGORY_UNCAT;
  return f;
}

function selectValueToCategory(v: string): FilterCategoryValue {
  if (v === CATEGORY_ALL) return "all";
  if (v === CATEGORY_UNCAT) return "uncategorized";
  return v;
}

type Props = {
  categories: NoteCategory[];
  tags: Tag[];
  filterCategory: FilterCategoryValue;
  filterTagId: string | null;
  onFilterCategory: (v: FilterCategoryValue) => void;
  onFilterTagId: (id: string | null) => void;
};

function categoryButtonLabel(filter: FilterCategoryValue, categories: NoteCategory[]): string {
  if (filter === "all") return "All categories";
  if (filter === "uncategorized") return "Uncategorized";
  const c = categories.find((x) => x.id === filter);
  return c?.name ?? "Category";
}

function tagButtonLabel(filterTagId: string | null, tags: Tag[]): string {
  if (!filterTagId) return "All tags";
  const t = tags.find((x) => x.id === filterTagId);
  return t?.label ?? "Tag";
}

export function NotesFilterBar({
  categories,
  tags,
  filterCategory,
  filterTagId,
  onFilterCategory,
  onFilterTagId,
}: Props) {
  const icon = useIconSemantic();
  const isWeb = Platform.OS === "web";
  const [catOpen, setCatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const sortedCats = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.label.localeCompare(b.label)),
    [tags],
  );

  return (
    <>
      <View className="border-b border-neutral-200 bg-neutral-100 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row flex-wrap gap-2">
          {isWeb ? (
            <>
              <WebNativeSelect
                value={categoryToSelectValue(filterCategory)}
                onValueChange={(v) => onFilterCategory(selectValueToCategory(v))}
                options={[
                  { value: CATEGORY_ALL, label: "All categories" },
                  { value: CATEGORY_UNCAT, label: "Uncategorized" },
                  ...sortedCats.map((c) => ({ value: c.id, label: c.name })),
                ]}
                ariaLabel="Filter by category"
              />
              <WebNativeSelect
                value={filterTagId ?? TAG_ALL}
                onValueChange={(v) => onFilterTagId(v === TAG_ALL ? null : v)}
                options={[
                  { value: TAG_ALL, label: "All tags" },
                  ...sortedTags.map((t) => ({ value: t.id, label: t.label })),
                ]}
                ariaLabel="Filter by tag"
              />
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setCatOpen(true)}
                className="min-w-[140px] flex-1 flex-row items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 active:opacity-90 dark:border-neutral-600 dark:bg-neutral-950"
                accessibilityRole="button"
                accessibilityLabel="Filter by category"
              >
                <Text className="flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100" numberOfLines={1}>
                  {categoryButtonLabel(filterCategory, categories)}
                </Text>
                <CaretDown size={18} weight="bold" color={icon.fgMuted} />
              </Pressable>
              <Pressable
                onPress={() => setTagOpen(true)}
                className="min-w-[140px] flex-1 flex-row items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 active:opacity-90 dark:border-neutral-600 dark:bg-neutral-950"
                accessibilityRole="button"
                accessibilityLabel="Filter by tag"
              >
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  {filterTagId ? (
                    <View
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tags.find((t) => t.id === filterTagId)?.color ?? "#737373" }}
                    />
                  ) : null}
                  <Text className="flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100" numberOfLines={1}>
                    {tagButtonLabel(filterTagId, tags)}
                  </Text>
                </View>
                <CaretDown size={18} weight="bold" color={icon.fgMuted} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!isWeb ? (
        <>
          <PickerModal visible={catOpen} title="Category" onClose={() => setCatOpen(false)}>
            <Pressable
              className="mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => {
                onFilterCategory("all");
                setCatOpen(false);
              }}
            >
              <Text className="text-base text-neutral-900 dark:text-neutral-100">All categories</Text>
            </Pressable>
            <Pressable
              className="mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => {
                onFilterCategory("uncategorized");
                setCatOpen(false);
              }}
            >
              <Text className="text-base text-neutral-900 dark:text-neutral-100">Uncategorized</Text>
            </Pressable>
            {sortedCats.map((c) => (
              <Pressable
                key={c.id}
                className={`mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800 ${
                  filterCategory === c.id ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
                onPress={() => {
                  onFilterCategory(c.id);
                  setCatOpen(false);
                }}
              >
                <Text className="text-base text-neutral-900 dark:text-neutral-100">{c.name}</Text>
              </Pressable>
            ))}
          </PickerModal>

          <PickerModal visible={tagOpen} title="Tag" onClose={() => setTagOpen(false)}>
            <Pressable
              className="mx-2 mb-1 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800"
              onPress={() => {
                onFilterTagId(null);
                setTagOpen(false);
              }}
            >
              <Text className="text-base text-neutral-900 dark:text-neutral-100">All tags</Text>
            </Pressable>
            {sortedTags.map((t) => (
              <Pressable
                key={t.id}
                className={`mx-2 mb-1 flex-row items-center gap-3 rounded-lg px-3 py-3 active:bg-neutral-100 dark:active:bg-neutral-800 ${
                  filterTagId === t.id ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
                onPress={() => {
                  onFilterTagId(t.id);
                  setTagOpen(false);
                }}
              >
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                <Text className="text-base text-neutral-900 dark:text-neutral-100">{t.label}</Text>
              </Pressable>
            ))}
          </PickerModal>
        </>
      ) : null}
    </>
  );
}
