import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useSignUp } from '@clerk/expo';
import { useRouter, Link, type Href } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSubmit = async () => {
    try {
      const { error } = await signUp.password({
        emailAddress,
        password,
      });
      
      if (error) {
        console.error(error);
        return;
      }
      
      if (!error) {
        await signUp.verifications.sendEmailCode();
        setPendingVerification(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVerify = async () => {
    try {
      await signUp.verifications.verifyEmailCode({ code });
      
      if (signUp.status === 'complete') {
        await signUp.finalize({
          navigate: ({ decorateUrl }) => router.replace(decorateUrl('/') as Href)
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const emailError = errors?.fields?.emailAddress?.message;
  const passwordError = errors?.fields?.password?.message;
  const codeError = errors?.fields?.code?.message;

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.primary }]}>HomeHub</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {pendingVerification ? 'Check your email for a code' : 'Join your family'}
          </Text>
        </View>

        {!pendingVerification ? (
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

            <View nativeID="clerk-captcha" />

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
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Sign Up</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.foreground }]}>Verification Code</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={code}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                onChangeText={setCode}
              />
              {codeError && <Text style={[styles.error, { color: colors.destructive }]}>{codeError}</Text>}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.9 },
                fetchStatus === 'fetching' && { opacity: 0.7 }
              ]}
              onPress={handleVerify}
              disabled={fetchStatus === 'fetching' || !code}
            >
              {fetchStatus === 'fetching' ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Verify Email</Text>
              )}
            </Pressable>
            
            <Pressable 
              style={[styles.secondaryButton]}
              onPress={() => signUp.verifications.sendEmailCode()}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Resend Code</Text>
            </Pressable>
          </View>
        )}

        {!pendingVerification && (
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={[styles.link, { color: colors.primary }]}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        )}
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
  secondaryButton: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  secondaryButtonText: {
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