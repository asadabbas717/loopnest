import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { backend } from '../../lib/client';
import { createModerationApi } from '../../lib/moderation-api';
import { reportReasons, type ReportReason } from '../../domain/reports';
import { Button, Heading, Notice, Page, styles, useAction } from '../../components/ui';

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [submitted, setSubmitted] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <Page>
      <Heading
        title={submitted ? 'Report received' : 'Report this message'}
        subtitle={
          submitted
            ? 'A project moderator can review it. Reporting does not promise immediate action.'
            : 'The selected text and any regular photo will be shared with authorized moderators. One-time photos are excluded, and expired content cannot be newly shared. The rest of your conversation stays private.'
        }
      />
      {!submitted && (
        <>
          <Text style={[styles.copy, { marginBottom: 16 }]}>
            Choose the main reason. Repeated reports of the same message count as one report. You
            can also block this person from the conversation.
          </Text>
          {reportReasons.map((item) => (
            <Button
              key={item}
              secondary
              title={`${reason === item ? '✓ ' : ''}${item.replaceAll('_', ' ')}`}
              disabled={busy}
              onPress={() => setReason(item)}
            />
          ))}
          <Notice text={error} />
          <Button
            title="Submit report"
            disabled={busy}
            onPress={() =>
              run(async () => {
                await createModerationApi(backend).report(id, reason);
                setSubmitted(true);
              })
            }
          />
        </>
      )}
      <Button title="Back" secondary disabled={busy} onPress={() => router.back()} />
    </Page>
  );
}
