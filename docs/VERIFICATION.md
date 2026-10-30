# Verification and release gates

Use [STATUS.md](STATUS.md) for exact source commits, CI links and user-reported device evidence. Older phase documents describe historical checks; they do not override the current implementation or acceptance status.

## Automated checks

From `mobile`:

```bash
npm ci
npm run check
npm run format:check
npm run audit:dependencies
npx expo install --check
npx expo-doctor
```

`check` includes strict TypeScript, Expo lint, domain/handler regressions and real SQL migrations executed in embedded PostgreSQL. Fixtures simulate Auth and Storage service tables; embedded tests cannot establish signed JWT, actual object deletion, SMTP or Realtime behavior.

The **Quality and authorization** GitHub workflow uses clean Node 24 installs. Its quality job runs audit, checks, formatting, a temporary localhost Expo startup/status/stop smoke and Android/iOS Hermes exports. The local project server does not need to run. The backend job starts an isolated Linux Supabase stack, exercises real Auth/PostgREST/Storage/Edge Functions/Realtime, and stops its stack afterward. Do not start the owner's stopped local Docker engine just to repeat CI.

Security regressions cover outsider/anonymous denial, account binding, accepted/nonblocked membership, immutable delivery IDs, physical-delete ordering, metadata-free JPEG re-encoding, one-time concurrent opening, server expiry, Clear Chat retries, profile-photo permissions, upload quotas and auth/session races. Tests must use synthetic content and avoid logging credentials or backend responses containing tokens.

## Current evidence and limits

- Earlier SDK 58 Expo Go acceptance passed on both owner phones for core sign-in, messaging, network recovery, photos, keyboard/autofill, account switching and native capture protection.
- The latest app launch was confirmed after starting the LAN Expo server. That connection incident did not establish an application-code crash.
- The owner tested the redesigned app on Android and iOS: regular/one-time photos, retention drafts, profile pictures, clearing and account privacy passed. Reconnection works on both after internet returns. On 31 October the owner reported the phase 23 keyboard/scroll retests passed except the iOS capture-test banner overlapping the status bar. The banner correction and newly added receipt indicators require device acceptance. See [recorded device evidence](DEVICE_ACCEPTANCE_2026_10_29.md) and [receipt checklist](MESSAGE_RECEIPTS.md).
- The owner explicitly enabled screenshot testing in local development. Capture-protection acceptance requires disabling that flag, restarting Metro and fully reopening Expo Go.
- No APK/IPA was built by the recorded source/export checks. iOS, signed-build lifecycle, accessibility and broader device-format/performance acceptance remain separate.

The dependency audit is a current registry check, not proof of vulnerability absence. The documented local `deepmerge` fork is not independently audited by npm. Preserve its provenance and focused tests; review its maintenance and the scoped CLI Zod override when upgrading tooling.

## Before public release

1. Finish device acceptance for the latest source, including capture/recording, recent apps, session/account transitions, keyboard/scrolling, photo picker and one-time closing behavior. Test actual signed builds and iOS.
2. Add monitored automatic physical cleanup and aggregate signup/request/egress protections; verify project-wide Free quotas and abuse response. Per-account limits alone are insufficient for public anonymous signup abuse.
3. Establish moderator/appeal/support procedures, retention and backup/recovery policies, failure monitoring, rollback and distribution/signing ownership.
4. Recheck dependencies and run an independent security review. Keep email confirmation enabled and test SMTP within the chosen provider's allowance.

The app is in development and is not end-to-end encrypted. Backend access denial at expiry is independent of physical cleanup; provider backups and recipients' copies remain outside live erasure. See [security model](SECURITY_MODEL.md) and [device checklist](PRIVATE_AVATARS_AND_CLEAR_CHAT.md).
