import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import {
  useGetGroceryLists,
  useCreateGroceryList,
  useGetGroceryItems,
  useAddGroceryItem,
  useUpdateGroceryItem,
  useDeleteGroceryItem,
  useGetMealPlans,
  useCreateMealPlanEntry,
  useGetProperties,
  getGetGroceryListsQueryKey,
  getGetGroceryItemsQueryKey,
  getGetMealPlansQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import * as Haptics from 'expo-haptics';

const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: string, size: number, color: string }) => {
  if (Platform.OS === 'ios') {
    return <SymbolView name={iosName} tintColor={color} size={size} />;
  }
  return <FeatherIcon name={name} size={size} color={color} />;
};

function GroceryListDetail({ listId, listName, onBack }: { listId: string, listName: string, onBack: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  
  const { data: items } = useGetGroceryItems(listId);
  const addItem = useAddGroceryItem();
  const updateItem = useUpdateGroceryItem();
  const deleteItem = useDeleteGroceryItem();
  
  const [newItemName, setNewItemName] = useState('');
  const inputRef = React.useRef<TextInput>(null);
  
  const handleAdd = () => {
    if (!newItemName.trim()) return;
    const name = newItemName.trim();
    setNewItemName(''); // clear immediately so it feels instant
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem.mutate({
      id: listId,
      data: { name }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
        // Keep keyboard open for rapid entry
        inputRef.current?.focus();
      }
    });
  };
  
  const handleToggle = (itemId: string, checked: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateItem.mutate({
      id: itemId,
      data: { checked: !checked }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      }
    });
  };
  
  const handleDelete = (itemId: string) => {
    deleteItem.mutate({ id: itemId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
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
              onPress={() => handleToggle(item.id, item.checked)}
            >
              <View style={[
                styles.checkbox,
                { borderColor: item.checked ? colors.primary : colors.mutedForeground },
                item.checked && { backgroundColor: colors.primary }
              ]}>
                {item.checked && <IconComponent name="check" iosName="checkmark" size={14} color={colors.primaryForeground} />}
              </View>
            </Pressable>
            <Text style={[
              styles.itemContent, 
              { color: item.checked ? colors.mutedForeground : colors.foreground },
              item.checked && { textDecorationLine: 'line-through' }
            ]}>
              {item.name}
            </Text>
            <Pressable onPress={() => handleDelete(item.id)} style={{ padding: 8 }}>
              <IconComponent name="trash-2" iosName="trash" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.inlineInputContainer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || 24 }]}>
        <TextInput
          ref={inputRef}
          style={[styles.inlineInput, { backgroundColor: colors.secondary, color: colors.foreground }]}
          value={newItemName}
          onChangeText={setNewItemName}
          placeholder="Add item..."
          placeholderTextColor={colors.mutedForeground}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
          blurOnSubmit={false}
          autoFocus
        />
        <Pressable 
          style={[styles.inlineAddBtn, { backgroundColor: colors.primary }, !newItemName.trim() && { opacity: 0.5 }]}
          onPress={handleAdd}
          disabled={!newItemName.trim() || addItem.isPending}
        >
          <IconComponent name="arrow-up" iosName="arrow.up" size={20} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

export default function KitchenScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState<'groceries' | 'meals'>('groceries');
  
  // Groceries state
  const [selectedList, setSelectedList] = useState<{id: string, name: string} | null>(null);
  const [isAddListModalVisible, setIsAddListModalVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  const { data: properties } = useGetProperties();
  const { data: lists, isLoading: isLoadingLists } = useGetGroceryLists();
  const createList = useCreateGroceryList();
  
  // Meals state
  const [weekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const { data: meals, isLoading: isLoadingMeals } = useGetMealPlans({ weekStart });
  const createMeal = useCreateMealPlanEntry();
  
  const [isAddMealModalVisible, setIsAddMealModalVisible] = useState(false);
  const [newMeal, setNewMeal] = useState<{dayOfWeek: number, mealType: string, meal: string}>({
    dayOfWeek: 0,
    mealType: 'dinner',
    meal: ''
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'groceries') {
      await queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
    } else {
      await queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
    }
    setRefreshing(false);
  };

  const handleCreateList = () => {
    if (!newListName.trim() || !properties?.length) return;
    createList.mutate({ data: { name: newListName.trim(), propertyId: properties[0].id } }, {
      onSuccess: () => {
        setNewListName('');
        setIsAddListModalVisible(false);
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      }
    });
  };

  const handleCreateMeal = () => {
    if (!newMeal.meal.trim() || !properties?.length) return;
    createMeal.mutate({
      data: {
        weekStart,
        dayOfWeek: newMeal.dayOfWeek,
        mealType: newMeal.mealType as any,
        meal: newMeal.meal.trim(),
        propertyId: properties[0].id
      }
    }, {
      onSuccess: () => {
        setNewMeal({ dayOfWeek: 0, mealType: 'dinner', meal: '' });
        setIsAddMealModalVisible(false);
        queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      }
    });
  };

  if (selectedList && activeTab === 'groceries') {
    return <GroceryListDetail listId={selectedList.id} listName={selectedList.name} onBack={() => setSelectedList(null)} />;
  }

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kitchen</Text>
        <Pressable 
          style={({pressed}) => [styles.addButton, pressed && { opacity: 0.7 }]}
          onPress={() => activeTab === 'groceries' ? setIsAddListModalVisible(true) : setIsAddMealModalVisible(true)}
        >
          <IconComponent name="plus" iosName="plus" size={24} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.topTabs}>
        <Pressable 
          style={[styles.topTab, activeTab === 'groceries' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('groceries')}
        >
          <Text style={[styles.topTabText, activeTab === 'groceries' ? { color: colors.primary, fontFamily: 'Inter_600SemiBold' } : { color: colors.mutedForeground }]}>Groceries</Text>
        </Pressable>
        <Pressable 
          style={[styles.topTab, activeTab === 'meals' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('meals')}
        >
          <Text style={[styles.topTabText, activeTab === 'meals' ? { color: colors.primary, fontFamily: 'Inter_600SemiBold' } : { color: colors.mutedForeground }]}>Meal Plan</Text>
        </Pressable>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {activeTab === 'groceries' ? (
          lists?.map(list => (
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
                <IconComponent name="shopping-cart" iosName="cart" size={24} color={colors.primary} />
              </View>
              <View style={styles.listCardInfo}>
                <Text style={[styles.listName, { color: colors.foreground }]}>{list.name}</Text>
                {list.itemCount > 0 ? (
                  <View style={styles.progressRow}>
                    <View style={[styles.progressBarBg, { backgroundColor: colors.border }]}>
                      <View style={[
                        styles.progressBarFill, 
                        { backgroundColor: colors.primary, width: `${(list.checkedCount / list.itemCount) * 100}%` }
                      ]} />
                    </View>
                    <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                      {list.checkedCount}/{list.itemCount}
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.progressText, { color: colors.mutedForeground }]}>Empty list</Text>
                )}
              </View>
              <IconComponent name="chevron-right" iosName="chevron.right" size={20} color={colors.mutedForeground} />
            </Pressable>
          ))
        ) : (
          <View style={styles.mealsContainer}>
            {daysOfWeek.map((dayName, idx) => {
              const dayMeals = meals?.filter(m => m.dayOfWeek === idx) || [];
              const dinner = dayMeals.find(m => m.mealType === 'dinner');
              
              return (
                <View key={dayName} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.dayName, { color: colors.foreground }]}>{dayName}</Text>
                  {dinner ? (
                    <Text style={[styles.mealName, { color: colors.primary }]}>{dinner.meal}</Text>
                  ) : (
                    <Pressable 
                      style={[styles.addMealBtn, { backgroundColor: colors.secondary }]}
                      onPress={() => {
                        setNewMeal({ dayOfWeek: idx, mealType: 'dinner', meal: '' });
                        setIsAddMealModalVisible(true);
                      }}
                    >
                      <Text style={[styles.addMealText, { color: colors.mutedForeground }]}>Plan dinner...</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Grocery List Modal */}
      <Modal visible={isAddListModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Grocery List</Text>
              <Pressable onPress={() => setIsAddListModalVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>List Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newListName}
                onChangeText={setNewListName}
                placeholder="e.g. Costco, Trader Joe's"
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

      {/* Add Meal Modal */}
      <Modal visible={isAddMealModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Plan Meal</Text>
              <Pressable onPress={() => setIsAddMealModalVisible(false)} style={styles.closeButton}>
                <IconComponent name="x" iosName="xmark" size={24} color={colors.foreground} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {daysOfWeek.map((day, idx) => (
                  <Pressable
                    key={day}
                    style={[styles.pill, newMeal.dayOfWeek === idx ? { backgroundColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setNewMeal(prev => ({ ...prev, dayOfWeek: idx }))}
                  >
                    <Text style={[styles.pillText, newMeal.dayOfWeek === idx ? { color: colors.primaryForeground } : { color: colors.foreground }]}>{day.substring(0,3)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Meal Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={newMeal.meal}
                onChangeText={(text) => setNewMeal(prev => ({...prev, meal: text}))}
                placeholder="e.g. Tacos, Spaghetti"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                !newMeal.meal.trim() && { opacity: 0.5 },
                pressed && { opacity: 0.8 }
              ]}
              onPress={handleCreateMeal}
              disabled={!newMeal.meal.trim() || createMeal.isPending}
            >
              <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>Save Meal</Text>
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
    paddingBottom: 8,
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
  topTabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  topTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  topTabText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  listContent: {
    paddingHorizontal: 24,
    gap: 12,
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
  mealsContainer: {
    gap: 12,
  },
  dayCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  dayName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  mealName: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
  },
  addMealBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addMealText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
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