# Phase 18 — private, expressive mobile experience

The interface uses graphite surfaces, lime and cyan accents, bundled Space Grotesk fonts, line icons, initial avatars, layered gradients and a restrained geometric identity. Fonts are bundled, with no Google Fonts network request. Home shows the other participant's display name and username; account identifiers and dates are not conversation titles. Chats, Friends and Account share a bottom dock, which hides while the keyboard is open. The previously accepted keyboard-aware scrolling, email editing and password visibility behavior remain in the shared controls.

Navigation, card entrances and button presses animate with the system reduced-motion setting. Expiring messages have no exit animation. No invented online status, encryption claim or tracking SDK is included. Messages remain access-controlled, not end-to-end encrypted.

Conversation settings offer Off, 1 hour, 24 hours, 7 days, or a custom whole-hour/day duration from 1 hour to 30 days. Either accepted participant can change future-message retention; the actual server value is displayed to both. Existing messages keep their deadlines. Server time and conservative monotonic timers remove expired rows without trusting the phone clock.

The attachment preview offers a one-time option before upload. Only the receiving participant can claim it. An explicit confirmation explains that delivery interruption also consumes the opening. The viewer uses the protected navigation window, holds bytes only in memory, disables image caching and closes on navigation, backgrounding or the earlier of sixty seconds and the message deadline. Migration `202610280002_one_time_deadline.sql` and the updated `open-photo` function supply a server-bounded display duration; HTTP and decoding time never extend it.

Native screenshot/recording prevention stays active above all navigation and session changes. Private screens do not mount if protection initialization fails. App-switcher protection and the inactive cover remain enabled. These are operating-system protections, not a guarantee against a modified device/client, external camera or copies already made. See [Expo's SDK 58 capture API](https://docs.expo.dev/versions/v58.0.0/sdk/screen-capture/) for platform behavior. No screenshot-detection permission or gallery-wide access is requested.

## Device acceptance still required

Using two disposable accounts and synthetic photos:

1. Check names, long names, navigation, scrolling, larger system text, password/autofill and the keyboard on long forms. Enable reduced motion and verify transitions respect it.
2. Set custom hours/days on one phone; verify the other sees the setting after the live update or Refresh. Send text and regular photos; older messages must retain their original setting. Invalid durations must show a useful warning.
3. Send a one-time photo. The sender must have no Open control. The recipient must confirm before opening and see an image. After closing, backgrounding or sixty seconds, reopening must fail. Simultaneous opens must have only one winner.
4. Attempt screenshots and screen recording in chat and during one-time viewing. Also start recording before opening the app, switch through recent apps, and switch accounts. Private pixels must not appear. Repeat in standalone builds before release; previous capture acceptance predates this viewer.
5. Verify ordinary new/old photos, block/unblock, reports, sign-out and account erasure still work. For an actual expiry check, use the minimum one-hour setting and confirm both phones lose the message without changing their clocks.

Automated checks and JavaScript bundles do not establish native visual, screenshot, recording or accessibility acceptance. No local Docker engine or persistent Expo server is needed for source verification.

## Automated evidence

All 58 local tests, strict typing, lint, formatting, SDK compatibility and all 20 Doctor checks pass. Dependency audit reports zero known vulnerabilities; the reviewed local merge fork still requires maintenance. [CI run 40694203730](https://github.com/asadabbas717/loopnest/actions/runs/40694203730), source `074581e`, passes clean installation, audit, tests, temporary CLI startup/stop, Android/iOS Hermes exports and all 16 real backend tests. Android generation retains the blocked permissions. The deadline migration and `open-photo` handler are deployed to the authorized Free test project; unauthenticated opening is denied. Device and signed-build acceptance are pending.
