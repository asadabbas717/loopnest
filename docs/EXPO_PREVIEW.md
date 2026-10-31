# Expo EAS internal APK

Current submission: **0.1.2/build 3**, source `f5a651d`, [Expo build 56efd37c](https://expo.dev/accounts/asadabbasbusiness/projects/loopnest/builds/56efd37c-0e1e-4517-afe9-98cf9bfea55e). It contains the shared safe-area correction, measured dock clearance and aligned Expo 58.0.22 / Router 58.0.29 / Screens 4.30.1 patches. Its source passes [CI 41248588895](https://github.com/asadabbas717/loopnest/actions/runs/41248588895); Expo completion and installed geometry have not been rechecked. The superseded 0.1.2 submission `4367c7eb` was canceled after Doctor reported outdated patches.

The earlier 0.1.1/build 2 [Expo APK](https://expo.dev/artifacts/eas/5gOgLbyGvGx5BqVvuU_C0RX0QQjZC1KY3P8ptxZ32EQ.apk) is built and passes the [exact-artifact Android 15 release launch probe](https://github.com/asadabbas717/loopnest/actions/runs/41244990989). It replaces the crashing 0.1.0 APK. The owner confirms Android launch, but reported dock overlap; 0.1.2 acceptance is separate. See [installed testing](INSTALLED_BUILD_TESTING.md) for its checksum and limits.

The owner requested an Expo-hosted alternative to the GitHub build. The project is linked to `@asadabbasbusiness/loopnest`. From `mobile`, use the signed-in EAS CLI:

For a fork, configure your own Expo owner/project ID in `app.config.ts` and your own public test-backend values in `eas.json` before submitting. The checked-in values describe the maintainer's dedicated test setup; cloning the repository does not grant access to that Expo account. Keep privileged backend credentials out of both files.

```bash
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile requests an internal APK with the standard medium builder, bundled JavaScript, hosted public backend configuration and screenshot testing disabled. No EAS Update channel or paid tier is configured. Free-account quotas/queue availability still apply; stop on a quota or billing requirement rather than upgrading. No store submission is included.

`withoutCredentials` intentionally uses the generated native template's public development signing key for internal testing. It creates no production signing identity or remote keystore. Do not distribute this as a production release. Establish owner-controlled signing separately before public distribution.

The repository-root `.easignore` excludes local environment files, credentials, generated native projects, package installs and downloaded binaries. The inspected archive contains app source and local tooling adapters, with no environment/credential/keystore/APK files. Public configuration in `eas.json` is intentionally embedded in the app; server authorization remains mandatory. Do not put privileged values there.

Android 14+ requires the normal `DETECT_SCREEN_CAPTURE` permission for the installed SDK 58 screen-capture module's automatic activity callback. Removing it can throw during module creation; it is retained in version 0.1.1. The callback does not provide screenshot pixels and the app does not subscribe to screenshot events. `FLAG_SECURE` capture prevention remains active. Camera, microphone, external-storage and broad image-read permissions remain blocked. See [Android documentation](https://developer.android.com/about/versions/14/features/screenshot-detection) and [installed-build acceptance](INSTALLED_BUILD_TESTING.md).

An EAS build success still needs installed-device acceptance. GitHub's isolated release-emulator probe provides separate crash diagnostics and cold-launch coverage; it is not proof of every Android device or iOS behavior.

The `Expo APK launch verification` workflow reads `mobile/eas-preview-artifact.json`. That file deliberately pins the last verified **0.1.1** artifact, not the latest submitted version. After a replacement finishes, verify its source and checksum before updating this metadata; its commit triggers exact-binary verification. Do not substitute an unverified URL/hash or describe an earlier run as coverage of a newer APK. Documentation-only commits do not alter submitted builds or trigger APK compilation.
