/**
 * CLINNA — SessionContext.tsx
 * Single source of truth for the Supabase session.
 *
 * The session used to live inside AppNavigator and decide which stack was
 * mounted. It lives here instead so screens can read it directly and gate
 * individual actions (see HomeScreen), rather than the whole app being
 * gated behind the Auth screen.
 *
 * Kept in its own module — AppNavigator imports the screens, so a screen
 * importing a runtime value back from AppNavigator would be a require cycle.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

interface SessionState {
  /** Active Supabase session, or null when signed out. */
  session: Session | null;
  /** True until the persisted session has been read back on startup. */
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore the persisted session on startup
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // Track session changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
}

/** Read the current session. Null means signed out — callers must handle it. */
export function useSession() {
  return useContext(SessionContext);
}
