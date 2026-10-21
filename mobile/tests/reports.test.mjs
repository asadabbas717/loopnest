import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportReason, reportReasons } from '../src/domain/reports.ts';
test('reports permit only explicit categories and do not accept injected free-form data', () => {
  for (const reason of reportReasons) assert.equal(reportReason(reason), reason);
  for (const reason of [
    '',
    'private message content',
    'moderator',
    'spam;drop table reports',
    'SPAM',
  ])
    assert.throws(() => reportReason(reason));
});
