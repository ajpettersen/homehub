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

  // Web = Replit preview — auth bypassed so you can still see the app.
  // On a real device (iOS/Android) Clerk auth is fully enforced.
  if (Platform.OS !== "web") {
    if (!isLoaded) return null;
    if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <PropertyProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </PropertyProvider>
  );
}