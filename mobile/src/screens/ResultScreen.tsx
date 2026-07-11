/**
 * CLINNA — ResultScreen v6  "Authentication Receipt"
 *
 * v6 changes:
 *   - "SAVE TO ARCHIVE" button added — storageUpload + Supabase insert
 *   - Save state: idle → saving → saved | error
 *   - On save success → navigate to History screen
 *   - All existing design (brutalist, 1px lines, monospace) preserved
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, Animated, StatusBar, Dimensions, Share, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP, verdictMeta } from '../theme';
import { ArchiveReport, PreviewReport } from '../services/api';
import { uploadScanImage } from '../services/storageUpload';
import { supabase } from '../services/supabase';
import { useScansLeft } from '../hooks/useScansLeft';

const { width } = Dimensions.get('window');

type Nav   = NativeStackNavigationProp<RootStackParamList, 'Result'>;
type Route = RouteProp<RootStackParamList, 'Result'>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ─── Risk badge helper (PreviewReport.risk_score → display) ──────

function riskMeta(score: number): { label: string; color: string } {
  if (score <= 33) return { label: '[ LOW RISK ]',    color: '#8BB88B' };
  if (score <= 66) return { label: '[ MEDIUM RISK ]', color: '#C4B89A' };
  return                   { label: '[ HIGH RISK ]',  color: '#D4A5A0' };
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
      legit_score:     report.authenticity.legit_probability_score,
      resell_value:    report.financials.current_resell_market_value || null,
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

// ─── Share text ───────────────────────────────────────────────────

function buildShareText(r: ArchiveReport, ref: string): string {
  const vm = verdictMeta(r.authenticity.legit_probability_score);
  return [
    '─────────────────────────',
    'CLINNA  AUTHENTICATION RECEIPT',
    `REF  ${ref}`,
    '─────────────────────────',
    `BRAND    ${r.archive_id.brand           || '—'}`,
    `ERA      ${r.archive_id.collection_year || '—'}`,
    `MODEL    ${r.archive_id.model_name      || '—'}`,
    '',
    `VERDICT  ${vm.label}  ${vm.glyph}`,
    `SCORE    ${r.authenticity.legit_probability_score} / 100`,
    '',
    ...r.authenticity.signals.slice(0, 3).map(s => `  · ${s}`),
    '',
    `RESELL   ${r.financials.current_resell_market_value || '—'}`,
    '─────────────────────────',
    '#ClinnaAI  #ArchiveFashion  #LegitCheck',
  ].join('\n');
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

// ─── Score Block ──────────────────────────────────────────────────

function ScoreBlock({ score }: { score: number }) {
  const unverified = score < 0;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!unverified) {
      Animated.timing(anim, { toValue: score / 100, duration: 1600, delay: 300, useNativeDriver: false }).start();
    }
  }, [score]);
  const barWidth = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const vm = verdictMeta(score);
  return (
    <View style={SC.root}>
      <View style={SC.row}>
        <Text style={SC.num}>{unverified ? '—' : score}</Text>
        <View style={SC.meta}>
          {!unverified && <Text style={SC.outOf}>/100</Text>}
          <Text style={[SC.verdict, { color: vm.color }]}>{vm.label}</Text>
        </View>
        <Text style={SC.glyph}>{vm.glyph}</Text>
      </View>
      <View style={SC.track}>
        {!unverified && <Animated.View style={[SC.fill, { width: barWidth }]} />}
      </View>
    </View>
  );
}
const SC = StyleSheet.create({
  root:  { paddingVertical: SP.md },
  row:   { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 14 },
  num:   { fontFamily: F.mono, fontSize: 72, fontWeight: '100', color: C.white, lineHeight: 76 },
  meta:  { flex: 1, gap: 5, paddingBottom: 8 },
  outOf: { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, letterSpacing: 1 },
  verdict: { fontFamily: F.mono, fontSize: FS.xs, letterSpacing: 3.5, fontWeight: '600' },
  glyph:   { fontFamily: F.mono, fontSize: 30, color: C.grey400, paddingBottom: 6 },
  track:   { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  fill:    { height: '100%', backgroundColor: C.white },
});

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

// ─── Locked Overlay (preview mode blur substitute) ───────────────

function LockedOverlay({ onUnlock }: { onUnlock: () => void }) {
  return (
    <View style={LO.root}>
      {/* Silhouette stub rows — gives shape without revealing data */}
      {[80, 60, 90, 50, 70].map((w, i) => (
        <View key={i} style={[LO.stubRow, { width: `${w}%` as any }]} />
      ))}
      {/* Opaque overlay */}
      <View style={LO.overlay}>
        <Text style={LO.lockLabel}>CLINNA  ·  PREMIUM</Text>
        <Text style={LO.lockSub}>
          Brand identity, authentication signals,{'\n'}
          and economics unlock with a full report.
        </Text>
        <TouchableOpacity style={LO.btn} onPress={onUnlock} activeOpacity={0.8}>
          <Text style={LO.btnTxt}>[ UNLOCK FULL REPORT ]</Text>
          <Text style={LO.btnArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
const LO = StyleSheet.create({
  root: {
    position:   'relative',
    marginTop:  SP.sm,
    minHeight:  220,
    overflow:   'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  stubRow: {
    height:          10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical:  10,
    marginLeft:      SP.lg,
    borderRadius:    2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             SP.md,
    padding:         SP.lg,
  },
  lockLabel: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 4,
    color:         C.grey600,
  },
  lockSub: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 0.5,
    color:         C.grey600,
    textAlign:     'center',
    lineHeight:    18,
  },
  btn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SP.sm,
    borderWidth:     1,
    borderColor:     C.white,
    paddingVertical: 15,
    paddingHorizontal: SP.lg,
    backgroundColor: C.white,
    marginTop:       SP.xs,
  },
  btnTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 3,
    fontWeight:    '700',
    color:         C.black,
  },
  btnArrow: {
    fontFamily: F.mono,
    fontSize:   FS.sm,
    color:      C.black,
  },
});

// ═══════════════════════════════════════════════════════════════════
// Ana Ekran
// ═══════════════════════════════════════════════════════════════════

export default function ResultScreen() {
  const navigation = useNavigation<Nav>();
  const route      = useRoute<Route>();
  const insets     = useSafeAreaInsets();
  const { imageUri, result: r, isMocked = false, previewData } = route.params;

  // Preview mode: explicitly mocked OR user has no entitlement left
  const { scansLeft, credits, isProActive } = useScansLeft();
  const hasEntitlement = isProActive || scansLeft > 0 || credits > 0;
  const isPreviewMode  = isMocked || (!hasEntitlement && !!previewData);

  const preview: PreviewReport = previewData ?? {
    anomaly_count: 0, risk_score: 0, category: 'unknown',
    is_fashion_item: true, processing_ms: 0,
  };
  const risk = riskMeta(preview.risk_score);

  const handleUnlock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Paywall');
  };

  const refNumber = useRef(`CLN-${Date.now().toString(36).toUpperCase().slice(-6)}`).current;
  const timestamp = useRef(
    new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  ).current;

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    // Offline local save — always runs
    saveLocalHistory(imageUri, r);

    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Share ────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Share.share({
      message: buildShareText(r, refNumber),
      title:   `CLINNA · ${r.archive_id.brand || 'Archive Report'}`,
    });
  }, [r, refNumber]);

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

  // ── Preview mode ─────────────────────────────────────────────────
  if (isPreviewMode) {
    return (
      <View style={S.root}>
        <StatusBar barStyle="light-content" />
        <View style={[S.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={() => navigation.navigate('Home')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={S.hBtn}>← HOME</Text>
          </TouchableOpacity>
          <Text style={S.hTitle}>PREVIEW</Text>
          <View style={{ width: 52 }} />
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
              <Text style={S.badge}>PREVIEW  ·  LIMITED</Text>
            </View>
            <Rule />

            {/* Preview info block — always visible */}
            <View style={PV.block}>
              {/* Risk badge */}
              <View style={PV.row}>
                <Text style={[PV.riskBadge, { color: risk.color, borderColor: risk.color }]}>
                  {risk.label}
                </Text>
                {!!preview.category && preview.category !== 'unknown' && (
                  <Text style={PV.categoryTag}>{preview.category.toUpperCase()}</Text>
                )}
              </View>
              {/* Anomaly count */}
              <Text style={PV.anomalyTxt}>
                [ {preview.anomaly_count} {preview.anomaly_count === 1 ? 'ANOMALY' : 'ANOMALIES'} DETECTED ]
              </Text>
            </View>
            <Rule />

            {/* Image */}
            <View style={S.imageWrap}>
              <Image source={{ uri: imageUri }} style={S.image} resizeMode="cover" />
            </View>

            {/* Locked overlay */}
            <LockedOverlay onUnlock={handleUnlock} />

            {/* New scan */}
            <View style={{ height: SP.lg }} />
            <TouchableOpacity
              style={S.outlineBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Camera'); }}
              activeOpacity={0.7}
            >
              <Text style={S.outlineBtnTxt}>NEW AUTHENTICATION →</Text>
            </TouchableOpacity>

          </Animated.View>
        </ScrollView>
      </View>
    );
  }

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

  const score = r.authenticity.legit_probability_score;

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
        <TouchableOpacity onPress={handleShare} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={S.hBtn}>SHARE ↑</Text>
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
              {r.scan_mode === 'deep_auth' ? 'DEEP AUTH' : 'QUICK SCAN'}  ·  {r.image_count}F
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

          {/* Authentication */}
          <SHead title="AUTHENTICATION" />
          <ScoreBlock score={score} />
          {score < 0 && (
            <Text style={S.unverifiedNote}>
              No brand mark detected. For authentication, add an interior label or wash-tag photo and run a Deep Scan.
            </Text>
          )}
          <Rule />

          {/* Evidence */}
          {r.authenticity.signals.length > 0 && (
            <>
              <SHead title="EVIDENCE" />
              <Signals signals={r.authenticity.signals} />
              <Rule />
            </>
          )}

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

          {/* Economics */}
          <SHead title="ECONOMICS" />
          <EconRow label="PRODUCTION COST" value={r.financials.estimated_production_cost} />
          <Rule faint />
          <EconRow label="BRAND PREMIUM"   value={r.financials.brand_premium} />
          <Rule faint />
          <EconRow label="RESELL VALUE"     value={r.financials.current_resell_market_value} highlight />
          <Rule />

          {/* Footer stamp */}
          <View style={S.footer}>
            <Text style={S.footerTxt}>CLINNA AI  ·  v0.7.0  ·  {r.processing_ms}ms</Text>
          </View>

          {/* ── CTA blok ── */}

          {/* SHARE — primary, solid white */}
          <TouchableOpacity style={S.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Text style={S.shareBtnTxt}>SHARE THIS REPORT</Text>
            <Text style={S.shareBtnArrow}>↑</Text>
          </TouchableOpacity>

          {/* SAVE TO ARCHIVE — brutalist outline, color by state */}
          <View style={{ height: 8 }} />
          <SaveBtn state={saveState} onPress={handleSave} />

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 }} />

          {/* NEW AUTHENTICATION — secondary outline */}
          <TouchableOpacity
            style={S.outlineBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Camera'); }}
            activeOpacity={0.7}
          >
            <Text style={S.outlineBtnTxt}>NEW AUTHENTICATION →</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
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

  footer:    { paddingVertical: SP.lg, alignItems: 'center' },
  footerTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey600 },

  shareBtn:      { backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: SP.lg },
  shareBtnTxt:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, fontWeight: '700', color: C.black },
  shareBtnArrow: { fontSize: 16, color: C.black },

  outlineBtn:    { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingVertical: 17, paddingHorizontal: SP.lg, flexDirection: 'row', justifyContent: 'center' },
  outlineBtnTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },
});

// ─── Preview mode styles ──────────────────────────────────────────
const PV = StyleSheet.create({
  block: {
    paddingVertical: SP.lg,
    gap:             SP.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SP.md,
    flexWrap:      'wrap',
  },
  riskBadge: {
    fontFamily:       F.mono,
    fontSize:         FS.xs,
    letterSpacing:    2.5,
    fontWeight:       '700',
    borderWidth:      1,
    paddingVertical:  5,
    paddingHorizontal: SP.sm,
  },
  categoryTag: {
    fontFamily:       F.mono,
    fontSize:         FS.xxs,
    letterSpacing:    3,
    color:            C.grey600,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.15)',
    paddingVertical:  5,
    paddingHorizontal: SP.sm,
  },
  anomalyTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xs,
    letterSpacing: 1.5,
    color:         C.white,
    marginTop:     SP.xs,
  },
});
