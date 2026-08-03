/**
 * CLINNA — AppNavigator.tsx
 * Single stack, public root: the app opens on HomeScreen with no session
 * required. Auth is a screen the user is sent to only when they take an
 * action that needs an account (see HomeScreen's requireAuth).
 *
 * Guard still holds in both directions:
 *   - Session-only screens are unreachable while signed out — every entry
 *     point to them goes through requireAuth.
 *   - Signing out from anywhere resets back to Home (see the effect below).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { C } from '../theme';
import { SessionProvider, useSession } from '../context/SessionContext';

import AuthScreen    from '../screens/AuthScreen';
import HomeScreen    from '../screens/HomeScreen';
import CameraScreen  from '../screens/CameraScreen';
import ResultScreen  from '../screens/ResultScreen';
import HistoryScreen from '../screens/HistoryScreen';
import PaywallScreen from '../screens/PaywallScreen';
import { ArchiveReport } from '../services/api';

/** Screens that require a session — where AuthScreen can send the user next. */
export type AuthRedirect = 'Camera' | 'History' | 'Paywall';

export type RootStackParamList = {
  Auth:    { redirectTo?: AuthRedirect } | undefined;
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

function RootNavigator() {
  const { session, loading } = useSession();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Sign-out guard: drop back to the public root so a signed-out user is never
  // left sitting on a session-only screen (e.g. logout from HistoryScreen).
  // Compares against the previous value so token refreshes don't trigger it.
  const prevSession = useRef<Session | null>(null);
  useEffect(() => {
    const hadSession = prevSession.current;
    prevSession.current = session;
    if (hadSession && !session && navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [session]);

  // Loading screen while the persisted session is resolving — keeps a
  // returning user from seeing the signed-out Home for a frame.
  //
  // Branded rather than bare: this is the first thing shown on a cold start,
  // and an unlabelled dark screen is easy to read as a hang or as a gate in
  // front of the app. The wordmark makes it legible as a splash.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Text style={{ fontFamily: 'MissFajardose', fontSize: 72, color: '#F2F0EB' }}>Clinna</Text>
        <ActivityIndicator color="rgba(255,255,255,0.6)" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={NAV_THEME}>
      <Stack.Navigator initialRouteName="Home" screenOptions={SCREEN_OPTS}>
        {/* ── Public root — no session required ─────────────────────── */}
        <Stack.Screen name="Home" component={HomeScreen} />

        {/* ── Auth — pushed on demand, dismissable ──────────────────── */}
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ animation: 'slide_from_bottom' }}
        />

        {/* ── Session-only — entered through requireAuth ────────────── */}
        <Stack.Screen name="Camera" component={CameraScreen} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
