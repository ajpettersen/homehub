import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { format, addDays } from 'date-fns';
import {
  useGetMaintenanceTasks,
  useCreateMaintenanceTask,
  useCompleteMaintenanceTask,
  useGetProperties,
  getMaintenanceTasksQueryKey,
  MaintenanceTaskCategory
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: string, size: number, color: string }) => {
  if (Platform.OS === 'ios') {
    return <SymbolView name={iosName} tintColor={color} size={size} />;
  }
  return <FeatherIcon name={name} size={size} color={color} />;
};

export default function MaintenanceScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  
  const { data: properties } = useGetProperties();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  
  // Default to first property if null
  React.useEffect(() => {
    if (properties?.length && !selectedPropertyId) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [properties]);
  
  const { data: tasks, isLoading } = useGetMaintenanceTasks(selectedPropertyId ? { propertyId: selectedPropertyId } : undefined);
  
  const completeTask = useCompleteMaintenanceTask();
  const createTask = useCreateMaintenanceTask();
  
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getMaintenanceTasksQueryKey() });
    setRefreshing(false);
  };
  
  const handleComplete = (taskId: string) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeTask.mutate({ id: taskId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getMaintenanceTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }
    });
  };

  const [newTask, setNewTask] = useState<{title: string, category: string, frequencyDays: string, propertyId: string}>({
    title: '',
    category: 'other',
    frequencyDays: '30',
    propertyId: ''
  });

  React.useEffect(() => {
    if (properties?.length && !newTask.propertyId) {
      setNewTask(prev => ({ ...prev, propertyId: properties[0].id }));
    }
  }, [properties]);

  const handleCreate = () => {
    if (!newTask.title || !newTask.propertyId || !newTask.frequencyDays) return;
    
    const nextDate = addDays(new Date(), parseInt(newTask.frequencyDays, 10));
    
    createTask.mutate({
      data: {
        title: newTask.title,
        propertyId: newTask.propertyId,
        category: newTask.category as any,
        frequencyDays: parseInt(newTask.frequencyDays, 10),
        nextDueDate: nextDate.toISOString()
      }
    }, {
      onSuccess: () => {
        setIsAddModalVisible(false);
        setNewTask({ title: '', category: 'other', frequencyDays: '30', propertyId: properties?.[0]?.id || '' });
        queryClient.invalidateQueries({ queryKey: getMaintenanceTasksQueryKey() });
      }
    });
  };

  // Organize tasks
  const overdueTasks = tasks?.filter(t => t.isOverdue) || [];
  const dueSoonTasks = tasks?.filter(t => t.isDueSoon && !t.isOverdue) || [];
  const upcomingTasks = tasks?.filter(t => !t.isDueSoon && !t.isOverdue) || [];

  const renderTask = (task: any) => (
    <View key={task.id} style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
          <View style={[
            styles.urgencyBadge,
            { backgroundColor: task.isOverdue ? '#FEF2F2' : task.isDueSoon ? '#FEF9C3' : '#F0FDF4' }
          ]}>
            <Text style={[
              styles.urgencyText,
              { color: task.isOverdue ? colors.danger : task.isDueSoon ? '#B45309' : colors.success }
            ]}>
              {task.isOverdue ? 'Overdue' : task.isDueSoon ? 'Due Soon' : 'Upcoming'}
            </Text>
          </View>
        </View>
        
        <View style={styles.taskFooter}>
          <View style={styles.taskMeta}>
            <IconComponent name="calendar" iosName="calendar" size={14} color={colors.mutedForeground} />
            <Text style={[styles.taskMetaText, { color: colors.mutedForeground }]}>
              {format(new Date(task.nextDueDate), 'MMM d, yyyy')}
            </Text>
            <Text style={[styles.taskMetaDot, { color: colors.mutedForeground }]}>•</Text>
            <Text style={[styles.taskMetaText, { color: colors.mutedForeground }]}>
              Every {task.frequencyDays} days
            </Text>
          </View>
          
          <Pressable
            style={({pressed}) => [
              styles.doneButton,
              { backgroundColor: colors.secondary },
              pressed && { opacity: 0.8 }
            ]}
            onPress={() => handleComplete(task.id)}
            disabled={completeTask.isPending}
          >
            <Text style={[styles.doneButtonText, { color: colors.primary }]}>Mark Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Maintenance</Text>
        <Pressable 
          style={({pressed}) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={() => setIsAddModalVisible(true)}
        >
          <IconComponent name="plus" iosName="plus" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.segmentedControlContainer}>
        <View style={[styles.segmentedControl, { backgroundColor: colors.secondary }]}>
          {properties?.map(prop => (
            <Pressable
              key={prop.id}
              style={[
                styles.segmentSegment,
                selectedPropertyId === prop.id && { backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 }
              ]}
              onPress={() => setSelectedPropertyId(prop.id)}
            >
              <Text style={[
                styles.segmentText,
                selectedPropertyId === prop.id ? { color: colors.foreground, fontFamily: 'Inter_600SemiBold' } : { color: colors.mutedForeground }
              ]}>{prop.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {overdueTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.danger }]}>Needs Attention</Text>
            {overdueTasks.map(renderTask)}
          </View>
        )}
        
        {dueSoonTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: '#B45309' }]}>Due Soon</Text>
            {dueSoonTasks.map(renderTask)}
          </View>
        )}
        
        {upcomingTasks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming</Text>
            {upcomingTasks.map(renderTask)}
          </View>
        )}
        
        {(!tasks || tasks.length === 0) && !isLoading && (
           <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
            <IconComponent name="check-circle" iosName="checkmark.circle.fill" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No tasks to manage right now.</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Task</Text>
              <Pressable onPress={() => setIsAddModalVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Task Title</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newTask.title}
                onChangeText={(text) => setNewTask(prev => ({ ...prev, title: text }))}
                placeholder="e.g. Change AC Filter"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Frequency (Days)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={newTask.frequencyDays}
                  onChangeText={(text) => setNewTask(prev => ({ ...prev, frequencyDays: text }))}
                  keyboardType="number-pad"
                  placeholder="90"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
                <View style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, justifyContent: 'center' }]}>
                  <Text style={{ color: colors.foreground, fontSize: 16 }}>{newTask.category}</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Category Selection</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {Object.values(MaintenanceTaskCategory).map(cat => (
                  <Pressable
                    key={cat}
                    style={[styles.pill, newTask.category === cat ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewTask(prev => ({ ...prev, category: cat }))}
                  >
                    <Text style={[styles.pillText, newTask.category === cat ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{cat}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                (!newTask.title || !newTask.propertyId || !newTask.frequencyDays) && { opacity: 0.5 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleCreate}
              disabled={!newTask.title || !newTask.propertyId || !newTask.frequencyDays || createTask.isPending}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>Create Task</Text>
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
  segmentedControlContainer: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
  },
  segmentSegment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 24,
    paddingTop: 8,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
  },
  taskCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  taskContent: {
    gap: 16,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
    marginRight: 16,
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  urgencyText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskMetaText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  taskMetaDot: {
    fontSize: 12,
  },
  doneButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  doneButtonText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
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
  formRow: {
    flexDirection: 'row',
    gap: 12,
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
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
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