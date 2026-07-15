import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase';

interface Entitlement {
  scans_left:    number;
  credits:       number;
  is_pro:        boolean;
  is_pro_active: boolean;
}

export function useScansLeft() {
  const [scansLeft,   setScansLeft]   = useState<number>(0);
  const [credits,     setCredits]     = useState<number>(0);
  const [isPro,       setIsPro]       = useState<boolean>(false);
  const [isProActive, setIsProActive] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase.rpc('get_user_entitlement');

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile row missing — create with new defaults
          const { error: upsertErr } = await supabase
            .from('profiles')
            .upsert({ id: session.user.id, scans_left: 2 }, { onConflict: 'id' });
          if (!upsertErr) setScansLeft(2);
        } else {
          console.error('[CLINNA] useScansLeft load:', error);
        }
        return;
      }

      const ent = data as Entitlement;
      setScansLeft(Math.max(0, ent.scans_left    ?? 0));
      setCredits(  Math.max(0, ent.credits       ?? 0));
      setIsPro(               ent.is_pro         ?? false);
      setIsProActive(         ent.is_pro_active  ?? false);
    } catch (e) {
      console.error('[CLINNA] useScansLeft load:', e);
    }
  }, []);

  // Atomic decrement via Supabase RPC — auth.uid() resolved server-side.
  // Returns the new count on success, or null if the RPC failed — null is
  // NOT the same as 0 (a legitimate "no scans left" result) and callers
  // must check for it explicitly so a failed sync isn't mistaken for success.
  const decrement = useCallback(async (): Promise<number | null> => {
    try {
      const { data, error } = await supabase.rpc('decrement_scans_left');
      if (error) {
        console.error('[CLINNA] useScansLeft decrement:', error);
        return null;
      }
      const next = Math.max(0, data ?? 0);
      setScansLeft(next);
      return next;
    } catch (e) {
      console.error('[CLINNA] useScansLeft decrement:', e);
      return null;
    }
  }, []);

  // Deduct one credit — true if consumed, false if none left, null if the
  // RPC itself failed (distinct from false — see decrement() above).
  const useCredit = useCallback(async (): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase.rpc('use_credit');
      if (error) {
        console.error('[CLINNA] useScansLeft useCredit:', error);
        return null;
      }
      if (data === true) {
        setCredits(prev => Math.max(0, prev - 1));
      }
      return data === true;
    } catch (e) {
      console.error('[CLINNA] useScansLeft useCredit:', e);
      return null;
    }
  }, []);

  useEffect(() => { load(); }, []);

  return { scansLeft, credits, isPro, isProActive, load, decrement, useCredit };
}
