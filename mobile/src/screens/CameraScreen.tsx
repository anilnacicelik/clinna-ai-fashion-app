/**
 * CLINNA — CameraScreen v7
 *
 * FIX 1 — Deep Auth step 3 button:
 *   deepActionShown state added. Without explicitly calling showActionBar()
 *   the shutter bar stays open and AUTHENTICATE does not appear.
 *
 * FIX 2 — API Error:
 *   StatusBanner brutalist red style, full error message display.
 *   Detailed console.error chains (in api.ts + useAnalysis.ts).
 *
 * FIX 3 — Dynamic Scan Counter:
 *   Counter is read via the useScansLeft hook.
 *   If scansLeft === 0, pressing AUTHENTICATE shows [ ERROR: NO SCANS LEFT ] Alert.
 *   On successful scan, decrement() is called.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Animated, StatusBar, Dimensions,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP } from '../theme';
import { strings } from '../i18n/strings';
import { useAnalysis } from '../hooks/useAnalysis';
import { useScansLeft } from '../hooks/useScansLeft';
import { DeepAuthImages } from '../services/api';

async function playSFX(_: 'shutter' | 'tap' | 'success') { /* stub */ }

const { width } = Dimensions.get('window');
const VF_W = width;
const VF_H = Math.round(VF_W * (4 / 3));  // portrait 3:4 — fits full-length garments
const ZOOM = 0.08;

type Nav      = NativeStackNavigationProp<RootStackParamList, 'Camera'>;
type ScanMode = 'quick_scan' | 'deep_auth' | 'acc';

const DEEP_STEPS = [
  { label: '01 / 03', title: 'FULL GARMENT',    sub: 'Frame the complete item' },
  { label: '02 / 03', title: 'INTERIOR LABEL',  sub: 'Close-up on brand tag' },
  { label: '03 / 03', title: 'WASH TAG',         sub: 'Care label or barcode' },
] as const;

const ACC_STEPS = [
  { label: '01 / 03', title: 'ITEM OVERVIEW',   sub: 'Full accessory in frame' },
  { label: '02 / 03', title: "MAKER'S MARK",    sub: 'Stamp, logo, or signature' },
  { label: '03 / 03', title: 'MATERIAL DETAIL', sub: 'Solder joint or surface texture' },
] as const;

const hap = {
  shutter: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  tap:     () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  sel:     () => Haptics.selectionAsync(),
};

// ═══════════════════════════════════════════════════════════════════
// 1. ViewFinder Overlay
// ═══════════════════════════════════════════════════════════════════

const BRACKET_LEN = 24;
const BRACKET_W   = 1;

function CornerBrackets({ active }: { active: boolean }) {
  const col = active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)';
  const s: object = { position: 'absolute', width: BRACKET_LEN, height: BRACKET_LEN, borderColor: col };
  return (
    <View style={VF.bracketWrapper} pointerEvents="none">
      <View style={[s, { top: 0, left: 0,     borderTopWidth: BRACKET_W,    borderLeftWidth: BRACKET_W  }]} />
      <View style={[s, { top: 0, right: 0,    borderTopWidth: BRACKET_W,    borderRightWidth: BRACKET_W }]} />
      <View style={[s, { bottom: 0, left: 0,  borderBottomWidth: BRACKET_W, borderLeftWidth: BRACKET_W  }]} />
      <View style={[s, { bottom: 0, right: 0, borderBottomWidth: BRACKET_W, borderRightWidth: BRACKET_W }]} />
    </View>
  );
}

function HorizonGuide() {
  return (
    <View pointerEvents="none" style={VF.horizonWrapper}>
      <View style={VF.horizonLine} />
    </View>
  );
}

const VF = StyleSheet.create({
  bracketWrapper: { ...StyleSheet.absoluteFillObject, margin: 16, zIndex: 5 },
  horizonWrapper: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', zIndex: 4 },
  horizonLine:    { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
});

// ═══════════════════════════════════════════════════════════════════
// 2. Analyzing Overlay
// ═══════════════════════════════════════════════════════════════════

const PHRASES = [
  '[ ARCHIVE ANALYSIS IN PROGRESS...\nEXAMINING DETAILS ]',
  '[ CROSS-REFERENCING LABEL TYPOGRAPHY ]',
  '[ ESTIMATING PRODUCTION COST ]',
  '[ VERIFYING HARDWARE SIGNATURES ]',
  '[ CONSULTING RESELL MARKET DATA ]',
  '[ COMPILING AUTHENTICATION REPORT ]',
] as const;

function AnalyzingOverlay({ visible }: { visible: boolean }) {
  const bg      = useRef(new Animated.Value(0)).current;
  const cardY   = useRef(new Animated.Value(16)).current;
  const cardOp  = useRef(new Animated.Value(0)).current;
  const dotAnim = useRef(new Animated.Value(0)).current;
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [shown, setShown]         = useState(false);

  useEffect(() => {
    if (visible) {
      setShown(true);
      Animated.timing(bg, { toValue: 1, duration: 280, useNativeDriver: true }).start();
      Animated.parallel([
        Animated.timing(cardOp, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(cardY,  { toValue: 0, tension: 70, friction: 12, useNativeDriver: true }),
      ]).start();
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(dotAnim, { toValue: 3, duration: 1200, useNativeDriver: false }),
        Animated.timing(dotAnim, { toValue: 0, duration: 0,    useNativeDriver: false }),
      ]));
      loop.start();
      const interval = setInterval(() => setPhraseIdx(i => (i + 1) % PHRASES.length), 2400);
      return () => { loop.stop(); clearInterval(interval); };
    } else {
      Animated.parallel([
        Animated.timing(bg,     { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(cardOp, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => setShown(false));
    }
  }, [visible]);

  if (!shown) return null;

  return (
    <Animated.View style={[OV.backdrop, { opacity: bg }]} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[OV.card, { opacity: cardOp, transform: [{ translateY: cardY }] }]}>
        <View style={OV.topRule} />
        <View style={OV.inner}>
          <Text style={OV.systemLabel}>CLINNA  ·  AI ENGINE</Text>
          <Text style={OV.phrase}>{PHRASES[phraseIdx]}</Text>
          <View style={OV.dotRow}>
            {[0, 1, 2].map(i => {
              const op = dotAnim.interpolate({
                inputRange:  [i - 0.4, i, i + 0.4, i + 1],
                outputRange: [0.15, 1, 0.15, 0.15],
                extrapolate: 'clamp',
              });
              return <Animated.View key={i} style={[OV.dot, { opacity: op }]} />;
            })}
          </View>
        </View>
        <View style={OV.bottomRule} />
      </Animated.View>
    </Animated.View>
  );
}

const OV = StyleSheet.create({
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  card:        { width: width - 48, backgroundColor: C.black, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  topRule:     { height: 1, backgroundColor: C.white, opacity: 0.12 },
  bottomRule:  { height: 1, backgroundColor: C.white, opacity: 0.12 },
  inner:       { padding: 28, gap: 18 },
  systemLabel: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, color: C.grey600 },
  phrase:      { fontFamily: F.mono, fontSize: FS.base, color: C.white, lineHeight: 22, letterSpacing: 0.2, minHeight: 44 },
  dotRow:      { flexDirection: 'row', gap: 8 },
  dot:         { width: 4, height: 4, backgroundColor: C.white },
});

// ═══════════════════════════════════════════════════════════════════
// Completeness Indicator
// ═══════════════════════════════════════════════════════════════════

const TIERS = [
  { min: 1, max: 1, label: 'BASIC SCAN',        hint: 'Add label & tag for a more complete analysis.' },
  { min: 2, max: 2, label: 'DETAILED SCAN',     hint: 'Add the wash tag for a more complete analysis.' },
  { min: 3, max: 3, label: 'FULL ARCHIVE SCAN', hint: null },
] as const;

function CompletenessBar({ uris }: { uris: (string | null)[] }) {
  const count = uris.filter(Boolean).length;
  const tier  = TIERS[Math.min(count, 3) - 1];
  return (
    <View style={CB.root}>
      <View style={CB.segRow}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[CB.seg, i < count && CB.segFilled]} />
        ))}
      </View>
      <View style={CB.labelRow}>
        <Text style={CB.tierTxt}>{tier.label}</Text>
        <Text style={CB.countTxt}>{count} / 3</Text>
      </View>
      {tier.hint && <Text style={CB.hint}>{tier.hint}</Text>}
    </View>
  );
}

const CB = StyleSheet.create({
  root:       { marginBottom: 10, gap: 6 },
  segRow:     { flexDirection: 'row', gap: 3 },
  seg:        { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 0 },
  segFilled:  { backgroundColor: C.white },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierTxt:    { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.white },
  countTxt:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 1.5, color: C.grey600 },
  hint:       { fontFamily: F.mono, fontSize: 9, letterSpacing: 0.5, color: C.grey600, lineHeight: 14 },
});

// ═══════════════════════════════════════════════════════════════════
// Mode Toggle
// ═══════════════════════════════════════════════════════════════════

const MODES: { key: ScanMode; label: string }[] = [
  { key: 'quick_scan', label: 'QUICK' },
  { key: 'deep_auth',  label: 'DEEP'  },
  { key: 'acc',        label: 'ACC'   },
];

function ModeBar({ mode, onChange }: { mode: ScanMode; onChange: (m: ScanMode) => void }) {
  return (
    <View style={MT.root}>
      {MODES.map((m, i) => {
        const active = mode === m.key;
        return (
          <React.Fragment key={m.key}>
            <TouchableOpacity style={MT.btn} onPress={() => { hap.sel(); playSFX('tap'); onChange(m.key); }} activeOpacity={0.6}>
              <Text style={[MT.lbl, active && MT.lblActive]}>{m.label}</Text>
              {active && <View style={MT.underline} />}
            </TouchableOpacity>
            {i < MODES.length - 1 && <View style={MT.sep} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const MT = StyleSheet.create({
  root:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btn:       { paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', position: 'relative' },
  lbl:       { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, color: C.grey600 },
  lblActive: { color: C.white },
  underline: { position: 'absolute', bottom: 5, left: 24, right: 24, height: 1, backgroundColor: C.white },
  sep:       { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
});

// ═══════════════════════════════════════════════════════════════════
// Thumb Strip
// ═══════════════════════════════════════════════════════════════════

const SZ = 44;

function ThumbStrip({ uris, step }: { uris: (string | null)[]; step: number }) {
  return (
    <View style={TS.root}>
      {[0, 1, 2].map(i => {
        const uri = uris[i]; const isCur = i === step; const isDone = !!uri;
        return (
          <View key={i} style={TS.item}>
            <View style={[TS.frame, isCur && TS.frameCur, isDone && TS.frameDone]}>
              {uri
                ? <Image source={{ uri }} style={{ width: SZ, height: SZ }} resizeMode="cover" />
                : <Text style={TS.num}>{i + 1}</Text>
              }
            </View>
            <Text style={[TS.lbl, isCur && TS.lblCur]}>{i === 0 ? 'ITEM' : i === 1 ? 'LABEL' : 'TAG'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const TS = StyleSheet.create({
  root:      { flexDirection: 'row', justifyContent: 'center', gap: 20, paddingVertical: 12 },
  item:      { alignItems: 'center', gap: 5 },
  frame:     { width: SZ, height: SZ, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frameCur:  { borderColor: C.white },
  frameDone: { borderColor: 'rgba(255,255,255,0.45)' },
  num:       { fontFamily: F.mono, fontSize: FS.md, color: C.grey600 },
  lbl:       { fontFamily: F.mono, fontSize: 8, letterSpacing: 2.5, color: C.grey600 },
  lblCur:    { color: C.white },
});

// ═══════════════════════════════════════════════════════════════════
// Status Banner — FIX 2: brutalist red error style
// ═══════════════════════════════════════════════════════════════════

function StatusBanner({ type, message, countdown }: {
  type: 'quota' | 'error'; message: string; countdown?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (type !== 'quota') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.2, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1,   duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [type]);

  return (
    <View style={[BN.root, type === 'error' && BN.rootError]}>
      {type === 'quota' && <Animated.View style={[BN.dot, { opacity: pulse }]} />}
      <Text style={[BN.txt, type === 'error' && BN.txtError]} numberOfLines={3}>
        {type === 'quota'
          ? `[ SYSTEM BUSY — RETRY IN ${countdown}s ]`
          : message}
      </Text>
    </View>
  );
}

const BN = StyleSheet.create({
  root:      { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', padding: 12, gap: 8, marginBottom: 8 },
  rootError: { borderColor: 'rgba(255,59,48,0.6)' },
  dot:       { width: 4, height: 4, backgroundColor: C.white, marginTop: 3 },
  txt:       { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 0.5, color: C.grey400, flex: 1, lineHeight: 16 },
  txtError:  { color: C.red },
});

// ═══════════════════════════════════════════════════════════════════
// Permission Screen
// ═══════════════════════════════════════════════════════════════════

function PermScreen({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Text style={{ fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4, color: C.grey600 }}>
        CAMERA ACCESS REQUIRED
      </Text>
      <TouchableOpacity
        style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingVertical: 14, paddingHorizontal: 36 }}
        onPress={onRequest}
        activeOpacity={0.7}
      >
        <Text style={{ fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.white }}>
          GRANT ACCESS
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════

export default function CameraScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // Camera state
  const cameraRef = useRef<CameraView>(null);
  const [facing,      setFacing]      = useState<CameraType>('back');
  const [flash,       setFlash]       = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  // Mode state
  const [mode,     setMode]     = useState<ScanMode>('quick_scan');
  const [deepStep, setDeepStep] = useState(0);
  const [deepUris, setDeepUris] = useState<(string | null)[]>([null, null, null]);

  // FIX 1: deepActionShown — action bar does not open without calling showActionBar()
  const [deepActionShown, setDeepActionShown] = useState(false);

  // Animations
  const shutterFlash = useRef(new Animated.Value(0)).current;
  const actionSlide  = useRef(new Animated.Value(56)).current;
  const actionFade   = useRef(new Animated.Value(0)).current;

  const { state, runQuickScan, runDeepAuth, runAccScan, reset } = useAnalysis();

  // Entitlement state
  const { scansLeft, credits, isProActive, decrement, useCredit } = useScansLeft();

  // Which currency was decided at the moment AUTHENTICATE was pressed
  const entitlementMethodRef = useRef<'decrement' | 'useCredit' | 'pro' | null>(null);

  // ── Navigate on success + deduct correct entitlement ─────────
  useEffect(() => {
    if (state.status === 'success') {
      hap.success(); playSFX('success');
      // Deduct the currency that was chosen when scan started
      if (entitlementMethodRef.current === 'decrement') decrement();
      else if (entitlementMethodRef.current === 'useCredit') useCredit();
      // 'pro' → no deduction needed
      entitlementMethodRef.current = null;
      const preview = mode === 'quick_scan' ? capturedUri : deepUris[0];
      navigation.replace('Result', { imageUri: preview!, result: state.data });
      reset();
    }
  }, [state.status]);

  // ── Reset on mode change ─────────────────────────────────────
  const handleModeChange = useCallback((m: ScanMode) => {
    setMode(m);
    setCapturedUri(null);
    setDeepStep(0);
    setDeepUris([null, null, null]);
    setDeepActionShown(false); // FIX 1: reset
    reset();
    actionSlide.setValue(56);
    actionFade.setValue(0);
  }, [reset]);

  // ── showActionBar — FIX 1: also sets deepActionShown ─────────
  const showActionBar = useCallback(() => {
    setDeepActionShown(true); // FIX 1: action bar explicitly triggered
    Animated.parallel([
      Animated.spring(actionSlide, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      Animated.timing(actionFade,  { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Retake ────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    hap.tap(); playSFX('tap');
    if (mode === 'quick_scan') {
      setCapturedUri(null);
    } else {
      setDeepUris(prev => { const n = [...prev]; n[deepStep] = null; return n; });
      setCapturedUri(null);
      if (deepStep === 0) setDeepActionShown(false);
    }
    reset();
    actionSlide.setValue(56);
    actionFade.setValue(0);
  }, [mode, deepStep, reset]);

  const toggleFlash  = useCallback(() => { hap.tap(); setFlash(f => f === 'off' ? 'on' : 'off'); }, []);
  const toggleFacing = useCallback(() => { hap.tap(); setFacing(f => f === 'back' ? 'front' : 'back'); }, []);

  // ── Gallery ───────────────────────────────────────────────────
  const handleGallery = useCallback(async () => {
    hap.tap(); playSFX('tap');
    try {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) {
        console.warn('[CLINNA] Gallery permission denied');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        allowsEditing: false,  // send full photo — no iOS forced square crop
        mediaTypes: 'images',
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const uri = result.assets[0].uri;
      if (!uri) {
        console.error('[CLINNA] Gallery Error: asset URI is empty');
        return;
      }
      console.log('[CLINNA] Gallery URI selected:', uri.slice(-50));
      if (mode === 'quick_scan') {
        setCapturedUri(uri); showActionBar();
      } else {
        const updated = [...deepUris]; updated[deepStep] = uri; setDeepUris(updated);
        setCapturedUri(uri);
        if (deepStep < 2) {
          if (deepStep === 0) showActionBar();
          setTimeout(() => { setCapturedUri(null); setDeepStep(s => s + 1); }, 500);
        } else {
          showActionBar();
        }
      }
    } catch (error) {
      console.error('[CLINNA] Gallery Error:', error);
    }
  }, [mode, deepStep, deepUris, showActionBar]);

  // ── Shutter ───────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    hap.shutter(); playSFX('shutter');
    Animated.sequence([
      Animated.timing(shutterFlash, { toValue: 1, duration: 50,  useNativeDriver: true }),
      Animated.timing(shutterFlash, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;
      if (mode === 'quick_scan') {
        setCapturedUri(photo.uri); showActionBar();
      } else {
        const updated = [...deepUris]; updated[deepStep] = photo.uri; setDeepUris(updated);
        setCapturedUri(photo.uri);
        if (deepStep < 2) {
          if (deepStep === 0) showActionBar();
          setTimeout(() => { setCapturedUri(null); setDeepStep(s => s + 1); }, 600);
        } else {
          showActionBar();
        }
      }
    } catch (e) {
      console.error('[CLINNA] Capture failed:', e);
    }
  }, [mode, deepStep, deepUris, showActionBar]);

  // ── Analyze ───────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    hap.tap(); playSFX('tap');

    // Entitlement gate — no scans, no credits, not pro → Paywall
    if (scansLeft === 0 && credits === 0 && !isProActive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      navigation.navigate('Paywall');
      return;
    }

    // Decide which currency to deduct on success
    if (isProActive) {
      entitlementMethodRef.current = 'pro';
    } else if (scansLeft > 0) {
      entitlementMethodRef.current = 'decrement';
    } else {
      entitlementMethodRef.current = 'useCredit';
    }

    if (mode === 'quick_scan') {
      if (!capturedUri) return;
      runQuickScan(capturedUri);
    } else if (mode === 'acc') {
      const [product, label, tag] = deepUris;
      if (!product) return;
      const imgs: DeepAuthImages = { product, ...(label ? { label } : {}), ...(tag ? { tag } : {}) };
      runAccScan(imgs);
    } else {
      const [product, label, tag] = deepUris;
      if (!product) return;
      const imgs: DeepAuthImages = { product, ...(label ? { label } : {}), ...(tag ? { tag } : {}) };
      runDeepAuth(imgs);
    }
  }, [mode, capturedUri, deepUris, runQuickScan, runDeepAuth, runAccScan, scansLeft, credits, isProActive]);

  // ── Skip 3rd step ─────────────────────────────────────────────
  const handleSkip3 = useCallback(() => {
    hap.tap();
    if (deepStep === 2) showActionBar(); // FIX 1: deepActionShown=true tetiklenir
  }, [deepStep, showActionBar]);

  // ── Derived state ─────────────────────────────────────────────

  const isMultiMode = mode !== 'quick_scan';
  const steps       = mode === 'acc' ? ACC_STEPS : DEEP_STEPS;
  const stepInfo    = steps[deepStep];
  const isPreview   = !!capturedUri && (mode === 'quick_scan' || deepStep === 2);
  const isLoading   = state.status === 'loading';
  const isQuota     = state.status === 'quota';
  const isError     = state.status === 'error';

  const deepReady  = isMultiMode && deepActionShown && !!deepUris[0];
  const showAction = (mode === 'quick_scan' && !!capturedUri) || deepReady;

  if (!permission)         return <View style={{ flex: 1, backgroundColor: C.black }} />;
  if (!permission.granted) return <PermScreen onRequest={requestPermission} />;

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ════════════ VIEWFINDER ════════════════════════════════ */}
      <View style={S.vf}>

        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={S.camera} resizeMode="contain" />
        ) : (
          <CameraView
            ref={cameraRef}
            style={S.camera}
            facing={facing}
            flash={flash}
            zoom={ZOOM}
          />
        )}

        {/* Shutter flash */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: '#fff', opacity: shutterFlash, zIndex: 10 }]}
        />

        {!capturedUri && <HorizonGuide />}
        <CornerBrackets active={!capturedUri} />

        {/* Pre-capture framing hint — quick scan only; multi-step has per-step sub-labels */}
        {!capturedUri && mode === 'quick_scan' && (
          <View style={S.captureHint} pointerEvents="none">
            <Text style={S.captureHintTxt}>{strings.camera.hintBeforeCapture}</Text>
          </View>
        )}

        {/* Top bar */}
        <View style={[S.topBar, { top: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
            <Text style={S.topBtn}>BACK</Text>
          </TouchableOpacity>
          <Text style={S.topLabel}>
            {isMultiMode && !isPreview ? stepInfo.title : mode === 'quick_scan' ? 'QUICK SCAN' : mode === 'acc' ? 'ACC' : 'DEEP AUTH'}
          </Text>
          {!capturedUri ? (
            <TouchableOpacity onPress={toggleFacing} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
              <Text style={S.topBtn}>FLIP</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleRetake} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
              <Text style={S.topBtn}>RETAKE</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Step instruction overlay */}
        {isMultiMode && !capturedUri && (
          <View style={S.stepOverlay} pointerEvents="box-none">
            <Text style={S.stepCounter}>{stepInfo.label}</Text>
            <Text style={S.stepSub}>{stepInfo.sub}</Text>
            {deepStep === 2 && (
              <TouchableOpacity onPress={handleSkip3} style={S.skipBtn} activeOpacity={0.7}>
                <Text style={S.skipTxt}>SKIP THIS STEP</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Shutter bar — visible whenever no photo is being previewed */}
        {!capturedUri && (
          <View style={[S.shutterBar, { paddingBottom: Math.max(SP.lg, insets.bottom) }]}>
            <View style={S.shutterRow}>
              <TouchableOpacity onPress={toggleFlash} style={S.sideControl} activeOpacity={0.7}>
                <Text style={[S.sideControlTop, flash === 'on' && { color: C.white }]}>FLASH</Text>
                <Text style={[S.sideControlBot, flash === 'on' && { color: C.white }]}>{flash === 'on' ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCapture} activeOpacity={0.75} style={S.shutterOuter}>
                <View style={S.shutterInner} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleGallery} style={S.sideControl} activeOpacity={0.7}>
                <Text style={S.sideControlTop}>GAL</Text>
                <Text style={S.sideControlBot}>LERY</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ════════════ BOTTOM PANEL ══════════════════════════════ */}
      <View style={[S.bottom, { paddingBottom: insets.bottom + 12 }]}>

        {!capturedUri && deepStep === 0 && (
          <View style={S.modeBarWrap}>
            <ModeBar mode={mode} onChange={handleModeChange} />
          </View>
        )}

        {isMultiMode && <ThumbStrip uris={deepUris} step={deepStep} />}

        {/* FIX 2: Banners — quota and error brutalist style */}
        {isQuota && (
          <StatusBanner type="quota" message="" countdown={state.status === 'quota' ? state.countdown : undefined} />
        )}
        {isError && (
          <StatusBanner
            type="error"
            message={`[ ERROR: ${state.message.toUpperCase()} ]`}
          />
        )}

        {/* Authenticate action bar */}
        {showAction && (
          <Animated.View style={{ transform: [{ translateY: actionSlide }], opacity: actionFade }}>
            {mode === 'quick_scan' ? (
              <>
                <Text style={S.readyLabel}>READY TO AUTHENTICATE</Text>
                <Text style={S.readyHint}>{strings.camera.hintAfterCapture}</Text>
              </>
            ) : (
              <CompletenessBar uris={deepUris} />
            )}
            <TouchableOpacity
              style={[S.authBtn, (isLoading || isQuota) && S.authBtnDisabled]}
              onPress={handleAnalyze}
              disabled={isLoading || isQuota}
              activeOpacity={0.85}
            >
              <Text style={[S.authBtnTxt, (isLoading || isQuota) && S.authBtnTxtDim]}>
                {isLoading
                  ? (mode === 'deep_auth' ? 'DEEP ANALYSIS IN PROGRESS' : 'ANALYSING')
                  : 'AUTHENTICATE'}
              </Text>
              {!isLoading && <Text style={S.authBtnArrow}>→</Text>}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>

      {/* ════════════ ANALYZING OVERLAY ═════════════════════════ */}
      <AnalyzingOverlay visible={isLoading} />

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },

  vf:     { width: VF_W, height: VF_H, overflow: 'hidden', backgroundColor: '#000', position: 'relative' },
  camera: { width: VF_W, height: VF_H },

  topBar: {
    position: 'absolute', left: SP.lg, right: SP.lg, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  topBtn:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.white, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 5, paddingHorizontal: 9 },
  topLabel: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.white },

  stepOverlay: { position: 'absolute', bottom: 120, left: 0, right: 0, zIndex: 15, alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 14 },
  stepCounter: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },
  stepSub:     { fontFamily: F.mono, fontSize: FS.sm, color: C.white },
  skipBtn:     { marginTop: 6, paddingVertical: 4, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  skipTxt:     { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey600 },

  shutterBar:     { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30, alignItems: 'center', paddingTop: 16, backgroundColor: 'rgba(0,0,0,0.72)' },
  shutterRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: SP.lg, marginBottom: SP.md },
  sideControl:    { minWidth: 52, alignItems: 'center', gap: 2 },
  sideControlTop: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.grey600 },
  sideControlBot: { fontFamily: F.mono, fontSize: 9, letterSpacing: 2, color: C.grey600 },
  shutterOuter:   { width: 68, height: 68, borderRadius: 34, borderWidth: 1, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner:   { width: 52, height: 52, borderRadius: 26, backgroundColor: C.white },

  bottom:      { flex: 1, backgroundColor: C.black, paddingHorizontal: SP.lg, paddingTop: 12, justifyContent: 'flex-end' },
  modeBarWrap: { marginBottom: 10 },

  readyLabel:     { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600, marginBottom: 4 },
  readyHint:      { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 0.5, color: C.grey600, marginBottom: 10, opacity: 0.7 },

  captureHint:    { position: 'absolute', bottom: 116, left: 0, right: 0, alignItems: 'center', zIndex: 6 },
  captureHintTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 1, color: 'rgba(255,255,255,0.50)', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 4 },
  authBtn:        { backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 17, paddingHorizontal: SP.lg },
  authBtnDisabled:{ backgroundColor: 'rgba(255,255,255,0.08)' },
  authBtnTxt:     { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, fontWeight: '700', color: C.black },
  authBtnTxtDim:  { color: C.grey600 },
  authBtnArrow:   { fontSize: 16, color: C.black, fontWeight: '300' },
});
