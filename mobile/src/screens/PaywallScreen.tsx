/**
 * CLINNA — PaywallScreen
 * Monetization gate: Credit Packs (one-time) + Pro Subscription.
 * RevenueCat handles the actual purchase; Supabase synced after success.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/AppNavigator';
import { usePurchases } from '../hooks/usePurchases';
import { useScansLeft } from '../hooks/useScansLeft';
import { C, F, FS, SP } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Paywall'>;
type Tab = 'credits' | 'pro';

// ─── Static product catalogue ─────────────────────────────────────

interface ProductInfo {
  id:       string;
  title:    string;
  subtitle: string;
  price:    string;
  badge?:   string;
}

const CREDIT_PRODUCTS: ProductInfo[] = [
  {
    id:       'clinna_credit_1',
    title:    '1 REPORT',
    subtitle: 'ONE-TIME',
    price:    '$2.99',
  },
  {
    id:       'clinna_credit_5',
    title:    '5 REPORTS',
    subtitle: 'ONE-TIME  ·  $2.00 EACH',
    price:    '$9.99',
    badge:    'EN POPÜLER',
  },
  {
    id:       'clinna_credit_15',
    title:    '15 REPORTS',
    subtitle: 'ONE-TIME  ·  $1.33 EACH',
    price:    '$19.99',
  },
];

const PRO_PRODUCTS: ProductInfo[] = [
  {
    id:       'clinna_pro_monthly',
    title:    'MONTHLY',
    subtitle: 'UNLIMITED DEEP SCANS',
    price:    '$14.99 / MO',
  },
  {
    id:       'clinna_pro_annual',
    title:    'ANNUAL',
    subtitle: 'UNLIMITED DEEP SCANS',
    price:    '$99.99 / YR',
    badge:    '%44 TASARRUF',
  },
];

// ─── Screen ───────────────────────────────────────────────────────

export default function PaywallScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();

  const { offerings, loading, error, purchase, restore } = usePurchases();
  const { load: reloadEntitlement } = useScansLeft();

  const [activeTab,   setActiveTab]   = useState<Tab>('credits');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  const products       = activeTab === 'credits' ? CREDIT_PRODUCTS : PRO_PRODUCTS;
  const selectedProduct = products.find(p => p.id === selectedId);

  const handleTabChange = (tab: Tab) => {
    if (tab === activeTab) return;
    Haptics.selectionAsync();
    setActiveTab(tab);
    setSelectedId(null);
  };

  const handleSelect = (id: string) => {
    Haptics.selectionAsync();
    setSelectedId(prev => (prev === id ? null : id));
  };

  const handlePurchase = async () => {
    if (!selectedId || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await purchase(selectedId);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reloadEntitlement();
      navigation.goBack();
    }
  };

  const handleRestore = async () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const hadSub = await restore();
    if (hadSub) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reloadEntitlement();
      navigation.goBack();
    }
  };

  // CTA label
  const ctaLabel = loading
    ? '[ PROCESSING... ]'
    : selectedProduct
    ? activeTab === 'credits'
      ? `[ BUY · ${selectedProduct.price} ]`
      : `[ SUBSCRIBE · ${selectedProduct.price} ]`
    : '[ SELECT A PLAN ]';

  const ctaActive = !!selectedId && !loading;

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      <ScrollView
        contentContainerStyle={[
          S.scroll,
          { paddingTop: insets.top + SP.lg, paddingBottom: insets.bottom + SP.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back ── */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={S.back}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={S.backTxt}>← BACK</Text>
        </TouchableOpacity>

        {/* ── Header ── */}
        <View style={S.headerBlock}>
          <Text style={S.eyebrow}>CLINNA  ·  SYSTEM GATE</Text>
          <Text style={S.title}>[ CLINNA PRO ]</Text>
          <View style={S.rule} />
          <Text style={S.headerSub}>
            Unlock unlimited deep scans and credit packs.{'\n'}
            Your purchase syncs instantly across all devices.
          </Text>
        </View>

        {/* ── Tab bar ── */}
        <TabBar activeTab={activeTab} onTabChange={handleTabChange} />

        {/* ── Product cards ── */}
        <View style={S.cardList}>
          {products.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              selected={selectedId === product.id}
              onPress={() => handleSelect(product.id)}
            />
          ))}
        </View>

        {/* ── Error message ── */}
        {error ? (
          <Text style={S.errorTxt}>[ ERROR: {error} ]</Text>
        ) : null}

        {/* ── CTA button ── */}
        <TouchableOpacity
          style={[S.cta, ctaActive ? S.ctaActive : S.ctaIdle]}
          onPress={handlePurchase}
          disabled={!ctaActive}
          activeOpacity={0.7}
        >
          <Text style={[S.ctaTxt, ctaActive ? S.ctaTxtActive : S.ctaTxtIdle]}>
            {ctaLabel}
          </Text>
        </TouchableOpacity>

        {/* ── Restore ── */}
        <TouchableOpacity
          style={S.restoreBtn}
          onPress={handleRestore}
          disabled={loading}
          activeOpacity={0.6}
        >
          <Text style={S.restoreTxt}>[ RESTORE PURCHASES ]</Text>
        </TouchableOpacity>

        {/* ── Disclaimer ── */}
        <Text style={S.disclaimer}>
          Payment is charged to your App Store account at confirmation.
          Subscriptions automatically renew unless auto-renew is turned off at least
          24 hours before the end of the current period.
          Manage or cancel subscriptions in your App Store account settings.
        </Text>
      </ScrollView>
    </View>
  );
}

// ─── TabBar ───────────────────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <View style={TB.root}>
      {(['credits', 'pro'] as Tab[]).map(tab => {
        const isActive = activeTab === tab;
        const label    = tab === 'credits' ? 'CREDIT PACKS' : 'PRO SUBSCRIPTION';
        return (
          <TouchableOpacity
            key={tab}
            style={TB.tab}
            onPress={() => onTabChange(tab)}
            activeOpacity={0.7}
          >
            <Text style={[TB.lbl, isActive && TB.lblActive]}>{label}</Text>
            {isActive && <View style={TB.indicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── ProductCard ──────────────────────────────────────────────────

function ProductCard({
  product,
  selected,
  onPress,
}: {
  product:  ProductInfo;
  selected: boolean;
  onPress:  () => void;
}) {
  return (
    <TouchableOpacity
      style={[PC.card, selected && PC.cardActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Title row + badge */}
      <View style={PC.topRow}>
        <Text style={[PC.title, selected && PC.titleActive]}>
          {product.title}
        </Text>
        {product.badge ? (
          <View style={[PC.badge, selected && PC.badgeActive]}>
            <Text style={[PC.badgeTxt, selected && PC.badgeTxtActive]}>
              {product.badge}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Subtitle + price */}
      <View style={PC.bottomRow}>
        <Text style={[PC.subtitle, selected && PC.subtitleActive]}>
          {product.subtitle}
        </Text>
        <Text style={[PC.price, selected && PC.priceActive]}>
          {product.price}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.black,
  },
  scroll: {
    paddingHorizontal: SP.lg,
    gap: SP.lg,
  },

  // Back
  back: {
    alignSelf: 'flex-start',
    paddingVertical: SP.xs,
    marginBottom: SP.xs,
  },
  backTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 2.5,
    color:         C.grey600,
  },

  // Header
  headerBlock: { gap: SP.xs },
  eyebrow: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 4,
    color:         C.grey600,
  },
  title: {
    fontFamily:    F.mono,
    fontSize:      28,
    letterSpacing: 1.5,
    color:         C.white,
    fontWeight:    '700',
  },
  rule: {
    height:          1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical:  SP.xs,
  },
  headerSub: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 0.3,
    color:         C.grey600,
    lineHeight:    18,
  },

  // Cards
  cardList: { gap: SP.sm },

  // Error
  errorTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 1.5,
    color:         C.red,
    lineHeight:    18,
  },

  // CTA button
  cta: {
    paddingVertical: 18,
    alignItems:      'center',
    borderWidth:     1,
    marginTop:       SP.xs,
  },
  ctaActive: {
    backgroundColor: C.white,
    borderColor:     C.white,
  },
  ctaIdle: {
    backgroundColor: 'transparent',
    borderColor:     'rgba(255,255,255,0.2)',
  },
  ctaTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xs,
    letterSpacing: 3,
    fontWeight:    '700',
  },
  ctaTxtActive: { color: C.black },
  ctaTxtIdle:   { color: 'rgba(255,255,255,0.3)' },

  // Restore
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: SP.sm,
  },
  restoreTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 2,
    color:         C.grey600,
  },

  // Disclaimer
  disclaimer: {
    fontFamily:    F.mono,
    fontSize:      9,
    letterSpacing: 0.3,
    color:         C.grey600,
    opacity:       0.45,
    lineHeight:    14,
    textAlign:     'center',
  },
});

const TB = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: SP.sm,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    paddingBottom:  SP.sm,
    position:       'relative',
  },
  lbl: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 2.5,
    color:         C.grey600,
  },
  lblActive: { color: C.white },
  indicator: {
    position:        'absolute',
    bottom:          0,
    left:            SP.lg,
    right:           SP.lg,
    height:          1,
    backgroundColor: C.white,
  },
});

const PC = StyleSheet.create({
  card: {
    borderWidth:      1,
    borderColor:      C.white,
    backgroundColor:  'transparent',
    paddingHorizontal: SP.md,
    paddingVertical:   SP.md,
    gap:              SP.xs,
  },
  cardActive: {
    backgroundColor: C.white,
  },

  topRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  title: {
    fontFamily:    F.mono,
    fontSize:      FS.sm,
    letterSpacing: 2,
    color:         C.white,
    fontWeight:    '700',
  },
  titleActive: { color: C.black },

  badge: {
    backgroundColor:  C.white,
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  badgeActive: {
    backgroundColor: C.black,
  },
  badgeTxt: {
    fontFamily:    F.mono,
    fontSize:      8,
    letterSpacing: 1.5,
    color:         C.black,
    fontWeight:    '700',
  },
  badgeTxtActive: { color: C.white },

  bottomRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
  },
  subtitle: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 1,
    color:         C.grey600,
    flex:          1,
    marginRight:   SP.sm,
  },
  subtitleActive: { color: 'rgba(0,0,0,0.5)' },

  price: {
    fontFamily:    F.mono,
    fontSize:      FS.sm,
    letterSpacing: 1,
    color:         C.white,
    fontWeight:    '700',
  },
  priceActive: { color: C.black },
});
