import React from 'react';
import { StyleSheet, TextInput, View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useSignIn } from '@clerk/expo';
import { useRouter, Link, type Href } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');

  const handleSubmit = async () => {
    try {
      const { error } = await signIn.password({
        emailAddress,
        password,
      });
      if (error) {
        console.error(error);
        return;
      }
      
      if (signIn.status === 'complete') {
        await signIn.finalize({
          navigate: ({ decorateUrl }) => router.replace(decorateUrl('/') as Href)
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const emailError = errors?.fields?.identifier?.message;
  const passwordError = errors?.fields?.password?.message;

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>HomeHub</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Keep your family organized</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              autoCapitalize="none"
              value={emailAddress}
              placeholder="emily@example.com"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={setEmailAddress}
              keyboardType="email-address"
            />
            {emailError && <Text style={[styles.error, { color: colors.destructive }]}>{emailError}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
              value={password}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
              onChangeText={setPassword}
            />
            {passwordError && <Text style={[styles.error, { color: colors.destructive }]}>{passwordError}</Text>}
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.9 },
              fetchStatus === 'fetching' && { opacity: 0.7 }
            ]}
            onPress={handleSubmit}
            disabled={fetchStatus === 'fetching' || !emailAddress || !password}
          >
            {fetchStatus === 'fetching' ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text style={[styles.link, { color: colors.primary }]}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
  error: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  link: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
});