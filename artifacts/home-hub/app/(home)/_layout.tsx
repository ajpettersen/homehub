import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export default function HomeLayout() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  
  // Auth guard disabled for preview — re-enable before going live
  // if (!isLoaded) return null;
  // if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  
  return <Stack screenOptions={{ headerShown: false }} />;
}