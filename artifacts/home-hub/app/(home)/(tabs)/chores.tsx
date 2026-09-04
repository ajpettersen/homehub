import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { 
  useGetChores, 
  useGetFamilyMembers, 
  useGetProperties, 
  useCompleteChore,
  useCreateChore,
  useUpdateChore,
  useDeleteChore,
  getGetChoresQueryKey,
  getGetDashboardQueryKey,
  ChoreFrequency,
  type Chore,
} from '@workspace/api-client-react';
import { PropertySwitcher } from '@/components/PropertySwitcher';
import { useProperty } from '@/context/PropertyContext';
import { useActiveMember } from '@/context/ActiveMemberContext';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: any, size: number, color: string }) => {
  if (Platform.OS === 'ios') {
    return <SymbolView name={iosName} tintColor={color} size={size} />;
  }
  return <FeatherIcon name={name} size={size} color={color} />;
};

const getDateOnlyAfter = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd');

const isValidDateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return format(parseISO(value), 'yyyy-MM-dd') === value;
  } catch {
    return false;
  }
};

export default function ChoresScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { selectedProperty } = useProperty();
  
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingChore, setEditingChore] = useState<Chore | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; frequency: string; assigneeId?: string; propertyId: string; dueDate: string }>({ title: '', frequency: 'weekly', propertyId: '', dueDate: '' });
  const [snoozingChoreId, setSnoozingChoreId] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');
  
  const choreParams: any = {};
  if (selectedMemberId) choreParams.assigneeId = selectedMemberId;
  if (selectedProperty) choreParams.propertyId = selectedProperty.id;
  
  const { data: chores, isLoading: isLoadingChores } = useGetChores(Object.keys(choreParams).length ? choreParams : undefined);
  const { data: members } = useGetFamilyMembers();
  const { data: properties } = useGetProperties();
  
  const completeChore = useCompleteChore({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }
    }
  });

  const createChore = useCreateChore({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setIsAddModalVisible(false);
        setNewChore({ title: '', frequency: 'weekly', propertyId: properties?.[0]?.id || '' });
      }
    }
  });

  const updateChore = useUpdateChore({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      }
    }
  });

  const deleteChore = useDeleteChore({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        setEditingChore(null);
      }
    }
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetChoresQueryKey() });
    setRefreshing(false);
  };

  const [newChore, setNewChore] = useState<{title: string, assigneeId?: string, propertyId: string, frequency: string}>({
    title: '',
    frequency: 'weekly',
    propertyId: '',
  });

  // Ensure propertyId is set if properties load later
  React.useEffect(() => {
    if (properties?.length && !newChore.propertyId) {
      setNewChore(prev => ({ ...prev, propertyId: properties[0].id }));
    }
  }, [properties]);

  const { activeMember, setActiveMemberId: setActiveMember } = useActiveMember();
  const [memberPickerVisible, setMemberPickerVisible] = useState(false);
  const humanMembers = (members ?? []).filter(m => m.role !== 'pet');

  const handleComplete = (id: string) => {
    completeChore.mutate({ id, data: { completedBy: activeMember?.name ?? 'Family' } });
  };

  const openEdit = (chore: Chore) => {
    setEditForm({
      title: chore.title,
      frequency: chore.frequency,
      assigneeId: chore.assigneeId ?? undefined,
      propertyId: chore.propertyId,
      dueDate: chore.dueDate ?? '',
    });
    setEditingChore(chore);
  };

  const handleSaveEdit = () => {
    if (!editingChore || !editForm.title || !editForm.propertyId) return;
    updateChore.mutate({
      id: editingChore.id,
      data: {
        title: editForm.title,
        frequency: editForm.frequency as any,
        assigneeId: editForm.assigneeId || undefined,
        propertyId: editForm.propertyId,
        dueDate: editForm.dueDate || null,
      },
    }, { onSuccess: () => setEditingChore(null) });
  };

  const openSnooze = (chore: Chore) => {
    setSnoozingChoreId(current => current === chore.id ? null : chore.id);
    setSnoozeDate(chore.dueDate ?? getDateOnlyAfter(1));
  };

  const handleSnooze = (id: string, dueDate: string) => {
    if (!isValidDateOnly(dueDate)) return;
    updateChore.mutate(
      { id, data: { dueDate } },
      { onSuccess: () => setSnoozingChoreId(null) },
    );
  };

  const handleDelete = (id: string) => {
    deleteChore.mutate({ id });
  };

  const handleAddChore = () => {
    if (!newChore.title || !newChore.propertyId) return;
    createChore.mutate({
      data: {
        title: newChore.title,
        propertyId: newChore.propertyId,
        frequency: newChore.frequency as any,
        assigneeId: newChore.assigneeId || undefined
      }
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Chores</Text>
        <View style={styles.headerRight}>
          {activeMember && (
            <Pressable
              style={[styles.activeMemberChip, { backgroundColor: activeMember.color + '22', borderColor: activeMember.color }]}
              onPress={() => setMemberPickerVisible(true)}
            >
              <View style={[styles.activeMemberDot, { backgroundColor: activeMember.color }]} />
              <Text style={[styles.activeMemberName, { color: activeMember.color }]}>{activeMember.name}</Text>
            </Pressable>
          )}
          <Pressable
            style={({pressed}) => [styles.addButton, pressed && { opacity: 0.7 }]}
            onPress={() => setIsAddModalVisible(true)}
          >
            <IconComponent name="plus" iosName="plus" size={24} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.switcherRow}>
        <PropertySwitcher />
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Pressable 
            style={[styles.filterAvatar, !selectedMemberId && { borderColor: colors.primary, borderWidth: 2 }]}
            onPress={() => setSelectedMemberId(null)}
          >
            <View style={[styles.avatarCircle, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.avatarText, { color: colors.foreground }]}>All</Text>
            </View>
          </Pressable>
          {members?.map(member => (
            <Pressable 
              key={member.id}
              style={[styles.filterAvatar, selectedMemberId === member.id && { borderColor: member.color, borderWidth: 2 }]}
              onPress={() => setSelectedMemberId(member.id)}
            >
              <View style={[styles.avatarCircle, { backgroundColor: member.color }]}>
                <Text style={[styles.avatarText, { color: '#FFF' }]}>{member.name.substring(0, 1)}</Text>
              </View>
              <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>{member.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {(() => {
          return chores && chores.length > 0 ? (
          chores.map(chore => {
            const assigneeColor = members?.find(m => m.id === chore.assigneeId)?.color || colors.muted;
            
            return (
              <View key={chore.id} style={[styles.choreCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.choreColorBar, { backgroundColor: assigneeColor }]} />
                <View style={styles.choreContent}>
                  <View style={styles.choreHeader}>
                    <Text style={[styles.choreTitle, { color: colors.foreground }]}>{chore.title}</Text>
                    {chore.dueDate && (
                      <Text style={[styles.choreDue, { color: chore.isOverdue ? colors.danger : colors.mutedForeground }]}>
                        {format(parseISO(chore.dueDate), 'MMM d')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.choreFooter}>
                    <View style={styles.choreMeta}>
                      <Text style={[styles.choreAssignee, { color: colors.mutedForeground }]}>{chore.assigneeName || 'Unassigned'}</Text>
                      <Text style={[styles.choreDot, { color: colors.mutedForeground }]}>•</Text>
                      <Text style={[styles.choreProperty, { color: colors.mutedForeground }]}>{chore.propertyName}</Text>
                      <Text style={[styles.choreDot, { color: colors.mutedForeground }]}>•</Text>
                      <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{chore.frequency}</Text>
                      </View>
                    </View>
                    <View style={styles.cardActions}>
                      <Pressable
                        style={({pressed}) => [
                          styles.cardActionBtn,
                          { borderColor: colors.border },
                          snoozingChoreId === chore.id && { backgroundColor: colors.secondary },
                          pressed && { backgroundColor: colors.secondary }
                        ]}
                        onPress={() => openSnooze(chore)}
                        disabled={updateChore.isPending}
                        accessibilityRole="button"
                        accessibilityLabel={`Snooze ${chore.title}`}
                        testID={`chore-snooze-${chore.id}`}
                      >
                        <IconComponent name="clock" iosName="clock.arrow.circlepath" size={14} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        style={({pressed}) => [
                          styles.cardActionBtn,
                          { borderColor: colors.border },
                          pressed && { backgroundColor: colors.secondary }
                        ]}
                        onPress={() => openEdit(chore)}
                      >
                        <IconComponent name="edit-2" iosName="pencil" size={14} color={colors.mutedForeground} />
                      </Pressable>
                      <Pressable
                        style={({pressed}) => [
                          styles.cardActionBtn,
                          { borderColor: colors.border },
                          pressed && { backgroundColor: colors.secondary }
                        ]}
                        onPress={() => handleComplete(chore.id)}
                        disabled={completeChore.isPending}
                      >
                        <IconComponent name="check" iosName="checkmark" size={16} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                  {snoozingChoreId === chore.id && (
                    <View style={[styles.snoozePanel, { borderTopColor: colors.border }]}>
                      <Text style={[styles.snoozeLabel, { color: colors.mutedForeground }]}>Move due date</Text>
                      <View style={styles.snoozeQuickRow}>
                        <Pressable
                          style={[styles.snoozeQuickButton, { backgroundColor: colors.secondary }]}
                          onPress={() => handleSnooze(chore.id, getDateOnlyAfter(1))}
                          disabled={updateChore.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Snooze ${chore.title} until tomorrow`}
                          testID={`chore-snooze-tomorrow-${chore.id}`}
                        >
                          <Text style={[styles.snoozeQuickText, { color: colors.foreground }]}>Tomorrow</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.snoozeQuickButton, { backgroundColor: colors.secondary }]}
                          onPress={() => handleSnooze(chore.id, getDateOnlyAfter(7))}
                          disabled={updateChore.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Snooze ${chore.title} until next week`}
                          testID={`chore-snooze-next-week-${chore.id}`}
                        >
                          <Text style={[styles.snoozeQuickText, { color: colors.foreground }]}>Next week</Text>
                        </Pressable>
                      </View>
                      <View style={styles.snoozeCustomRow}>
                        <TextInput
                          style={[styles.snoozeInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                          value={snoozeDate}
                          onChangeText={setSnoozeDate}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.mutedForeground}
                          keyboardType="numbers-and-punctuation"
                          maxLength={10}
                          accessibilityLabel={`Custom due date for ${chore.title}, YYYY-MM-DD`}
                          testID={`chore-snooze-date-${chore.id}`}
                        />
                        <Pressable
                          style={[styles.snoozeApplyButton, { backgroundColor: colors.primary }, !isValidDateOnly(snoozeDate) && { opacity: 0.5 }]}
                          onPress={() => handleSnooze(chore.id, snoozeDate)}
                          disabled={!isValidDateOnly(snoozeDate) || updateChore.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={`Apply custom due date for ${chore.title}`}
                          testID={`chore-snooze-apply-${chore.id}`}
                        >
                          <Text style={[styles.snoozeApplyText, { color: colors.primaryForeground }]}>Apply</Text>
                        </Pressable>
                      </View>
                      {!!snoozeDate && !isValidDateOnly(snoozeDate) && (
                        <Text style={[styles.dateErrorText, { color: colors.danger }]} accessibilityLiveRegion="polite">
                          Enter a valid date as YYYY-MM-DD.
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
              <IconComponent name="check-circle" iosName="checkmark.circle.fill" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No chores found. Great job!</Text>
            </View>
          );
        })()}
      </ScrollView>

      {/* Member Picker */}
      <Modal visible={memberPickerVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Who are you?</Text>
              <Pressable onPress={() => setMemberPickerVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>
            <View style={styles.pillRow}>
              {humanMembers.map(m => (
                <Pressable
                  key={m.id}
                  style={[styles.memberPickerOption, { backgroundColor: m.color + '22', borderColor: m.color, borderWidth: activeMember?.id === m.id ? 2 : 1 }]}
                  onPress={() => { setActiveMember(m.id); setMemberPickerVisible(false); }}
                >
                  <View style={[styles.activeMemberDot, { backgroundColor: m.color }]} />
                  <Text style={[styles.memberPickerName, { color: m.color, fontFamily: activeMember?.id === m.id ? 'Inter_700Bold' : 'Inter_500Medium' }]}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Chore Modal */}
      <Modal visible={!!editingChore} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Edit Chore</Text>
              <Pressable onPress={() => setEditingChore(null)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Chore Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={editForm.title}
                onChangeText={(text) => setEditForm(prev => ({ ...prev, title: text }))}
                placeholder="e.g. Empty dishwasher"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Property</Text>
              <View style={styles.pillRow}>
                {properties?.map(prop => (
                  <Pressable
                    key={prop.id}
                    style={[styles.pill, editForm.propertyId === prop.id ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setEditForm(prev => ({ ...prev, propertyId: prop.id }))}
                  >
                    <Text style={[styles.pillText, editForm.propertyId === prop.id ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{prop.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Assign To</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Pressable
                  style={[styles.pill, !editForm.assigneeId ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setEditForm(prev => ({ ...prev, assigneeId: undefined }))}
                >
                  <Text style={[styles.pillText, !editForm.assigneeId ? { color: colors.primaryForeground } : { color: colors.foreground }]}>Anyone</Text>
                </Pressable>
                {members?.map(member => (
                  <Pressable
                    key={member.id}
                    style={[styles.pill, editForm.assigneeId === member.id ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setEditForm(prev => ({ ...prev, assigneeId: member.id }))}
                  >
                    <Text style={[styles.pillText, editForm.assigneeId === member.id ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{member.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Frequency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Object.values(ChoreFrequency).map(freq => (
                  <Pressable
                    key={freq}
                    style={[styles.pill, editForm.frequency === freq ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setEditForm(prev => ({ ...prev, frequency: freq }))}
                  >
                    <Text style={[styles.pillText, editForm.frequency === freq ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{freq}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Due Date</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={editForm.dueDate}
                onChangeText={(dueDate) => setEditForm(prev => ({ ...prev, dueDate }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                accessibilityLabel="Chore due date, YYYY-MM-DD"
                testID="edit-chore-due-date"
              />
              {!!editForm.dueDate && !isValidDateOnly(editForm.dueDate) && (
                <Text style={[styles.dateErrorText, { color: colors.danger }]} accessibilityLiveRegion="polite">
                  Enter a valid date as YYYY-MM-DD.
                </Text>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                (!editForm.title || !editForm.propertyId || (!!editForm.dueDate && !isValidDateOnly(editForm.dueDate))) && { opacity: 0.5 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleSaveEdit}
              disabled={!editForm.title || !editForm.propertyId || (!!editForm.dueDate && !isValidDateOnly(editForm.dueDate)) || updateChore.isPending}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
                {updateChore.isPending ? 'Saving…' : 'Save Changes'}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
              onPress={() => editingChore && handleDelete(editingChore.id)}
              disabled={deleteChore.isPending}
            >
              <IconComponent name="trash-2" iosName="trash" size={16} color={colors.danger} />
              <Text style={[styles.deleteButtonText, { color: colors.danger }]}>
                {deleteChore.isPending ? 'Deleting…' : 'Delete Chore'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Add Chore Modal */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Chore</Text>
              <Pressable onPress={() => setIsAddModalVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Chore Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newChore.title}
                onChangeText={(text) => setNewChore(prev => ({ ...prev, title: text }))}
                placeholder="e.g. Empty dishwasher"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Property</Text>
              <View style={styles.pillRow}>
                {properties?.map(prop => (
                  <Pressable
                    key={prop.id}
                    style={[styles.pill, newChore.propertyId === prop.id ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewChore(prev => ({ ...prev, propertyId: prop.id }))}
                  >
                    <Text style={[styles.pillText, newChore.propertyId === prop.id ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{prop.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Assign To (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Pressable
                  style={[styles.pill, !newChore.assigneeId ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setNewChore(prev => ({ ...prev, assigneeId: undefined }))}
                >
                  <Text style={[styles.pillText, !newChore.assigneeId ? { color: colors.primaryForeground } : { color: colors.foreground }]}>Anyone</Text>
                </Pressable>
                {members?.map(member => (
                  <Pressable
                    key={member.id}
                    style={[styles.pill, newChore.assigneeId === member.id ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewChore(prev => ({ ...prev, assigneeId: member.id }))}
                  >
                    <Text style={[styles.pillText, newChore.assigneeId === member.id ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{member.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Frequency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Object.values(ChoreFrequency).map(freq => (
                  <Pressable
                    key={freq}
                    style={[styles.pill, newChore.frequency === freq ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewChore(prev => ({ ...prev, frequency: freq }))}
                  >
                    <Text style={[styles.pillText, newChore.frequency === freq ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{freq}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                (!newChore.title || !newChore.propertyId) && { opacity: 0.5 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleAddChore}
              disabled={!newChore.title || !newChore.propertyId || createChore.isPending}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>Add Chore</Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
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
  filterRow: {
    marginBottom: 16,
  },
  filterScroll: {
    paddingHorizontal: 24,
    gap: 16,
  },
  filterAvatar: {
    alignItems: 'center',
    gap: 4,
    padding: 2,
    borderRadius: 40,
  },
  avatarCircle: {
    width: 56, height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
  memberName: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    width: 60,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  choreCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  choreColorBar: {
    width: 6,
  },
  choreContent: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  choreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  choreTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  choreDue: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginLeft: 8,
  },
  choreFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  choreMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  choreAssignee: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  choreProperty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  choreDot: {
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginLeft: 12,
  },
  cardActionBtn: {
    width: 32, height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozePanel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 10,
  },
  snoozeLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  snoozeQuickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  snoozeQuickButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  snoozeQuickText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  snoozeCustomRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  snoozeInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  snoozeApplyButton: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeApplyText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  dateErrorText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  deleteButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  emptyCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 32,
    gap: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
  },
  closeButton: {
    padding: 4,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  activeMemberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  activeMemberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeMemberName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  memberPickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 4,
    flex: 1,
    minWidth: '45%',
  },
  memberPickerName: {
    fontSize: 15,
  },
});