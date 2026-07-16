/**
 * CLINNA — HomeScreen.tsx
 * Changes:
 *  - Wordmark fontSize 112, letterSpacing 2
 *  - Top right: [ 3 SCANS LEFT ] counter (1px white border) + [ LOGOUT ] button
 *  - Logout → supabase.auth.signOut()  (Auth Guard handles redirect)
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, StatusBar, Dimensions, Alert, Linking,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../services/supabase';
import { deleteAccount } from '../services/api';
import { useScansLeft } from '../hooks/useScansLeft';
import { C, F, FS, SP } from '../theme';
import { RootStackParamList } from '../navigation/AppNavigator';
import { strings } from '../i18n/strings';
import { PRIVACY_URL, TERMS_URL } from '../config/legal';

const { width, height } = Dimensions.get('window');
type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const SCRIPT_FONT = 'MissFajardose';

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();
  const { scansLeft, load } = useScansLeft();
  const [deleting, setDeleting] = useState(false);

  // Refresh counter on every focus (stays current when returning from CameraScreen)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkY       = useRef(new Animated.Value(24)).current;
  const wordmarkScale   = useRef(new Animated.Value(0.94)).current;
  const buttonOpacity   = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(wordmarkOpacity, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(wordmarkY,       { toValue: 0, duration: 1400, useNativeDriver: true }),
        Animated.timing(wordmarkScale,   { toValue: 1, duration: 1400, useNativeDriver: true }),
      ]),
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 800,  useNativeDriver: true }),
        Animated.timing(buttonOpacity,   { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleAnalyze = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Camera');
  };

  const handleGetCredits = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Paywall');
  };

  const handleHistory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('History');
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('[HomeScreen] signOut error:', e);
    }
  };

  const handlePrivacyPolicy = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(PRIVACY_URL).catch(e => console.error('[HomeScreen] openURL (privacy) error:', e));
  };

  const handleTerms = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(TERMS_URL).catch(e => console.error('[HomeScreen] openURL (terms) error:', e));
  };

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      '[ DELETE ACCOUNT ]',
      'THIS WILL PERMANENTLY DELETE YOUR ACCOUNT, SCAN HISTORY, AND CREDITS. THIS CANNOT BE UNDONE.',
      [
        { text: strings.common.cancelBtn, style: 'cancel' },
        {
          text: '[ DELETE ]',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await supabase.auth.signOut();
            } catch (e) {
              console.error('[HomeScreen] deleteAccount error:', e);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('[ DELETE FAILED ]', 'COULD NOT DELETE ACCOUNT. CHECK YOUR CONNECTION AND TRY AGAIN.', [{ text: strings.common.okBtn }]);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ── Top right: Get Credits + Logout ── */}
      <View style={[S.topBar, { top: insets.top + 10 }]}>
        <TouchableOpacity style={S.creditsBtn} onPress={handleGetCredits} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Text style={S.creditsText}>[ GET CREDITS ]</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.logoutBtn} onPress={handleLogout} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <Text style={S.logoutText}>{strings.common.logoutBtn}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Wordmark — fontSize 112, letterSpacing 2 ── */}
      <Animated.View
        style={[
          S.wordmarkContainer,
          {
            opacity:   wordmarkOpacity,
            transform: [{ translateY: wordmarkY }, { scale: wordmarkScale }],
          },
        ]}
      >
        <Text style={S.wordmark} adjustsFontSizeToFit numberOfLines={1}>
          {strings.common.wordmark}
        </Text>
        <View style={S.rule} />
        <Text style={S.brandLabel}>CLINNA</Text>
      </Animated.View>

      {/* ── Subtitle ── */}
      <Animated.View style={[S.subtitleContainer, { opacity: subtitleOpacity }]}>
        <Text style={S.subtitle}>{strings.home.subtitle}</Text>
      </Animated.View>

      {/* ── Button group: History on top, Analyze below ── */}
      <Animated.View style={[S.buttonContainer, { opacity: buttonOpacity }]}>

        <TouchableOpacity style={S.historyButton} onPress={handleHistory} activeOpacity={0.55}>
          <Text style={S.historyText}>{strings.home.historyBtn}</Text>
        </TouchableOpacity>

        <View style={S.buttonGap} />

        <TouchableOpacity style={S.button} onPress={handleAnalyze} activeOpacity={0.55}>
          <Text style={S.buttonText}>{strings.home.analyzeBtn}</Text>
        </TouchableOpacity>

        <View style={S.scanCounter}>
          <Text style={S.scanCounterText}>{strings.common.scansLeft(scansLeft)}</Text>
        </View>

        <TouchableOpacity
          style={S.deleteAccountBtn}
          onPress={handleDeleteAccount}
          activeOpacity={0.55}
          disabled={deleting}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={S.deleteAccountText}>
            {deleting ? '[ DELETING... ]' : strings.common.deleteAccountBtn}
          </Text>
        </TouchableOpacity>

        <View style={S.legalRow}>
          <TouchableOpacity onPress={handlePrivacyPolicy} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={S.legalText}>[ PRIVACY POLICY ]</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleTerms} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
            <Text style={S.legalText}>[ TERMS OF SERVICE ]</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Top right bar ────────────────────────────────────────────────
  topBar: {
    position:      'absolute',
    right:         SP.lg,           // 24
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  scanCounter: {
    alignSelf:        'center',
    marginTop:        14,
    borderWidth:      1,
    borderColor:      C.white,
    paddingVertical:  4,
    paddingHorizontal: 8,
  },
  scanCounterText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,          // 10
    color:         C.white,
    letterSpacing: 1.5,
  },
  creditsBtn: {
    paddingVertical:  4,
    paddingHorizontal: 8,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.2)',
  },
  creditsText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         C.grey400,
    letterSpacing: 1.5,
  },
  logoutBtn: {
    paddingVertical:  4,
    paddingHorizontal: 8,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.2)',
  },
  logoutText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         C.grey400,
    letterSpacing: 1.5,
  },

  // ── Wordmark ─────────────────────────────────────────────────────
  wordmarkContainer: {
    position:   'absolute',
    top:        height * 0.30,
    alignItems: 'center',
    width:      width * 0.88,
  },
  wordmark: {
    fontFamily:        SCRIPT_FONT,
    fontSize:          112,            // ← increased (82 → 112)
    fontWeight:        '400',
    color:             '#F2F0EB',
    letterSpacing:     2,              // ← expanded (-1 → 2)
    lineHeight:        136,
    textAlign:         'center',
    textShadowColor:   'rgba(242, 240, 235, 0.08)',
    textShadowOffset:  { width: 0, height: 0 },
    textShadowRadius:  20,
  },
  rule: {
    width:           40,
    height:          0.5,
    backgroundColor: 'rgba(242, 240, 235, 0.25)',
    marginTop:       8,
  },
  brandLabel: {
    fontFamily:    F.mono,
    fontSize:      FS.xs,
    letterSpacing: 6,
    color:         C.grey600,
    marginTop:     SP.sm,
  },

  // ── Subtitle ─────────────────────────────────────────────────────
  subtitleContainer: {
    position:   'absolute',
    top:        height * 0.30 + 158 + 26, // +26 to clear the new CLINNA brand label line above
    alignItems: 'center',
  },
  subtitle: {
    fontFamily:    'System',
    fontSize:      9,
    fontWeight:    '400',
    letterSpacing: 3.5,
    color:         'rgba(242, 240, 235, 0.22)',
  },

  // ── Button group ─────────────────────────────────────────────────
  buttonContainer: {
    position:   'absolute',
    bottom:     height * 0.10,
    alignSelf:  'center',
    width:      width - 104,
    alignItems: 'center',
  },
  historyButton: {
    width:           '100%',
    alignItems:      'center',
    paddingVertical: 13,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.2)',
    backgroundColor: '#000000',
  },
  historyText: {
    fontFamily:    'Courier New',
    fontSize:      9,
    fontWeight:    '400',
    letterSpacing: 4,
    color:         'rgba(255,255,255,0.35)',
  },
  buttonGap: { height: 10 },
  button: {
    width:           '100%',
    borderWidth:     0.5,
    borderColor:     'rgba(242, 240, 235, 0.28)',
    paddingVertical: 18,
    alignItems:      'center',
  },
  buttonText: {
    fontFamily:    'System',
    fontSize:      10,
    fontWeight:    '400',
    letterSpacing: 5,
    color:         'rgba(242, 240, 235, 0.6)',
  },
  deleteAccountBtn: {
    marginTop:  18,
    alignItems: 'center',
  },
  deleteAccountText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 1.5,
    color:         'rgba(242, 240, 235, 0.22)',
  },
  legalRow: {
    flexDirection: 'row',
    gap:           SP.md,
    marginTop:     14,
  },
  legalText: {
    fontFamily:    F.mono,
    fontSize:      9,
    letterSpacing: 1,
    color:         'rgba(242, 240, 235, 0.16)',
  },
});
