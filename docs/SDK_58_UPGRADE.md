# Expo SDK 58 upgrade

This document records the original major-version migration. Subsequent SDK 58 patch alignment, resolved dependency advisories, device evidence and current test counts are in [STATUS.md](STATUS.md) and [VERIFICATION.md](VERIFICATION.md); older version/audit counts below are historical.

The owner reports both phones now run Expo Go 58.0.2, which cannot load the SDK 57 project. Upgrade the project to SDK 58 and align all installed Expo/native modules with its compatibility matrix. The Expo package patch version and the Expo Go client version are separate numbers; they need the same SDK major, not identical patch numbers.

Reviewed the official [upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [SDK 58 release notes](https://expo.dev/changelog/sdk-58), [Router migration guide](https://docs.expo.dev/router/migrate/sdk-57-to-58/) and versioned screen-capture documentation. Native generation must use the new SDK. The old ignored Android project was verified to contain no tracked files and removed before regeneration. No handwritten native source is migrated.

The app does not use the removed React Native APIs, legacy nested navigation parameters, custom navigators or synchronous `File.write()`. Existing href-based navigation remains supported. The native screen-capture prevention, iOS inactive overlay and keyboard modules must still pass phone checks; successful JavaScript exports do not prove device behavior.

## Testing on phones

Stop any previous Metro process in its terminal, then from `mobile` run:

```bash
npm run start:device -- --clear
```

Fully close/reopen Expo Go and scan the new QR code. Keep both phones and the computer on the same trusted Wi-Fi. Use disposable accounts/synthetic photos to check sign-in, keyboard scrolling, Friends/chat navigation, text/photo delivery and recent-apps/screenshot protection. Repeat the connection interruption checklist in `CONNECTION_RELIABILITY.md`, which has not yet been accepted on devices.

Existing standalone development builds must be rebuilt with SDK 58. This upgrade requires no Supabase migration, billing change, paid cloud build or local Docker engine. Backend data and ignored environment configuration remain in place.

## Verification

Installed Expo 58.0.19, Router 58.0.26, React Native 0.88.0, React/React DOM 19.3.0 and the SDK-compatible native modules. The first in-place dependency alignment encountered stale SDK 57 optional peers; a clean dependency resolution and explicit React DOM alignment resolved them without force/legacy-peer flags. The temporary old dependency directory is discarded after the new install passes checks.

The new router has no `query-string` dependency. Removed the unused local `decode-uri-component` compatibility copy, override and its two package tests; the installed dependency tree contains neither legacy package. The temporary old dependency directory has also been removed.

Strict typing, lint, formatting and 44 tests pass. Expo Doctor passes 20/20 checks, dependency compatibility passes, and the full installed dependency tree reports no invalid peers. Android generation preserves explicit permission removal directives for READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE, DETECT_SCREEN_CAPTURE, CAMERA and RECORD_AUDIO. Android and iOS Hermes exports pass. Clean-install CI also passes the quality/platform checks and all 15 real backend tests; see `STATUS.md` for the verified run.

On October 28, 2026, the owner confirmed all six requested smoke/network/privacy tests passed on both phones in SDK 58 Expo Go. See `STATUS.md` for the scope and limits of that acceptance.

The dependency audit still reports five high affected packages and no moderate/critical findings; see `DEPENDENCIES.md` for the unresolved release blockers. No APK/IPA has been compiled; standalone-build and broader platform testing remain separate requirements.
