/**
 * CLINNA — RevenueCat Purchases Service
 * Wraps react-native-purchases SDK. Entitlements (credits/is_pro) are granted
 * server-side by backend/routers/webhooks.py via the RevenueCat webhook —
 * the client has no write access to those columns (see
 * mobile/services/security_hardening_migration.sql). This avoids a client
 * being able to self-grant credits/pro by calling Supabase directly with a
 * forged value.
 */

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '';

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
  // Entitlement grant happens server-side via the RevenueCat webhook.
  // Callers should re-poll useScansLeft().load() a couple of times with a
  // short delay to pick up the update once the webhook lands.
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function checkSubscriptionStatus(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return info.activeSubscriptions.length > 0;
}
