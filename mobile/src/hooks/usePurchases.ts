import { useState, useCallback, useEffect } from 'react';
import { PurchasesOffering } from 'react-native-purchases';
import {
  configure,
  identifyUser,
  getOfferings,
  purchasePackage,
  restorePurchases as restoreService,
  findPackage,
} from '../services/purchases';
import { supabase } from '../services/supabase';

export function usePurchases() {
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Configure SDK + identify the current Supabase user
      const { data: { session } } = await supabase.auth.getSession();
      configure();
      if (session?.user?.id) {
        await identifyUser(session.user.id);
      }
      // Load offerings (silently — no error state on initial load failure)
      try {
        setOfferings(await getOfferings());
      } catch (e) {
        console.warn('[CLINNA usePurchases] getOfferings:', e);
      }
    })();
  }, []);

  const purchase = useCallback(async (productId: string): Promise<boolean> => {
    const pkg = findPackage(offerings, productId);
    if (!pkg) {
      setError('STORE NOT AVAILABLE — TRY AGAIN LATER');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      await purchasePackage(pkg);
      return true;
    } catch (e: any) {
      // Cancelled by user — not an error worth surfacing
      if (e?.userCancelled === true) return false;
      console.error('[CLINNA usePurchases] purchase:', e);
      setError((e?.message ?? 'PURCHASE FAILED').toUpperCase());
      return false;
    } finally {
      setLoading(false);
    }
  }, [offerings]);

  const restore = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const info = await restoreService();
      return info.activeSubscriptions.length > 0;
    } catch (e: any) {
      console.error('[CLINNA usePurchases] restore:', e);
      setError((e?.message ?? 'RESTORE FAILED').toUpperCase());
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { offerings, loading, error, purchase, restore };
}
