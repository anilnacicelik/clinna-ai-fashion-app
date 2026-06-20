/**
 * CLINNA — HistoryScreen.tsx
 * Changes:
 *  - Header right: [ 3 SCANS LEFT ] + [ LOGOUT ] (supabase.auth.signOut)
 *  - ScanRow onLongPress → brutalist Alert → Supabase delete
 *  - Haptics.ImpactFeedbackStyle.Medium on delete confirm and completion
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, StatusBar, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../services/supabase';
import { useScansLeft } from '../hooks/useScansLeft';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'History'>;

// ─── Type ────────────────────────────────────────────────────────

interface ScanRecord {
  id:              string;
  created_at:      string;
  brand:           string | null;
  collection_year: string | null;
  model_name:      string | null;
  legit_score:     number | null;
  resell_value:    string | null;
  scan_mode:       string | null;
  image_url:       string | null;
}

// ─── Helper: score → color ───────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return 'rgba(255,255,255,0.25)';
  if (score >= 75)   return 'rgba(180,210,160,0.9)';
  if (score >= 45)   return 'rgba(210,190,140,0.9)';
  return                    'rgba(210,140,140,0.9)';
}

// ─── Date format ─────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ─── Single scan row ─────────────────────────────────────────────

function ScanRow({ item, onLongPress }: { item: ScanRecord; onLongPress: () => void }) {
  const col = scoreColor(item.legit_score);

  return (
    <TouchableOpacity
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.75}
    >
      <View style={ROW.root}>

        {/* Photo thumbnail */}
        <View style={ROW.thumb}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={ROW.thumbImg} resizeMode="cover" />
          ) : (
            <View style={ROW.thumbPlaceholder}>
              <Text style={ROW.thumbPlaceholderTxt}>—</Text>
            </View>
          )}
        </View>

        {/* Text info */}
        <View style={ROW.info}>
          <Text style={ROW.brand} numberOfLines={1}>
            {item.brand ?? 'UNKNOWN BRAND'}
          </Text>
          {(item.model_name || item.collection_year) && (
            <Text style={ROW.model} numberOfLines={1}>
              {[item.model_name, item.collection_year].filter(Boolean).join('  ·  ')}
            </Text>
          )}
          {item.resell_value && (
            <Text style={ROW.resell}>{item.resell_value}</Text>
          )}
          <Text style={ROW.meta}>
            {formatDate(item.created_at)}
            {item.scan_mode ? `  ·  ${item.scan_mode.replace('_', ' ').toUpperCase()}` : ''}
          </Text>
        </View>

        {/* Score badge */}
        <View style={ROW.scoreBlock}>
          <Text style={[ROW.score, { color: col }]}>
            {item.legit_score !== null ? item.legit_score : '—'}
          </Text>
          <Text style={ROW.scoreLabel}>/100</Text>
        </View>

      </View>
    </TouchableOpacity>
  );
}

const THUMB_SIZE = 64;

const ROW = StyleSheet.create({
  root: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 16,
    gap:             SP.md,
  },
  thumb: {
    width:       THUMB_SIZE,
    height:      THUMB_SIZE,
    overflow:    'hidden',
    flexShrink:  0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbImg: { width: THUMB_SIZE, height: THUMB_SIZE },
  thumbPlaceholder: {
    width:           THUMB_SIZE,
    height:          THUMB_SIZE,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  thumbPlaceholderTxt: {
    fontFamily: F.mono,
    fontSize:   FS.md,
    color:      'rgba(255,255,255,0.15)',
  },
  info:   { flex: 1, gap: 4 },
  brand: {
    fontFamily:    F.mono,
    fontSize:      FS.sm,
    color:         C.white,
    letterSpacing: 0.3,
  },
  model: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         C.grey400,
    letterSpacing: 0.3,
  },
  resell: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  meta: {
    fontFamily:    F.mono,
    fontSize:      8,
    color:         C.grey600,
    letterSpacing: 1,
    marginTop:     2,
  },
  scoreBlock: { alignItems: 'flex-end', flexShrink: 0 },
  score: {
    fontFamily: F.mono,
    fontSize:   22,
    fontWeight: '200',
    lineHeight: 26,
  },
  scoreLabel: {
    fontFamily:    F.mono,
    fontSize:      8,
    color:         C.grey600,
    letterSpacing: 1,
  },
});

// ─── Separator ───────────────────────────────────────────────────

function Separator() {
  return <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />;
}

// ─── Empty state ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={EMPTY.root}>
      <Text style={EMPTY.symbol}>◎</Text>
      <Text style={EMPTY.title}>NO SCANS YET</Text>
      <Text style={EMPTY.sub}>{'Authenticate your first piece\nto begin your archive.'}</Text>
    </View>
  );
}

const EMPTY = StyleSheet.create({
  root:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 80 },
  symbol: { fontFamily: F.mono, fontSize: 36, color: 'rgba(255,255,255,0.1)' },
  title:  { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4, color: C.grey600 },
  sub:    { fontFamily: F.mono, fontSize: FS.xxs, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 18 },
});

// ═══════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════

export default function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { scansLeft, load: loadScans } = useScansLeft();

  // Update counter when screen gains focus
  useFocusEffect(useCallback(() => { loadScans(); }, [loadScans]));

  const [scans,      setScans]      = useState<ScanRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Fetch data ───────────────────────────────────────────────

  const fetchScans = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    setError(null);

    try {
      const { data, error: dbError } = await supabase
        .from('scans')
        .select('id, created_at, brand, collection_year, model_name, legit_score, resell_value, scan_mode, image_url')
        .order('created_at', { ascending: false })
        .limit(100);

      if (dbError) throw dbError;
      setScans((data as ScanRecord[]) ?? []);
    } catch (e: any) {
      console.error('[HistoryScreen] fetchScans:', e);
      setError('ARCHIVE COULD NOT BE LOADED.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchScans(); }, []);

  // ── Logout ───────────────────────────────────────────────────

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[HistoryScreen] signOut error:', e);
    }
  };

  // ── Delete (long press) ──────────────────────────────────────

  const handleDelete = useCallback((item: ScanRecord) => {
    // 1. Haptics when Alert opens
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      '[ DELETE SCAN ]',
      `${item.brand?.toUpperCase() ?? 'UNKNOWN BRAND'}\n${formatDate(item.created_at)}\n\nTHIS SCAN WILL BE PERMANENTLY REMOVED FROM YOUR ARCHIVE.`,
      [
        {
          text: '[ CANCEL ]',
          style: 'cancel',
        },
        {
          text: '[ DELETE ]',
          style: 'destructive',
          onPress: async () => {
            const { error: deleteError } = await supabase
              .from('scans')
              .delete()
              .eq('id', item.id);

            if (!deleteError) {
              // 2. Haptics when delete completes
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setScans(prev => prev.filter(s => s.id !== item.id));
            }
          },
        },
      ],
      { userInterfaceStyle: 'dark' }
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 14 }]}>

        {/* Left: Back */}
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.goBack(); }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={S.hBtn}>← BACK</Text>
        </TouchableOpacity>

        {/* Center: Title */}
        <Text style={S.hTitle}>ARCHIVE HISTORY</Text>

        {/* Right: Scan counter + Logout */}
        <View style={S.hRight}>
          <View style={S.hScanBadge}>
            <Text style={S.hScanText}>{`[ ${scansLeft} SCANS LEFT ]`}</Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            style={S.hLogoutBtn}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Text style={S.hLogoutText}>[ LOGOUT ]</Text>
          </TouchableOpacity>
        </View>

      </View>

      <View style={S.rule} />

      {/* Content */}
      {loading ? (
        <View style={S.center}>
          <ActivityIndicator color="rgba(255,255,255,0.3)" />
        </View>
      ) : error ? (
        <View style={S.center}>
          <Text style={S.errorTxt}>{error}</Text>
          <TouchableOpacity onPress={() => fetchScans()} style={S.retryBtn}>
            <Text style={S.retryTxt}>[ RETRY ]</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={scans}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <ScanRow item={item} onLongPress={() => handleDelete(item)} />
          )}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={EmptyState}
          contentContainerStyle={[
            S.listContent,
            { paddingBottom: insets.bottom + SP.xl },
            scans.length === 0 && { flex: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchScans(true)}
              tintColor="rgba(255,255,255,0.3)"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SP.lg,
    paddingBottom:     14,
  },

  hBtn:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.grey400 },
  hTitle: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4,   color: C.white, flex: 1, textAlign: 'center' },

  // Right group: counter + logout
  hRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
  },
  hScanBadge: {
    borderWidth:      1,
    borderColor:      C.white,
    paddingVertical:  3,
    paddingHorizontal: 6,
  },
  hScanText: {
    fontFamily:    F.mono,
    fontSize:      8,
    color:         C.white,
    letterSpacing: 1,
  },
  hLogoutBtn: {
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.2)',
    paddingVertical:  3,
    paddingHorizontal: 6,
  },
  hLogoutText: {
    fontFamily:    F.mono,
    fontSize:      8,
    color:         C.grey400,
    letterSpacing: 1,
  },

  rule: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  listContent: { paddingHorizontal: SP.lg },

  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorTxt: { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600, textAlign: 'center', lineHeight: 18 },
  retryBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, paddingHorizontal: 24, marginTop: 8 },
  retryTxt: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey400 },
});
