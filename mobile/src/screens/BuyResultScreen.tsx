/**
 * CLINNA — BuyResultScreen  "Before you buy"
 *
 * The in-store answer. The user is standing in a shop holding a price tag and
 * has about ten seconds, so this screen says one thing at the top and hides
 * everything else behind a toggle. The full receipt is one tap away.
 *
 * Style is taken from ResultScreen (header, rules, EconRow, bracket buttons,
 * hidden share card) and PaywallScreen (headline weight). No new colours,
 * fonts or shapes — theme tokens only.
 *
 * Deliberately not said anywhere on this screen: whether to buy it. Every
 * number carries "~" or "EST." and the copy never renders a verdict.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Animated, StatusBar, Dimensions, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP } from '../theme';
import { strings } from '../i18n/strings';
import CostCard, { CostBar } from '../components/CostCard';
import ArchiveStatus from '../components/ArchiveStatus';
import { useAutoArchive } from '../hooks/useAutoArchive';
import { formatUsd, markupOf, comparePrice } from '../utils/cost';
import { track } from '../services/analytics';
import { maybeRequestReview } from '../services/review';

const { width } = Dimensions.get('window');

type Nav   = NativeStackNavigationProp<RootStackParamList, 'BuyResult'>;
type Route = RouteProp<RootStackParamList, 'BuyResult'>;
type ShareState = 'idle' | 'preparing';

// ─── Atoms — same shapes as ResultScreen ──────────────────────────

function Rule({ faint }: { faint?: boolean }) {
  return (
    <View style={{ height: 1, backgroundColor: faint ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)' }} />
  );
}

function EconRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={EC.row}>
      <Text style={EC.lbl}>{label}</Text>
      <Text style={EC.val}>{value}</Text>
    </View>
  );
}
const EC = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  lbl: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey400 },
  val: { fontFamily: F.mono, fontSize: FS.md, color: C.white },
});

// ═══════════════════════════════════════════════════════════════════
// Screen
// ═══════════════════════════════════════════════════════════════════

export default function BuyResultScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const insets     = useSafeAreaInsets();

  const {
    imageUri, result: r, tagPrice = null,
    archiveKey = null, guestMode = false,
  } = route.params;

  const [shareState, setShareState] = useState<ShareState>('idle');
  const [open,       setOpen]       = useState(false);
  const cardRef = useRef<View>(null);

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Filed on open. A guest scan has no account to file it against.
  const archive = useAutoArchive(
    guestMode ? null : archiveKey,
    { mode: 'buy', imageUri, report: r, tagPrice },
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
    maybeRequestReview();
  }, []);

  // ── Share — capture the hidden cost card and share as PNG ────────
  const handleShare = useCallback(async () => {
    if (shareState === 'preparing') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('share_tapped', { mode: 'buy' });
    setShareState('preparing');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('[ SHARE UNAVAILABLE ]', '[ SHARING IS NOT SUPPORTED ON THIS DEVICE ]', [{ text: strings.common.okBtn }]);
        return;
      }
      const uri = await captureRef(cardRef, {
        format:  'png',
        quality: 1,
        width:   1080,
        height:  1920,
        result:  'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType:    'image/png',
        dialogTitle: `CLINNA · ${r.archive_id.brand || 'Cost Report'}`,
        UTI:         'public.png',
      });
    } catch (err) {
      console.error('[BuyResultScreen] share error:', err);
      Alert.alert('[ SHARE FAILED ]', '[ COULD NOT GENERATE SHARE CARD — TRY AGAIN ]', [{ text: strings.common.okBtn }]);
    } finally {
      setShareState('idle');
    }
  }, [r, shareState]);

  // Same report, same archive key — ResultScreen reads the row this screen
  // already wrote rather than filing a second one.
  const handleFullReport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('full_report_tapped');
    navigation.navigate('Result', {
      imageUri, result: r, archiveKey: archiveKey ?? undefined, fromBuy: true, guestMode,
    });
  }, [navigation, imageUri, r, archiveKey, guestMode]);

  const handleHome = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Home');
  }, [navigation]);

  const handleFeedback = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Feedback');
  }, [navigation]);

  // ── Non-fashion guard — same shape as ResultScreen ───────────────
  if (!r.is_fashion_item) {
    return (
      <View style={S.root}>
        <StatusBar barStyle="light-content" />
        <View style={[S.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={handleHome}>
            <Text style={S.hBtn}>← HOME</Text>
          </TouchableOpacity>
          <Text style={S.hTitle}>{strings.buy.title}</Text>
          <View style={{ width: 52 }} />
        </View>
        <Rule />
        <View style={S.notFashion}>
          <Text style={S.notFashionTitle}>{strings.buy.notFashionTitle}</Text>
          <Text style={S.notFashionNote}>{strings.buy.notFashionNote}</Text>
          <TouchableOpacity style={S.outlineBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={S.outlineBtnTxt}>{strings.buy.tryAgainBtn}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const f     = r.financials;
  const cost  = f.total_production_cost_usd;
  // The tag price the user typed wins; the model's retail estimate stands in
  // when they skipped it. Neither → the headline is the cost on its own.
  const price  = comparePrice(tagPrice, f.estimated_retail_price_usd);
  const markup = markupOf(price, cost);

  const headline = price != null
    ? strings.buy.headlineWithPrice(formatUsd(price), formatUsd(cost))
    : strings.buy.headlineCostOnly(formatUsd(cost));

  const brandKnown = !!r.archive_id.brand && r.archive_id.brand.toUpperCase() !== 'UNKNOWN';

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={handleHome} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={S.hBtn}>← HOME</Text>
        </TouchableOpacity>
        <Text style={S.hTitle}>{strings.buy.title}</Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          disabled={shareState === 'preparing'}
        >
          <Text style={S.hBtn}>{shareState === 'preparing' ? '...' : 'SHARE ↑'}</Text>
        </TouchableOpacity>
      </View>
      <Rule />

      <ScrollView
        style={S.scroll}
        contentContainerStyle={[S.content, { paddingBottom: insets.bottom + SP.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>

          {/* ── The answer ── */}
          <View style={S.headlineBlock}>
            <Text style={S.headline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
              {headline}
            </Text>

            {markup.kind === 'markup' && (
              <Text style={S.markup}>{strings.buy.markupLine(markup.pct)}</Text>
            )}
            {markup.kind === 'nearCost' && (
              <Text style={S.markup}>{strings.buy.nearCostLine}</Text>
            )}

            <Text style={S.disclaimer}>{strings.buy.disclaimer}</Text>
          </View>
          <Rule />

          {/* ── Photo ── */}
          {!!imageUri && (
            <View style={S.imageWrap}>
              <Image source={{ uri: imageUri }} style={S.image} resizeMode="cover" />
            </View>
          )}

          {/* ── Breakdown — collapsed by default ── */}
          <TouchableOpacity
            style={S.toggle}
            onPress={() => { Haptics.selectionAsync(); setOpen(o => !o); }}
            activeOpacity={0.6}
          >
            <Text style={S.toggleTxt}>
              {open ? strings.buy.breakdownClose : strings.buy.breakdownOpen}
            </Text>
          </TouchableOpacity>

          {open && (
            <View>
              <Rule faint />
              <EconRow label={strings.buy.labelMaterial} value={formatUsd(f.material_cost_usd)} />
              <Rule faint />
              <EconRow label={strings.buy.labelLabor} value={formatUsd(f.labor_cost_usd)} />
              {brandKnown && (
                <>
                  <Rule faint />
                  <EconRow label={strings.buy.labelBrand} value={r.archive_id.brand} />
                </>
              )}
              <CostBar material={f.material_cost_usd} labor={f.labor_cost_usd} />
              <Text style={S.confidenceNote}>
                [ {f.confidence.toUpperCase()} CONFIDENCE ]
              </Text>
            </View>
          )}
          <Rule />

          {/* ── Archive status ── */}
          <View style={{ height: SP.lg }} />
          {archive.enabled && <ArchiveStatus
            state={archive.state}
            removing={archive.removing}
            onRemove={archive.remove}
            onRetry={archive.retry}
          />}

          {/* ── Actions ── */}
          <View style={{ height: SP.sm }} />
          <TouchableOpacity
            style={S.shareBtn}
            onPress={handleShare}
            activeOpacity={0.8}
            disabled={shareState === 'preparing'}
          >
            <Text style={S.shareBtnTxt}>
              {shareState === 'preparing' ? strings.buy.sharePreparing : strings.buy.shareBtn}
            </Text>
          </TouchableOpacity>

          <View style={{ height: SP.sm }} />
          <TouchableOpacity style={S.outlineBtn} onPress={handleFullReport} activeOpacity={0.7}>
            <Text style={S.outlineBtnTxt}>{strings.buy.fullReportBtn}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={S.feedbackBtn}
            onPress={handleFeedback}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Text style={S.feedbackTxt}>{strings.buy.feedbackBtn}</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>

      {/* Hidden share card — buy variant carries the tag price line + stamp. */}
      <View style={S.hiddenCardWrap} pointerEvents="none">
        <CostCard ref={cardRef} imageUri={imageUri} r={r} tagPrice={tagPrice} buyMode />
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.lg, paddingBottom: 14 },
  hBtn:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.grey400 },
  hTitle: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4,   color: C.white   },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: SP.lg },

  // The one thing the screen exists to say.
  headlineBlock: { paddingTop: SP.xl, paddingBottom: SP.lg, gap: SP.sm },
  headline: {
    fontFamily:    F.mono,
    fontSize:      FS.xl,           // 28
    fontWeight:    '700',
    color:         C.white,
    letterSpacing: 0.5,
    lineHeight:    34,
  },
  markup: {
    fontFamily:    F.mono,
    fontSize:      FS.sm,
    letterSpacing: 1.5,
    color:         C.white,
    lineHeight:    20,
  },
  disclaimer: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 0.3,
    color:         C.grey600,       // 5.56:1
    lineHeight:    16,
    paddingTop:    SP.xs,
  },

  imageWrap: { width: '100%', height: Math.round(width * (4 / 3) * 0.55), marginVertical: SP.lg, overflow: 'hidden' },
  image:     { width: '100%', height: '100%' },

  toggle:    { paddingVertical: SP.md, alignItems: 'center' },
  toggleTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey400 },

  confidenceNote: { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, lineHeight: 16, paddingTop: SP.sm, paddingBottom: SP.md, letterSpacing: 0.3 },

  shareBtn:    { backgroundColor: C.white, paddingVertical: 18, paddingHorizontal: SP.lg, alignItems: 'center' },
  shareBtnTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, fontWeight: '700', color: C.black },

  outlineBtn:    { borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingVertical: 17, paddingHorizontal: SP.lg, flexDirection: 'row', justifyContent: 'center' },
  outlineBtnTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey400 },

  feedbackBtn: { marginTop: SP.lg, alignItems: 'center' },
  feedbackTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 1.5, color: C.grey600 },

  notFashion:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: SP.xl },
  notFashionTitle: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.grey400 },
  notFashionNote:  { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 0.3, color: C.grey400, textAlign: 'center', lineHeight: 18 },

  hiddenCardWrap: { position: 'absolute', top: -9999, left: -9999 },
});
