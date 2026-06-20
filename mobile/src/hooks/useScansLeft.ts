import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase';

export function useScansLeft() {
  const [scansLeft, setScansLeft] = useState<number>(0);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('scans_left')
        .eq('id', session.user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile row — create with default 3 scans
          const { error: upsertErr } = await supabase
            .from('profiles')
            .upsert({ id: session.user.id, scans_left: 3 }, { onConflict: 'id' });
          if (!upsertErr) setScansLeft(3);
        } else {
          console.error('[CLINNA] useScansLeft load:', error);
        }
        return;
      }

      setScansLeft(Math.max(0, data.scans_left ?? 0));
    } catch (e) {
      console.error('[CLINNA] useScansLeft load:', e);
    }
  }, []);

  // Atomic decrement via Supabase RPC — auth.uid() resolved server-side
  const decrement = useCallback(async (): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc('decrement_scans_left');
      if (error) {
        console.error('[CLINNA] useScansLeft decrement:', error);
        return 0;
      }
      const next = Math.max(0, data ?? 0);
      setScansLeft(next);
      return next;
    } catch (e) {
      console.error('[CLINNA] useScansLeft decrement:', e);
      return 0;
    }
  }, []);

  useEffect(() => { load(); }, []);

  return { scansLeft, load, decrement };
}
