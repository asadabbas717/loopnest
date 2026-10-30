# Android and iOS acceptance — 29 October 2026

These are owner-reported physical-device results, not results inferred from automated tests.

**31 October follow-up:** the owner reports all follow-up tests passed except the development capture banner overlapping the iOS status bar. Phase 24 corrects that separate safe-area issue. The checklist below preserves the original retest scope; new branding and receipt indicators have separate acceptance in [branding](BRANDING.md) and [receipts](MESSAGE_RECEIPTS.md).

## Passed on both phones

- Sign-in, email autofill, password visibility and accurate wrong-credential warnings.
- Bidirectional text, long-message layout, timestamps, new and older unexpired regular photos, captions and explicit photo-load retry.
- Retention presets remain open, Save alone applies changes, hours/days convert, peer refresh shows the setting and older deadlines remain unchanged.
- One-time recipient-only viewing, correct rendering, no reopening after close/background and automatic closing within sixty seconds.
- Profile-photo addition/replacement/removal, peer visibility, initial fallback and blocking/unblocking access.
- Clear Chat confirmation, shared history removal, retained connection and fresh messages/photos afterward.
- Background privacy, account-switch isolation, wrong-password deletion refusal, successful deletion and peer conversation removal.
- Network catch-up and sending after internet returns. The owner's clarification supersedes the initial iOS failure report; no offline send queue is promised.

Android focused-field keyboard handling passed. iOS sign-up and account-deletion fields were covered. Returning from photo/report screens did not preserve scroll; new-message following failed and receiving while reading older history caused jumps. Phase 23 addresses these UI defects; fixes require another phone test.

## Focused retest after phase 23

Fully close Expo Go, restart Metro from `mobile`, then reopen its current QR code on both phones:

```bash
npm run start:device -- --clear
```

- [ ] iOS sign-up: focus every field, including the last field; typed text and controls remain reachable above the keyboard. Repeat with keyboard already open.
- [ ] iOS Account deletion: focus current password and DELETE confirmation; both remain visible and scrollable. Do not delete a real account for this layout check.
- [ ] Android sign-up/deletion/chat composer: keyboard behavior remains correct.
- [ ] Read older chat history, open a regular photo or report screen, then return: the same history position remains visible.
- [ ] At the bottom, receive several messages/photos: the view follows the new content.
- [ ] Scroll into older history, receive several messages/photos: the view stays on that history without flashing or jumping to the bottom.
- [ ] Send a message: it follows to the composer/latest content, including after the asynchronous server refresh.
- [ ] Background/return and disconnect/reconnect while reading history: private content remains hidden in the background and loaded history returns without a loading placeholder overwriting the position.

## Still unverified

- Actual expiry: set one hour, send disposable text and a regular photo, then check both phones after the deadline, including Refresh and reopening. Seeing a timer alone is not expiry acceptance.
- Current capture enforcement while the explicit development screenshot flag is disabled. The owner enabled capture for UI feedback; release builds ignore that opt-in.
- Signed-build lifecycle, accessibility, broader screen sizes and release gates in [VERIFICATION.md](VERIFICATION.md).

Local phase 23 verification passes strict typing, lint and all 82 automated tests, including seven scroll-intent regressions. These tests exercise event ordering and bookmark/follow state; they cannot prove native keyboard geometry or native scroll rendering.
