import assert from 'node:assert/strict';
import test from 'node:test';
import { createScrollIntent } from '../src/domain/scroll-intent.ts';
function fixture(startAtEnd = true) {
  const moves = [],
    bookmarks = [];
  const scroll = createScrollIntent({
    startAtEnd,
    scrollTo: (y) => moves.push(y),
    save: (p) => bookmarks.push(p),
  });
  scroll.viewport(500);
  return { scroll, moves, bookmarks };
}
test('restoration waits for loaded native content and ignores loading/stale callbacks', () => {
  const { scroll, moves, bookmarks } = fixture();
  const old = scroll.focus({ offset: 600, atEnd: false });
  scroll.ready(false);
  scroll.layout(100, old);
  scroll.observe(0);
  assert.equal(bookmarks.length, 0);
  scroll.ready(true);
  scroll.layout(100, old);
  assert.equal(moves.length, 0);
  scroll.layout(2000, scroll.ticket());
  assert.deepEqual(moves, [600]);
  scroll.observe(0);
  assert.equal(
    bookmarks.at(-1).offset,
    600,
    'late layout clamp cannot overwrite requested restoration',
  );
  scroll.observe(600);
  assert.equal(bookmarks.at(-1).offset, 600);
});
test('new messages follow near the bottom but never promote a reader back to following', () => {
  const { scroll, moves, bookmarks } = fixture();
  scroll.focus();
  scroll.ready(true);
  scroll.layout(1500, scroll.ticket());
  scroll.observe(1000);
  scroll.layout(1800, scroll.ticket());
  assert.equal(moves.at(-1), 1300);
  scroll.observe(1300);
  scroll.beginGesture();
  scroll.observe(300);
  scroll.endGesture();
  const before = moves.length;
  scroll.layout(2100, scroll.ticket());
  assert.equal(moves.length, before);
  scroll.observe(450); // Native maintain-visible-position correction.
  scroll.layout(2300, scroll.ticket());
  assert.equal(moves.length, before);
  assert.deepEqual(bookmarks.at(-1), { offset: 450, atEnd: false });
});
test('blur/background cannot poison the bookmark and return restores after remeasurement', () => {
  const { scroll, moves, bookmarks } = fixture();
  scroll.focus({ offset: 500, atEnd: false });
  scroll.ready(true);
  scroll.layout(2000, scroll.ticket());
  scroll.observe(500);
  const saved = bookmarks.at(-1),
    old = scroll.ticket();
  scroll.blur();
  scroll.observe(0);
  scroll.ready(false);
  scroll.layout(60, old);
  assert.deepEqual(bookmarks.at(-1), saved);
  scroll.focus(saved);
  scroll.ready(true);
  scroll.layout(2000, scroll.ticket());
  assert.equal(moves.at(-1), 500);
});
test('keyboard owns automatic movement while typing and reading intent survives dismissal', () => {
  const { scroll, moves, bookmarks } = fixture();
  scroll.focus();
  scroll.ready(true);
  scroll.layout(1500, scroll.ticket());
  scroll.observe(1000);
  scroll.keyboard(true);
  const before = moves.length;
  scroll.layout(1800, scroll.ticket());
  scroll.observe(1250);
  assert.equal(moves.length, before);
  scroll.beginGesture();
  scroll.observe(300);
  scroll.endGesture();
  scroll.keyboard(false);
  assert.equal(moves.length, before);
  assert.equal(bookmarks.at(-1).atEnd, false);
});
test('an explicit send jump continues following after the asynchronous message render', () => {
  const { scroll, moves } = fixture();
  scroll.focus({ offset: 100, atEnd: false });
  scroll.ready(true);
  scroll.layout(1500, scroll.ticket());
  scroll.observe(100);
  scroll.jumpToEnd();
  assert.equal(moves.at(-1), 1000);
  scroll.observe(1000);
  scroll.layout(1700, scroll.ticket());
  assert.equal(moves.at(-1), 1200);
});

test('a user gesture cancels a pending restoration instead of jumping over the reader', () => {
  const { scroll, moves, bookmarks } = fixture();
  scroll.focus({ offset: 1000, atEnd: false });
  scroll.ready(true);
  scroll.beginGesture();
  scroll.observe(250);
  scroll.endGesture();
  scroll.layout(2000, scroll.ticket());
  assert.deepEqual(moves, []);
  assert.deepEqual(bookmarks.at(-1), { offset: 250, atEnd: false });
});
test('invalid or obsolete bookmarks and nonfinite native observations never produce invalid offsets', () => {
  const { scroll, moves, bookmarks } = fixture(false);
  scroll.focus(600); // Development Fast Refresh can retain the old numeric map.
  scroll.ready(true);
  scroll.viewport(Number.NaN);
  scroll.layout(2000, scroll.ticket());
  scroll.observe(Number.NaN);
  assert.equal(bookmarks.at(-1).offset, 0);
  assert.ok(moves.every(Number.isFinite));
});

test('read visibility excludes loading, restoration, dragging, keyboard and blurred routes', () => {
  const { scroll } = fixture();
  scroll.focus({ offset: 200, atEnd: false });
  assert.equal(scroll.visibleRange(), null);
  scroll.ready(true);
  scroll.layout(2000, scroll.ticket());
  assert.equal(scroll.visibleRange(), null, 'wait for native restoration acknowledgement');
  scroll.observe(200);
  assert.deepEqual(scroll.visibleRange(), { top: 200, bottom: 700 });
  scroll.beginGesture();
  assert.equal(scroll.visibleRange(), null);
  scroll.observe(400);
  scroll.endGesture();
  assert.deepEqual(scroll.visibleRange(), { top: 400, bottom: 900 });
  scroll.keyboard(true);
  assert.equal(scroll.visibleRange(), null);
  scroll.keyboard(false);
  scroll.blur();
  assert.equal(scroll.visibleRange(), null);
});
