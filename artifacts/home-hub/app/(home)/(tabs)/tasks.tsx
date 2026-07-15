import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Pressable,
  Platform, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import {
  useGetTodoLists,
  useGetTodoItems,
  useAddTodoItem,
  useUpdateTodoItem,
  useDeleteTodoItem,
  getGetTodoItemsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

// ─── Icon helper ────────────────────────────────────────────────────────────

const Icon = ({
  name, iosName, size, color,
}: { name: any; iosName: string; size: number; color: string }) => {
  if (Platform.OS === 'ios') return <SymbolView name={iosName} tintColor={color} size={size} />;
  return <FeatherIcon name={name} size={size} color={color} />;
};

// ─── Section definitions ─────────────────────────────────────────────────────

const SECTIONS = [
  {
    name: 'Family To-Do',
    icon: 'users',
    iosIcon: 'person.2.fill',
    color: '#2D6A4F',
    subtitle: 'Shared tasks for everyone',
  },
  {
    name: 'House Projects',
    icon: 'home',
    iosIcon: 'house.fill',
    color: '#457B9D',
    subtitle: 'Main House projects & repairs',
  },
  {
    name: 'Cabin Projects',
    icon: 'map-pin',
    iosIcon: 'mappin.circle.fill',
    color: '#BC6C25',
    subtitle: 'Cabin projects & improvements',
  },
] as const;

type SectionMeta = typeof SECTIONS[number];

// ─── TaskSection ──────────────────────────────────────────────────────────────

function TaskSection({ listId, meta }: { listId: string; meta: SectionMeta }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [newItem, setNewItem] = useState('');

  const { data: items, isLoading } = useGetTodoItems(listId);
  const addItem = useAddTodoItem();
  const updateItem = useUpdateTodoItem();
  const deleteItem = useDeleteTodoItem();

  const incomplete = items?.filter((i) => !i.completed) ?? [];
  const done = items?.filter((i) => i.completed) ?? [];
  const total = (items?.length) ?? 0;

  const handleAdd = () => {
    const text = newItem.trim();
    if (!text) return;
    setNewItem('');
    addItem.mutate(
      { id: listId, data: { content: text } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) }) },
    );
  };

  const handleToggle = (itemId: string, completed: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateItem.mutate(
      { id: itemId, data: { completed: !completed } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) }) },
    );
  };

  const handleDelete = (itemId: string) => {
    deleteItem.mutate(
      { id: itemId },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) }) },
    );
  };

  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* ── Header ── */}
      <Pressable
        style={styles.sectionHeader}
        onPress={() => {
          if (Platform.OS !== 'web') Haptics.selectionAsync();
          setExpanded((e) => !e);
        }}
      >
        <View style={[styles.sectionAccent, { backgroundColor: meta.color }]} />
        <View style={[styles.sectionIconWrap, { backgroundColor: `${meta.color}18` }]}>
          <Icon name={meta.icon} iosName={meta.iosIcon} size={18} color={meta.color} />
        </View>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{meta.name}</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            {total === 0
              ? 'No tasks yet'
              : `${incomplete.length} remaining`}
          </Text>
        </View>
        {total > 0 && (
          <View style={[styles.progressPill, { backgroundColor: `${meta.color}15` }]}>
            <Text style={[styles.progressPillText, { color: meta.color }]}>
              {done.length}/{total}
            </Text>
          </View>
        )}
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          iosName={expanded ? 'chevron.up' : 'chevron.down'}
          size={16}
          color={colors.mutedForeground}
        />
      </Pressable>

      {/* ── Body ── */}
      {expanded && (
        <View>
          {isLoading ? (
            <ActivityIndicator size="small" color={meta.color} style={{ padding: 20 }} />
          ) : (
            <>
              {/* Incomplete items */}
              {incomplete.map((item) => (
                <View
                  key={item.id}
                  style={[styles.itemRow, { borderTopColor: colors.border }]}
                >
                  <Pressable
                    style={styles.checkboxWrap}
                    onPress={() => handleToggle(item.id, item.completed)}
                  >
                    <View style={[styles.checkbox, { borderColor: meta.color }]} />
                  </Pressable>
                  <Text style={[styles.itemText, { color: colors.foreground }]}>
                    {item.content}
                  </Text>
                  <Pressable
                    onPress={() => handleDelete(item.id)}
                    style={styles.deleteBtn}
                  >
                    <Icon name="trash-2" iosName="trash" size={14} color={colors.mutedForeground} />
                  </Pressable>
                </View>
              ))}

              {/* Completed items */}
              {done.length > 0 && (
                <View style={[styles.doneSection, { borderTopColor: colors.border }]}>
                  {done.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.itemRow, { borderTopColor: colors.border }]}
                    >
                      <Pressable
                        style={styles.checkboxWrap}
                        onPress={() => handleToggle(item.id, item.completed)}
                      >
                        <View
                          style={[
                            styles.checkboxDone,
                            { borderColor: meta.color, backgroundColor: meta.color },
                          ]}
                        >
                          <Icon name="check" iosName="checkmark" size={11} color="#fff" />
                        </View>
                      </Pressable>
                      <Text
                        style={[
                          styles.itemText,
                          styles.itemDone,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.content}
                      </Text>
                      <Pressable
                        onPress={() => handleDelete(item.id)}
                        style={styles.deleteBtn}
                      >
                        <Icon name="trash-2" iosName="trash" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* Inline add */}
              <View style={[styles.addRow, { borderTopColor: colors.border }]}>
                <View style={[styles.checkboxWrap, { opacity: 0.25 }]}>
                  <View style={[styles.checkbox, { borderColor: meta.color }]} />
                </View>
                <TextInput
                  style={[styles.addInput, { color: colors.foreground }]}
                  value={newItem}
                  onChangeText={setNewItem}
                  placeholder="Add a task..."
                  placeholderTextColor={colors.mutedForeground}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  blurOnSubmit={false}
                />
                {newItem.trim().length > 0 && (
                  <Pressable
                    onPress={handleAdd}
                    style={[styles.addSendBtn, { backgroundColor: meta.color }]}
                  >
                    <Icon name="arrow-up" iosName="arrow.up" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: lists, isLoading, refetch } = useGetTodoLists();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const getListId = (name: string) => lists?.find((l) => l.name === name)?.id;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Tasks</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} />
        ) : (
          SECTIONS.map((meta) => {
            const listId = getListId(meta.name);
            if (!listId) return null;
            return <TaskSection key={meta.name} listId={listId} meta={meta} />;
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  content: {
    paddingHorizontal: 20,
    gap: 14,
    paddingTop: 4,
  },

  // Section card
  section: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingRight: 16,
    gap: 12,
  },
  sectionAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  progressPillText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingRight: 12,
  },
  checkboxWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  checkboxDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 14,
  },
  itemDone: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  deleteBtn: {
    padding: 8,
  },
  doneSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    opacity: 0.75,
  },

  // Inline add
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingRight: 12,
  },
  addInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    paddingVertical: 14,
  },
  addSendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
