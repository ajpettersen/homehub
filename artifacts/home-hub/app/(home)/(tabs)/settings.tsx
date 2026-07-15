/**
 * Settings — Family Command Center
 *
 * Inspired by Skylight Calendar: person-first layout with color-coded family
 * members, every chore/task assignment visible at a glance, all editable inline.
 */
import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Pressable,
  Platform, Switch, ActivityIndicator, Alert,
  TextInput, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useColors } from '@/hooks/useColors';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetChores,
  useGetFamilyMembers,
  useGetProperties,
  useGetMaintenanceTasks,
  useUpdateChore,
  useUpdateMaintenanceTask,
  useDeleteChore,
  useDeleteMaintenanceTask,
  getGetChoresQueryKey,
  getGetMaintenanceTasksQueryKey,
  Chore,
  FamilyMember,
  MaintenanceTask,
  ChoreFrequency,
} from '@workspace/api-client-react';
import { useProperty } from '@/context/PropertyContext';
import { PropertySwitcher } from '@/components/PropertySwitcher';

// ─── helpers ────────────────────────────────────────────────────────────────

const Icon = ({
  name, iosName, size, color,
}: { name: any; iosName: string; size: number; color: string }) =>
  Platform.OS === 'ios'
    ? <SymbolView name={iosName} tintColor={color} size={size} />
    : <FeatherIcon name={name} size={size} color={color} />;

const FREQ_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 wks',
  monthly: 'Monthly',
  custom: 'Custom',
};

const MAINT_FREQ_OPTIONS = [
  { label: '1 wk', days: 7 },
  { label: '2 wks', days: 14 },
  { label: '1 mo', days: 30 },
  { label: '2 mo', days: 60 },
  { label: '3 mo', days: 90 },
  { label: '6 mo', days: 180 },
  { label: '1 yr', days: 365 },
];

function freqLabel(days: number): string {
  const match = MAINT_FREQ_OPTIONS.find((o) => o.days === days);
  return match ? match.label : `${days}d`;
}

// ─── Member Avatar ──────────────────────────────────────────────────────────

function MemberAvatar({
  member, size = 44, selected, onPress,
}: {
  member: FamilyMember;
  size?: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const initial = member.name.charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.avatarWrap,
        { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 },
        selected && { borderWidth: 2.5, borderColor: member.color },
      ]}
    >
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: member.color },
        ]}
      >
        <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
      </View>
    </Pressable>
  );
}

// ─── Chore Row ──────────────────────────────────────────────────────────────

function ChoreRow({
  chore, members, expanded, onToggle, colors,
}: {
  chore: Chore;
  members: FamilyMember[];
  expanded: boolean;
  onToggle: () => void;
  colors: any;
}) {
  const queryClient = useQueryClient();
  const updateChore = useUpdateChore();
  const deleteChore = useDeleteChore();

  const assignee = members.find((m) => m.id === chore.assigneeId);
  const borderColor = assignee?.color ?? colors.border;

  const handleAssign = (memberId: string | null) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateChore.mutate(
      { id: chore.id, data: { assigneeId: memberId } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() }) },
    );
  };

  const handleFreq = (freq: string) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateChore.mutate(
      { id: chore.id, data: { frequency: freq as any } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() }) },
    );
  };

  const handleDelete = () => {
    Alert.alert('Delete Chore', `Remove "${chore.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteChore.mutate(
          { id: chore.id },
          { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() }) },
        ),
      },
    ]);
  };

  return (
    <View>
      {/* Row */}
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.choreRow,
          { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: borderColor },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.choreRowLeft}>
          <Text style={[styles.choreTitle, { color: colors.foreground }]} numberOfLines={1}>
            {chore.title}
          </Text>
          <View style={styles.choreMeta}>
            <Text style={[styles.choreProperty, { color: colors.mutedForeground }]}>
              {chore.propertyName}
            </Text>
          </View>
        </View>
        <View style={styles.choreRowRight}>
          <View style={[styles.freqChip, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.freqChipText, { color: colors.foreground }]}>
              {FREQ_LABELS[chore.frequency] ?? chore.frequency}
            </Text>
          </View>
          {assignee ? (
            <View style={[styles.smallAvatar, { backgroundColor: assignee.color }]}>
              <Text style={styles.smallAvatarText}>{assignee.name.charAt(0)}</Text>
            </View>
          ) : (
            <View style={[styles.smallAvatar, { backgroundColor: colors.muted }]}>
              <Icon name="user" iosName="person" size={12} color={colors.mutedForeground} />
            </View>
          )}
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            iosName={expanded ? 'chevron.up' : 'chevron.down'}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      {/* Inline editor */}
      {expanded && (
        <View style={[styles.choreEditor, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {/* Assign to */}
          <Text style={[styles.editorLabel, { color: colors.mutedForeground }]}>ASSIGN TO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorRow}>
            <Pressable
              style={[
                styles.assignPill,
                !chore.assigneeId
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
              onPress={() => handleAssign(null)}
            >
              <Text style={[styles.assignPillText, { color: !chore.assigneeId ? colors.primaryForeground : colors.foreground }]}>
                Anyone
              </Text>
            </Pressable>
            {members.map((m) => {
              const isActive = chore.assigneeId === m.id;
              return (
                <Pressable
                  key={m.id}
                  style={[
                    styles.assignPill,
                    isActive
                      ? { backgroundColor: m.color }
                      : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                  onPress={() => handleAssign(m.id)}
                >
                  <Text style={[styles.assignPillText, { color: isActive ? '#fff' : colors.foreground }]}>
                    {m.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Frequency */}
          <Text style={[styles.editorLabel, { color: colors.mutedForeground }]}>HOW OFTEN</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorRow}>
            {Object.values(ChoreFrequency).map((f) => {
              const isActive = chore.frequency === f;
              return (
                <Pressable
                  key={f}
                  style={[
                    styles.assignPill,
                    isActive
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                  onPress={() => handleFreq(f)}
                >
                  <Text style={[styles.assignPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                    {FREQ_LABELS[f] ?? f}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Delete */}
          <Pressable onPress={handleDelete} style={styles.deleteLink}>
            <Icon name="trash-2" iosName="trash" size={14} color={colors.danger} />
            <Text style={[styles.deleteLinkText, { color: colors.danger }]}>Remove chore</Text>
          </Pressable>

          {updateChore.isPending && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Maintenance Row ────────────────────────────────────────────────────────

function MaintenanceRow({
  task, expanded, onToggle, colors, showCleanerOption,
}: {
  task: MaintenanceTask;
  expanded: boolean;
  onToggle: () => void;
  colors: any;
  showCleanerOption: boolean;
}) {
  const queryClient = useQueryClient();
  const updateTask = useUpdateMaintenanceTask();
  const deleteTask = useDeleteMaintenanceTask();
  const [customDays, setCustomDays] = useState('');

  const handleFreq = (days: number) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateTask.mutate(
      { id: task.id, data: { frequencyDays: days } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() }) },
    );
  };

  const handleCleanerToggle = (val: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateTask.mutate(
      { id: task.id, data: { isCleanerTask: val } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() }) },
    );
  };

  const handleDelete = () => {
    Alert.alert('Delete Task', `Remove "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => deleteTask.mutate(
          { id: task.id },
          { onSettled: () => queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() }) },
        ),
      },
    ]);
  };

  const cleanerColor = '#6B7280';
  const borderColor = (showCleanerOption && task.isCleanerTask) ? cleanerColor : colors.primary;

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.choreRow,
          { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: borderColor },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.choreRowLeft}>
          <Text style={[styles.choreTitle, { color: colors.foreground }]} numberOfLines={1}>
            {task.title}
          </Text>
          <View style={styles.choreMeta}>
            <Text style={[styles.choreProperty, { color: colors.mutedForeground }]}>
              {task.category}
            </Text>
          </View>
        </View>
        <View style={styles.choreRowRight}>
          <View style={[styles.freqChip, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.freqChipText, { color: colors.foreground }]}>
              {freqLabel(task.frequencyDays)}
            </Text>
          </View>
          {/* Cleaner badge — Main House only */}
          {showCleanerOption && (
            task.isCleanerTask ? (
              <View style={[styles.cleanerBadge, { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.cleanerBadgeText, { color: cleanerColor }]}>Cleaner</Text>
              </View>
            ) : (
              <View style={[styles.cleanerBadge, { backgroundColor: '#F0FDF4' }]}>
                <Text style={[styles.cleanerBadgeText, { color: colors.primary }]}>Us</Text>
              </View>
            )
          )}
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            iosName={expanded ? 'chevron.up' : 'chevron.down'}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={[styles.choreEditor, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          {/* Frequency */}
          <Text style={[styles.editorLabel, { color: colors.mutedForeground }]}>HOW OFTEN</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editorRow}>
            {MAINT_FREQ_OPTIONS.map((opt) => {
              const isActive = task.frequencyDays === opt.days;
              return (
                <Pressable
                  key={opt.days}
                  style={[
                    styles.assignPill,
                    isActive
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                  ]}
                  onPress={() => handleFreq(opt.days)}
                >
                  <Text style={[styles.assignPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Custom days input */}
          <View style={styles.customDaysRow}>
            <Text style={[styles.editorLabel, { color: colors.mutedForeground }]}>CUSTOM (days)</Text>
            <View style={styles.customDaysInput}>
              <TextInput
                style={[styles.customInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={customDays}
                onChangeText={setCustomDays}
                placeholder={String(task.frequencyDays)}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => {
                  const n = parseInt(customDays, 10);
                  if (n > 0) { handleFreq(n); setCustomDays(''); }
                }}
              />
              <Pressable
                style={[styles.customSetBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const n = parseInt(customDays, 10);
                  if (n > 0) { handleFreq(n); setCustomDays(''); }
                }}
              >
                <Text style={[styles.assignPillText, { color: colors.primaryForeground }]}>Set</Text>
              </Pressable>
            </View>
          </View>

          {showCleanerOption && (
            <View style={styles.cleanerToggleRow}>
              <View>
                <Text style={[styles.editorLabel, { color: colors.mutedForeground }]}>WHO DOES IT</Text>
                <Text style={[styles.cleanerToggleDesc, { color: colors.foreground }]}>
                  {task.isCleanerTask ? 'House cleaner handles this' : 'We handle this ourselves'}
                </Text>
              </View>
              <View style={styles.cleanerSegment}>
                <Pressable
                  style={[
                    styles.segmentBtn,
                    !task.isCleanerTask && { backgroundColor: colors.primary },
                    { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
                  ]}
                  onPress={() => handleCleanerToggle(false)}
                >
                  <Text style={[styles.segmentBtnText, { color: !task.isCleanerTask ? colors.primaryForeground : colors.mutedForeground }]}>
                    Us
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.segmentBtn,
                    task.isCleanerTask && { backgroundColor: '#6B7280' },
                    { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
                  ]}
                  onPress={() => handleCleanerToggle(true)}
                >
                  <Text style={[styles.segmentBtnText, { color: task.isCleanerTask ? '#fff' : colors.mutedForeground }]}>
                    Cleaner
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Delete */}
          <Pressable onPress={handleDelete} style={styles.deleteLink}>
            <Icon name="trash-2" iosName="trash" size={14} color={colors.danger} />
            <Text style={[styles.deleteLinkText, { color: colors.danger }]}>Remove task</Text>
          </Pressable>

          {updateTask.isPending && (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 4 }} />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { selectedProperty } = useProperty();

  const { data: members } = useGetFamilyMembers();
  const { data: allChores, isLoading: isLoadingChores } = useGetChores();
  const { data: tasks, isLoading: isLoadingTasks } = useGetMaintenanceTasks(
    selectedProperty ? { propertyId: selectedProperty.id } : undefined,
  );
  const { data: properties } = useGetProperties();

  const [activeMemberId, setActiveMemberId] = useState<string | 'all'>('all');
  const [expandedChoreId, setExpandedChoreId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetMaintenanceTasksQueryKey() });
    setRefreshing(false);
  };

  const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync(); };

  // Filter chores by active member (and selected property)
  const filteredChores = (allChores ?? []).filter((c) => {
    const memberMatch = activeMemberId === 'all' || c.assigneeId === activeMemberId;
    const propMatch = !selectedProperty || c.propertyId === selectedProperty.id;
    return memberMatch && propMatch;
  });

  // When showing all, group by person
  const groupedChores: { member: FamilyMember | null; chores: Chore[] }[] = React.useMemo(() => {
    if (activeMemberId !== 'all') return [{ member: null, chores: filteredChores }];
    const unassigned = filteredChores.filter((c) => !c.assigneeId);
    const groups = (members ?? []).map((m) => ({
      member: m,
      chores: filteredChores.filter((c) => c.assigneeId === m.id),
    })).filter((g) => g.chores.length > 0);
    if (unassigned.length) groups.push({ member: null, chores: unassigned });
    return groups;
  }, [filteredChores, members, activeMemberId]);

  const humanMembers = (members ?? []).filter((m) => m.role !== 'pet');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Family schedule & preferences</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

        {/* ── Your Family */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Your Family</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
            Tap a member to filter their schedule
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familyRow}>
            {/* "All" button */}
            <Pressable
              onPress={() => { tap(); setActiveMemberId('all'); }}
              style={[
                styles.allMemberPill,
                activeMemberId === 'all'
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.allMemberText, { color: activeMemberId === 'all' ? colors.primaryForeground : colors.mutedForeground }]}>
                All
              </Text>
            </Pressable>

            {(members ?? []).map((m) => (
              <View key={m.id} style={styles.memberCell}>
                <MemberAvatar
                  member={m}
                  size={48}
                  selected={activeMemberId === m.id}
                  onPress={() => { tap(); setActiveMemberId(activeMemberId === m.id ? 'all' : m.id); }}
                />
                <Text style={[styles.memberName, { color: m.role === 'pet' ? colors.mutedForeground : colors.foreground }]}>
                  {m.name}
                </Text>
                <View style={[styles.roleChip, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.roleChipText, { color: colors.mutedForeground }]}>
                    {m.role}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── Chore Schedule */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Chore Schedule</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                {activeMemberId === 'all' ? 'Who does what, how often' : `${members?.find(m => m.id === activeMemberId)?.name}'s chores`}
              </Text>
            </View>
            <PropertySwitcher />
          </View>

          {isLoadingChores ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : filteredChores.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
              <Icon name="check-circle" iosName="checkmark.circle.fill" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No chores yet for this view.
              </Text>
            </View>
          ) : activeMemberId === 'all' ? (
            // Grouped by person
            groupedChores.map((group) => (
              <View key={group.member?.id ?? 'unassigned'} style={styles.choreGroup}>
                <View style={styles.groupHeader}>
                  {group.member ? (
                    <View style={[styles.groupDot, { backgroundColor: group.member.color }]} />
                  ) : (
                    <View style={[styles.groupDot, { backgroundColor: colors.muted }]} />
                  )}
                  <Text style={[styles.groupName, { color: group.member?.color ?? colors.mutedForeground }]}>
                    {group.member?.name ?? 'Unassigned'}
                  </Text>
                  <Text style={[styles.groupCount, { color: colors.mutedForeground }]}>
                    {group.chores.length} {group.chores.length === 1 ? 'chore' : 'chores'}
                  </Text>
                </View>
                {group.chores.map((chore) => (
                  <ChoreRow
                    key={chore.id}
                    chore={chore}
                    members={humanMembers}
                    expanded={expandedChoreId === chore.id}
                    onToggle={() => setExpandedChoreId(expandedChoreId === chore.id ? null : chore.id)}
                    colors={colors}
                  />
                ))}
              </View>
            ))
          ) : (
            // Flat list for selected member
            filteredChores.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                members={humanMembers}
                expanded={expandedChoreId === chore.id}
                onToggle={() => setExpandedChoreId(expandedChoreId === chore.id ? null : chore.id)}
                colors={colors}
              />
            ))
          )}
        </View>

        {/* ── Maintenance Schedule */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Maintenance Schedule</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                Frequency & who's responsible
              </Text>
            </View>
          </View>

          {isLoadingTasks ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : !tasks?.length ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
              <Icon name="tool" iosName="wrench.and.screwdriver" size={24} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks for this property.</Text>
            </View>
          ) : (
            <>
              {/* Us vs Cleaner summary */}
              <View style={[styles.summaryRow, { backgroundColor: colors.secondary }]}>
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryNum, { color: colors.primary }]}>
                    {tasks.filter((t) => !t.isCleanerTask).length}
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Our tasks</Text>
                </View>
                <View style={[styles.summarySep, { backgroundColor: colors.border }]} />
                <View style={styles.summaryCell}>
                  <Text style={[styles.summaryNum, { color: '#6B7280' }]}>
                    {tasks.filter((t) => t.isCleanerTask).length}
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Cleaner tasks</Text>
                </View>
              </View>

              {tasks.map((task) => (
                <MaintenanceRow
                  key={task.id}
                  task={task}
                  expanded={expandedTaskId === task.id}
                  onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                  colors={colors}
                  showCleanerOption={selectedProperty?.type !== 'cabin'}
                />
              ))}
            </>
          )}
        </View>

        {/* ── Properties */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Properties</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>Your registered homes</Text>
          {(properties ?? []).map((p) => (
            <View key={p.id} style={[styles.propertyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.propertyIcon, { backgroundColor: colors.secondary }]}>
                <Icon
                  name={p.type === 'house' ? 'home' : 'map-pin'}
                  iosName={p.type === 'house' ? 'house.fill' : 'location.fill'}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.propertyName, { color: colors.foreground }]}>{p.name}</Text>
                <Text style={[styles.propertyType, { color: colors.mutedForeground }]}>
                  {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                </Text>
              </View>
              <View style={[styles.propTypeBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.propTypeBadgeText, { color: colors.mutedForeground }]}>{p.icon}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── App Settings */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>App</Text>
          <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>Preferences</Text>
          <View style={[styles.appSettingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Icon name="users" iosName="person.2.fill" size={18} color={colors.primary} />
                <View>
                  <Text style={[styles.settingTitle, { color: colors.foreground }]}>Family members</Text>
                  <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                    {members?.length ?? 0} members in your household
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Icon name="home" iosName="house.fill" size={18} color={colors.primary} />
                <View>
                  <Text style={[styles.settingTitle, { color: colors.foreground }]}>Properties</Text>
                  <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                    {properties?.length ?? 0} properties configured
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.settingDivider, { backgroundColor: colors.border }]} />
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Icon name="info" iosName="info.circle.fill" size={18} color={colors.primary} />
                <View>
                  <Text style={[styles.settingTitle, { color: colors.foreground }]}>HomeHub</Text>
                  <Text style={[styles.settingDesc, { color: colors.mutedForeground }]}>
                    Family household manager
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  headerSub: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 24,
    paddingTop: 4,
  },

  // ── Section structure
  sectionCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 14,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },

  // ── Family row
  familyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  memberCell: {
    alignItems: 'center',
    gap: 5,
    width: 68,
  },
  memberName: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roleChipText: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  allMemberPill: {
    height: 56,
    paddingHorizontal: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  allMemberText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
  },

  // ── Chore grouping
  choreGroup: {
    gap: 4,
    marginBottom: 6,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  groupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupName: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    flex: 1,
  },
  groupCount: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },

  // ── Chore row
  choreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    marginBottom: 4,
    gap: 12,
  },
  choreRowLeft: {
    flex: 1,
    gap: 3,
  },
  choreTitle: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  choreMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  choreProperty: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textTransform: 'capitalize',
  },
  choreRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  freqChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  freqChipText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  smallAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallAvatarText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  cleanerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cleanerBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },

  // ── Inline editor
  choreEditor: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 4,
    marginTop: -4,
  },
  editorLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  editorRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  assignPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  assignPillText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  deleteLinkText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },

  // ── Maintenance
  cleanerToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cleanerToggleDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  cleanerSegment: {
    flexDirection: 'row',
    borderRadius: 10,
    overflow: 'hidden',
  },
  segmentBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  segmentBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  customDaysRow: {
    gap: 6,
  },
  customDaysInput: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  customInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  customSetBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 16,
    marginBottom: 4,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryNum: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  summaryLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  summarySep: {
    width: 1,
    marginVertical: 4,
  },

  // ── Properties
  propertyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  propertyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propertyName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  propertyType: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  propTypeBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  propTypeBadgeText: {
    fontSize: 20,
  },

  // ── App settings
  appSettingsCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    gap: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  settingDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  settingDivider: {
    height: 1,
    marginLeft: 50,
  },

  // ── Empty
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
});
