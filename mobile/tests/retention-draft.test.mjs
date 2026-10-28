import assert from 'node:assert/strict';
import test from 'node:test';
import { retentionDraft, durationSeconds, convertDuration } from '../src/domain/retention-draft.ts';

test('retention drafts reflect the saved value and unit changes preserve duration', () => {
  assert.deepEqual(retentionDraft(604800), { enabled: true, value: '7', unit: 'days' });
  assert.equal(retentionDraft(null).enabled, false);
  assert.equal(convertDuration('24', 'hours', 'days'), '1');
  assert.equal(convertDuration('7', 'days', 'hours'), '168');
  for (let hours = 1; hours <= 720; hours++) {
    const days = convertDuration(String(hours), 'hours', 'days');
    assert.equal(durationSeconds(days, 'days'), hours * 3600);
    assert.equal(convertDuration(days, 'days', 'hours'), String(hours));
  }
  for (const [value, unit] of [
    ['0', 'hours'],
    ['721', 'hours'],
    ['31', 'days'],
    ['1.5', 'hours'],
    ['', 'days'],
    ['Infinity', 'days'],
  ])
    assert.ok(Number.isNaN(durationSeconds(value, unit)));
});
