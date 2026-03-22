import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSignIn = async () => {
    setMessage(null);
    setBusy(true);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setMessage(error);
  };

  const onSignUp = async () => {
    setMessage(null);
    setBusy(true);
    const { error } = await signUp(email.trim(), password);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    setMessage("Check your email to confirm, or disable confirmations in Supabase Auth settings for dev.");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-neutral-50 px-6 pt-16 dark:bg-neutral-950"
    >
      <Text className="mb-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Sign in
      </Text>
      <Text className="mb-8 text-sm text-neutral-600 dark:text-neutral-400">
        Email and password (enable Email provider in Supabase)
      </Text>

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Email
      </Text>
      <TextInput
        className="mb-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor="#a3a3a3"
        value={email}
        onChangeText={setEmail}
      />

      <Text className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        Password
      </Text>
      <TextInput
        className="mb-6 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#a3a3a3"
        value={password}
        onChangeText={setPassword}
      />

      {message ? (
        <Text className="mb-4 text-sm text-amber-800 dark:text-amber-200">{message}</Text>
      ) : null}

      <Pressable
        className="mb-3 items-center rounded-lg bg-neutral-900 py-3.5 active:opacity-80 dark:bg-neutral-100"
        onPress={onSignIn}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-semibold text-white dark:text-neutral-900">Sign in</Text>
        )}
      </Pressable>

      <Pressable
        className="items-center rounded-lg border border-neutral-300 py-3.5 active:bg-neutral-100 dark:border-neutral-600 dark:active:bg-neutral-800"
        onPress={onSignUp}
        disabled={busy}
      >
        <Text className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Create account
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
