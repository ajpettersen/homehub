import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useGetDashboard, useGetProperties, getGetDashboardQueryKey, getGetPropertiesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Feather as FeatherIcon } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const queryClient = useQueryClient();
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  
  const { data: dashboard, isLoading: isLoadingDashboard, refetch: refetchDashboard } = useGetDashboard();
  const { data: properties, isLoading: isLoadingProperties } = useGetProperties();
  
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetPropertiesQueryKey() })
    ]);
    setRefreshing(false);
  };
  
  const todayDate = format(new Date(), 'EEEE, MMMM d');
  
  const IconComponent = ({ name, iosName, size, color }: { name: any, iosName: string, size: number, color: string }) => {
    if (Platform.OS === 'ios') {
      return <SymbolView name={iosName} tintColor={color} size={size} />;
    }
    return <FeatherIcon name={name} size={size} color={color} />;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.background }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>HomeHub</Text>
          <Text style={[styles.headerDate, { color: colors.mutedForeground }]}>{todayDate}</Text>
        </View>
      </View>
      
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {properties && properties.length > 0 && (
          <View style={styles.propertySelector}>
            <Pressable
              style={[
                styles.propertyPill,
                !selectedPropertyId && { backgroundColor: colors.primary }
              ]}
              onPress={() => setSelectedPropertyId(null)}
            >
              <Text style={[
                styles.propertyPillText,
                !selectedPropertyId ? { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' } : { color: colors.mutedForeground }
              ]}>All Properties</Text>
            </Pressable>
            {properties.map(prop => (
              <Pressable
                key={prop.id}
                style={[
                  styles.propertyPill,
                  selectedPropertyId === prop.id && { backgroundColor: colors.primary }
                ]}
                onPress={() => setSelectedPropertyId(prop.id)}
              >
                <IconComponent 
                  name={prop.type === 'house' ? 'home' : 'map-pin'} 
                  iosName={prop.type === 'house' ? 'house.fill' : 'tree.fill'} 
                  size={14} 
                  color={selectedPropertyId === prop.id ? colors.primaryForeground : colors.mutedForeground} 
                />
                <Text style={[
                  styles.propertyPillText,
                  selectedPropertyId === prop.id ? { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' } : { color: colors.mutedForeground }
                ]}>{prop.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {dashboard && (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{dashboard.choresToday}</Text>
                <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Chores Today</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: dashboard.choresOverdue > 0 ? '#FEF2F2' : colors.secondary }]}>
                <Text style={[styles.summaryValue, { color: dashboard.choresOverdue > 0 ? colors.danger : colors.primary }]}>{dashboard.choresOverdue}</Text>
                <Text style={[styles.summaryLabel, { color: dashboard.choresOverdue > 0 ? colors.danger : colors.mutedForeground }]}>Overdue Chores</Text>
              </View>
            </View>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: dashboard.maintenanceDueSoon > 0 ? '#FEF9C3' : colors.secondary }]}>
                <Text style={[styles.summaryValue, { color: dashboard.maintenanceDueSoon > 0 ? colors.warning : colors.primary }]}>{dashboard.maintenanceDueSoon}</Text>
                <Text style={[styles.summaryLabel, { color: dashboard.maintenanceDueSoon > 0 ? '#B45309' : colors.mutedForeground }]}>Maint. Due Soon</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: dashboard.maintenanceOverdue > 0 ? '#FEF2F2' : colors.secondary }]}>
                <Text style={[styles.summaryValue, { color: dashboard.maintenanceOverdue > 0 ? colors.danger : colors.primary }]}>{dashboard.maintenanceOverdue}</Text>
                <Text style={[styles.summaryLabel, { color: dashboard.maintenanceOverdue > 0 ? colors.danger : colors.mutedForeground }]}>Overdue Maint.</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today's Meals</Text>
              {dashboard.todaysMeals.length > 0 ? (
                <View style={[styles.mealsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {['breakfast', 'lunch', 'dinner', 'snack'].map((mealType) => {
                    const mealForType = dashboard.todaysMeals.find(m => m.mealType === mealType);
                    if (!mealForType) return null;
                    return (
                      <View key={mealType} style={styles.mealRow}>
                        <View style={styles.mealTypeContainer}>
                          <Text style={[styles.mealType, { color: colors.mutedForeground }]}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
                        </View>
                        <Text style={[styles.mealName, { color: colors.foreground }]}>{mealForType.meal}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
                  <IconComponent name="coffee" iosName="cup.and.saucer.fill" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No meals planned for today. Tap Kitchen to add some!</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming Maintenance</Text>
              {dashboard.upcomingMaintenance.filter(task => !selectedPropertyId || task.propertyId === selectedPropertyId).length > 0 ? (
                dashboard.upcomingMaintenance
                  .filter(task => !selectedPropertyId || task.propertyId === selectedPropertyId)
                  .map(task => (
                  <View key={task.id} style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                      <Text style={[styles.taskProperty, { color: colors.mutedForeground }]}>{task.propertyName} • {task.category}</Text>
                    </View>
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
                ))
              ) : (
                <View style={[styles.emptyCard, { backgroundColor: colors.secondary }]}>
                  <IconComponent name="check-circle" iosName="checkmark.circle.fill" size={24} color={colors.mutedForeground} />
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
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerDate: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 24,
  },
  propertySelector: {
    flexDirection: 'row',
    gap: 8,
  },
  propertyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  propertyPillText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
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
    gap: 16,
  },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mealTypeContainer: {
    width: 80,
  },
  mealType: {
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
    marginBottom: 12,
  },
  taskInfo: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  taskProperty: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgencyText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
});