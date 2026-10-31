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

The **Quality and authorization** GitHub workflow uses clean Node 24 installs. Its quality job runs audit, Expo Doctor, checks, formatting, a temporary localhost Expo startup/status/stop smoke and Android/iOS Hermes exports. The local project server does not need to run. The backend job starts an isolated Linux Supabase stack, exercises real Auth/PostgREST/Storage/Edge Functions/Realtime, and stops its stack afterward. Do not start the owner's stopped local Docker engine just to repeat CI.

Security regressions cover outsider/anonymous denial, account binding, accepted/nonblocked membership, immutable delivery IDs, physical-delete ordering, metadata-free JPEG re-encoding, one-time concurrent opening, server expiry, Clear Chat retries, profile-photo permissions, upload quotas and auth/session races. Tests must use synthetic content and avoid logging credentials or backend responses containing tokens.

## Current evidence and limits

The current app source is 0.1.2/build 3 with the bottom/side safe-area correction and aligned SDK patches. Source `f5a651d` passes [CI 41248588895](https://github.com/asadabbas717/loopnest/actions/runs/41248588895), including Expo Doctor and backend integration. The exact Expo-built APK passes Android 15 cold launches and shared content-container bounds in three-button and gesture modes in [run 41250626835](https://github.com/asadabbas717/loopnest/actions/runs/41250626835). The probe uses signed-out UI and does not establish signed-in dock/device acceptance; use [current Expo build information](EXPO_PREVIEW.md). The earlier 0.1.1 binary's launch evidence below must not be treated as 0.1.2 acceptance.

- Earlier SDK 58 Expo Go acceptance passed on both owner phones for core sign-in, messaging, network recovery, photos, keyboard/autofill, account switching and native capture protection.
- The earlier Expo Go connection incident was resolved by opening the running LAN URL. Later installed APK startup failures are separately recorded below.
- The owner tested the redesigned app on Android and iOS: regular/one-time photos, retention drafts, profile pictures, clearing and account privacy passed. Reconnection works on both after internet returns. On 31 October the owner confirmed the phase 23 keyboard/scroll retests, subsequently confirmed enabled/disabled read-receipt behavior on both phones, and confirmed the corrected iOS banner alignment. Individual unreported visibility scenarios and installed-build acceptance remain separate. See [recorded device evidence](DEVICE_ACCEPTANCE_2026_10_29.md) and [receipt checklist](MESSAGE_RECEIPTS.md).
- The owner explicitly enabled screenshot testing in local development. Capture-protection acceptance requires disabling that flag, restarting Metro and fully reopening Expo Go.
- The first APK compiled but failed owner launch and reproduced an Android callback-permission crash. The Expo-built replacement 0.1.1 from `02ef0b2` passes two release cold launches and installed-permission checks on an Android 15 emulator in [run 41244990989](https://github.com/asadabbas717/loopnest/actions/runs/41244990989). Download/checksum are recorded in [installed-build testing](INSTALLED_BUILD_TESTING.md). It uses the template development signing key. Owner-device lifecycle, accessibility, capture and performance acceptance remain pending; no IPA was built.

The dependency audit is a current registry check, not proof of vulnerability absence. The documented local `deepmerge` fork is not independently audited by npm. Preserve its provenance and focused tests; review its maintenance and the scoped CLI Zod override when upgrading tooling.

## Before public release

1. Finish device acceptance for the latest source, including capture/recording, recent apps, session/account transitions, keyboard/scrolling, photo picker and one-time closing behavior. Test actual signed builds and iOS.
2. Verify ongoing scheduled-cleanup health and add external alert delivery plus aggregate signup/request/egress protections; verify project-wide Free quotas and abuse response. Per-account limits alone are insufficient for public anonymous signup abuse.
3. Establish moderator/appeal/support procedures, retention and backup/recovery policies, failure monitoring, rollback and distribution/signing ownership.
4. Recheck dependencies and run an independent security review. Keep email confirmation enabled and test SMTP within the chosen provider's allowance.

Installed-build preparation is in [Android/iOS acceptance](INSTALLED_BUILD_TESTING.md). The remaining owner/operations decisions are explicit in [operations](OPERATIONS.md); workflow files and draft runbooks alone do not close those gates. CAPTCHA is deferred and project-wide write limits do not cover all Auth/request/egress abuse.

The app is in development and is not end-to-end encrypted. Backend access denial at expiry is independent of physical cleanup; provider backups and recipients' copies remain outside live erasure. See [security model](SECURITY_MODEL.md) and [device checklist](PRIVATE_AVATARS_AND_CLEAR_CHAT.md).
