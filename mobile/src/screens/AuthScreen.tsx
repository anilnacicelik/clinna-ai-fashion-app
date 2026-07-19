/**
 * CLINNA — AuthScreen.tsx
 * Supabase auth.signInWithPassword + auth.signUp
 * Errors: brutalist red monospace [ ERROR: ... ]
 * Navigation: onAuthStateChange Auth Guard in AppNavigator handles routing
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Animated, StatusBar, KeyboardAvoidingView, ScrollView,
  Platform, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../services/supabase';
import { C, F, FS, SP } from '../theme';
import { strings } from '../i18n/strings';

const { height } = Dimensions.get('window');
type AuthMode = 'login' | 'signup';

// ═══════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════════════

export default function AuthScreen() {
  const insets = useSafeAreaInsets();

  const [mode,     setMode]     = useState<AuthMode>('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg,  setInfoMsg]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false); // opt-in, default unchecked

  const contentOpacity = useRef(new Animated.Value(1)).current;

  const clearMessages = () => { setErrorMsg(null); setInfoMsg(null); };

  // ── 1. Sign In with Email ──────────────────────────────────────

  const handleEmailLogin = async () => {
    clearMessages();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMsg(error.message.toUpperCase());
      }
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(e instanceof Error ? e.message.toUpperCase() : strings.auth.errorNetwork);
    } finally {
      setLoading(false);
    }
    // On success → onAuthStateChange in AppNavigator automatically navigates to Home
  };

  // ── 2. Sign Up with Email ──────────────────────────────────────

  const handleEmailSignup = async () => {
    clearMessages();
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    if (!hasLetter || !hasNumber) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(strings.auth.errorWeakPassword);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMsg(error.message.toUpperCase());
      } else {
        if (!data.session) {
          // If email confirmation is required, session will not arrive yet
          setInfoMsg(strings.auth.infoCheckEmail);
        }
        // Record consent (opt-in only — skip the call entirely when unchecked,
        // matching the column's own false default). If email confirmation is
        // required there's no session yet, so this RPC is a harmless no-op
        // until the user's first login; the consent is not retried after that.
        if (marketingConsent) {
          const { error: consentErr } = await supabase.rpc('set_marketing_consent', { consent: true });
          if (consentErr) console.error('[AuthScreen] set_marketing_consent error:', consentErr);
        }
      }
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(e instanceof Error ? e.message.toUpperCase() : strings.auth.errorNetwork);
    } finally {
      setLoading(false);
    }
    // If session exists → Auth Guard automatically navigates to Home
  };

  // ── 3. Forgot Password (Supabase hosted reset flow) ─────────────
  // No custom deep link scheme is configured for this app, so the reset
  // link opens Supabase's flow on a static page in the clinna-legal site
  // (see legal-site/reset-password.html) where the user sets a new
  // password in the browser, then returns to the app to sign in.

  const handleForgotPassword = async () => {
    clearMessages();
    if (!email.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(strings.auth.enterEmailFirst);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://anilnacicelik.github.io/clinna-legal/reset-password.html',
      });
      if (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrorMsg(strings.auth.errorResetFailed);
      } else {
        setInfoMsg(strings.auth.resetSent);
      }
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg(strings.auth.errorResetFailed);
    } finally {
      setLoading(false);
    }
  };

  const handlePrimary = () => {
    if (loading) return;
    if (mode === 'login') handleEmailLogin();
    else handleEmailSignup();
  };

  const switchMode = useCallback((m: AuthMode) => {
    if (m === mode) return;
    clearMessages();
    Animated.timing(contentOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setMode(m);
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }, [mode]);

  return (
    <KeyboardAvoidingView style={S.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />
      <ScrollView
        style={S.scroll}
        contentContainerStyle={[S.content, { paddingTop: insets.top + SP.xl }]}
        showsVerticalScrollIndicator={false}
      >

        <View style={S.logoBlock}>
          <Text style={S.wordmark}>{strings.auth.wordmark}</Text>
          <View style={S.logoRule} />
          <Text style={S.brandLabel}>CLINNA</Text>
          <Text style={S.logoSub}>{strings.auth.tagline}</Text>
        </View>

        <TabBar mode={mode} onChange={switchMode} />

        <Animated.View style={{ opacity: contentOpacity }}>

          {mode === 'signup' && (
            <Field
              label={strings.auth.labelFullName}
              value={fullName}
              onChangeText={(t: string) => { clearMessages(); setFullName(t); }}
              placeholder={strings.auth.placeholderName}
              autoCapitalize="words"
            />
          )}
          <Field
            label={strings.auth.labelEmail}
            value={email}
            onChangeText={(t: string) => { clearMessages(); setEmail(t); }}
            placeholder={strings.auth.placeholderEmail}
            keyboardType="email-address"
          />
          <Field
            label={strings.auth.labelPassword}
            value={password}
            onChangeText={(t: string) => { clearMessages(); setPassword(t); }}
            placeholder={strings.auth.placeholderPass}
            secureTextEntry
            showPassword={showPass}
            onShowToggle={() => setShowPass(!showPass)}
          />

          {mode === 'login' && (
            <TouchableOpacity
              style={S.forgotRow}
              onPress={() => { Haptics.selectionAsync(); handleForgotPassword(); }}
              disabled={loading}
            >
              <Text style={S.forgotText}>{strings.auth.forgotPassword}</Text>
            </TouchableOpacity>
          )}

          {mode === 'signup' && (
            <Checkbox
              checked={marketingConsent}
              onToggle={() => { Haptics.selectionAsync(); setMarketingConsent(c => !c); }}
              label={strings.auth.marketingConsent}
              note={strings.auth.marketingConsentNote}
            />
          )}

          {/* ── Brutalist error message ── */}
          {errorMsg && (
            <Text style={S.errorText}>{strings.auth.errorFmt(errorMsg)}</Text>
          )}

          {/* ── Info message ── */}
          {infoMsg && (
            <Text style={S.infoText}>{strings.auth.infoFmt(infoMsg)}</Text>
          )}

          <PrimaryBtn
            label={mode === 'login' ? strings.auth.ctaLogin : strings.auth.createAccount}
            onPress={handlePrimary}
            loading={loading}
          />

        </Animated.View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function TabBar({ mode, onChange }: { mode: AuthMode; onChange: (m: AuthMode) => void }) {
  return (
    <View style={TB.root}>
      {(['login', 'signup'] as AuthMode[]).map((m) => (
        <TouchableOpacity key={m} style={TB.tab} onPress={() => { Haptics.selectionAsync(); onChange(m); }}>
          <Text style={[TB.lbl, mode === m && TB.lblActive]}>
            {m === 'login' ? strings.auth.tabSignIn : strings.auth.createAccount}
          </Text>
          {mode === m && <View style={TB.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, showPassword, onShowToggle, keyboardType, autoCapitalize }: any) {
  return (
    <View style={FLD.root}>
      <Text style={FLD.label}>{label}</Text>
      <View style={FLD.inputRow}>
        <TextInput
          style={FLD.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.2)"
          secureTextEntry={secureTextEntry && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
        />
        {onShowToggle && (
          <TouchableOpacity onPress={onShowToggle}>
            <Text style={FLD.eyeTxt}>{showPassword ? strings.auth.hidePass : strings.auth.showPass}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={FLD.underline} />
    </View>
  );
}

function Checkbox({ checked, onToggle, label, note }: {
  checked: boolean; onToggle: () => void; label: string; note?: string;
}) {
  return (
    <TouchableOpacity style={CHK.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[CHK.box, checked && CHK.boxChecked]} />
      <View style={{ flex: 1 }}>
        <Text style={CHK.label}>{label}</Text>
        {!!note && <Text style={CHK.note}>{note}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function PrimaryBtn({ label, onPress, loading }: any) {
  return (
    <TouchableOpacity
      style={[PB.root, loading && PB.rootLoading]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
      disabled={loading}
      activeOpacity={0.7}
    >
      <Text style={PB.label}>{loading ? strings.auth.ctaLoading : label}</Text>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════

const S = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.black },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: SP.lg, minHeight: height },

  logoBlock: { alignItems: 'flex-start', marginBottom: SP.xxl },
  wordmark:  { fontFamily: F.brand, fontSize: 72, color: C.white, lineHeight: 80 },
  logoRule:  { width: 32, height: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: SP.xs },
  brandLabel: { fontFamily: F.mono, fontSize: FS.xs, letterSpacing: 6, color: C.grey600, marginBottom: SP.xs },
  logoSub:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },

  // Forgot-password link — login mode only
  forgotRow: { alignSelf: 'flex-end', marginTop: -SP.sm, marginBottom: SP.lg },
  forgotText: { fontFamily: F.mono, fontSize: FS.xs, letterSpacing: 2, color: C.grey600 },

  // Brutalist error — red monospace
  errorText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         C.red,
    letterSpacing: 1.5,
    lineHeight:    18,
    marginBottom:  SP.md,
  },
  // Info message — grey monospace
  infoText: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    color:         C.grey400,
    letterSpacing: 1.5,
    lineHeight:    18,
    marginBottom:  SP.md,
  },
});

const FLD = StyleSheet.create({
  root:     { gap: 8, marginBottom: SP.lg },
  label:    { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, color: C.grey600 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input:    { flex: 1, fontFamily: F.mono, fontSize: FS.base, color: C.white, paddingVertical: 10 },
  eyeTxt:   { fontFamily: F.mono, fontSize: FS.xxs, color: C.grey600 },
  underline: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
});

const CHK = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: SP.lg },
  box:   { width: 16, height: 16, borderWidth: 1, borderColor: C.white, marginTop: 2 },
  boxChecked: { backgroundColor: C.white },
  label: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey400, lineHeight: 16 },
  note:  { fontFamily: F.mono, fontSize: 9, letterSpacing: 0.5, color: C.grey600, marginTop: 4, lineHeight: 13 },
});

const TB = StyleSheet.create({
  root:      { flexDirection: 'row', marginBottom: SP.xl },
  tab:       { paddingBottom: 10, paddingRight: SP.xl },
  lbl:       { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3.5, color: C.grey600 },
  lblActive: { color: C.white },
  indicator: { position: 'absolute', bottom: 0, left: 0, right: SP.xl, height: 1, backgroundColor: C.white },
});

const PB = StyleSheet.create({
  root:        { backgroundColor: C.white, paddingVertical: 18, alignItems: 'center', marginTop: SP.sm },
  rootLoading: { opacity: 0.5 },
  label:       { fontFamily: F.mono, fontSize: FS.xs, fontWeight: '700', letterSpacing: 4, color: C.black },
});
