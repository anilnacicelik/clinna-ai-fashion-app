import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase';
import type { ScanEntitlement } from '../services/api';

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

  // Scans are charged by the backend (services/entitlement.py); a paid scan
  // response carries what is left afterwards. Apply it so the counter matches
  // the server without another round trip.
  const applyEntitlement = useCallback((ent: ScanEntitlement) => {
    setScansLeft(Math.max(0, ent.scans_left ?? 0));
    setCredits(  Math.max(0, ent.credits    ?? 0));
    setIsProActive(!!ent.is_pro_active);
  }, []);

  useEffect(() => { load(); }, []);

  return { scansLeft, credits, isPro, isProActive, load, applyEntitlement };
}
