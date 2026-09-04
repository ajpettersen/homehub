import { View, ActivityIndicator, Pressable, Text } from "react-native";
import { Redirect, Stack, type Href } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useGetMe } from "@workspace/api-client-react";
import { PropertyProvider } from "@/context/PropertyContext";
import { useColors } from "@/hooks/useColors";

export default function HomeLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <PropertyProvider>
      <RoleGuard>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </PropertyProvider>
  );
}

/** Redirect cleaners and pending users away from the family app */
function RoleGuard({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const { data: me, isLoading, isError, refetch } = useGetMe({ query: { enabled: !!isSignedIn } as any });
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !me) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background }}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" }}>
          We couldn't load your family access.
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>
          Check your connection and try again.
        </Text>
        <Pressable onPress={() => refetch()} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (me?.role === "cleaner") return <Redirect href="/(cleaner)" />;
  if (me?.role === "pending") return <Redirect href="/(pending)" />;
  if (me.role === "family" && me.isAdmin && !me.onboardingCompleted) {
    return <Redirect href={"/onboarding" as Href} />;
  }

  return <>{children}</>;
}
