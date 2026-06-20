import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Read secret keys from .env
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Create the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Persists the session in memory after login; avoids re-prompting on every launch
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});