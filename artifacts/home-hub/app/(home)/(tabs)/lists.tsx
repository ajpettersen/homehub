import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import {
  useGetTodoLists,
  useCreateTodoList,
  useGetTodoItems,
  useAddTodoItem,
  useUpdateTodoItem,
  useDeleteTodoItem,
  useGetFamilyMembers,
  getGetTodoListsQueryKey,
  getGetTodoItemsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: string, size: number, color: string }) => {
  if (Platform.OS === 'ios') {
    return <SymbolView name={iosName} tintColor={color} size={size} />;
  }
  return <FeatherIcon name={name} size={size} color={color} />;
};

function TodoListDetail({ listId, listName, onBack }: { listId: string, listName: string, onBack: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const { data: items } = useGetTodoItems(listId);
  const { data: members } = useGetFamilyMembers();
  const addItem = useAddTodoItem();
  const updateItem = useUpdateTodoItem();
  const deleteItem = useDeleteTodoItem();
  
  const [newItemContent, setNewItemContent] = useState('');
  
  const handleAdd = () => {
    if (!newItemContent.trim()) return;
    addItem.mutate({
      id: listId,
      data: { content: newItemContent.trim() }
    }, {
      onSuccess: () => {
        setNewItemContent('');
        queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      }
    });
  };
  
  const handleToggle = (itemId: string, completed: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateItem.mutate({
      id: itemId,
      data: { completed: !completed }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      }
    });
  };
  
  const handleDelete = (itemId: string) => {
    deleteItem.mutate({ id: itemId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodoItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      }
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20, alignItems: 'center', paddingBottom: 16 }]}>
        <Pressable onPress={onBack} style={{ padding: 8, marginLeft: -8 }}>
          <IconComponent name="chevron-left" iosName="chevron.left" size={28} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground, flex: 1, fontSize: 22 }]} numberOfLines={1}>{listName}</Text>
      </View>
      
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 120 }]}>
        {items?.map(item => (
          <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
            <Pressable
              style={styles.itemCheckboxArea}
              onPress={() => handleToggle(item.id, item.completed)}
            >
              <View style={[
                styles.checkbox,
                { borderColor: item.completed ? colors.primary : colors.mutedForeground },
                item.completed && { backgroundColor: colors.primary }
              ]}>
                {item.completed && <IconComponent name="check" iosName="checkmark" size={14} color={colors.primaryForeground} />}
              </View>
            </Pressable>
            <Text style={[
              styles.itemContent, 
              { color: item.completed ? colors.mutedForeground : colors.foreground },
              item.completed && { textDecorationLine: 'line-through' }
            ]}>
              {item.content}
            </Text>
            <Pressable onPress={() => handleDelete(item.id)} style={{ padding: 8 }}>
              <IconComponent name="trash-2" iosName="trash" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inlineInputContainer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || 24 }]}>
        <TextInput
          style={[styles.inlineInput, { backgroundColor: colors.secondary, color: colors.foreground }]}
          value={newItemContent}
          onChangeText={setNewItemContent}
          placeholder="Add an item..."
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable 
          style={[styles.inlineAddBtn, { backgroundColor: colors.primary }, !newItemContent.trim() && { opacity: 0.5 }]}
          onPress={handleAdd}
          disabled={!newItemContent.trim() || addItem.isPending}
        >
          <IconComponent name="arrow-up" iosName="arrow.up" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ListsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  
  const [selectedList, setSelectedList] = useState<{id: string, name: string} | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const { data: lists, isLoading } = useGetTodoLists();
  const createList = useCreateTodoList();
  
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
    setRefreshing(false);
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createList.mutate({ data: { name: newListName.trim() } }, {
      onSuccess: () => {
        setNewListName('');
        setIsAddModalVisible(false);
        queryClient.invalidateQueries({ queryKey: getGetTodoListsQueryKey() });
      }
    });
  };

  if (selectedList) {
    return <TodoListDetail listId={selectedList.id} listName={selectedList.name} onBack={() => setSelectedList(null)} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Lists</Text>
        <Pressable 
          style={({pressed}) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={() => setIsAddModalVisible(true)}
        >
          <IconComponent name="plus" iosName="plus" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {lists?.map(list => (
          <Pressable
            key={list.id}
            style={({pressed}) => [
              styles.listCard, 
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { backgroundColor: colors.secondary }
            ]}
            onPress={() => setSelectedList({ id: list.id, name: list.name })}
          >
            <View style={[styles.iconBox, { backgroundColor: colors.secondary }]}>
              <IconComponent name="list" iosName="list.bullet" size={24} color={colors.primary} />
            </View>
            <View style={styles.listCardInfo}>
              <Text style={[styles.listName, { color: colors.foreground }]}>{list.name}</Text>
              {list.itemCount > 0 ? (
                <View style={styles.progressRow}>
                  <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                    <View style={[
                      styles.progressBarFill, 
                      { backgroundColor: colors.primary, width: `${(list.completedCount / list.itemCount) * 100}%` }
                    ]} />
                  </View>
                  <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                    {list.completedCount}/{list.itemCount}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.progressText, { color: colors.mutedForeground }]}>Empty list</Text>
              )}
            </View>
            <IconComponent name="chevron-right" iosName="chevron.right" size={20} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </ScrollView>

      {/* Add List Modal */}
      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New List</Text>
              <Pressable onPress={() => setIsAddModalVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>List Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newListName}
                onChangeText={setNewListName}
                placeholder="e.g. Costco run, Packing list"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                !newListName.trim() && { opacity: 0.5 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleCreateList}
              disabled={!newListName.trim() || createList.isPending}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>Create List</Text>
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
  listContent: {
    paddingHorizontal: 24,
    gap: 12,
    paddingTop: 8,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 16,
  },
  iconBox: {
    width: 48, height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCardInfo: {
    flex: 1,
    gap: 6,
  },
  listName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemCheckboxArea: {
    padding: 8,
    marginRight: 8,
  },
  checkbox: {
    width: 24, height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  inlineInputContainer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inlineInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  inlineAddBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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