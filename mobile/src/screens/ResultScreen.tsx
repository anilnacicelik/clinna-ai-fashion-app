/**
 * CLINNA — ResultScreen v7  "Analysis Receipt"
 *
 * v7 changes:
 *   - Authenticity score removed entirely (legal risk) — replaced with a
 *     plain "OBSERVED SIGNALS" list of construction observations only.
 *   - Production cost breakdown is now always shown, independent of brand.
 *   - Shareable cost card: captures a hidden brutalist 1080x1920 card
 *     (product photo + cost breakdown + watermark) and shares it as a PNG.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Animated, StatusBar, Dimensions, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP } from '../theme';
import { ArchiveReport } from '../services/api';
import { uploadScanImage } from '../services/storageUpload';
import { supabase } from '../services/supabase';

const { width } = Dimensions.get('window');

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Result'>;
type Route = RouteProp<RootStackParamList, 'Result'>;
type SaveState  = 'idle' | 'saving' | 'saved' | 'error';
type ShareState = 'idle' | 'preparing';

// ─── Formatting helpers ─────────────────────────────────────────────

function formatUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function modeLabel(mode: ArchiveReport['scan_mode']): string {
  if (mode === 'deep_auth') return 'DETAILED';
  if (mode === 'acc')       return 'ACCESSORY';
  return 'QUICK';
}

// ─── AsyncStorage history (offline fallback) ──────────────────────

async function saveLocalHistory(imageUri: string, report: ArchiveReport) {
  try {
    const raw = await AsyncStorage.getItem('@clinna_history');
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({ id: `${Date.now()}`, timestamp: new Date().toISOString(), imageUri, report });
    await AsyncStorage.setItem('@clinna_history', JSON.stringify(arr.slice(0, 50)));
  } catch (e) { console.warn('Local history save failed', e); }
}

// ─── Supabase + Storage save function ────────────────────────────

async function saveToArchive(
  imageUri: string,
  report:   ArchiveReport,
): Promise<string> {
  // 1. Insert row into scans table — get ID first
  const { data: row, error: insertError } = await supabase
    .from('scans')
    .insert({
      brand:           report.archive_id.brand           || null,
      collection_year: report.archive_id.collection_year || null,
      model_name:      report.archive_id.model_name      || null,
      scan_mode:       report.scan_mode                  || 'quick_scan',
    })
    .select('id')
    .single();

  if (insertError || !row?.id) {
    throw new Error(insertError?.message ?? 'DB insert failed');
  }

  const scanId: string = row.id;

  // 2. Upload photo to Storage and update image_url
  //    uploadScanImage already updates the scans table (see storageUpload.ts)
  await uploadScanImage(imageUri, scanId);

  return scanId;
}

// ═══════════════════════════════════════════════════════════════════
// Atomic components
// ═══════════════════════════════════════════════════════════════════

function Rule({ faint }: { faint?: boolean }) {
  return (
    <View style={{ height: 1, backgroundColor: faint ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)' }} />
  );
}

function SHead({ title }: { title: string }) {
  return (
    <View style={{ paddingTop: SP.lg, paddingBottom: 8 }}>
      <Text style={{ fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4, color: C.grey600 }}>
        {title}
      </Text>
    </View>
  );
}

// ─── Signals ──────────────────────────────────────────────────────

function Signals({ signals }: { signals: string[] }) {
  if (!signals.length) return null;
  return (
    <View>
      {signals.map((s, i) => (
        <View key={i}>
          <View style={SG.row}>
            <Text style={SG.dash}>–</Text>
            <Text style={SG.txt}>{s}</Text>
          </View>
          {i < signals.length - 1 && <Rule faint />}
        </View>
      ))}
    </View>
  );
}
const SG = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  dash: { fontFamily: F.mono, fontSize: FS.sm, color: C.grey600, width: 12, lineHeight: 20 },
  txt:  { flex: 1, fontFamily: F.mono, fontSize: FS.xxs, color: C.grey400, lineHeight: 20, letterSpacing: 0.3 },
});

// ─── EconRow ──────────────────────────────────────────────────────

function EconRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  if (!value) return null;
  return (
    <View style={EC.row}>
      <Text style={EC.lbl}>{label}</Text>
      <Text style={[EC.val, highlight && EC.valHL]}>{value}</Text>
    </View>
  );
}
const EC = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  lbl:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },
  val:   { fontFamily: F.mono, fontSize: FS.sm, color: C.white },
  valHL: { fontFamily: F.mono, fontSize: FS.sm, color: C.white, fontWeight: '700' },
});

// ─── Cost breakdown bar ─────────────────────────────────────────────

function CostBar({ material, labor }: { material: number; labor: number }) {
  const total   = material + labor;
  const matPct  = total > 0 ? material / total : 0.5;
  const laborPct = 1 - matPct;
  return (
    <View style={CBV.root}>
      <View style={CBV.track}>
        <View style={[CBV.seg, { flex: Math.max(matPct, 0.02), backgroundColor: 'rgba(255,255,255,0.7)' }]} />
        <View style={[CBV.seg, { flex: Math.max(laborPct, 0.02), backgroundColor: 'rgba(255,255,255,0.25)' }]} />
      </View>
      <View style={CBV.labelRow}>
        <Text style={CBV.label}>MATERIAL {Math.round(matPct * 100)}%</Text>
        <Text style={CBV.label}>LABOR {Math.round(laborPct * 100)}%</Text>
      </View>
    </View>
  );
}
const CBV = StyleSheet.create({
  root:     { paddingVertical: 12, gap: 8 },
  track:    { flexDirection: 'row', height: 6, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  seg:      { height: '100%' },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label:    { fontFamily: F.mono, fontSize: 9, letterSpacing: 1.5, color: C.grey600 },
});

// ─── ColorRow ─────────────────────────────────────────────────────

function ColorRow({ hex, desc }: { hex: string; desc: string }) {
  const valid = /^#[0-9A-Fa-f]{6}$/.test(hex);
  return (
    <View style={CR.root}>
      <View style={[CR.swatch, { backgroundColor: valid ? hex : 'transparent' }]} />
      <View style={{ gap: 4 }}>
        <Text style={CR.desc}>{desc || '—'}</Text>
        {valid && <Text style={CR.hex}>{hex.toUpperCase()}</Text>}
      </View>
    </View>
  );
}
const CR = StyleSheet.create({
  root:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  swatch: { width: 32, height: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  desc:   { fontFamily: F.mono, fontSize: FS.sm, color: C.white },
  hex:    { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, letterSpacing: 1.5 },
});

// ─── MetaRow ──────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value || value === 'Unknown' || value === 'Bilinemiyor') return null;
  return (
    <View style={MR.root}>
      <Text style={MR.lbl}>{label}</Text>
      <Text style={MR.val}>{value}</Text>
    </View>
  );
}
const MR = StyleSheet.create({
  root: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 12 },
  lbl:  { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600, flex: 1 },
  val:  { fontFamily: F.mono, fontSize: FS.xs, color: C.white, flex: 2, textAlign: 'right', lineHeight: 18 },
});

// ─── Save To Archive Button ───────────────────────────────────────

function SaveBtn({ state, onPress }: { state: SaveState; onPress: () => void }) {
  const labels: Record<SaveState, string> = {
    idle:   '[ SAVE TO ARCHIVE ]',
    saving: '[ SAVING... ]',
    saved:  '[ SAVED  ✦ ]',
    error:  '[ RETRY SAVE ]',
  };
  const colors: Record<SaveState, string> = {
    idle:   'rgba(255,255,255,0.25)',
    saving: 'rgba(255,255,255,0.15)',
    saved:  'rgba(180,210,160,0.6)',   // greenish — success
    error:  'rgba(210,140,140,0.6)',   // reddish — error
  };
  return (
    <TouchableOpacity
      style={[SB.root, { borderColor: colors[state] }]}
      onPress={onPress}
      disabled={state === 'saving' || state === 'saved'}
      activeOpacity={0.6}
    >
      <Text style={[SB.label, { color: colors[state] }]}>
        {labels[state]}
      </Text>
    </TouchableOpacity>
  );
}
const SB = StyleSheet.create({
  root: {
    borderWidth:   1,
    paddingVertical: 15,
    alignItems:    'center',
    backgroundColor: '#000000',   // black background
  },
  label: {
    fontFamily:    'Courier New',
    fontSize:      FS.xxs,
    letterSpacing: 3,
  },
});

// ─── Shareable cost card (hidden, captured as PNG) ────────────────
// Rendered at 360x640 (9:16) and captured at exactly 3x → 1080x1920.

const CARD_W = 360;
const CARD_H = 640;

const ShareCard = React.forwardRef<View, { imageUri: string; r: ArchiveReport }>(
  ({ imageUri, r }, ref) => {
    const f = r.financials;
    return (
      <View ref={ref} collapsable={false} style={SCV.root}>
        <Image source={{ uri: imageUri }} style={SCV.image} resizeMode="cover" />
        <View style={SCV.body}>
          <Text style={SCV.costLine}>[ PRODUCTION COST: {formatUsd(f.total_production_cost_usd)} ]</Text>
          {f.estimated_retail_price_usd != null && (
            <Text style={SCV.subLine}>[ RETAIL: {formatUsd(f.estimated_retail_price_usd)} ]</Text>
          )}
          {f.brand_markup != null && (
            <Text style={SCV.subLine}>[ MARKUP: {f.brand_markup.toFixed(1)}x ]</Text>
          )}
          <CostBar material={f.material_cost_usd} labor={f.labor_cost_usd} />
        </View>
        <View style={SCV.footer}>
          <Text style={SCV.watermark}>CLINNA</Text>
          <Text style={SCV.watermarkSub}>clinna.app</Text>
        </View>
      </View>
    );
  },
);

const SCV = StyleSheet.create({
  root:  { width: CARD_W, height: CARD_H, backgroundColor: C.black },
  image: { width: CARD_W, height: CARD_H * 0.5 },
  body:  { paddingHorizontal: 20, paddingTop: 20, gap: 6 },
  costLine: { fontFamily: F.mono, fontSize: 17, fontWeight: '700', letterSpacing: 1, color: C.white },
  subLine:  { fontFamily: F.mono, fontSize: 13, letterSpacing: 1, color: C.grey400 },
  footer: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    alignItems: 'center', gap: 2,
  },
  watermark:    { fontFamily: 'MissFajardose', fontSize: 30, color: '#F2F0EB' },
  watermarkSub: { fontFamily: F.mono, fontSize: 10, letterSpacing: 3, color: C.grey600 },
});

// ═══════════════════════════════════════════════════════════════════
// Ana Ekran
// ═══════════════════════════════════════════════════════════════════

export default function ResultScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const insets     = useSafeAreaInsets();
  const { imageUri, result: r } = route.params;

  const refNumber = useRef(`CLN-${Date.now().toString(36).toUpperCase().slice(-6)}`).current;
  const timestamp = useRef(
    new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  ).current;

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [shareState, setShareState] = useState<ShareState>('idle');
  const cardRef = useRef<View>(null);

  useEffect(() => {
    // Offline local save — always runs
    saveLocalHistory(imageUri, r);

    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Share — capture the hidden cost card and share as PNG ────────
  const handleShare = useCallback(async () => {
    if (shareState === 'preparing') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShareState('preparing');
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('[ SHARE UNAVAILABLE ]', '[ SHARING IS NOT SUPPORTED ON THIS DEVICE ]', [{ text: '[ OK ]' }]);
        return;
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        width:  1080,
        height: 1920,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType:    'image/png',
        dialogTitle: `CLINNA · ${r.archive_id.brand || 'Cost Report'}`,
        UTI:         'public.png',
      });
    } catch (err) {
      console.error('[ResultScreen] share error:', err);
      Alert.alert('[ SHARE FAILED ]', '[ COULD NOT GENERATE SHARE CARD — TRY AGAIN ]', [{ text: '[ OK ]' }]);
    } finally {
      setShareState('idle');
    }
  }, [r, shareState]);

  // ── Save To Archive ──────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaveState('saving');
    try {
      await saveToArchive(imageUri, r);
      setSaveState('saved');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Short delay then navigate to History
      setTimeout(() => {
        navigation.navigate('History');
      }, 800);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ResultScreen] saveToArchive error:', msg);
      setSaveState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        '[ SAVE FAILED ]',
        '[ ERROR: ARCHIVE SAVE FAILED — CHECK CONNECTION AND RETRY ]',
        [{ text: '[ OK ]' }],
        { userInterfaceStyle: 'dark' },
      );
    }
  }, [saveState, imageUri, r, navigation]);

  // ── Non-fashion guard ────────────────────────────────────────────
  if (!r.is_fashion_item) {
    return (
      <View style={S.root}>
        <StatusBar barStyle="light-content" />
        <View style={[S.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => navigation.navigate('Home')}>
            <Text style={S.hBtn}>← HOME</Text>
          </TouchableOpacity>
          <Text style={S.hTitle}>RECEIPT</Text>
          <View style={{ width: 52 }} />
        </View>
        <Rule />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: SP.xl }}>
          <Text style={{ fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4, color: C.grey600 }}>
            NOT A FASHION ITEM
          </Text>
          <TouchableOpacity style={S.outlineBtn} onPress={() => navigation.navigate('Camera')} activeOpacity={0.7}>
            <Text style={S.outlineBtnTxt}>TRY AGAIN →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const brandUnknown = !r.archive_id.brand || r.archive_id.brand.toUpperCase() === 'UNKNOWN';
  const f = r.financials;

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Home'); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={S.hBtn}>← HOME</Text>
        </TouchableOpacity>
        <Text style={S.hTitle}>RECEIPT</Text>
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} disabled={shareState === 'preparing'}>
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

          {/* Receipt meta */}
          <View style={S.receiptMeta}>
            <View>
              <Text style={S.refNum}>{refNumber}</Text>
              <Text style={S.ts}>{timestamp}</Text>
            </View>
            <Text style={S.badge}>
              {modeLabel(r.scan_mode)}  ·  {r.image_count}F
            </Text>
          </View>
          <Rule />

          {/* Brand hierarchy */}
          <View style={S.brandBlock}>
            <Text style={S.brandName} numberOfLines={1} adjustsFontSizeToFit>
              {r.archive_id.brand || 'UNKNOWN'}
            </Text>
            {!!r.archive_id.model_name && r.archive_id.model_name !== 'Unknown' && (
              <Text style={S.brandModel}>{r.archive_id.model_name}</Text>
            )}
            {!!r.archive_id.collection_year && r.archive_id.collection_year !== 'Unknown' && (
              <Text style={S.brandEra}>{r.archive_id.collection_year}</Text>
            )}
          </View>
          <Rule />

          {/* Observed Signals */}
          <SHead title="OBSERVED SIGNALS" />
          <Signals signals={r.authenticity.signals} />
          {brandUnknown && (
            <Text style={S.unverifiedNote}>
              No brand mark detected. Add an interior label or wash-tag photo and run a Detailed Scan for a more complete construction analysis.
            </Text>
          )}
          <Text style={S.disclaimerNote}>
            AI-generated observations based on visual analysis — not a certification or guarantee of authenticity.
          </Text>
          <Rule />

          {/* Image */}
          <View style={S.imageWrap}>
            <Image source={{ uri: imageUri }} style={S.image} resizeMode="cover" />
          </View>

          {/* Colorway */}
          {(r.color_analysis.colorblind_friendly_desc || r.color_analysis.hex) && (
            <>
              <SHead title="COLORWAY" />
              <ColorRow hex={r.color_analysis.hex} desc={r.color_analysis.colorblind_friendly_desc} />
              <Rule />
            </>
          )}

          {/* Material */}
          {r.fabric_estimate.composition && (
            <>
              <SHead title="MATERIAL" />
              <MetaRow label="COMPOSITION" value={r.fabric_estimate.composition} />
              {!!r.fabric_estimate.texture_notes && (
                <Text style={S.textureNote}>{r.fabric_estimate.texture_notes}</Text>
              )}
              <Rule />
            </>
          )}

          {/* Production cost — always shown, independent of brand */}
          <SHead title="PRODUCTION COST" />
          <EconRow label="MATERIAL"  value={formatUsd(f.material_cost_usd)} />
          <Rule faint />
          <EconRow label="LABOR (CMT)" value={formatUsd(f.labor_cost_usd)} />
          <Rule faint />
          <EconRow label="TOTAL COST" value={formatUsd(f.total_production_cost_usd)} highlight />
          {f.estimated_retail_price_usd != null && (
            <>
              <Rule faint />
              <EconRow label="EST. RETAIL" value={formatUsd(f.estimated_retail_price_usd)} />
            </>
          )}
          {f.brand_markup != null && (
            <>
              <Rule faint />
              <EconRow label="BRAND MARKUP" value={`${f.brand_markup.toFixed(1)}×`} highlight />
            </>
          )}
          <CostBar material={f.material_cost_usd} labor={f.labor_cost_usd} />
          <Text style={S.confidenceNote}>
            [ {f.confidence.toUpperCase()} CONFIDENCE ]{f.reasoning ? `  ${f.reasoning}` : ''}
          </Text>
          <Rule />

          {/* Footer stamp */}
          <View style={S.footer}>
            <Text style={S.footerTxt}>CLINNA AI  ·  v0.7.0  ·  {r.processing_ms}ms</Text>
          </View>

          {/* ── CTA blok ── */}

          {/* SHARE — primary, solid white */}
          <TouchableOpacity style={S.shareBtn} onPress={handleShare} activeOpacity={0.8} disabled={shareState === 'preparing'}>
            <Text style={S.shareBtnTxt}>{shareState === 'preparing' ? 'PREPARING...' : 'SHARE COST CARD'}</Text>
            <Text style={S.shareBtnArrow}>↑</Text>
          </TouchableOpacity>

          {/* SAVE TO ARCHIVE — brutalist outline, color by state */}
          <View style={{ height: 8 }} />
          <SaveBtn state={saveState} onPress={handleSave} />

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 }} />

          {/* NEW ANALYSIS — secondary outline */}
          <TouchableOpacity
            style={S.outlineBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Camera'); }}
            activeOpacity={0.7}
          >
            <Text style={S.outlineBtnTxt}>NEW ANALYSIS →</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>

      {/* Hidden share card — rendered off-screen, captured on demand */}
      <View style={S.hiddenCardWrap} pointerEvents="none">
        <ShareCard ref={cardRef} imageUri={imageUri} r={r} />
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

  receiptMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 14 },
  refNum: { fontFamily: F.mono, fontSize: FS.sm,  color: C.white,   letterSpacing: 1 },
  ts:     { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, letterSpacing: 0.5, marginTop: 2 },
  badge:  { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, letterSpacing: 2.5 },

  brandBlock: { paddingVertical: SP.lg, gap: 6 },
  brandName:  { fontFamily: F.mono, fontSize: FS.xl, fontWeight: '100', color: C.white, letterSpacing: 0, lineHeight: 34 },
  brandModel: { fontFamily: F.mono, fontSize: FS.sm,  color: C.grey400, letterSpacing: 0.5 },
  brandEra:   { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, letterSpacing: 3.5, marginTop: 2 },

  imageWrap: { width: '100%', height: Math.round(width * (4 / 3) * 0.55), marginVertical: SP.lg, overflow: 'hidden' },
  image:     { width: '100%', height: '100%' },

  textureNote:     { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, lineHeight: 18, paddingBottom: SP.md, letterSpacing: 0.2 },
  unverifiedNote:  { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, lineHeight: 18, paddingTop: SP.sm, paddingBottom: SP.md, letterSpacing: 0.3 },
  disclaimerNote:  { fontFamily: F.mono, fontSize: 9, color: C.grey600, opacity: 0.5, lineHeight: 14, paddingTop: SP.xs, paddingBottom: SP.md, letterSpacing: 0.3 },
  confidenceNote:  { fontFamily: F.mono, fontSize: 9, color: C.grey600, opacity: 0.6, lineHeight: 15, paddingTop: SP.sm, paddingBottom: SP.md, letterSpacing: 0.3 },

  footer:    { paddingVertical: SP.lg, alignItems: 'center' },
  footerTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey600 },

  shareBtn:      { backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: SP.lg },
  shareBtnTxt:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, fontWeight: '700', color: C.black },
  shareBtnArrow: { fontSize: 16, color: C.black },

  outlineBtn:    { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingVertical: 17, paddingHorizontal: SP.lg, flexDirection: 'row', justifyContent: 'center' },
  outlineBtnTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },

  hiddenCardWrap: { position: 'absolute', top: -9999, left: -9999 },
});
