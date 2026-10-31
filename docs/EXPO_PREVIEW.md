# Expo EAS internal APK

The 0.1.1/build 2 [Expo APK](https://expo.dev/artifacts/eas/5gOgLbyGvGx5BqVvuU_C0RX0QQjZC1KY3P8ptxZ32EQ.apk) is built and passes the [exact-artifact Android 15 release launch probe](https://github.com/asadabbas717/loopnest/actions/runs/41244990989). It replaces the crashing 0.1.0 APK. Owner-device acceptance is pending; see [installed testing](INSTALLED_BUILD_TESTING.md) for its checksum and limits.

The owner requested an Expo-hosted alternative to the GitHub build. The project is linked to `@asadabbasbusiness/loopnest`. From `mobile`, use the signed-in EAS CLI:

```bash
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile requests an internal APK with the standard medium builder, bundled JavaScript, hosted public backend configuration and screenshot testing disabled. No EAS Update channel or paid tier is configured. Free-account quotas/queue availability still apply; stop on a quota or billing requirement rather than upgrading. No store submission is included.

`withoutCredentials` intentionally uses the generated native template's public development signing key for internal testing. It creates no production signing identity or remote keystore. Do not distribute this as a production release. Establish owner-controlled signing separately before public distribution.

The repository-root `.easignore` excludes local environment files, credentials, generated native projects, package installs and downloaded binaries. The inspected archive contains app source and local tooling adapters, with no environment/credential/keystore/APK files. Public configuration in `eas.json` is intentionally embedded in the app; server authorization remains mandatory. Do not put privileged values there.

Android 14+ requires the normal `DETECT_SCREEN_CAPTURE` permission for the installed SDK 58 screen-capture module's automatic activity callback. Removing it can throw during module creation; it is retained in version 0.1.1. The callback does not provide screenshot pixels and the app does not subscribe to screenshot events. `FLAG_SECURE` capture prevention remains active. Camera, microphone, external-storage and broad image-read permissions remain blocked. See [Android documentation](https://developer.android.com/about/versions/14/features/screenshot-detection) and [installed-build acceptance](INSTALLED_BUILD_TESTING.md).

An EAS build success still needs installed-device acceptance. GitHub's isolated release-emulator probe provides separate crash diagnostics and cold-launch coverage; it is not proof of every Android device or iOS behavior.
