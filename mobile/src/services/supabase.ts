import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Read secret keys from .env
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // Without this, persistSession falls back to in-memory only — session is lost on every app restart
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// React Native's JS timers pause while backgrounded (esp. iOS), so the SDK's
// autoRefreshToken timer alone can't be trusted to keep the token fresh
// across background periods. Per Supabase's documented RN setup, drive the
// refresh loop off AppState instead: https://supabase.com/docs/reference/javascript/auth-startautorefresh
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});