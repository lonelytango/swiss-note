import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { isSupabaseConfigured } from "./src/lib/supabase";
import { AuthScreen } from "./src/screens/AuthScreen";
import { NotesScreen } from "./src/screens/NotesScreen";

function Root() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return session ? <NotesScreen /> : <AuthScreen />;
}

export default function App() {
  if (!isSupabaseConfigured()) {
    return (
      <View className="flex-1 items-center justify-center bg-neutral-50 px-6 dark:bg-neutral-950">
        <Text className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Dev Notes
        </Text>
        <Text className="text-center text-neutral-600 dark:text-neutral-400">
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env (see .env.example).
        </Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <Root />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
