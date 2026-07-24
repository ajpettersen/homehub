import { useEffect } from "react";
import { Platform } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { PropertyProvider } from "@/context/PropertyContext";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);

  // Auth temporarily bypassed for testing — skip sign-in check on all platforms

  return (
    <PropertyProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PropertyProvider>
  );
}