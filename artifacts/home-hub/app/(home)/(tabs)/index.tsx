import React from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetDashboard, getGetDashboardQueryKey, getGetPropertiesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { PropertySwitcher } from '@/components/PropertySwitcher';
import { useProperty } from '@/context/PropertyContext';
import { getDeviceTimeZone } from '@/utils/timeZone';

const Icon = ({ name, iosName, size, color }: { name: any; iosName: string; size: number; color: string }) => {
  if (Platform.OS === 'ios') return <SymbolView name={iosName} tintColor={color} size={size} />;
  return <FeatherIcon name={name} size={size} color={color} />;
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { selectedProperty } = useProperty();

  const { data: dashboard } = useGetDashboard({ timezone: getDeviceTimeZone() });
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() }),
    ]);
    setRefreshing(false);
  };

  const todayDate = format(new Date(), 'EEEE, MMMM d');

  // Filter maintenance to selected property
  const maintenance = dashboard?.upcomingMaintenance.filter(
    (t) => !selectedProperty || t.propertyId === selectedProperty.id,
  ) ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>HomeHub</Text>
          <Text style={[styles.headerDate, { color: colors.mutedForeground }]}>{todayDate}</Text>
        </View>
      </View>

      {/* Persistent property switcher */}
      <View style={styles.switcherRow}>
        <PropertySwitcher />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {dashboard && (
          <>
            <View style={styles.summaryRow}>
              <Pressable
                style={({ pressed }) => [styles.summaryCard, { backgroundColor: colors.secondary }, pressed && styles.pressed]}
                onPress={() => router.push('/chores')}
                accessibilityRole="button"
                accessibilityLabel="View chores due today"
              >
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{dashboard.choresToday}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Chores Today</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.summaryCard, { backgroundColor: dashboard.choresOverdue > 0 ? '#FEF2F2' : colors.secondary }, pressed && styles.pressed]}
                onPress={() => router.push('/chores')}
                accessibilityRole="button"
                accessibilityLabel="View overdue chores"
              >
                <Text style={[styles.summaryValue, { color: dashboard.choresOverdue > 0 ? colors.danger : colors.primary }]}>
                  {dashboard.choresOverdue}
                </Text>
                <Text style={[styles.summaryLabel, { color: dashboard.choresOverdue > 0 ? colors.danger : colors.mutedForeground }]}>
                  Overdue Chores
                </Text>
              </Pressable>
            </View>
            <View style={styles.summaryRow}>
              <Pressable
                style={({ pressed }) => [styles.summaryCard, { backgroundColor: dashboard.maintenanceDueSoon > 0 ? '#FEF9C3' : colors.secondary }, pressed && styles.pressed]}
                onPress={() => router.push('/maintenance')}
                accessibilityRole="button"
                accessibilityLabel="View maintenance due soon"
              >
                <Text style={[styles.summaryValue, { color: dashboard.maintenanceDueSoon > 0 ? colors.warning : colors.primary }]}>
                  {dashboard.maintenanceDueSoon}
                </Text>
                <Text style={[styles.summaryLabel, { color: dashboard.maintenanceDueSoon > 0 ? '#B45309' : colors.mutedForeground }]}>
                  Maint. Due Soon
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.summaryCard, { backgroundColor: dashboard.maintenanceOverdue > 0 ? '#FEF2F2' : colors.secondary }, pressed && styles.pressed]}
                onPress={() => router.push('/maintenance')}
                accessibilityRole="button"
                accessibilityLabel="View overdue maintenance"
              >
                <Text style={[styles.summaryValue, { color: dashboard.maintenanceOverdue > 0 ? colors.danger : colors.primary }]}>
                  {dashboard.maintenanceOverdue}
                </Text>
                <Text style={[styles.summaryLabel, { color: dashboard.maintenanceOverdue > 0 ? colors.danger : colors.mutedForeground }]}>
                  Overdue Maint.
                </Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today's Meals</Text>
              {dashboard.todaysMeals.length > 0 ? (
                <Pressable
                  style={({ pressed }) => [styles.mealsCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]}
                  onPress={() => router.push('/kitchen')}
                  accessibilityRole="button"
                  accessibilityLabel="Open today's meal plan"
                >
                  {['breakfast', 'lunch', 'dinner', 'snack'].map((mt) => {
                    const meal = dashboard.todaysMeals.find((m) => m.mealType === mt);
                    if (!meal) return null;
                    return (
                      <View key={mt} style={styles.mealRow}>
                        <Text style={[styles.mealType, { color: colors.mutedForeground }]}>
                          {mt.charAt(0).toUpperCase() + mt.slice(1)}
                        </Text>
                        <Text style={[styles.mealName, { color: colors.foreground }]}>{meal.meal}</Text>
                      </View>
                    );
                  })}
                </Pressable>
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
                  <Icon name="coffee" iosName="cup.and.saucer.fill" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    No meals planned for today. Tap Kitchen to add some!
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {selectedProperty ? `${selectedProperty.name} Maintenance` : 'Upcoming Maintenance'}
              </Text>
              {maintenance.length > 0 ? (
                maintenance.map((task) => (
                  <Pressable
                    key={task.id}
                    style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => router.push('/maintenance')}
                    accessibilityRole="button"
                    accessibilityLabel={`View maintenance task ${task.title}`}
                  >
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                      <Text style={[styles.taskMeta, { color: colors.mutedForeground }]}>
                        {task.propertyName} • {task.category}
                        {(task as any).isCleanerTask ? ' • For cleaner' : ''}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.urgencyBadge,
                        { backgroundColor: task.isOverdue ? '#FEF2F2' : task.isDueSoon ? '#FEF9C3' : '#F0FDF4' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.urgencyText,
                          { color: task.isOverdue ? colors.danger : task.isDueSoon ? '#B45309' : colors.success },
                        ]}
                      >
                        {task.isOverdue ? 'Overdue' : task.isDueSoon ? 'Due Soon' : 'Upcoming'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
                  <Icon name="check-circle" iosName="checkmark.circle.fill" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>All caught up on maintenance!</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerDate: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  switcherRow: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  summaryValue: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.3,
  },
  mealsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mealType: {
    width: 72,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  mealName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 1,
    borderRadius: 16,
  },
  taskInfo: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  taskMeta: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
  },
  urgencyText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});
