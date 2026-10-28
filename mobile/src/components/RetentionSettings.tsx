import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Field, styles } from './ui';
import { Icon, visual } from './visuals';
import { fonts, palette } from './theme';
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
  const [value, setValue] = useState('24');
  const [unit, setUnit] = useState<'hours' | 'days'>('hours');
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
            accessibilityState={{ selected: seconds === option.seconds, disabled: busy }}
            disabled={busy}
            onPress={() => onSave(option.seconds)}
            style={{
              paddingHorizontal: 12,
              minHeight: 44,
              justifyContent: 'center',
              borderRadius: 12,
              backgroundColor: seconds === option.seconds ? '#2B4120' : palette.raised,
              borderWidth: 1,
              borderColor: seconds === option.seconds ? '#597B37' : palette.line,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.medium,
                color: seconds === option.seconds ? palette.accent : palette.ink,
                fontSize: 12,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="Or choose your own duration"
        value={value}
        onChangeText={setValue}
        keyboardType="number-pad"
        maxLength={3}
        editable={!busy}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Hours"
            secondary={unit !== 'hours'}
            disabled={busy}
            onPress={() => setUnit('hours')}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Days"
            secondary={unit !== 'days'}
            disabled={busy}
            onPress={() => setUnit('days')}
          />
        </View>
      </View>
      <Button
        title="Set disappearing messages"
        icon="clock"
        disabled={busy}
        onPress={() =>
          onSave(
            /^\d+$/.test(value) ? Number(value) * (unit === 'hours' ? 3600 : 86400) : Number.NaN,
          )
        }
      />
      <Text style={visual.small}>
        Choose 1 hour to 30 days. Saved copies and provider backups cannot be recalled.
      </Text>
    </View>
  );
}
