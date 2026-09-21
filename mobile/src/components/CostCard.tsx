/**
 * CLINNA — shareable cost card
 *
 * Lifted verbatim out of ResultScreen (v7 "Analysis Receipt") so BuyResultScreen
 * can share the same object instead of growing a second visual language. The
 * card is rendered off-screen at 360x640 (9:16) and captured at exactly 3x →
 * 1080x1920.
 *
 * Passing no `tagPrice`/`buyMode` reproduces the original card byte for byte —
 * that is what ResultScreen, ListingResult and every non-buy mode still get.
 * The tag-price headline and the "before you buy it, scan it" stamp appear on
 * buy-mode cards only.
 */

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { C, F } from '../theme';
import { ArchiveReport } from '../services/api';
import { formatUsd, markupOf } from '../utils/cost';

const CARD_W = 360;
const CARD_H = 640;

// ─── Cost breakdown bar ─────────────────────────────────────────────
// Also used in the ResultScreen body, hence the named export.

export function CostBar({ material, labor }: { material: number; labor: number }) {
  const total    = material + labor;
  const matPct   = total > 0 ? material / total : 0.5;
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
  label:    { fontFamily: F.mono, fontSize: 11, letterSpacing: 1, color: C.grey400 },
});

// ─── Card ───────────────────────────────────────────────────────────

interface CostCardProps {
  imageUri: string;
  r:        ArchiveReport;
  /** Price read off the tag in store. Buy mode only. */
  tagPrice?: number | null;
  /** Adds the tag-price headline (when a price is known) and the stamp. */
  buyMode?:  boolean;
}

const CostCard = React.forwardRef<View, CostCardProps>(
  ({ imageUri, r, tagPrice = null, buyMode = false }, ref) => {
    const f       = r.financials;
    const cost    = f.total_production_cost_usd;
    const markup  = markupOf(tagPrice, cost);
    // The buy headline needs a price the user actually saw on a tag — the
    // model's retail estimate is not what they are standing in front of.
    const buyLine = buyMode && tagPrice != null && tagPrice > 0;

    return (
      <View ref={ref} collapsable={false} style={SCV.root}>
        <Image source={{ uri: imageUri }} style={SCV.image} resizeMode="cover" />
        <View style={SCV.body}>
          {buyLine ? (
            <Text style={SCV.costLine}>
              [ TAG PRICE {formatUsd(tagPrice!)} → REAL COST {formatUsd(cost)}
              {markup.kind === 'markup' ? ` · ${markup.pct}% MARKUP` : ''} ]
            </Text>
          ) : (
            <Text style={SCV.costLine}>[ PRODUCTION COST: {formatUsd(cost)} ]</Text>
          )}
          {!buyLine && f.estimated_retail_price_usd != null && (
            <Text style={SCV.subLine}>[ RETAIL: {formatUsd(f.estimated_retail_price_usd)} ]</Text>
          )}
          {!buyLine && f.brand_markup != null && (
            <Text style={SCV.subLine}>[ MARKUP: {f.brand_markup.toFixed(1)}x ]</Text>
          )}
          <CostBar material={f.material_cost_usd} labor={f.labor_cost_usd} />
        </View>
        <View style={SCV.footer}>
          <Text style={SCV.watermark}>CLINNA</Text>
          <Text style={SCV.watermarkSub}>clinna.app</Text>
          {buyMode && <Text style={SCV.stamp}>before you buy it, scan it — clinna</Text>}
        </View>
      </View>
    );
  },
);

CostCard.displayName = 'CostCard';

const SCV = StyleSheet.create({
  root:  { width: CARD_W, height: CARD_H, backgroundColor: C.black },
  image: { width: CARD_W, height: CARD_H * 0.5 },
  body:  { paddingHorizontal: 20, paddingTop: 20, gap: 6 },
  costLine: { fontFamily: F.mono, fontSize: 17, fontWeight: '700', letterSpacing: 1, color: C.white, lineHeight: 23 },
  subLine:  { fontFamily: F.mono, fontSize: 13, letterSpacing: 1, color: C.grey400 },
  footer: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    alignItems: 'center', gap: 2,
  },
  watermark:    { fontFamily: 'MissFajardose', fontSize: 30, color: '#F2F0EB' },
  watermarkSub: { fontFamily: F.mono, fontSize: 10, letterSpacing: 3, color: C.grey600 },
  stamp:        { fontFamily: F.mono, fontSize: 10, letterSpacing: 1, color: C.grey600, marginTop: 4 },
});

export default CostCard;
