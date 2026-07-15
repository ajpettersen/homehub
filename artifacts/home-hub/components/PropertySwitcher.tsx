import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useColors } from '@/hooks/useColors';
import { useProperty } from '@/context/PropertyContext';
import * as Haptics from 'expo-haptics';

export function PropertySwitcher() {
  const colors = useColors();
  const { properties, selectedProperty, setSelectedProperty } = useProperty();

  if (properties.length < 2) return null;

  const handleSelect = (p: (typeof properties)[0]) => {
    if (p.id === selectedProperty?.id) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    setSelectedProperty(p);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.secondary }]}>
      {properties.map((p) => {
        const isActive = selectedProperty?.id === p.id;
        const isHouse = p.type === 'house';
        return (
          <Pressable
            key={p.id}
            style={[
              styles.pill,
              isActive && { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
            ]}
            onPress={() => handleSelect(p)}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView
                name={isHouse ? 'house.fill' : 'tree.fill'}
                tintColor={isActive ? colors.primaryForeground : colors.mutedForeground}
                size={14}
              />
            ) : (
              <Feather
                name={isHouse ? 'home' : 'map-pin'}
                size={13}
                color={isActive ? colors.primaryForeground : colors.mutedForeground}
              />
            )}
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.primaryForeground : colors.mutedForeground },
                isActive && { fontFamily: 'Inter_600SemiBold' },
              ]}
            >
              {p.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
});
