import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, styles } from './ui';
import { Icon, visual } from './visuals';
import { fonts, palette } from './theme';
import {
  retentionDraft,
  convertDuration,
  durationSeconds,
  type DurationUnit,
} from '../domain/retention-draft';
export function retentionLabel(seconds: number | null) {
  if (!seconds) return 'Off';
  return seconds % 86400 === 0
    ? `${seconds / 86400} ${seconds === 86400 ? 'day' : 'days'}`
    : `${seconds / 3600} ${seconds === 3600 ? 'hour' : 'hours'}`;
}
export function RetentionSettings({
  seconds,
  busy,
  onSave,
}: {
  seconds: number | null;
  busy: boolean;
  onSave: (seconds: number | null) => void;
}) {
  const [draft, setDraft] = useState(() => retentionDraft(seconds));
  const selected = draft.enabled ? durationSeconds(draft.value, draft.unit) : null;
  const changeUnit = (unit: DurationUnit) =>
    setDraft((current) => ({
      ...current,
      unit,
      value: convertDuration(current.value, current.unit, unit),
    }));
  return (
    <View style={styles.card}>
      <View style={visual.row}>
        <Icon name="clock" color={palette.accent} />
        <Text style={[styles.label, { fontSize: 18 }]}>Leave a lighter trace.</Text>
      </View>
      <Text style={visual.small}>
        New messages disappear after your chosen time. Both people can change this setting. Existing
        deadlines stay unchanged.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[
          { label: 'Off', seconds: null },
          { label: '1 hour', seconds: 3600 },
          { label: '24 hours', seconds: 86400 },
          { label: '7 days', seconds: 604800 },
        ].map((option) => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: selected === option.seconds, disabled: busy }}
            disabled={busy}
            onPress={() => setDraft(retentionDraft(option.seconds))}
            style={{
              paddingHorizontal: 12,
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: selected === option.seconds ? '#2B4120' : palette.raised,
              borderWidth: 1,
              borderColor: selected === option.seconds ? '#597B37' : palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.medium,
                color: selected === option.seconds ? palette.accent : palette.ink,
                fontSize: 12,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label={`Custom duration (${draft.unit})`}
        value={draft.value}
        onChangeText={(value) => setDraft((current) => ({ ...current, enabled: true, value }))}
        keyboardType="decimal-pad"
        maxLength={12}
        editable={!busy}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Hours"
            secondary={draft.unit !== 'hours'}
            disabled={busy}
            onPress={() => changeUnit('hours')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Days"
            secondary={draft.unit !== 'days'}
            disabled={busy}
            onPress={() => changeUnit('days')}
          />
        </View>
      </View>
      <Button
        title="Save disappearing messages"
        icon="clock"
        disabled={busy}
        onPress={() => onSave(selected)}
      />
      <Text style={visual.small}>
        {selected === null
          ? 'Draft: Off.'
          : Number.isFinite(selected)
            ? `Draft: ${retentionLabel(selected)}.`
            : 'Enter a duration in whole hours, from 1 hour to 30 days.'}{' '}
        Tap Save to apply. Saved copies and provider backups cannot be recalled.
      </Text>
    </View>
  );
}
