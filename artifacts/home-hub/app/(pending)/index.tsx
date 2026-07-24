import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';

export default function PendingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <Text style={[styles.emoji]}>🏠</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Account Pending</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Your account has been created but hasn't been configured yet.{'\n\n'}
        Ask the household admin to open{' '}
        <Text style={{ fontFamily: 'Inter_600SemiBold' }}>Settings → Users</Text>
        {' '}and set your role and property.
      </Text>

      <Pressable
        style={[styles.signOutBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        onPress={() => signOut()}
      >
        <Text style={[styles.signOutText, { color: colors.mutedForeground }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  body: { fontSize: 16, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
  signOutBtn: { marginTop: 32, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  signOutText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
