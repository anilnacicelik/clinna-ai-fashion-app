/**
 * CLINNA — RevenueCat Purchases Service
 * Wraps react-native-purchases SDK; syncs outcomes to Supabase profiles.
 */

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';
import { supabase } from './supabase';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

// Credit pack product ID → how many credits to add
const CREDIT_AMOUNTS: Record<string, number> = {
  clinna_credit_1:  1,
  clinna_credit_5:  5,
  clinna_credit_15: 15,
};

// ─── Setup ────────────────────────────────────────────────────────

export function configure(): void {
  if (!API_KEY) {
    console.warn('[CLINNA Purchases] EXPO_PUBLIC_REVENUECAT_API_KEY not set — purchases disabled');
    return;
  }
  Purchases.configure({ apiKey: API_KEY });
}

export async function identifyUser(userId: string): Promise<void> {
  if (!API_KEY) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[CLINNA Purchases] logIn failed:', e);
  }
}

// ─── Offerings ────────────────────────────────────────────────────

export async function getOfferings(): Promise<PurchasesOffering | null> {
  const { current } = await Purchases.getOfferings();
  return current;
}

/** Find a package inside an offering by its product identifier. */
export function findPackage(
  offering: PurchasesOffering | null,
  productId: string,
): PurchasesPackage | null {
  if (!offering) return null;
  return offering.availablePackages.find(
    p => p.product.identifier === productId,
  ) ?? null;
}

// ─── Purchase ─────────────────────────────────────────────────────

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  await _syncPurchaseToSupabase(pkg.product.identifier);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const info = await Purchases.restorePurchases();
  await _syncRestoreToSupabase(info);
  return info;
}

export async function checkSubscriptionStatus(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return info.activeSubscriptions.length > 0;
}

// ─── Supabase sync ────────────────────────────────────────────────

async function _syncPurchaseToSupabase(productId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const creditAmount = CREDIT_AMOUNTS[productId];

    if (creditAmount != null) {
      // Credit pack — read current credits then increment
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', session.user.id)
        .single();

      await supabase
        .from('profiles')
        .update({ credits: (profile?.credits ?? 0) + creditAmount })
        .eq('id', session.user.id);
    } else {
      // Pro subscription — set expiry based on period
      const days      = productId === 'clinna_pro_annual' ? 365 : 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('profiles')
        .update({ is_pro: true, pro_expires_at: expiresAt })
        .eq('id', session.user.id);
    }
  } catch (e) {
    console.error('[CLINNA Purchases] Supabase purchase sync error:', e);
  }
}

async function _syncRestoreToSupabase(info: CustomerInfo): Promise<void> {
  try {
    if (!info.activeSubscriptions.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    // Restore: extend 30 days from now as a conservative sync
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('profiles')
      .update({ is_pro: true, pro_expires_at: expiresAt })
      .eq('id', session.user.id);
  } catch (e) {
    console.error('[CLINNA Purchases] Supabase restore sync error:', e);
  }
}
