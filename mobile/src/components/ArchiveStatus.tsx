/**
 * CLINNA — archive status row
 *
 * Replaces the old [ SAVE TO ARCHIVE ] button on every result screen. The scan
 * is already filed by the time this renders, so the label is a statement, not
 * a control — the only action left is REMOVE.
 *
 * Same frame as the button it replaces: 1px border, black fill, bracketed
 * mono label at FS.xxs / letterSpacing 3.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F, FS, SP } from '../theme';
import { strings } from '../i18n/strings';
import { ArchiveState } from '../hooks/useAutoArchive';
import { track } from '../services/analytics';

const LABELS: Record<ArchiveState, string> = {
  idle:    strings.archive.savingLabel,
  saving:  strings.archive.savingLabel,
  saved:   strings.archive.savedLabel,
  error:   strings.archive.failedLabel,
  removed: strings.archive.removedLabel,
};

// Border doubles as the label colour, as it did on SaveBtn.
const COLORS: Record<ArchiveState, string> = {
  idle:    'rgba(255,255,255,0.45)',  //  4.41:1 — transient
  saving:  'rgba(255,255,255,0.45)',
  saved:   'rgba(180,210,160,0.85)',  // greenish — filed
  error:   'rgba(210,140,140,0.85)',  // reddish — needs a retry
  removed: 'rgba(255,255,255,0.45)',
};

interface Props {
  state:    ArchiveState;
  removing: boolean;
  onRemove: () => Promise<void>;
  onRetry:  () => void;
}

export default function ArchiveStatus({ state, removing, onRemove, onRetry }: Props) {
  const handleRemove = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      strings.archive.removeTitle,
      strings.archive.removeBody,
      [
        { text: strings.common.cancelBtn, style: 'cancel' },
        {
          text:    strings.archive.removeBtn,
          style:   'destructive',
          onPress: async () => {
            try {
              await onRemove();
              track('archive_item_removed');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch (e) {
              console.error('[ArchiveStatus] remove failed:', e);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                strings.archive.removeFailedTitle,
                strings.archive.removeFailedBody,
                [{ text: strings.common.okBtn }],
                { userInterfaceStyle: 'dark' },
              );
            }
          },
        },
      ],
      { userInterfaceStyle: 'dark' },
    );
  };

  const color = COLORS[state];

  return (
    <View style={[S.root, { borderColor: color }]}>
      {state === 'error' ? (
        <TouchableOpacity onPress={onRetry} activeOpacity={0.6} style={S.labelWrap}>
          <Text style={[S.label, { color }]}>{LABELS[state]}</Text>
        </TouchableOpacity>
      ) : (
        <View style={S.labelWrap}>
          <Text style={[S.label, { color }]}>{LABELS[state]}</Text>
        </View>
      )}

      {state === 'saved' && (
        <TouchableOpacity
          onPress={handleRemove}
          disabled={removing}
          activeOpacity={0.6}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={S.removeTxt}>
            {removing ? strings.archive.removingBtn : strings.archive.removeBtn}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: {
    borderWidth:       1,
    paddingVertical:   15,
    paddingHorizontal: SP.md,
    backgroundColor:   C.black,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  labelWrap: { flex: 1 },
  label: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 3,
  },
  removeTxt: {
    fontFamily:    F.mono,
    fontSize:      FS.xxs,
    letterSpacing: 2,
    color:         C.grey400,
  },
});
