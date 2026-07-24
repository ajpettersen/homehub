/**
 * Cleaner view — shows only chores at the cleaner's assigned property
 * that are explicitly assigned to their linked family member.
 */
import React, { useState } from 'react';
import {
  StyleSheet, Text, View, ScrollView, Pressable, Platform,
  TextInput, ActivityIndicator, Modal, KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useAuth, useClerk } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetMe,
  useGetChores,
  useCompleteChore,
  getGetChoresQueryKey,
  type Chore,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

const Icon = ({ name, iosName, size, color }: { name: any; iosName: string; size: number; color: string }) =>
  Platform.OS === 'ios'
    ? <SymbolView name={iosName} tintColor={color} size={size} />
    : <FeatherIcon name={name} size={size} color={color} />;

function fmtDate(d: string | null | undefined) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Complete Modal ──────────────────────────────────────────────────────────

function CompleteModal({
  chore,
  cleanerName,
  visible,
  onClose,
  onDone,
}: {
  chore: Chore | null;
  cleanerName: string;
  visible: boolean;
  onClose: () => void;
  onDone: (note: string) => void;
}) {
  const colors = useColors();
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    onDone(note.trim());
    setNote('');
  };

  if (!chore) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalRoot, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalHandle} />
        <Text style={[styles.modalTitle, { color: colors.foreground }]}>Mark Complete</Text>
        <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>{chore.title}</Text>

        <Text style={[styles.modalLabel, { color: colors.foreground }]}>Add a note (optional)</Text>
        <TextInput
          style={[styles.modalInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          placeholder="e.g. All rooms done, replaced soap"
          placeholderTextColor={colors.mutedForeground}
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.completeBtn, { backgroundColor: colors.primary }]}
          onPress={handleSubmit}
        >
          <Icon name="check" iosName="checkmark" size={18} color="#fff" />
          <Text style={styles.completeBtnText}>Mark as Done</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({ chore, onComplete, colors }: { chore: Chore; onComplete: () => void; colors: any }) {
  const isOverdue = chore.isOverdue;
  const isDone = !!chore.completedAt;

  const statusColor = isDone ? '#22C55E' : isOverdue ? '#EF4444' : colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: statusColor, borderLeftWidth: 3 }]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }, isDone && styles.cardTitleDone]}>{chore.title}</Text>
          {chore.dueDate && (
            <Text style={[styles.cardDate, { color: isOverdue ? '#EF4444' : colors.mutedForeground }]}>
              {isDone ? `Done ${fmtDate(chore.completedAt?.split('T')[0])}` : `Due ${fmtDate(chore.dueDate)}`}
              {isOverdue && ' · Overdue'}
            </Text>
          )}
          {isDone && chore.completionNote && (
            <Text style={[styles.cardNote, { color: colors.mutedForeground }]}>💬 {chore.completionNote}</Text>
          )}
        </View>

        {isDone ? (
          <View style={[styles.doneTag, { backgroundColor: '#22C55E18' }]}>
            <Icon name="check-circle" iosName="checkmark.circle.fill" size={18} color="#22C55E" />
          </View>
        ) : (
          <Pressable
            style={[styles.completeTag, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}
            onPress={onComplete}
            hitSlop={8}
          >
            <Icon name="check" iosName="checkmark" size={14} color={colors.primary} />
            <Text style={[styles.completeTagText, { color: colors.primary }]}>Done</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.freqTag, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.freqTagText, { color: colors.mutedForeground }]}>{chore.frequency}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CleanerTaskList() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();

  const [showDone, setShowDone] = useState(false);
  const [completing, setCompleting] = useState<Chore | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn } as any });

  const hasProfile = !!me?.linkedFamilyMemberId && !!me?.allowedPropertyId;
  const { data: chores, isLoading } = useGetChores(
    hasProfile
      ? { assigneeId: me!.linkedFamilyMemberId!, propertyId: me!.allowedPropertyId! }
      : undefined,
    { query: { enabled: hasProfile } as any },
  );

  const completeChore = useCompleteChore();

  const pending = (chores ?? []).filter((c) => !c.completedAt);
  const done = (chores ?? []).filter((c) => !!c.completedAt);
  const displayed = showDone ? done : pending;

  const handleMarkDone = (note: string) => {
    if (!completing) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeChore.mutate(
      { id: completing.id, data: { completedBy: me?.linkedFamilyMemberName ?? 'Cleaner', note } },
      {
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
          setCompleting(null);
        },
      },
    );
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
    setRefreshing(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerGreeting, { color: colors.mutedForeground }]}>{greeting} 🧹</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {me?.allowedPropertyName ?? 'Your Tasks'}
          </Text>
        </View>
        <Pressable
          style={[styles.signOutBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={() => signOut()}
          hitSlop={8}
        >
          <Icon name="log-out" iosName="rectangle.portrait.and.arrow.right" size={16} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Tab bar: Pending / Done */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          style={[styles.tab, !showDone && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setShowDone(false)}
        >
          <Text style={[styles.tabText, { color: !showDone ? colors.primary : colors.mutedForeground }, !showDone && { fontFamily: 'Inter_600SemiBold' }]}>
            Pending{pending.length > 0 ? ` (${pending.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, showDone && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setShowDone(true)}
        >
          <Text style={[styles.tabText, { color: showDone ? colors.primary : colors.mutedForeground }, showDone && { fontFamily: 'Inter_600SemiBold' }]}>
            Done{done.length > 0 ? ` (${done.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Task list */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !me?.linkedFamilyMemberId ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>⚙️</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Not fully set up yet</Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            Ask your household admin to link your account to a family member and property in Settings → Users.
          </Text>
        </View>
      ) : displayed.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>{showDone ? '🎉' : '✅'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {showDone ? 'No completed tasks yet' : 'All caught up!'}
          </Text>
          <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
            {showDone ? 'Completed tasks will show here.' : 'No pending tasks assigned to you.'}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {displayed.map((chore) => (
            <TaskCard
              key={chore.id}
              chore={chore}
              colors={colors}
              onComplete={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setCompleting(chore);
              }}
            />
          ))}
        </ScrollView>
      )}

      <CompleteModal
        chore={completing}
        cleanerName={me?.linkedFamilyMemberName ?? 'Cleaner'}
        visible={!!completing}
        onClose={() => setCompleting(null)}
        onDone={handleMarkDone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerGreeting: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 2 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  signOutBtn: { padding: 8, borderRadius: 10, borderWidth: 1 },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  // List
  list: { padding: 16, gap: 10 },

  // Task card
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  cardTitleDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  cardDate: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  cardNote: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' },
  freqTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  freqTagText: { fontSize: 11, fontFamily: 'Inter_500Medium', textTransform: 'capitalize' },

  // Buttons
  doneTag: { padding: 6, borderRadius: 10 },
  completeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  completeTagText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },

  // Empty
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },

  // Complete modal
  modalRoot: { flex: 1, padding: 24 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  modalSub: { fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 8 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, fontFamily: 'Inter_400Regular', minHeight: 90, marginBottom: 20 },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 12 },
  completeBtnText: { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
