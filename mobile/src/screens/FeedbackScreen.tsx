/**
 * CLINNA — FeedbackScreen
 *
 * One box, one button. Pushed as a sheet from Home and from BuyResult.
 *
 * The message goes to the Supabase `feedback` table with the user id when
 * there is one — nothing else about the user is attached, and the failure
 * path never shows a Postgres error to someone standing in a shop.
 *
 * Field styling is AuthScreen's (label / input / underline); buttons are the
 * bracketed pair used on every result screen.
 */

import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { RootStackParamList } from '../navigation/AppNavigator';
import { supabase } from '../services/supabase';
import { APP_VERSION, track } from '../services/analytics';
import { C, F, FS, SP } from '../theme';
import { strings } from '../i18n/strings';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Feedback'>;
type SendState = 'idle' | 'sending' | 'sent';

const MAX_LENGTH = 2000;

export default function FeedbackScreen() {
  const navigation = useNavigation<Nav>();
  const insets     = useSafeAreaInsets();

  const [message, setMessage] = useState('');
  const [state,   setState]   = useState<SendState>('idle');
  const [error,   setError]   = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    if (state !== 'idle') return;

    const body = message.trim();
    if (!body) {
      setError(strings.feedback.errorEmpty);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setState('sending');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error: dbError } = await supabase.from('feedback').insert({
        user_id:     session?.user?.id ?? null,
        message:     body.slice(0, MAX_LENGTH),
        platform:    Platform.OS,
        app_version: APP_VERSION,
      });
      if (dbError) throw new Error(dbError.message);

      track('feedback_sent');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState('sent');

      // Leave the confirmation up long enough to read, then dismiss.
      setTimeout(() => navigation.goBack(), 1400);
    } catch (e) {
      // Whatever went wrong, the user gets one sentence they can act on.
      console.error('[FeedbackScreen] send failed:', e);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(strings.feedback.errorFailed);
      setState('idle');
    }
  }, [message, state, navigation]);

  const sendLabel =
    state === 'sending' ? strings.feedback.sendingBtn
    : state === 'sent'  ? strings.feedback.sentBtn
    : strings.feedback.sendBtn;

  return (
    <KeyboardAvoidingView
      style={S.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={S.hBtn}>{strings.feedback.closeBtn}</Text>
        </TouchableOpacity>
        <Text style={S.hTitle}>{strings.feedback.title}</Text>
        <View style={{ width: 52 }} />
      </View>
      <View style={S.rule} />

      <ScrollView
        contentContainerStyle={[S.content, { paddingBottom: insets.bottom + SP.xl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={S.intro}>{strings.feedback.intro}</Text>

        <View style={S.field}>
          <Text style={S.label}>{strings.feedback.label}</Text>
          <TextInput
            style={S.input}
            value={message}
            onChangeText={t => { setMessage(t); if (error) setError(null); }}
            placeholder={strings.feedback.placeholder}
            placeholderTextColor="rgba(255,255,255,0.5)"
            multiline
            textAlignVertical="top"
            maxLength={MAX_LENGTH}
            editable={state === 'idle'}
            autoCorrect
          />
          <View style={S.underline} />
        </View>

        {!!error && <Text style={S.errorTxt}>{strings.auth.errorFmt(error)}</Text>}

        <TouchableOpacity
          style={[S.sendBtn, state !== 'idle' && S.sendBtnDim]}
          onPress={handleSend}
          disabled={state !== 'idle'}
          activeOpacity={0.8}
        >
          <Text style={[S.sendTxt, state !== 'idle' && S.sendTxtDim]} numberOfLines={1} adjustsFontSizeToFit>
            {sendLabel}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const S = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.black },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.lg, paddingBottom: 14 },
  hBtn:   { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2.5, color: C.grey400 },
  hTitle: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 4,   color: C.white   },
  rule:   { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  content: { paddingHorizontal: SP.lg, paddingTop: SP.lg, gap: SP.lg },

  intro: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 0.3,
    color:         C.grey400,
    lineHeight:    18,
  },

  field: { gap: 8 },
  label: { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 2, color: C.grey400 },
  input: {
    fontFamily:      F.mono,
    fontSize:        FS.base,
    color:           C.white,
    paddingVertical: 10,
    minHeight:       140,
    lineHeight:      22,
  },
  underline: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  errorTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 1.5,
    color:         C.red,
    lineHeight:    18,
  },

  sendBtn:    { backgroundColor: C.white, paddingVertical: 18, paddingHorizontal: SP.md, alignItems: 'center' },
  sendBtnDim: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendTxt:    { fontFamily: F.mono, fontSize: FS.xxs, letterSpacing: 3, fontWeight: '700', color: C.black },
  sendTxtDim: { color: C.grey400 },
});
