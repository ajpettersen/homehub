import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Platform, View, ActivityIndicator, StyleSheet } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Auth temporarily bypassed for Expo Go testing — go straight to app
  return <Redirect href="/(home)/(tabs)" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
