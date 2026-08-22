import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// NativeTabs (expo-router/unstable-native-tabs) and expo-glass-effect both
// require native modules that are not bundled in Expo Go. We always use the
// classic Tabs layout so the app works in Expo Go and dev builds alike.

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const tabBarHeight = isWeb ? 92 : Math.max(84, 56 + insets.bottom);
  const tabIconSize = isIOS ? 27 : 25;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: isWeb ? 28 : Math.max(insets.bottom, 8),
        },
        tabBarItemStyle: {
          height: 54,
          minHeight: 54,
          paddingVertical: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'Inter_600SemiBold',
          lineHeight: 15,
          marginTop: -1,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.background },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="home" size={tabIconSize} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: 'Chores',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="checkmark.circle" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="check-circle" size={tabIconSize} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          title: 'Kitchen',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="cart" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="shopping-cart" size={tabIconSize} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="checklist" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="check-square" size={tabIconSize} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="maintenance"
        options={{
          title: 'Maint.',
          tabBarAccessibilityLabel: 'Maintenance',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="wrench.and.screwdriver" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="tool" size={tabIconSize} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gearshape" tintColor={color} size={tabIconSize} />
            ) : (
              <Feather name="settings" size={tabIconSize} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}