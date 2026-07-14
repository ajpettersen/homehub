import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { 
  useGetChores, 
  useGetFamilyMembers, 
  useGetProperties, 
  useCompleteChore,
  useCreateChore,
  getGetChoresQueryKey,
  ChoreFrequency
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: string, size: number, color: string }) => {
  if (Platform.OS === 'ios') {
    return <SymbolView name={iosName} tintColor={color} size={size} />;
  }
  return <FeatherIcon name={name} size={size} color={color} />;
};

export default function ChoresScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  
  const { data: chores, isLoading: isLoadingChores } = useGetChores(selectedMemberId ? { assigneeId: selectedMemberId } : undefined);
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
        setIsAddModalVisible(false);
        setNewChore({ title: '', frequency: 'weekly', propertyId: properties?.[0]?.id || '' });
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

  const handleComplete = (id: string) => {
    // In a real app we'd get the actual logged in user name
    completeChore.mutate({ id, data: { completedBy: 'AJ' } });
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
        <Pressable 
          style={({pressed}) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={() => setIsAddModalVisible(true)}
        >
          <IconComponent name="plus" iosName="plus" size={24} color={colors.primary} />
        </Pressable>
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
        {chores && chores.length > 0 ? (
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
                        {format(new Date(chore.dueDate), 'MMM d')}
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
                    <Pressable
                      style={({pressed}) => [
                        styles.completeButton,
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
              </View>
            );
          })
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
            <IconComponent name="check-circle" iosName="checkmark.circle.fill" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No chores found. Great job!</Text>
          </View>
        )}
      </ScrollView>

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
  completeButton: {
    width: 32, height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
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
});