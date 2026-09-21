import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { C, F, FS, SP } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { VintedListing } from '../services/api';
import ArchiveStatus from '../components/ArchiveStatus';
import { useAutoArchive } from '../hooks/useAutoArchive';
import { track } from '../services/analytics';
import { maybeRequestReview } from '../services/review';

type ListingResultRouteProp = RouteProp<RootStackParamList, 'ListingResult'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'ListingResult'>;

export default function ListingResultScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ListingResultRouteProp>();
  const { imageUri, listing, archiveKey = null } = route.params;

  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const viewShotRef = useRef<View>(null);

  // Filed on open like every other result screen — no SAVE button, just a
  // status and a way to take it back out.
  const archive = useAutoArchive(archiveKey, { mode: 'listing', imageUri, listing });

  useEffect(() => { maybeRequestReview(); }, []);

  const refNumber = 'VNT-' + Date.now().toString(36).toUpperCase().slice(-6);
  const timestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = async (text: string, sectionName: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopiedSection(sectionName);
    setTimeout(() => {
      setCopiedSection(null);
    }, 1500);
  };

  const handleCopyAll = async () => {
    const formattedText = `${listing.title}

${listing.description}

Brand: ${listing.brand}
Size: ${listing.size}
Condition: ${listing.condition}
Material: ${listing.material}

${listing.hashtags.map(h => '#' + h).join(' ')}`;

    await handleCopy(formattedText, 'ALL');
  };

  const handleShare = async () => {
    if (!viewShotRef.current) return;
    try {
      track('share_tapped', { mode: 'listing' });
      setIsSharing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 0.9,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Share Listing Card',
      });
    } catch (err) {
      console.error('Failed to share', err);
    } finally {
      setIsSharing(false);
    }
  };

  const renderCopyButton = (text: string, sectionName: string) => {
    const isCopied = copiedSection === sectionName;
    return (
      <TouchableOpacity
        onPress={() => handleCopy(text, sectionName)}
        style={styles.copyButton}
      >
        <Text style={styles.copyButtonText}>{isCopied ? 'COPIED' : 'COPY'}</Text>
      </TouchableOpacity>
    );
  };

  if (listing.is_fashion_item === false) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>← HOME</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackTitle}>NOT A FASHION ITEM</Text>
          <Text style={styles.fallbackText}>This image does not appear to contain clothing, footwear, or accessories.</Text>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.primaryButtonText}>TRY AGAIN →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toast */}
      {copiedSection && copiedSection !== 'ALL' && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>COPIED {copiedSection}</Text>
        </View>
      )}

      {/* Hidden Share Card */}
      <View style={styles.offscreenContainer}>
        <View ref={viewShotRef} style={styles.shareCard}>
          <Image source={{ uri: imageUri }} style={styles.shareCardImage} resizeMode="cover" />
          <View style={styles.shareCardContent}>
            <Text style={styles.shareCardTitle} numberOfLines={2}>{listing.title}</Text>
            <Text style={styles.shareCardBrand}>{listing.brand} • {listing.size}</Text>
            <Text style={styles.shareCardPrice}>€{listing.suggested_price_eur.toFixed(2)}</Text>
          </View>
          <View style={styles.shareCardFooter}>
            <Text style={styles.shareCardWatermark}>── CLINNA AI ──</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* Top Nav */}
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.backButton}>
            <Text style={styles.backButtonText}>← HOME</Text>
          </TouchableOpacity>
        </View>

        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>VINTED LISTING DRAFT</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>REF: {refNumber}</Text>
            <Text style={styles.metaText}>{timestamp}</Text>
          </View>
          <View style={styles.hairline} />
        </View>

        {/* Product Image */}
        <View style={styles.imageContainer}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.productImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderText}>PRODUCT PHOTO</Text>
            </View>
          )}
        </View>

        {/* Title Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TITLE</Text>
            {renderCopyButton(listing.title, 'TITLE')}
          </View>
          <Text style={styles.titleText}>{listing.title}</Text>
        </View>

        {/* Details Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DETAILS</Text>
          <View style={styles.grid}>
            {[
              { label: 'BRAND', value: listing.brand },
              { label: 'SIZE', value: listing.size },
              { label: 'CONDITION', value: listing.condition },
              { label: 'CATEGORY', value: listing.category },
              { label: 'MATERIAL', value: listing.material },
              { label: 'COLORS', value: listing.colors.join(', ') },
            ].map((item, index) => (
              <View key={index} style={styles.gridRow}>
                <Text style={styles.gridLabel}>{item.label}</Text>
                <Text style={styles.gridValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Condition Notes */}
        {listing.condition_notes ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>CONDITION NOTES</Text>
              {renderCopyButton(listing.condition_notes, 'NOTES')}
            </View>
            <Text style={styles.bodyText}>{listing.condition_notes}</Text>
          </View>
        ) : null}

        {/* Suggested Price */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUGGESTED PRICE</Text>
          <Text style={styles.priceText}>€{listing.suggested_price_eur.toFixed(2)}</Text>
          <Text style={styles.priceReasoning}>{listing.price_reasoning}</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>DESCRIPTION</Text>
            {renderCopyButton(listing.description, 'DESCRIPTION')}
          </View>
          <Text style={styles.bodyText}>{listing.description}</Text>
        </View>

        {/* Hashtags */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>HASHTAGS</Text>
            {renderCopyButton(listing.hashtags.map(h => '#' + h).join(' '), 'HASHTAGS')}
          </View>
          <Text style={styles.bodyText}>{listing.hashtags.map(h => '#' + h).join('  ')}</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {archive.enabled && <ArchiveStatus
            state={archive.state}
            removing={archive.removing}
            onRemove={archive.remove}
            onRetry={archive.retry}
          />}

          <TouchableOpacity style={styles.primaryButton} onPress={handleCopyAll}>
            <Text style={styles.primaryButtonText}>{copiedSection === 'ALL' ? 'COPIED TO CLIPBOARD' : 'COPY ALL TO CLIPBOARD'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleShare} disabled={isSharing}>
            {isSharing ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.secondaryButtonText}>SHARE LISTING CARD</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.textButton} onPress={() => navigation.navigate('Camera', { listingMode: true } as any)}>
            <Text style={styles.textButtonText}>NEW LISTING</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>── CLINNA ──</Text>
            <Text style={styles.footerText}>AI-generated listing draft. Verify details before posting.</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.black,
  },
  scrollContent: {
    paddingHorizontal: SP.md,
    paddingBottom: SP.xl,
    paddingTop: Platform.OS === 'ios' ? 60 : SP.xl,
  },
  topNav: {
    marginBottom: SP.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: SP.xs,
  },
  backButtonText: {
    fontFamily: F.mono,
    fontSize: FS.xs,
    color: C.grey400,
    letterSpacing: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : SP.xl,
    paddingHorizontal: SP.md,
  },
  headerSection: {
    marginBottom: SP.lg,
  },
  headerTitle: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 3,
    color: C.grey600,
    marginBottom: SP.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SP.sm,
  },
  metaText: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    color: C.grey600,
  },
  hairline: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 4 / 3,
    marginBottom: SP.xl,
    backgroundColor: C.grey600,
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.grey400,
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    fontFamily: F.mono,
    color: C.grey400,
    fontSize: FS.xs,
  },
  section: {
    marginBottom: SP.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SP.sm,
  },
  sectionLabel: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 2.5,
    color: C.grey600,
  },
  titleText: {
    fontFamily: F.sans,
    fontSize: FS.md,
    color: C.white,
    fontWeight: '500',
  },
  copyButton: {
    borderWidth: 1,
    borderColor: C.grey600,
    paddingHorizontal: SP.sm,
    paddingVertical: 2,
  },
  copyButtonText: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    color: C.grey400,
  },
  grid: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  gridRow: {
    flexDirection: 'row',
    paddingVertical: SP.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  gridLabel: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 2,
    color: C.grey600,
    width: 100,
  },
  gridValue: {
    fontFamily: F.sans,
    fontSize: FS.sm,
    color: C.white,
    flex: 1,
  },
  bodyText: {
    fontFamily: F.sans,
    fontSize: FS.sm,
    color: C.grey400,
    lineHeight: 22,
  },
  priceText: {
    fontFamily: F.sans,
    fontSize: FS.xl,
    color: C.white,
    fontWeight: '700',
  },
  priceReasoning: {
    fontFamily: F.sans,
    fontSize: FS.xxs,
    color: C.grey400,
    marginTop: 4,
  },
  actionsContainer: {
    marginTop: SP.lg,
    alignItems: 'stretch',
    gap: SP.md,
  },
  primaryButton: {
    backgroundColor: C.white,
    paddingVertical: SP.md,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    fontFamily: F.mono,
    fontSize: FS.sm,
    color: C.black,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: C.white,
    paddingVertical: SP.md,
    alignItems: 'center',
    width: '100%',
  },
  secondaryButtonText: {
    fontFamily: F.mono,
    fontSize: FS.sm,
    color: C.white,
  },
  textButton: {
    paddingVertical: SP.sm,
    alignItems: 'center',
  },
  textButtonText: {
    fontFamily: F.mono,
    fontSize: FS.xs,
    color: C.grey400,
    textDecorationLine: 'underline',
  },
  footer: {
    marginTop: SP.xl,
    alignItems: 'center',
    gap: SP.xs,
  },
  footerText: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    color: C.grey600,
    textAlign: 'center',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SP.xl,
    gap: SP.lg,
  },
  fallbackTitle: {
    fontFamily: F.mono,
    fontSize: FS.lg,
    color: C.red,
    textAlign: 'center',
    letterSpacing: 2,
  },
  fallbackText: {
    fontFamily: F.sans,
    fontSize: FS.base,
    color: C.grey400,
    textAlign: 'center',
    lineHeight: 24,
  },
  toast: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 60,
    alignSelf: 'center',
    backgroundColor: C.white,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    zIndex: 999,
  },
  toastText: {
    fontFamily: F.mono,
    fontSize: FS.xs,
    color: C.black,
    fontWeight: '700',
  },
  offscreenContainer: {
    position: 'absolute',
    left: -9999,
  },
  shareCard: {
    width: 360,
    height: 640,
    backgroundColor: C.black,
    borderWidth: 1,
    borderColor: C.grey600,
  },
  shareCardImage: {
    width: '100%',
    height: '60%',
  },
  shareCardContent: {
    padding: SP.lg,
    flex: 1,
  },
  shareCardTitle: {
    fontFamily: F.sans,
    fontSize: FS.md,
    color: C.white,
    fontWeight: '700',
    marginBottom: SP.xs,
  },
  shareCardBrand: {
    fontFamily: F.mono,
    fontSize: FS.xs,
    color: C.grey400,
    marginBottom: SP.lg,
  },
  shareCardPrice: {
    fontFamily: F.sans,
    fontSize: FS.xl,
    color: C.white,
    fontWeight: '700',
  },
  shareCardFooter: {
    padding: SP.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.grey600,
  },
  shareCardWatermark: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    color: C.grey600,
    letterSpacing: 2,
  },
});
