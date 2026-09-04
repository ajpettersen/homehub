import React, { useRef, useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Pressable,
  Platform, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import {
  useGetTodoLists,
  useGetTodoItems,
  useAddTodoItem,
  useUpdateTodoItem,
  useDeleteTodoItem,
  getGetTodoItemsQueryKey,
  type TodoItem,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';

// ─── Icon helper ────────────────────────────────────────────────────────────

const Icon = ({
  name, iosName, size, color,
}: { name: any; iosName: SFSymbol; size: number; color: string }) => {
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

function getLocalDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function relativeDateOnly(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateOnly(date);
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

// ─── TaskSection ──────────────────────────────────────────────────────────────

function TaskSection({ listId, meta }: { listId: string; meta: SectionMeta }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [newItemDueDate, setNewItemDueDate] = useState('');
  const [showNewItemDueDate, setShowNewItemDueDate] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null);
  const [updatingDueDateIds, setUpdatingDueDateIds] = useState<Set<string>>(() => new Set());
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [dueDateError, setDueDateError] = useState('');
  const dueDateMutationLocks = useRef(new Set<string>());

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
    if (newItemDueDate && !isValidDateOnly(newItemDueDate)) {
      setAddError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    setNewItem('');
    addItem.mutate(
      {
        id: listId,
        data: { content: text, ...(newItemDueDate && { dueDate: newItemDueDate }) },
      },
      {
        onSuccess: () => {
          setNewItemDueDate('');
          setShowNewItemDueDate(false);
          setAddError('');
        },
        onError: () => setAddError('Could not add task. Please try again.'),
        onSettled: () => queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) }),
      },
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

  const handleDueDateChange = (itemId: string, dueDate: string | null) => {
    if (dueDateMutationLocks.current.has(itemId)) return;
    dueDateMutationLocks.current.add(itemId);
    setUpdatingDueDateIds(current => new Set(current).add(itemId));
    updateItem.mutate(
      { id: itemId, data: { dueDate } },
      {
        onSuccess: () => {
          setEditingDueDateId(null);
          setDueDateDraft('');
          setDueDateError('');
        },
        onError: () => setDueDateError('Could not update due date.'),
        onSettled: () => {
          dueDateMutationLocks.current.delete(itemId);
          setUpdatingDueDateIds(current => {
            const next = new Set(current);
            next.delete(itemId);
            return next;
          });
          queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) });
        },
      },
    );
  };

  const openDateEditor = (item: TodoItem) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    if (editingDueDateId === item.id) {
      setEditingDueDateId(null);
      setDueDateError('');
      return;
    }
    setEditingDueDateId(item.id);
    setDueDateDraft(item.dueDate ?? '');
    setDueDateError('');
  };

  const applyPickedDate = (itemId: string) => {
    if (!isValidDateOnly(dueDateDraft)) {
      setDueDateError('Enter a valid date as YYYY-MM-DD.');
      return;
    }
    handleDueDateChange(itemId, dueDateDraft);
  };

  const renderItem = (item: TodoItem, completed: boolean) => (
    <View
      key={item.id}
      style={[styles.itemContainer, { borderTopColor: colors.border }]}
    >
      <View style={styles.itemRow}>
        <Pressable
          style={styles.checkboxWrap}
          onPress={() => handleToggle(item.id, item.completed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.completed }}
          accessibilityLabel={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.content}`}
          testID={`task-toggle-${item.id}`}
        >
          {completed ? (
            <View
              style={[
                styles.checkboxDone,
                { borderColor: meta.color, backgroundColor: meta.color },
              ]}
            >
              <Icon name="check" iosName="checkmark" size={11} color="#fff" />
            </View>
          ) : (
            <View style={[styles.checkbox, { borderColor: meta.color }]} />
          )}
        </Pressable>
        <View style={styles.itemContent}>
          <Text
            style={[
              styles.itemText,
              completed && styles.itemDone,
              { color: completed ? colors.mutedForeground : colors.foreground },
            ]}
          >
            {item.content}
          </Text>
          {item.dueDate && (
            <Text style={[styles.dueDateText, { color: colors.mutedForeground }]}>
              Due {format(parseISO(item.dueDate), 'MMM d')}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => openDateEditor(item)}
          style={[styles.itemActionBtn, updatingDueDateIds.has(item.id) && { opacity: 0.5 }]}
          disabled={updatingDueDateIds.has(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Change due date for ${item.content}`}
          accessibilityState={{ expanded: editingDueDateId === item.id }}
          testID={`task-due-date-${item.id}`}
        >
          <Icon name="calendar" iosName="calendar" size={15} color={meta.color} />
        </Pressable>
        <Pressable
          onPress={() => handleDelete(item.id)}
          style={styles.itemActionBtn}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.content}`}
          testID={`task-delete-${item.id}`}
        >
          <Icon name="trash-2" iosName="trash" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {editingDueDateId === item.id && (
        <View style={styles.dateEditor}>
          <View style={styles.snoozeRow}>
            <Pressable
              style={[styles.snoozeBtn, { borderColor: colors.border }, updatingDueDateIds.has(item.id) && { opacity: 0.5 }]}
              onPress={() => handleDueDateChange(item.id, relativeDateOnly(1))}
              disabled={updatingDueDateIds.has(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${item.content} until tomorrow`}
              testID={`task-snooze-tomorrow-${item.id}`}
            >
              <Text style={[styles.snoozeText, { color: meta.color }]}>Tomorrow</Text>
            </Pressable>
            <Pressable
              style={[styles.snoozeBtn, { borderColor: colors.border }, updatingDueDateIds.has(item.id) && { opacity: 0.5 }]}
              onPress={() => handleDueDateChange(item.id, relativeDateOnly(7))}
              disabled={updatingDueDateIds.has(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${item.content} until next week`}
              testID={`task-snooze-next-week-${item.id}`}
            >
              <Text style={[styles.snoozeText, { color: meta.color }]}>Next week</Text>
            </Pressable>
            {item.dueDate && (
              <Pressable
                style={[styles.snoozeBtn, { borderColor: colors.border }, updatingDueDateIds.has(item.id) && { opacity: 0.5 }]}
                onPress={() => handleDueDateChange(item.id, null)}
                disabled={updatingDueDateIds.has(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Clear due date for ${item.content}`}
                testID={`task-due-date-clear-${item.id}`}
              >
                <Text style={[styles.snoozeText, { color: colors.mutedForeground }]}>Clear</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.pickDateRow}>
            <TextInput
              style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border }]}
              value={dueDateDraft}
              onChangeText={(value) => {
                setDueDateDraft(value);
                setDueDateError('');
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="numbers-and-punctuation"
              editable={!updatingDueDateIds.has(item.id)}
              accessibilityLabel={`Picked due date for ${item.content}`}
              testID={`task-due-date-input-${item.id}`}
            />
            <Pressable
              style={[styles.setDateBtn, { backgroundColor: meta.color }, updatingDueDateIds.has(item.id) && { opacity: 0.5 }]}
              onPress={() => applyPickedDate(item.id)}
              disabled={updatingDueDateIds.has(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Set picked due date for ${item.content}`}
              testID={`task-due-date-set-${item.id}`}
            >
              <Icon name="check" iosName="checkmark" size={14} color="#fff" />
            </Pressable>
          </View>
          {dueDateError ? (
            <Text style={[styles.errorText, { color: colors.danger }]} accessibilityRole="alert">
              {dueDateError}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );

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
              {incomplete.map((item) => renderItem(item, false))}

              {/* Completed items */}
              {done.length > 0 && (
                <View style={[styles.doneSection, { borderTopColor: colors.border }]}>
                  {done.map((item) => renderItem(item, true))}
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
                  accessibilityLabel={`New task for ${meta.name}`}
                  testID={`task-add-input-${listId}`}
                />
                <Pressable
                  onPress={() => setShowNewItemDueDate((shown) => !shown)}
                  style={styles.itemActionBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Add an optional due date"
                  accessibilityState={{ expanded: showNewItemDueDate }}
                  testID={`task-add-due-date-${listId}`}
                >
                  <Icon name="calendar" iosName="calendar" size={15} color={meta.color} />
                </Pressable>
                {newItem.trim().length > 0 && (
                  <Pressable
                    onPress={handleAdd}
                    style={[styles.addSendBtn, { backgroundColor: meta.color }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add task to ${meta.name}`}
                    testID={`task-add-submit-${listId}`}
                  >
                    <Icon name="arrow-up" iosName="arrow.up" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
              {showNewItemDueDate && (
                <View style={styles.addDateArea}>
                  <TextInput
                    style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border }]}
                    value={newItemDueDate}
                    onChangeText={(value) => {
                      setNewItemDueDate(value);
                      setAddError('');
                    }}
                    placeholder="Optional due date (YYYY-MM-DD)"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numbers-and-punctuation"
                    accessibilityLabel="Optional due date for new task"
                    testID={`task-add-due-date-input-${listId}`}
                  />
                  {newItemDueDate ? (
                    <Pressable
                      style={styles.itemActionBtn}
                      onPress={() => {
                        setNewItemDueDate('');
                        setAddError('');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Clear new task due date"
                      testID={`task-add-due-date-clear-${listId}`}
                    >
                      <Icon name="x" iosName="xmark" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  ) : null}
                </View>
              )}
              {addError ? (
                <Text style={[styles.addErrorText, { color: colors.destructive }]} accessibilityRole="alert">
                  {addError}
                </Text>
              ) : null}
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
  itemContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  itemContent: {
    flex: 1,
    paddingVertical: 11,
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
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  dueDateText: {
    marginTop: 3,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  itemDone: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  itemActionBtn: {
    padding: 8,
  },
  dateEditor: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  snoozeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  snoozeBtn: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 18,
  },
  snoozeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  pickDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  setDateBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
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
  addDateArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 4,
  },
  addErrorText: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
