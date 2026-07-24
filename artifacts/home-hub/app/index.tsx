import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Platform, View, ActivityIndicator, StyleSheet } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Web (Replit preview) — skip auth
  if (Platform.OS === "web") {
    return <Redirect href="/(home)/(tabs)" />;
  }

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Signed in — enter home; role-based routing happens inside (home)/_layout.tsx
  return <Redirect href="/(home)/(tabs)" />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
