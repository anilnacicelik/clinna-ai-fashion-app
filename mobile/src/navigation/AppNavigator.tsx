/**
 * CLINNA — AppNavigator.tsx
 * Auth Guard: session check via onAuthStateChange.
 * No user → Auth stack | User present → Home stack
 */

import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { C } from '../theme';
import { supabase } from '../services/supabase';

import AuthScreen    from '../screens/AuthScreen';
import HomeScreen    from '../screens/HomeScreen';
import CameraScreen  from '../screens/CameraScreen';
import ResultScreen  from '../screens/ResultScreen';
import HistoryScreen from '../screens/HistoryScreen';
import PaywallScreen from '../screens/PaywallScreen';
import { ArchiveReport } from '../services/api';

export type RootStackParamList = {
  Auth:    undefined;
  Home:    undefined;
  Camera:  undefined;
  Result:  { imageUri: string; result: ArchiveReport };
  History: undefined;
  Paywall: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const NAV_THEME = {
  dark: true,
  colors: {
    primary:      C.white,
    background:   C.black,
    card:         C.black,
    text:         C.white,
    border:       'rgba(255,255,255,0.1)',
    notification: C.grey400,
  },
};

const SCREEN_OPTS = {
  headerShown:    false,
  animation:      'fade' as const,
  contentStyle:   { backgroundColor: C.black },
  gestureEnabled: true,
};

export default function AppNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check current session on startup
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Listen for session changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Minimal loading screen while session is resolving
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="rgba(255,255,255,0.3)" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={NAV_THEME}>
      <Stack.Navigator screenOptions={SCREEN_OPTS}>
        {session ? (
          // ── Session active: Home stack ───────────────────────────
          <>
            <Stack.Screen name="Home"    component={HomeScreen} />
            <Stack.Screen name="Camera"  component={CameraScreen} />
            <Stack.Screen
              name="Result"
              component={ResultScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
          </>
        ) : (
          // ── No session: Auth stack ──────────────────────────────
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
