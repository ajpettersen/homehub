import { useEffect } from "react";
import { Platform, View, ActivityIndicator } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter, useGetMe } from "@workspace/api-client-react";
import { PropertyProvider } from "@/context/PropertyContext";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  // Web: bypass auth (Replit preview)
  if (Platform.OS !== "web") {
    if (!isLoaded) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      );
    }
    if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  }

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
  const { data: me, isLoading } = useGetMe({ query: { enabled: !!isSignedIn && Platform.OS !== "web" } as any });

  // On web or still loading — just render normally
  if (Platform.OS === "web" || !isSignedIn || isLoading) {
    return <>{children}</>;
  }

  if (me?.role === "cleaner") return <Redirect href="/(cleaner)" />;
  if (me?.role === "pending") return <Redirect href="/(pending)" />;

  return <>{children}</>;
}
