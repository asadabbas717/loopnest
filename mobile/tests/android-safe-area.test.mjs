import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAndroidSafeArea } from '../scripts/android-safe-area.mjs';

const xml = (bottom, dock = '') =>
  `<hierarchy><node resource-id="safe-page-content" bounds="[0,63][1080,${bottom}]">${dock}</node></hierarchy>`;
const bar = (top, visible = true) =>
  `InsetsSource: mType=navigationBars mFrame=[0,${top}][1080,1920] mVisible=${visible}`;
test('native geometry check rejects system-bar and dock overlap rather than accepting process survival alone', () => {
  const deviceDump =
    'InsetsSource id=98c50001 type=navigationBars frame=[0,1794][1080,1920] visible=true flags=INSETS_ROUNDED_CORNER sideHint=BOTTOM';
  assert.equal(checkAndroidSafeArea(xml(1794), deviceDump).navigationTop, 1794);
  assert.equal(checkAndroidSafeArea(xml(1794), bar(1794)).navigationTop, 1794);
  assert.equal(checkAndroidSafeArea(xml(1854), bar(1854)).pageBottom, 1854);
  assert.throws(() => checkAndroidSafeArea(xml(1920), bar(1794)), /overlaps/);
  assert.throws(() => checkAndroidSafeArea(xml(1920), deviceDump), /overlaps/);
  assert.throws(() => checkAndroidSafeArea(xml(1794), bar(1794, false)), /unavailable/);
  assert.throws(() => checkAndroidSafeArea('<hierarchy/>', bar(1794)), /unavailable/);
  assert.throws(
    () =>
      checkAndroidSafeArea(
        xml(1794, '<node resource-id="bottom-navigation" bounds="[22,1700][1058,1820]"/>'),
        bar(1794),
      ),
    /dock extends/,
  );
});
