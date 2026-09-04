import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, RefreshControl,
  Pressable, Platform, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { format, addDays, parseISO } from 'date-fns';
import {
  useGetMaintenanceTasks,
  useCreateMaintenanceTask,
  useCompleteMaintenanceTask,
  useUpdateMaintenanceTask,
  useDeleteMaintenanceTask,
  useGetFamilyMembers,
  getGetDashboardQueryKey,
  getGetMaintenanceTasksQueryKey,
  MaintenanceTask,
  MaintenanceTaskCategory,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { PropertySwitcher } from '@/components/PropertySwitcher';
import { useProperty } from '@/context/PropertyContext';
import { useActiveMember } from '@/context/ActiveMemberContext';

const Icon = ({ name, iosName, size, color }: { name: any; iosName: string; size: number; color: string }) => {
  if (Platform.OS === 'ios') return <SymbolView name={iosName as any} tintColor={color} size={size} />;
  return <FeatherIcon name={name} size={size} color={color} />;
};

function getResolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return format(parseISO(value), 'yyyy-MM-dd') === value;
  } catch {
    return false;
  }
}

function UrgencyBadge({ task, colors }: { task: MaintenanceTask; colors: any }) {
  const bg = task.isOverdue ? '#FEF2F2' : task.isDueSoon ? '#FEF9C3' : '#F0FDF4';
  const fg = task.isOverdue ? colors.danger : task.isDueSoon ? '#B45309' : colors.success;
  const label = task.isOverdue ? 'Overdue' : task.isDueSoon ? 'Due Soon' : 'Upcoming';
  return (
    <View style={[styles.urgencyBadge, { backgroundColor: bg }]}>
      <Text style={[styles.urgencyText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function TaskCard({
  task,
  onMarkDone,
  onDelete,
  colors,
  isPending,
  isDeleting,
  onDueDateChange,
  isUpdatingDueDate,
}: {
  task: MaintenanceTask;
  onMarkDone: (task: MaintenanceTask) => void;
  onDelete: (task: MaintenanceTask) => void;
  colors: any;
  isPending: boolean;
  isDeleting: boolean;
  onDueDateChange: (task: MaintenanceTask, nextDueDate: string) => void;
  isUpdatingDueDate: boolean;
}) {
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDate, setDueDate] = useState(task.nextDueDate);
  const lastDoneText = task.lastCompletedAt
    ? `Done ${format(new Date(task.lastCompletedAt), 'MMM d')}${task.lastCompletedBy ? ` by ${task.lastCompletedBy}` : ''}`
    : 'Never completed';

  return (
    <View style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.taskTop}>
        <Text style={[styles.taskTitle, { color: colors.foreground }]} numberOfLines={2}>{task.title}</Text>
        <UrgencyBadge task={task} colors={colors} />
      </View>
      {task.description ? (
        <Text style={[styles.taskDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}
      <View style={styles.taskBottom}>
        <View style={styles.taskMeta}>
          <Icon name="calendar" iosName="calendar" size={13} color={colors.mutedForeground} />
          <Text style={[styles.taskMetaText, { color: colors.mutedForeground }]}>
            {format(parseISO(task.nextDueDate), 'MMM d')} · {task.scheduleType === 'one-time' ? 'one-time task' : `every ${task.frequencyDays}d`}
          </Text>
        </View>
        <View style={styles.taskMeta}>
          <Icon name="clock" iosName="clock" size={13} color={colors.mutedForeground} />
          <Text style={[styles.taskMetaText, { color: colors.mutedForeground }]}>{lastDoneText}</Text>
        </View>
      </View>
      <View style={styles.taskActions}>
        <Pressable
          style={({ pressed }) => [
            styles.doneBtn,
            { backgroundColor: task.isOverdue ? colors.danger : colors.primary },
            (pressed || isPending) && { opacity: 0.7 },
          ]}
          onPress={() => onMarkDone(task)}
          disabled={isPending || isDeleting}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Icon name="check" iosName="checkmark" size={15} color="#fff" />
              <Text style={styles.doneBtnText}>Mark Done</Text>
            </>
          )}
        </Pressable>
        <Pressable
          testID={`maintenance-delete-${task.id}`}
          accessibilityLabel={`Delete ${task.title}`}
          accessibilityHint="Permanently removes this maintenance task"
          hitSlop={8}
          style={({ pressed }) => [
            styles.deleteBtn,
            { borderColor: colors.danger },
            (pressed || isDeleting) && { opacity: 0.6 },
          ]}
          onPress={() => onDelete(task)}
          disabled={isPending || isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Icon name="trash-2" iosName="trash" size={16} color={colors.danger} />
              <Text style={[styles.deleteBtnText, { color: colors.danger }]}>Delete</Text>
            </>
          )}
        </Pressable>
      </View>
      <View style={styles.dueDateActions}>
        <Pressable
          testID={`maintenance-snooze-tomorrow-${task.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Snooze ${task.title} until tomorrow`}
          style={({ pressed }) => [
            styles.snoozeBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
            (pressed || isUpdatingDueDate) && { opacity: 0.6 },
          ]}
          onPress={() => {
            const nextDueDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
            setDueDate(nextDueDate);
            onDueDateChange(task, nextDueDate);
          }}
          disabled={isPending || isDeleting || isUpdatingDueDate}
        >
          <Text style={[styles.snoozeBtnText, { color: colors.foreground }]}>Tomorrow</Text>
        </Pressable>
        <Pressable
          testID={`maintenance-snooze-next-week-${task.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Snooze ${task.title} until next week`}
          style={({ pressed }) => [
            styles.snoozeBtn,
            { borderColor: colors.border, backgroundColor: colors.card },
            (pressed || isUpdatingDueDate) && { opacity: 0.6 },
          ]}
          onPress={() => {
            const nextDueDate = format(addDays(new Date(), 7), 'yyyy-MM-dd');
            setDueDate(nextDueDate);
            onDueDateChange(task, nextDueDate);
          }}
          disabled={isPending || isDeleting || isUpdatingDueDate}
        >
          <Text style={[styles.snoozeBtnText, { color: colors.foreground }]}>Next week</Text>
        </Pressable>
        <Pressable
          testID={`maintenance-pick-date-${task.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Choose next due date for ${task.title}`}
          accessibilityState={{ expanded: editingDueDate }}
          style={({ pressed }) => [
            styles.snoozeBtn,
            { borderColor: colors.primary, backgroundColor: colors.card },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setEditingDueDate((current) => !current)}
          disabled={isPending || isDeleting || isUpdatingDueDate}
        >
          <Text style={[styles.snoozeBtnText, { color: colors.primary }]}>Pick date</Text>
        </Pressable>
      </View>
      {editingDueDate && (
        <View style={styles.dateEditor}>
          <TextInput
            testID={`maintenance-date-input-${task.id}`}
            accessibilityLabel={`Next due date for ${task.title}, YYYY-MM-DD`}
            style={[styles.dateInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            value={dueDate}
            onChangeText={setDueDate}
            keyboardType="numbers-and-punctuation"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            editable={!isUpdatingDueDate}
            maxLength={10}
          />
          <Pressable
            testID={`maintenance-save-date-${task.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Save next due date for ${task.title}`}
            style={({ pressed }) => [
              styles.saveDateBtn,
              { backgroundColor: colors.primary },
              (!isValidDateOnly(dueDate) || pressed || isUpdatingDueDate) && { opacity: 0.6 },
            ]}
            disabled={!isValidDateOnly(dueDate) || isUpdatingDueDate}
            onPress={() => {
              onDueDateChange(task, dueDate);
              setEditingDueDate(false);
            }}
          >
            {isUpdatingDueDate
              ? <ActivityIndicator size="small" color={colors.primaryForeground} />
              : <Text style={[styles.saveDateText, { color: colors.primaryForeground }]}>Save</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function TaskSection({
  title,
  tasks,
  onMarkDone,
  onDelete,
  colors,
  pendingId,
  deletingId,
  updatingDueDateId,
  onDueDateChange,
  emptyText,
}: {
  title: string;
  tasks: MaintenanceTask[];
  onMarkDone: (task: MaintenanceTask) => void;
  onDelete: (task: MaintenanceTask) => void;
  colors: any;
  pendingId: string | null;
  deletingId: string | null;
  updatingDueDateId: string | null;
  onDueDateChange: (task: MaintenanceTask, nextDueDate: string) => void;
  emptyText?: string;
}) {
  const overdue = tasks.filter((t) => t.isOverdue);
  const dueSoon = tasks.filter((t) => t.isDueSoon && !t.isOverdue);
  const upcoming = tasks.filter((t) => !t.isDueSoon && !t.isOverdue);

  if (tasks.length === 0 && emptyText) {
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
          <Icon name="check-circle" iosName="checkmark.circle.fill" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyText}</Text>
        </View>
      </View>
    );
  }

  if (tasks.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      {overdue.length > 0 && (
        <View style={styles.subSection}>
          <Text style={[styles.subSectionLabel, { color: colors.danger }]}>Needs attention</Text>
          {overdue.map((t) => (
            <TaskCard key={t.id} task={t} onMarkDone={onMarkDone} onDelete={onDelete} colors={colors} isPending={pendingId === t.id} isDeleting={deletingId === t.id} onDueDateChange={onDueDateChange} isUpdatingDueDate={updatingDueDateId === t.id} />
          ))}
        </View>
      )}
      {dueSoon.length > 0 && (
        <View style={styles.subSection}>
          <Text style={[styles.subSectionLabel, { color: '#B45309' }]}>Due soon</Text>
          {dueSoon.map((t) => (
            <TaskCard key={t.id} task={t} onMarkDone={onMarkDone} onDelete={onDelete} colors={colors} isPending={pendingId === t.id} isDeleting={deletingId === t.id} onDueDateChange={onDueDateChange} isUpdatingDueDate={updatingDueDateId === t.id} />
          ))}
        </View>
      )}
      {upcoming.length > 0 && (
        <View style={styles.subSection}>
          <Text style={[styles.subSectionLabel, { color: colors.mutedForeground }]}>Upcoming</Text>
          {upcoming.map((t) => (
            <TaskCard key={t.id} task={t} onMarkDone={onMarkDone} onDelete={onDelete} colors={colors} isPending={pendingId === t.id} isDeleting={deletingId === t.id} onDueDateChange={onDueDateChange} isUpdatingDueDate={updatingDueDateId === t.id} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { selectedProperty } = useProperty();
  const { data: members } = useGetFamilyMembers();
  const { activeMember } = useActiveMember();
  const timezone = getResolvedTimeZone();
  const maintenanceQuery = {
    ...(selectedProperty && { propertyId: selectedProperty.id }),
    timezone,
  };

  const { data: tasks, isLoading } = useGetMaintenanceTasks(maintenanceQuery);

  const completeTask = useCompleteMaintenanceTask();
  const createTask = useCreateMaintenanceTask();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();

  const [refreshing, setRefreshing] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingDueDateId, setUpdatingDueDateId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<MaintenanceTask | null>(null);

  // "Who did it?" sheet
  const [whoSheet, setWhoSheet] = useState<{ task: MaintenanceTask } | null>(null);
  // Add task modal
  const [isAddVisible, setIsAddVisible] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    category: 'other',
    scheduleType: 'recurring' as 'recurring' | 'one-time',
    frequencyDays: '30',
    dueDate: '',
    isCleanerTask: false,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
    setRefreshing(false);
  };

  const handleMarkDone = (task: MaintenanceTask) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWhoSheet({ task });
  };

  const handleConfirmDone = (task: MaintenanceTask, completedBy: string) => {
    setWhoSheet(null);
    setPendingId(task.id);
    completeTask.mutate(
      {
        id: task.id,
        data: {
          completedBy,
          ...(task.scheduleType === 'recurring' && { timezone }),
        },
      },
      {
        onSettled: () => {
          setPendingId(null);
          queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  };

  const handleDelete = (task: MaintenanceTask) => {
    setDeleteCandidate(task);
  };

  const handleDueDateChange = (task: MaintenanceTask, nextDueDate: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setUpdatingDueDateId(task.id);
    updateTask.mutate(
      {
        id: task.id,
        data: {
          nextDueDate,
          ...(task.scheduleType === 'recurring' && { timezone }),
        },
      },
      {
        onSettled: () => {
          setUpdatingDueDateId(null);
          queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteCandidate) return;
    const task = deleteCandidate;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteCandidate(null);
    setDeletingId(task.id);
    deleteTask.mutate(
      { id: task.id },
      {
        onSettled: () => {
          setDeletingId(null);
          queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      },
    );
  };

  const handleCreate = () => {
    const isOneTime = newTask.scheduleType === 'one-time';
    if (!newTask.title || !selectedProperty || (isOneTime && !/^\d{4}-\d{2}-\d{2}$/.test(newTask.dueDate))) return;
    const nextDate = isOneTime
      ? newTask.dueDate
      : addDays(new Date(), parseInt(newTask.frequencyDays, 10) || 30).toISOString().split('T')[0];
    createTask.mutate(
      {
        data: {
          title: newTask.title,
          propertyId: selectedProperty.id,
          category: newTask.category as any,
          scheduleType: newTask.scheduleType,
          frequencyDays: isOneTime ? undefined : parseInt(newTask.frequencyDays, 10) || 30,
          isCleanerTask: newTask.isCleanerTask,
          nextDueDate: nextDate,
        },
      },
      {
        onSuccess: () => {
          setIsAddVisible(false);
          setNewTask({ title: '', category: 'other', scheduleType: 'recurring', frequencyDays: '30', dueDate: '', isCleanerTask: false });
          queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
        },
      },
    );
  };

  const isCabin = selectedProperty?.type === 'cabin';
  const yourTasks = tasks?.filter((t) => !t.isCleanerTask) ?? [];
  const cleanerTasks = tasks?.filter((t) => t.isCleanerTask) ?? [];

  // Who options: parents + "Cleaner"
  const whoOptions = [
    ...(members?.filter((m) => m.role === 'parent') ?? []).map((m) => ({ id: m.id, name: m.name, color: m.color })),
    { id: 'cleaner', name: 'Cleaner', color: '#6B7280' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Maintenance</Text>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={() => setIsAddVisible(true)}
        >
          <Icon name="plus" iosName="plus" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Property switcher */}
      <View style={styles.switcherRow}>
        <PropertySwitcher />
      </View>

      {isCabin && (
        <View style={styles.contextBanner}>
          <Icon name="map-pin" iosName="location.fill" size={14} color={colors.primary} />
          <Text style={[styles.contextText, { color: colors.primary }]}>
            Showing tasks for when you're at the cabin
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : isCabin ? (
          <TaskSection
            title="On-Site Tasks"
            tasks={tasks ?? []}
            onMarkDone={handleMarkDone}
            onDelete={handleDelete}
            colors={colors}
            pendingId={pendingId}
            deletingId={deletingId}
            updatingDueDateId={updatingDueDateId}
            onDueDateChange={handleDueDateChange}
            emptyText="No cabin tasks yet. Tap + to add one."
          />
        ) : (
          <>
            <TaskSection
              title="Your Tasks"
              tasks={yourTasks}
              onMarkDone={handleMarkDone}
              onDelete={handleDelete}
              colors={colors}
              pendingId={pendingId}
              deletingId={deletingId}
              updatingDueDateId={updatingDueDateId}
              onDueDateChange={handleDueDateChange}
              emptyText="No personal tasks for this property."
            />
            <TaskSection
              title="Cleaner's Checklist"
              tasks={cleanerTasks}
              onMarkDone={handleMarkDone}
              onDelete={handleDelete}
              colors={colors}
              pendingId={pendingId}
              deletingId={deletingId}
              updatingDueDateId={updatingDueDateId}
              onDueDateChange={handleDueDateChange}
              emptyText="No cleaner tasks yet. Add one with the + button."
            />
          </>
        )}
      </ScrollView>

      {/* Who did it? sheet */}
      <Modal visible={!!whoSheet} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Who completed this?</Text>
            {whoSheet && (
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
                {whoSheet.task.title}
              </Text>
            )}
            <View style={styles.whoGrid}>
              {whoOptions.map((who) => (
                <Pressable
                  key={who.id}
                  style={({ pressed }) => [
                    styles.whoOption,
                    { backgroundColor: colors.card, borderColor: activeMember?.name === who.name ? who.color : colors.border, borderWidth: activeMember?.name === who.name ? 2 : 1 },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => whoSheet && handleConfirmDone(whoSheet.task, who.name)}
                >
                  <View style={[styles.whoAvatar, { backgroundColor: who.color }]}>
                    <Text style={styles.whoAvatarText}>{who.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.whoName, { color: colors.foreground }]}>{who.name}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => setWhoSheet(null)}
            >
              <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Delete confirmation sheet */}
      <Modal
        visible={!!deleteCandidate}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteCandidate(null)}
      >
        <View style={styles.modalOverlay} accessibilityViewIsModal>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={[styles.deleteConfirmIcon, { backgroundColor: colors.secondary }]}>
              <Icon name="trash-2" iosName="trash" size={24} color={colors.danger} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Delete {deleteCandidate?.scheduleType === 'recurring' ? 'recurring ' : ''}task?
            </Text>
            <Text style={[styles.deleteConfirmMessage, { color: colors.mutedForeground }]}>
              {deleteCandidate?.scheduleType === 'recurring'
                ? 'This will permanently stop this recurring task from appearing for this property.'
                : 'This will permanently remove this one-time task from this property.'}
            </Text>
            <View style={[styles.deleteTaskPreview, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.deleteTaskPreviewText, { color: colors.foreground }]} numberOfLines={2}>
                {deleteCandidate?.title}
              </Text>
            </View>
            <View style={styles.deleteConfirmActions}>
              <Pressable
                testID="cancel-maintenance-delete"
                style={({ pressed }) => [
                  styles.deleteConfirmButton,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setDeleteCandidate(null)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="confirm-maintenance-delete"
                style={({ pressed }) => [
                  styles.deleteConfirmButton,
                  { backgroundColor: colors.danger, borderColor: colors.danger },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleConfirmDelete}
              >
                <Text style={styles.deleteConfirmButtonText}>Delete task</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Task Modal */}
      <Modal visible={isAddVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Task</Text>
              <Pressable onPress={() => setIsAddVisible(false)}>
                <Icon name="x" iosName="xmark" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Task Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newTask.title}
                onChangeText={(t) => setNewTask((p) => ({ ...p, title: t }))}
                placeholder="e.g. Clean gutters"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Schedule</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[
                  { value: 'recurring', label: 'Repeat' },
                  { value: 'one-time', label: 'One time' },
                ].map((option) => (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.pill,
                      newTask.scheduleType === option.value
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                    ]}
                    onPress={() => setNewTask((p) => ({ ...p, scheduleType: option.value as 'recurring' | 'one-time' }))}
                  >
                    <Text style={[styles.pillText, { color: newTask.scheduleType === option.value ? colors.primaryForeground : colors.foreground }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  {newTask.scheduleType === 'one-time' ? 'Due date (YYYY-MM-DD)' : 'Every (days)'}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={newTask.scheduleType === 'one-time' ? newTask.dueDate : newTask.frequencyDays}
                  onChangeText={(t) => setNewTask((p) => (
                    newTask.scheduleType === 'one-time' ? { ...p, dueDate: t } : { ...p, frequencyDays: t }
                  ))}
                  keyboardType={newTask.scheduleType === 'one-time' ? 'numbers-and-punctuation' : 'number-pad'}
                  placeholder={newTask.scheduleType === 'one-time' ? '2026-09-15' : '30'}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              {!isCabin && (
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Who does it?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <Pressable
                      style={[styles.pill, !newTask.isCleanerTask ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                      onPress={() => setNewTask((p) => ({ ...p, isCleanerTask: false }))}
                    >
                      <Text style={[styles.pillText, { color: !newTask.isCleanerTask ? colors.primaryForeground : colors.foreground }]}>Us</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.pill, newTask.isCleanerTask ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                      onPress={() => setNewTask((p) => ({ ...p, isCleanerTask: true }))}
                    >
                      <Text style={[styles.pillText, { color: newTask.isCleanerTask ? colors.primaryForeground : colors.foreground }]}>Cleaner</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Object.values(MaintenanceTaskCategory).map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.pill, newTask.category === cat ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewTask((p) => ({ ...p, category: cat }))}
                  >
                    <Text style={[styles.pillText, { color: newTask.category === cat ? colors.primaryForeground : colors.foreground }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                (!newTask.title || !selectedProperty || (newTask.scheduleType === 'one-time' && !/^\d{4}-\d{2}-\d{2}$/.test(newTask.dueDate))) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
              onPress={handleCreate}
              disabled={!newTask.title || !selectedProperty || createTask.isPending || (newTask.scheduleType === 'one-time' && !/^\d{4}-\d{2}-\d{2}$/.test(newTask.dueDate))}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>Add Task</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  addButton: {
    width: 40, height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherRow: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 24,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
  },
  contextText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 28,
    paddingTop: 8,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  subSection: {
    gap: 8,
  },
  subSectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  taskCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  taskDesc: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  taskBottom: {
    gap: 4,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taskMetaText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  taskActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dueDateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  snoozeBtn: {
    minHeight: 44,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  snoozeBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  dateEditor: {
    flexDirection: 'row',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  saveDateBtn: {
    minWidth: 72,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDateText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 48,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  deleteBtn: {
    minHeight: 48,
    minWidth: 82,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 12,
  },
  deleteBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  urgencyText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyCard: {
    padding: 28,
    borderRadius: 16,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 16,
    gap: 16,
  },
  modalHandle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  modalSubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    marginTop: -8,
  },
  whoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  whoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: '45%',
    flex: 1,
  },
  whoAvatar: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whoAvatarText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  whoName: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  cancelBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  deleteConfirmIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmMessage: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  deleteTaskPreview: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deleteTaskPreviewText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  deleteConfirmButton: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  formGroup: { gap: 8 },
  formRow: { flexDirection: 'row', gap: 12 },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  submitButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
});
