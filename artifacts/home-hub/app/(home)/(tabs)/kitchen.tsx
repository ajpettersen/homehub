import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, RefreshControl,
  Pressable, Platform, Modal, TextInput, ActivityIndicator, Image,
  KeyboardAvoidingView,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
  useGetMealRecipe,
  useDeleteMealPlanEntry,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addWeeks } from 'date-fns';
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

    // Request the right permission first
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setError('Camera permission denied. Please allow camera access in your device Settings.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Photo library permission denied. Please allow photo access in your device Settings.');
        return;
      }
    }

    try {
      const picker = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const picked = await picker({
        mediaTypes: 'images',
        quality: 0.55,
        base64: true,
      });
      if (!picked.canceled && picked.assets[0]?.base64) {
        setPhotos(prev => [...prev, { uri: picked.assets[0].uri, base64: picked.assets[0].base64! }]);
        setResult(null);
        setError(null);
      }
    } catch (e) {
      setError('Could not open camera or photo library. Please try again.');
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

// ─── Meal plan print HTML ─────────────────────────────────────────────────────

function generateMealPlanHTML(
  meals: any[],
  fullDays: string[],
  weekStart: string,
): string {
  const weekDate = new Date(weekStart + 'T12:00:00');
  const weekEndDate = new Date(weekDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const todayIdx = new Date().getDay();

  const byDay: Record<number, string> = {};
  meals?.forEach((m) => { if (m.mealType === 'dinner') byDay[m.dayOfWeek] = m.meal; });

  const rows = fullDays.map((day, idx) => {
    const meal = byDay[idx];
    const isToday = idx === todayIdx;
    return `
      <div class="day-card${isToday ? ' today' : ''}">
        <div class="day-name">${day}</div>
        ${meal
          ? `<div class="meal-name">${meal}</div>`
          : '<div class="empty">Not planned</div>'}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Georgia, serif; padding: 32px; color: #111; background: #fff; }
  header { text-align: center; margin-bottom: 32px; }
  header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  header .sub { font-size: 14px; color: #888; margin-top: 6px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
  .day-card { border: 1.5px solid #e5e5e5; border-radius: 10px; padding: 14px 10px; min-height: 110px; }
  .day-card.today { border-color: #3b82f6; background: #eff6ff; }
  .day-name { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #999; margin-bottom: 8px; }
  .day-card.today .day-name { color: #3b82f6; }
  .meal-name { font-size: 14px; line-height: 1.45; color: #111; font-weight: 500; }
  .empty { font-size: 13px; color: #ccc; font-style: italic; }
  footer { margin-top: 28px; text-align: center; font-size: 11px; color: #bbb; border-top: 1px solid #eee; padding-top: 14px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<header>
  <h1>🏠 Weekly Meal Plan</h1>
  <div class="sub">Week of ${fmt(weekDate)} – ${fmt(weekEndDate)}</div>
</header>
<div class="grid">${rows}</div>
<footer>Printed from HomeHub · ${new Date().toLocaleDateString()}</footer>
</body>
</html>`;
}

// ─── Meal Detail / Recipe Sheet ───────────────────────────────────────────────

function MealDetailSheet({
  meal,
  visible,
  onClose,
  onAddIngredients,
}: {
  meal: string | null;
  visible: boolean;
  onClose: () => void;
  onAddIngredients: (items: string[]) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);

  const recipeMutation = useGetMealRecipe();
  const recipe = (recipeMutation.data as any)?.recipe;
  const loading = recipeMutation.isPending;

  useEffect(() => {
    if (meal && visible) {
      setCheckedSteps(new Set());
      setImageB64(null);
      setGeneratingImage(false);
      recipeMutation.mutate({ data: { meal } });
    }
  }, [meal, visible]);

  const handleGeneratePhoto = () => {
    if (!meal || generatingImage) return;
    setGeneratingImage(true);
    recipeMutation.mutate(
      { data: { meal, generateImage: true } },
      {
        onSuccess: (data: any) => {
          if (data?.imageBase64) setImageB64(data.imageBase64);
          setGeneratingImage(false);
        },
        onError: () => setGeneratingImage(false),
      },
    );
  };

  const toggleStep = (idx: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <View style={[styles.recipeSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.sheetHandle}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          </View>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1, marginRight: 12 }]} numberOfLines={2}>{meal}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon name="x" iosName="xmark" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {loading && (
              <View style={styles.recipeLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.recipeLoadingText, { color: colors.mutedForeground }]}>Getting recipe…</Text>
              </View>
            )}

            {recipe && !loading && (
              <View style={styles.recipeBody}>
                {/* Meta chips: prep, cook, servings, difficulty */}
                <View style={styles.recipeMetaRow}>
                  {recipe.prepTime && (
                    <View style={[styles.recipeMetaChip, { backgroundColor: colors.secondary }]}>
                      <Icon name="clock" iosName="clock" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.recipeMetaText, { color: colors.mutedForeground }]}>Prep {recipe.prepTime}</Text>
                    </View>
                  )}
                  {recipe.cookTime && (
                    <View style={[styles.recipeMetaChip, { backgroundColor: colors.secondary }]}>
                      <Icon name="zap" iosName="bolt.fill" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.recipeMetaText, { color: colors.mutedForeground }]}>Cook {recipe.cookTime}</Text>
                    </View>
                  )}
                  {recipe.servings && (
                    <View style={[styles.recipeMetaChip, { backgroundColor: colors.secondary }]}>
                      <Icon name="users" iosName="person.2" size={12} color={colors.mutedForeground} />
                      <Text style={[styles.recipeMetaText, { color: colors.mutedForeground }]}>Serves {recipe.servings}</Text>
                    </View>
                  )}
                  {recipe.difficulty && (
                    <View style={[styles.recipeMetaChip, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.recipeMetaText, { color: colors.mutedForeground }]}>{recipe.difficulty}</Text>
                    </View>
                  )}
                </View>

                {/* Ingredients */}
                <Text style={[styles.recipeSectionTitle, { color: colors.foreground }]}>Ingredients</Text>
                {(recipe.ingredients ?? []).map((ing: string, idx: number) => (
                  <View key={idx} style={[styles.recipeIngredientRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.ingredientDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.recipeIngredientText, { color: colors.foreground }]}>{ing}</Text>
                  </View>
                ))}
                <Pressable
                  style={[styles.recipeAddBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}10` }]}
                  onPress={() => { onAddIngredients(recipe.ingredients ?? []); onClose(); }}
                >
                  <Icon name="shopping-cart" iosName="cart" size={15} color={colors.primary} />
                  <Text style={[styles.recipeAddBtnText, { color: colors.primary }]}>Add all to grocery list</Text>
                </Pressable>

                {/* Steps */}
                <Text style={[styles.recipeSectionTitle, { color: colors.foreground, marginTop: 20 }]}>Instructions</Text>
                {(recipe.steps ?? []).map((step: string, idx: number) => (
                  <Pressable
                    key={idx}
                    style={[styles.recipeStepRow, { borderBottomColor: colors.border }]}
                    onPress={() => toggleStep(idx)}
                  >
                    <View style={[
                      styles.recipeStepNum,
                      { backgroundColor: checkedSteps.has(idx) ? colors.primary : colors.secondary },
                    ]}>
                      {checkedSteps.has(idx)
                        ? <Icon name="check" iosName="checkmark" size={11} color="#fff" />
                        : <Text style={[styles.recipeStepNumText, { color: colors.foreground }]}>{idx + 1}</Text>
                      }
                    </View>
                    <Text style={[
                      styles.recipeStepText,
                      { color: checkedSteps.has(idx) ? colors.mutedForeground : colors.foreground },
                      checkedSteps.has(idx) && { textDecorationLine: 'line-through' },
                    ]}>{step}</Text>
                  </Pressable>
                ))}

                {/* Tips */}
                {recipe.tips && (
                  <View style={[styles.recipeTipBox, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}25` }]}>
                    <Text style={[styles.recipeTipLabel, { color: colors.primary }]}>💡 Tip</Text>
                    <Text style={[styles.recipeTipText, { color: colors.foreground }]}>{recipe.tips}</Text>
                  </View>
                )}

                {/* Photo — below recipe so it doesn't block content */}
                {imageB64 ? (
                  <Image
                    source={{ uri: `data:image/png;base64,${imageB64}` }}
                    style={[styles.recipeFoodPhoto, { marginTop: 20, borderRadius: 16 }]}
                    resizeMode="cover"
                  />
                ) : (
                  <Pressable
                    style={[styles.recipePhotoPlaceholder, { backgroundColor: colors.secondary, borderColor: colors.border, marginTop: 20 }]}
                    onPress={handleGeneratePhoto}
                    disabled={generatingImage}
                  >
                    {generatingImage ? (
                      <>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={[styles.recipePhotoHint, { color: colors.primary }]}>Generating dish photo…</Text>
                      </>
                    ) : (
                      <>
                        <Icon name="image" iosName="photo" size={18} color={colors.mutedForeground} />
                        <Text style={[styles.recipePhotoHint, { color: colors.mutedForeground }]}>Generate a dish photo</Text>
                      </>
                    )}
                  </Pressable>
                )}
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
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [recipeVisible, setRecipeVisible] = useState(false);
  const [recipeMeal, setRecipeMeal] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const { data: properties } = useGetProperties();
  const { data: allLists } = useGetGroceryLists();
  const lists = allLists?.filter((l: any) => !selectedProperty || l.propertyId === selectedProperty.id);
  const createList = useCreateGroceryList();

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 0 });
    return format(addWeeks(base, weekOffset), 'yyyy-MM-dd');
  }, [weekOffset]);

  const weekLabel = useMemo(() => {
    const start = new Date(weekStart + 'T12:00:00');
    const end = addWeeks(start, 1);
    end.setDate(end.getDate() - 1);
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    return `${format(start, 'MMM d')}–${format(end, 'MMM d')}`;
  }, [weekStart, weekOffset]);

  const { data: meals } = useGetMealPlans({ weekStart });
  const createMeal = useCreateMealPlanEntry();
  const deleteMeal = useDeleteMealPlanEntry();

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
    const doCreate = () => {
      createMeal.mutate({ data: { weekStart, dayOfWeek: newMeal.dayOfWeek, mealType: newMeal.mealType as any, meal: newMeal.meal.trim(), propertyId: selectedProperty?.id ?? properties[0].id } }, {
        onSuccess: () => {
          setNewMeal({ dayOfWeek: new Date().getDay(), mealType: 'dinner', meal: '' });
          setEditingMealId(null);
          setAddMealVisible(false);
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          queryClient.invalidateQueries({ queryKey: getGetMealPlansQueryKey({ weekStart }) });
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        },
      });
    };
    // If editing an existing meal, delete it first then create fresh
    if (editingMealId) {
      deleteMeal.mutate({ id: editingMealId }, { onSettled: doCreate });
    } else {
      doCreate();
    }
  };

  const handleDeleteMeal = (id: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteMeal.mutate({ id }, {
      onSuccess: () => {
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

  // Print the weekly meal plan as a PDF via AirPrint / system share
  const handlePrintPlan = async () => {
    try {
      const html = generateMealPlanHTML(meals ?? [], fullDays, weekStart);
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.print(); }
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Weekly Meal Plan' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      console.error('Print failed:', e);
    }
  };

  // Open the recipe detail sheet for a planned meal
  const handleViewRecipe = (mealName: string) => {
    setRecipeMeal(mealName);
    setRecipeVisible(true);
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

      {/* Week nav — only on meals tab */}
      {activeTab === 'meals' && (
        <View style={[styles.weekNavBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Pressable onPress={() => setWeekOffset(o => o - 1)} hitSlop={16} style={styles.weekNavArrow}>
            <Icon name="chevron-left" iosName="chevron.left" size={18} color={colors.primary} />
          </Pressable>
          <Text style={[styles.weekNavLabel, { color: colors.foreground }]}>{weekLabel}</Text>
          <Pressable onPress={() => setWeekOffset(o => o + 1)} hitSlop={16} style={styles.weekNavArrow}>
            <Icon name="chevron-right" iosName="chevron.right" size={18} color={colors.primary} />
          </Pressable>
          <Pressable onPress={handlePrintPlan} hitSlop={12} style={[styles.weekNavPrint, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Icon name="printer" iosName="printer" size={15} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

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
          <>
            {fullDays.map((dayName, idx) => {
              const dayMeals = (meals ?? []).filter((m) => m.dayOfWeek === idx)
                .sort((a, b) => {
                  const order: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
                  return (order[a.mealType] ?? 9) - (order[b.mealType] ?? 9);
                });
              const isToday = idx === today;
              const MEAL_EMOJI: Record<string, string> = { breakfast: '🍳', lunch: '🥗', dinner: '🍽️', snack: '🍎' };

              return (
                <View
                  key={dayName}
                  style={[
                    styles.dayCard,
                    { backgroundColor: colors.card, borderColor: isToday ? colors.primary : colors.border },
                    isToday && { borderWidth: 2 },
                  ]}
                >
                  {/* Left: day column */}
                  <View style={[styles.dayCardLeft, { backgroundColor: isToday ? `${colors.primary}18` : colors.secondary }]}>
                    <Text style={[styles.dayCardDay, { color: isToday ? colors.primary : colors.mutedForeground }]}>
                      {days[idx]}
                    </Text>
                    {isToday && <View style={[styles.dayCardTodayDot, { backgroundColor: colors.primary }]} />}
                  </View>

                  {/* Right: meals + add row */}
                  <View style={[styles.dayCardContent, { paddingVertical: 8 }]}>
                    {dayMeals.map((m) => (
                      <Pressable
                        key={m.id}
                        style={styles.dayMealRow}
                        onPress={() => handleViewRecipe(m.meal)}
                      >
                        <Text style={styles.dayMealEmoji}>{MEAL_EMOJI[m.mealType] ?? '🍴'}</Text>
                        <Text style={[styles.dayMealName, { color: colors.foreground }]} numberOfLines={1}>{m.meal}</Text>
                        <Pressable
                          hitSlop={10}
                          style={[styles.dayMealDelete, { backgroundColor: colors.secondary }]}
                          onPress={() => handleDeleteMeal(m.id)}
                        >
                          <Icon name="x" iosName="xmark" size={10} color={colors.mutedForeground} />
                        </Pressable>
                      </Pressable>
                    ))}

                    <Pressable
                      style={styles.dayCardAddRow}
                      onPress={() => {
                        setNewMeal({ dayOfWeek: idx, mealType: 'dinner', meal: '' });
                        setEditingMealId(null);
                        setAddMealVisible(true);
                      }}
                    >
                      <Icon name="plus" iosName="plus" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.dayCardEmptyText, { color: colors.mutedForeground }]}>
                        {dayMeals.length === 0 ? 'Add meal' : 'Add another'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* AI Scan Sheet */}
      <ScanSheet
        visible={scanVisible}
        onClose={() => setScanVisible(false)}
        onAddToMealPlan={handleAddToMealPlan}
        onAddToGrocery={handleAddToGrocery}
      />

      {/* Meal Recipe Detail Sheet */}
      <MealDetailSheet
        meal={recipeMeal}
        visible={recipeVisible}
        onClose={() => setRecipeVisible(false)}
        onAddIngredients={handleAddToGrocery}
      />

      {/* Add List Modal */}
      <Modal visible={addListVisible} animationType="slide" transparent onRequestClose={() => setAddListVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalOverlay} onPress={() => setAddListVisible(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.modalBox, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Grocery List</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                  value={newListName}
                  onChangeText={setNewListName}
                  placeholder="e.g. Target, Costco, Whole Foods"
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateList}
                />
                <View style={styles.modalBtns}>
                  <Pressable style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setAddListVisible(false)}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }, !newListName.trim() && { opacity: 0.4 }]} onPress={handleCreateList} disabled={!newListName.trim()}>
                    <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Create</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Meal Modal */}
      <Modal visible={addMealVisible} animationType="slide" transparent onRequestClose={() => setAddMealVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalOverlay} onPress={() => setAddMealVisible(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={[styles.modalBox, { backgroundColor: colors.card }]}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 8, gap: 14 }}
                >
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Plan a Meal</Text>

                  {/* Day picker */}
                  <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Day</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {fullDays.map((day, idx) => {
                      const active = newMeal.dayOfWeek === idx;
                      return (
                        <Pressable
                          key={day}
                          style={[
                            styles.dayPill,
                            { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
                          ]}
                          onPress={() => setNewMeal((p) => ({ ...p, dayOfWeek: idx }))}
                        >
                          <Text style={[styles.dayPillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                            {days[idx]}
                          </Text>
                          {idx === today && (
                            <Text style={[styles.dayPillSub, { color: active ? `${colors.primaryForeground}99` : colors.mutedForeground }]}>Today</Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Meal type */}
                  <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Meal type</Text>
                  <View style={styles.mealTypeRow}>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((type) => {
                      const active = newMeal.mealType === type;
                      const emoji = type === 'breakfast' ? '🍳' : type === 'lunch' ? '🥗' : type === 'dinner' ? '🍽️' : '🍎';
                      return (
                        <Pressable
                          key={type}
                          style={[
                            styles.mealTypeChip,
                            { backgroundColor: active ? colors.primary : colors.secondary, borderColor: active ? colors.primary : colors.border },
                          ]}
                          onPress={() => setNewMeal((p) => ({ ...p, mealType: type }))}
                        >
                          <Text style={styles.mealTypeEmoji}>{emoji}</Text>
                          <Text style={[styles.mealTypeLabel, { color: active ? colors.primaryForeground : colors.foreground }]}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Meal name */}
                  <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>What are you making?</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                    value={newMeal.meal}
                    onChangeText={(t) => setNewMeal((p) => ({ ...p, meal: t }))}
                    placeholder="e.g. Tacos, Pasta, Grilled chicken…"
                    placeholderTextColor={colors.mutedForeground}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateMeal}
                  />

                  <View style={styles.modalBtns}>
                    <Pressable style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setAddMealVisible(false)}>
                      <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_500Medium', fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }, !newMeal.meal.trim() && { opacity: 0.4 }]}
                      onPress={handleCreateMeal}
                      disabled={!newMeal.meal.trim()}
                    >
                      <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Save</Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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

  // Week navigation bar
  weekNavBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  weekNavArrow: { padding: 4 },
  weekNavLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  weekNavPrint: { padding: 7, borderRadius: 10, borderWidth: 1, marginLeft: 4 },

  // Day cards (vertical meal plan)
  dayCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  dayCardLeft: { width: 54, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 4 },
  dayCardDay: { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  dayCardTodayDot: { width: 5, height: 5, borderRadius: 3 },
  dayCardContent: { flex: 1, paddingHorizontal: 12, justifyContent: 'center', gap: 4 },

  // Individual meal rows inside a day card
  dayMealRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dayMealEmoji: { fontSize: 16, width: 22, textAlign: 'center' },
  dayMealName: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  dayMealDelete: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dayCardAddRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, opacity: 0.6 },
  dayCardEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular' },

  // Recipe sheet
  recipeSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  recipeFoodPhoto: { width: '100%', height: 220, marginBottom: 4 },
  recipePhotoPlaceholder: { margin: 20, height: 140, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  recipePhotoHint: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  recipeLoading: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  recipeLoadingText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  recipeBody: { paddingHorizontal: 20, paddingBottom: 24 },
  recipeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  recipeMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  recipeMetaText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  recipeSectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  recipeIngredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  ingredientDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  recipeIngredientText: { fontSize: 14, fontFamily: 'Inter_400Regular', flex: 1 },
  recipeAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  recipeAddBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  recipeStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  recipeStepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  recipeStepNumText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  recipeStepText: { fontSize: 14, fontFamily: 'Inter_400Regular', flex: 1, lineHeight: 20 },
  recipeTipBox: { marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1, gap: 4 },
  recipeTipLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  recipeTipText: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 },

  // Add-meal modal extras
  modalLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  dayPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, alignItems: 'center', minWidth: 52 },
  dayPillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dayPillSub: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 1 },
  mealTypeRow: { flexDirection: 'row', gap: 8 },
  mealTypeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  mealTypeEmoji: { fontSize: 18 },
  mealTypeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  modalInput: { height: 50, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, fontFamily: 'Inter_400Regular', borderWidth: 1 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  modalConfirmBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
