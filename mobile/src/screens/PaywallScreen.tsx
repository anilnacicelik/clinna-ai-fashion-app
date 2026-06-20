/**
 * CLINNA — PaywallScreen
 * Placeholder — purchase integration pending (RevenueCat / StoreKit).
 * Not currently reachable from the app; kept for future sprint.
 */

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { C, F, FS, SP } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Paywall'>;

export default function PaywallScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.black }}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      <ScrollView
        contentContainerStyle={[
          S.scroll,
          { paddingTop: insets.top + SP.lg, paddingBottom: insets.bottom + SP.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Back ── */}
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.back} activeOpacity={0.7}>
          <Text style={S.backTxt}>← BACK</Text>
        </TouchableOpacity>

        {/* ── Header ── */}
        <View style={S.headerBlock}>
          <Text style={S.eyebrow}>CLINNA  ·  SYSTEM GATE</Text>
          <Text style={S.title}>EXPANDED ACCESS{'\n'}COMING SOON</Text>
          <View style={S.titleRule} />
          <Text style={S.subtitle}>
            Premium tiers are in development.{'\n'}
            For now, all scans are available free of charge.
          </Text>
        </View>

        <Text style={S.footer}>
          Powered by CLINNA Neural Engine.
        </Text>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  scroll: {
    paddingHorizontal: SP.lg,
    gap: SP.lg,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: SP.xs,
    marginBottom: SP.sm,
  },
  backTxt: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 2.5,
    color: C.grey600,
  },
  headerBlock: {
    gap: SP.sm,
    marginBottom: SP.sm,
  },
  eyebrow: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 4,
    color: C.grey600,
  },
  title: {
    fontFamily: F.mono,
    fontSize: 32,
    letterSpacing: 1.5,
    color: C.white,
    lineHeight: 38,
    fontWeight: '700',
  },
  titleRule: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: SP.xs,
  },
  subtitle: {
    fontFamily: F.mono,
    fontSize: FS.xxs,
    letterSpacing: 0.3,
    color: C.grey600,
    lineHeight: 18,
  },
  footer: {
    fontFamily: F.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: C.grey600,
    opacity: 0.4,
    textAlign: 'center',
    marginTop: SP.sm,
  },
});
