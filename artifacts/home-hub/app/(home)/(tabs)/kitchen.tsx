import React, { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, ScrollView, RefreshControl,
  Pressable, Platform, Modal, TextInput, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import * as ImagePicker from 'expo-image-picker';
import { PropertySwitcher } from '@/components/PropertySwitcher';
import { useProperty } from '@/context/PropertyContext';
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
  useScanPantry,
  useSuggestMeals,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek } from 'date-fns';
import * as Haptics from 'expo-haptics';

const Icon = ({ name, iosName, size, color }: { name: any; iosName: string; size: number; color: string }) => {
  if (Platform.OS === 'ios') return <SymbolView name={iosName} tintColor={color} size={size} />;
  return <FeatherIcon name={name} size={size} color={color} />;
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface MealSuggestion {
  name: string;
  description: string;
  usesIngredients?: string[];
  missingIngredients: string[];
}

interface ScanResult {
  ingredients: string[];
  mealSuggestions: MealSuggestion[];
}

// ─── Grocery list detail (drill-in) ──────────────────────────────────────────

function GroceryListDetail({ listId, listName, onBack }: { listId: string; listName: string; onBack: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: items } = useGetGroceryItems(listId);
  const addItem = useAddGroceryItem();
  const updateItem = useUpdateGroceryItem();
  const deleteItem = useDeleteGroceryItem();
  const [newItemName, setNewItemName] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleAdd = () => {
    const name = newItemName.trim();
    if (!name) return;
    setNewItemName('');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem.mutate({ id: listId, data: { name } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
        inputRef.current?.focus();
      },
    });
  };

  const handleToggle = (itemId: string, checked: boolean) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    updateItem.mutate({ id: itemId, data: { checked: !checked } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      },
    });
  };

  const handleDelete = (itemId: string) => {
    deleteItem.mutate({ id: itemId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
        queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
      },
    });
  };

  const unchecked = items?.filter((i) => !i.checked) ?? [];
  const checked = items?.filter((i) => i.checked) ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.detailHeader, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          <Icon name="chevron-left" iosName="chevron.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.detailTitle, { color: colors.foreground }]} numberOfLines={1}>{listName}</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 110 }]}>
        {unchecked.map((item) => (
          <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
            <Pressable style={styles.itemCheckArea} onPress={() => handleToggle(item.id, item.checked)}>
              <View style={[styles.checkbox, { borderColor: colors.primary }]} />
            </Pressable>
            <Text style={[styles.itemText, { color: colors.foreground }]}>{item.name}</Text>
            <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={{ padding: 8 }}>
              <Icon name="trash-2" iosName="trash" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ))}
        {checked.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>In cart</Text>
            {checked.map((item) => (
              <View key={item.id} style={[styles.itemRow, { borderBottomColor: colors.border, opacity: 0.5 }]}>
                <Pressable style={styles.itemCheckArea} onPress={() => handleToggle(item.id, item.checked)}>
                  <View style={[styles.checkboxDone, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Icon name="check" iosName="checkmark" size={11} color="#fff" />
                  </View>
                </Pressable>
                <Text style={[styles.itemText, { color: colors.mutedForeground, textDecorationLine: 'line-through' }]}>{item.name}</Text>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={{ padding: 8 }}>
                  <Icon name="trash-2" iosName="trash" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <View style={[styles.addBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || 20 }]}>
        <TextInput
          ref={inputRef}
          style={[styles.addInput, { backgroundColor: colors.secondary, color: colors.foreground }]}
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
          style={[styles.addSendBtn, { backgroundColor: colors.primary }, !newItemName.trim() && { opacity: 0.4 }]}
          onPress={handleAdd}
          disabled={!newItemName.trim() || addItem.isPending}
        >
          <Icon name="arrow-up" iosName="arrow.up" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── AI Scan Sheet ────────────────────────────────────────────────────────────

const MAX_PHOTOS = 4;
const PHOTO_LABELS = ['Fridge', 'Pantry', 'Pantry shelf', 'Freezer'];

function ScanSheet({
  visible,
  onClose,
  onAddToMealPlan,
  onAddToGrocery,
}: {
  visible: boolean;
  onClose: () => void;
  onAddToMealPlan: (meal: MealSuggestion) => void;
  onAddToGrocery: (items: string[]) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<Array<{ uri: string; base64: string }>>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const scanMutation = useScanPantry();
  const suggestMutation = useSuggestMeals();

  const scanning = scanMutation.isPending;
  const suggesting = suggestMutation.isPending;

  const reset = () => {
    setPhotos([]);
    setResult(null);
    setError(null);
    setAddingPhoto(false);
    scanMutation.reset();
    suggestMutation.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  const addPhoto = async (useCamera: boolean) => {
    if (photos.length >= MAX_PHOTOS) return;
    setAddingPhoto(false);
    const picker = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    try {
      const picked = await picker({
        mediaTypes: ImagePicker.MediaType.Images,
        quality: 0.55,
        base64: true,
      });
      if (!picked.canceled && picked.assets[0]?.base64) {
        setPhotos(prev => [...prev, { uri: picked.assets[0].uri, base64: picked.assets[0].base64! }]);
        setResult(null);
        setError(null);
      }
    } catch (e) {
      setError('Could not access camera or photos. Please check permissions.');
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleScan = () => {
    if (photos.length === 0) return;
    setError(null);
    scanMutation.mutate(
      { data: { imagesBase64: photos.map(p => p.base64) } },
      {
        onSuccess: (data) => setResult(data as ScanResult),
        onError: (err: any) => setError(
          err?.response?.data?.error ?? 'Could not analyze the photos. Please try again.'
        ),
      },
    );
  };

  const handleSuggestOnly = () => {
    setError(null);
    suggestMutation.mutate(undefined, {
      onSuccess: (data: any) => setResult({ ingredients: [], mealSuggestions: data.mealSuggestions }),
      onError: () => setError('Could not get suggestions. Please try again.'),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
          {/* Handle + header */}
          <View style={styles.sheetHandle}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>AI Kitchen</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Icon name="x" iosName="xmark" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {!result && (
              <View style={styles.scanBody}>

                {/* ── Empty state ── */}
                {photos.length === 0 && (
                  <View style={[styles.photoPlaceholder, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Icon name="camera" iosName="camera.fill" size={32} color={colors.mutedForeground} />
                    <Text style={[styles.photoHint, { color: colors.mutedForeground }]}>
                      Add up to {MAX_PHOTOS} photos — fridge, pantry, freezer, or shelves
                    </Text>
                    <View style={styles.photoActions}>
                      <Pressable
                        style={[styles.photoBtn, { backgroundColor: colors.primary }]}
                        onPress={() => addPhoto(true)}
                      >
                        <Icon name="camera" iosName="camera" size={16} color="#fff" />
                        <Text style={styles.photoBtnText}>Camera</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.photoBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                        onPress={() => addPhoto(false)}
                      >
                        <Icon name="image" iosName="photo" size={16} color={colors.foreground} />
                        <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Library</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* ── Photo grid ── */}
                {photos.length > 0 && (
                  <View style={styles.photoGrid}>
                    {photos.map((photo, idx) => (
                      <View key={idx} style={[styles.photoGridItem, { borderColor: colors.border }]}>
                        <Image source={{ uri: photo.uri }} style={styles.photoGridImage} resizeMode="cover" />
                        <View style={[styles.photoGridLabel, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
                          <Text style={styles.photoGridLabelText}>{PHOTO_LABELS[idx] ?? `Photo ${idx + 1}`}</Text>
                        </View>
                        <Pressable
                          style={[styles.photoGridRemove, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
                          onPress={() => removePhoto(idx)}
                          hitSlop={6}
                        >
                          <Icon name="x" iosName="xmark" size={12} color="#fff" />
                        </Pressable>
                      </View>
                    ))}

                    {/* Add another slot */}
                    {photos.length < MAX_PHOTOS && (
                      <Pressable
                        style={[styles.photoGridItem, styles.photoGridAdd, { borderColor: colors.border, backgroundColor: colors.secondary }]}
                        onPress={() => setAddingPhoto(v => !v)}
                      >
                        <Icon name="plus" iosName="plus" size={22} color={colors.mutedForeground} />
                        <Text style={[styles.photoGridAddText, { color: colors.mutedForeground }]}>Add photo</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* Add photo picker (shown when tapping "Add photo" slot) */}
                {addingPhoto && photos.length < MAX_PHOTOS && (
                  <View style={[styles.addPhotoRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                    <Pressable style={[styles.photoBtn, { backgroundColor: colors.primary }]} onPress={() => addPhoto(true)}>
                      <Icon name="camera" iosName="camera" size={15} color="#fff" />
                      <Text style={styles.photoBtnText}>Camera</Text>
                    </Pressable>
                    <Pressable style={[styles.photoBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]} onPress={() => addPhoto(false)}>
                      <Icon name="image" iosName="photo" size={15} color={colors.foreground} />
                      <Text style={[styles.photoBtnText, { color: colors.foreground }]}>Library</Text>
                    </Pressable>
                  </View>
                )}

                {photos.length > 0 && (
                  <Text style={[styles.photoCountHint, { color: colors.mutedForeground }]}>
                    {photos.length} of {MAX_PHOTOS} photos · AI will find ingredients across all of them
                  </Text>
                )}

                {error && (
                  <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
                )}

                {photos.length > 0 && (
                  <Pressable
                    style={[styles.scanBtn, { backgroundColor: colors.primary }, scanning && { opacity: 0.7 }]}
                    onPress={handleScan}
                    disabled={scanning}
                  >
                    {scanning
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Icon name="zap" iosName="bolt.fill" size={16} color="#fff" /><Text style={styles.scanBtnText}>Analyze {photos.length > 1 ? `${photos.length} Photos` : 'Photo'} & Suggest Meals</Text></>
                    }
                  </Pressable>
                )}

                <View style={styles.dividerRow}>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                </View>

                <Pressable
                  style={[styles.suggestBtn, { borderColor: colors.border }, suggesting && { opacity: 0.7 }]}
                  onPress={handleSuggestOnly}
                  disabled={suggesting}
                >
                  {suggesting
                    ? <ActivityIndicator color={colors.primary} size="small" />
                    : <><Icon name="sparkles" iosName="sparkles" size={16} color={colors.primary} /><Text style={[styles.suggestBtnText, { color: colors.primary }]}>Suggest meals from history</Text></>
                  }
                </Pressable>
              </View>
            )}

            {/* Results */}
            {result && (
              <View style={styles.resultsBody}>
                {result.ingredients.length > 0 && (
                  <View style={[styles.ingredientsCard, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.resultsLabel, { color: colors.foreground }]}>Found in your kitchen</Text>
                    <View style={styles.chipRow}>
                      {result.ingredients.map((ing) => (
                        <View key={ing} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          <Text style={[styles.chipText, { color: colors.foreground }]}>{ing}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <Text style={[styles.resultsLabel, { color: colors.foreground, marginTop: 16 }]}>Meal suggestions</Text>

                {result.mealSuggestions.map((meal) => (
                  <View key={meal.name} style={[styles.mealCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.mealCardName, { color: colors.foreground }]}>{meal.name}</Text>
                    <Text style={[styles.mealCardDesc, { color: colors.mutedForeground }]}>{meal.description}</Text>
                    {meal.missingIngredients.length > 0 && (
                      <Text style={[styles.mealCardMissing, { color: colors.mutedForeground }]}>
                        Need: {meal.missingIngredients.join(', ')}
                      </Text>
                    )}
                    <View style={styles.mealCardActions}>
                      <Pressable
                        style={[styles.mealActionBtn, { backgroundColor: colors.primary }]}
                        onPress={() => { onAddToMealPlan(meal); handleClose(); }}
                      >
                        <Text style={[styles.mealActionText, { color: colors.primaryForeground }]}>Plan It</Text>
                      </Pressable>
                      {meal.missingIngredients.length > 0 && (
                        <Pressable
                          style={[styles.mealActionBtn, { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }]}
                          onPress={() => { onAddToGrocery(meal.missingIngredients); handleClose(); }}
                        >
                          <Text style={[styles.mealActionText, { color: colors.foreground }]}>Add to List</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}

                <Pressable onPress={reset} style={styles.scanAgainBtn}>
                  <Text style={[styles.scanAgainText, { color: colors.primary }]}>← Scan again</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function KitchenScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const { selectedProperty } = useProperty();

  const [activeTab, setActiveTab] = useState<'groceries' | 'meals'>('groceries');
  const [selectedList, setSelectedList] = useState<{ id: string; name: string } | null>(null);
  const [scanVisible, setScanVisible] = useState(false);
  const [addListVisible, setAddListVisible] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addMealVisible, setAddMealVisible] = useState(false);
  const [newMeal, setNewMeal] = useState<{ dayOfWeek: number; mealType: string; meal: string }>({ dayOfWeek: new Date().getDay(), mealType: 'dinner', meal: '' });

  const { data: properties } = useGetProperties();
  const { data: allLists } = useGetGroceryLists();
  const lists = allLists?.filter((l: any) => !selectedProperty || l.propertyId === selectedProperty.id);
  const createList = useCreateGroceryList();

  const [weekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'));
  const { data: meals } = useGetMealPlans({ weekStart });
  const createMeal = useCreateMealPlanEntry();

  const addGroceryItem = useAddGroceryItem();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: activeTab === 'groceries' ? getGetGroceryListsQueryKey() : getGetMealPlansQueryKey({ weekStart }) });
    setRefreshing(false);
  };

  const handleCreateList = () => {
    if (!newListName.trim() || !properties?.length) return;
    createList.mutate({ data: { name: newListName.trim(), propertyId: selectedProperty?.id ?? properties[0].id } }, {
      onSuccess: () => { setNewListName(''); setAddListVisible(false); queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() }); },
    });
  };

  const handleCreateMeal = () => {
    if (!newMeal.meal.trim() || !properties?.length) return;
    createMeal.mutate({ data: { weekStart, dayOfWeek: newMeal.dayOfWeek, mealType: newMeal.mealType as any, meal: newMeal.meal.trim(), propertyId: selectedProperty?.id ?? properties[0].id } }, {
      onSuccess: () => {
        setNewMeal({ dayOfWeek: new Date().getDay(), mealType: 'dinner', meal: '' });
        setAddMealVisible(false);
        queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      },
    });
  };

  // Add a meal suggestion to the plan
  const handleAddToMealPlan = (suggestion: MealSuggestion) => {
    if (!properties?.length) return;
    // Find first empty dinner slot this week
    const filledDays = new Set(meals?.filter((m) => m.mealType === 'dinner').map((m) => m.dayOfWeek) ?? []);
    const emptyDay = [0, 1, 2, 3, 4, 5, 6].find((d) => !filledDays.has(d)) ?? new Date().getDay();
    createMeal.mutate({ data: { weekStart, dayOfWeek: emptyDay, mealType: 'dinner', meal: suggestion.name, propertyId: selectedProperty?.id ?? properties[0].id } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      },
    });
  };

  // Add missing ingredients to first grocery list
  const handleAddToGrocery = async (items: string[]) => {
    if (!lists?.length || !items.length) return;
    const listId = lists[0].id;
    for (const name of items) {
      await new Promise<void>((resolve) => {
        addGroceryItem.mutate({ id: listId, data: { name } }, { onSettled: () => resolve() });
      });
    }
    queryClient.invalidateQueries({ queryKey: getGetGroceryItemsQueryKey(listId) });
    queryClient.invalidateQueries({ queryKey: getGetGroceryListsQueryKey() });
  };

  if (selectedList && activeTab === 'groceries') {
    return <GroceryListDetail listId={selectedList.id} listName={selectedList.name} onBack={() => setSelectedList(null)} />;
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().getDay();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Kitchen</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={[styles.aiBtn, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}
            onPress={() => setScanVisible(true)}
          >
            <Icon name="zap" iosName="bolt.fill" size={14} color={colors.primary} />
            <Text style={[styles.aiBtnText, { color: colors.primary }]}>AI</Text>
          </Pressable>
          <Pressable
            style={styles.addBtn}
            onPress={() => activeTab === 'groceries' ? setAddListVisible(true) : setAddMealVisible(true)}
          >
            <Icon name="plus" iosName="plus" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.switcherRow}>
        <PropertySwitcher />
      </View>

      {/* Sub-tabs */}
      <View style={[styles.subTabs, { borderBottomColor: colors.border }]}>
        {(['groceries', 'meals'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.subTab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.subTabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }, activeTab === tab && { fontFamily: 'Inter_600SemiBold' }]}>
              {tab === 'groceries' ? 'Groceries' : 'Meal Plan'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {activeTab === 'groceries' ? (
          <>
            {lists?.length === 0 && (
              <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
                <Icon name="shopping-cart" iosName="cart" size={28} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No lists yet. Tap + to create one.</Text>
              </View>
            )}
            {lists?.map((list) => (
              <Pressable
                key={list.id}
                style={({ pressed }) => [styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.8 }]}
                onPress={() => setSelectedList({ id: list.id, name: list.name })}
              >
                <View style={[styles.listIconBox, { backgroundColor: `${colors.primary}15` }]}>
                  <Icon name="shopping-cart" iosName="cart" size={20} color={colors.primary} />
                </View>
                <View style={styles.listCardMeta}>
                  <Text style={[styles.listCardName, { color: colors.foreground }]}>{list.name}</Text>
                  {list.itemCount > 0 ? (
                    <View style={styles.progressRow}>
                      <View style={[styles.progressBg, { backgroundColor: colors.border }]}>
                        <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.round((list.checkedCount / list.itemCount) * 100)}%` as any }]} />
                      </View>
                      <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>{list.checkedCount}/{list.itemCount}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Empty</Text>
                  )}
                </View>
                <Icon name="chevron-right" iosName="chevron.right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </>
        ) : (
          <View style={styles.weekGrid}>
            {days.map((day, idx) => {
              const dinner = meals?.find((m) => m.dayOfWeek === idx && m.mealType === 'dinner');
              const isToday = idx === today;
              return (
                <Pressable
                  key={day}
                  style={[
                    styles.dayCell,
                    { backgroundColor: colors.card, borderColor: isToday ? colors.primary : colors.border },
                    isToday && { borderWidth: 1.5 },
                  ]}
                  onPress={() => {
                    setNewMeal({ dayOfWeek: idx, mealType: 'dinner', meal: '' });
                    setAddMealVisible(true);
                  }}
                >
                  <Text style={[styles.dayCellLabel, { color: isToday ? colors.primary : colors.mutedForeground }]}>{day}</Text>
                  {dinner ? (
                    <Text style={[styles.dayCellMeal, { color: colors.foreground }]} numberOfLines={2}>{dinner.meal}</Text>
                  ) : (
                    <Text style={[styles.dayCellEmpty, { color: colors.mutedForeground }]}>Plan...</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* AI Scan Sheet */}
      <ScanSheet
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
        onAddToMealPlan={handleAddToMealPlan}
        onAddToGrocery={handleAddToGrocery}
      />

      {/* Add List Modal */}
      <Modal visible={addListVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Grocery List</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground }]}
              value={newListName}
              onChangeText={setNewListName}
              placeholder="e.g. Target, Costco"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              onSubmitEditing={handleCreateList}
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setAddListVisible(false)}>
                <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 15 }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }, !newListName.trim() && { opacity: 0.4 }]} onPress={handleCreateList} disabled={!newListName.trim()}>
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Meal Modal */}
      <Modal visible={addMealVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Plan Dinner — {fullDays[newMeal.dayOfWeek]}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground }]}
              value={newMeal.meal}
              onChangeText={(t) => setNewMeal((p) => ({ ...p, meal: t }))}
              placeholder="e.g. Tacos, Pasta, Grilled chicken"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
              onSubmitEditing={handleCreateMeal}
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setAddMealVisible(false)}>
                <Text style={[{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 15 }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }, !newMeal.meal.trim() && { opacity: 0.4 }]} onPress={handleCreateMeal} disabled={!newMeal.meal.trim()}>
                <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  aiBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  addBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  switcherRow: { paddingHorizontal: 20, paddingBottom: 8 },

  // Sub-tabs
  subTabs: { flexDirection: 'row', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 12 },
  subTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  subTabText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  // Scroll content
  scroll: { paddingHorizontal: 16, gap: 10 },

  // Grocery list card
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  listIconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listCardMeta: { flex: 1, gap: 4 },
  listCardName: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },

  // Week grid (meal plan)
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayCell: {
    width: '30%',
    minHeight: 80,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  dayCellLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCellMeal: { fontSize: 13, fontFamily: 'Inter_500Medium', lineHeight: 18 },
  dayCellEmpty: { fontSize: 12, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },

  // Grocery list detail
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 4 },
  detailTitle: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold' },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  sectionLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: 10, paddingHorizontal: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  itemCheckArea: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  checkboxDone: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  addBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addInput: { flex: 1, height: 40, borderRadius: 20, paddingHorizontal: 14, fontSize: 15, fontFamily: 'Inter_400Regular' },
  addSendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyCard: { padding: 32, borderRadius: 16, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  // Scan sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  sheetHandle: { alignItems: 'center', paddingTop: 10 },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  sheetTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },

  scanBody: { padding: 20, gap: 14 },
  photoPlaceholder: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', padding: 28, gap: 10 },
  photoHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  photoActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  photoBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  // Multi-photo grid
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoGridItem: { width: '47%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, position: 'relative' },
  photoGridImage: { width: '100%', height: '100%' },
  photoGridLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 5, paddingHorizontal: 8 },
  photoGridLabelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  photoGridRemove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  photoGridAdd: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', gap: 4 },
  photoGridAddText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  addPhotoRow: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  photoCountHint: { fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  // Legacy (kept for safety)
  previewWrap: { borderRadius: 16, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: 200 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  retakeBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 14 },
  scanBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  suggestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 14, borderWidth: 1 },
  suggestBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  errorText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },

  resultsBody: { padding: 20, gap: 6 },
  ingredientsCard: { padding: 14, borderRadius: 14, gap: 8 },
  resultsLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  mealCard: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 6, marginTop: 8 },
  mealCardName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  mealCardDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  mealCardMissing: { fontSize: 12, fontFamily: 'Inter_400Regular', fontStyle: 'italic' },
  mealCardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  mealActionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  mealActionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  scanAgainBtn: { alignItems: 'center', paddingVertical: 12 },
  scanAgainText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  modalInput: { height: 46, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  modalConfirmBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
