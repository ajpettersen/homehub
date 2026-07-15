import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { Platform, View, ActivityIndicator } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  // Web = Replit preview — skip auth so you can see the app without signing in.
  // On a real iOS/Android device Clerk auth is enforced.
  if (Platform.OS === "web") {
    return <Redirect href="/(home)/(tabs)/" />;
  }

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <Redirect href="/(home)/(tabs)/" />;
}
