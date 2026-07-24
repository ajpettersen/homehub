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

  // Auth temporarily bypassed for Expo Go testing

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
  const { data: me, isLoading } = useGetMe({ query: { enabled: !!isSignedIn } as any });

  // Bypass role routing while auth is bypassed
  if (!isSignedIn || isLoading) {
    return <>{children}</>;
  }

  if (me?.role === "cleaner") return <Redirect href="/(cleaner)" />;
  if (me?.role === "pending") return <Redirect href="/(pending)" />;

  return <>{children}</>;
}
