# Installed-build acceptance

Current preview: **0.1.2 / build 3**, [download the Expo APK](https://expo.dev/artifacts/eas/QSaCYcd1cvmxekKBzFrAZiObE3xWMIJqCQPppiJhoow.apk). [Expo build 56efd37c](https://expo.dev/accounts/asadabbasbusiness/projects/loopnest/builds/56efd37c-0e1e-4517-afe9-98cf9bfea55e) uses source `f5a651d` and completes with Doctor 20/20 and a successful native build. APK size: 100,835,206 bytes. SHA-256: `8bd091e8c45cc186dda16852957838a24070e0e881356208f1ffa9421377eafd`. A verified local copy is in ignored `build-artifacts/Loopnest-0.1.2-expo-f5a651d.apk`.

The exact APK passes [Android 15 verification 41250626835](https://github.com/asadabbas717/loopnest/actions/runs/41250626835): source/checksum, installed callback permission, five camera/microphone/storage exclusions and two successful cold launches. Its shared Page content container stays outside Android navigation in both modes: bottom/navigation-top are 1794/1794 pixels for three-button and 1857/1857 for gestures on the emulator. The probe renders signed-out UI; the signed-in dock is not present, so its actual labels/controls and owner-device geometry still require testing.

The owner confirmed 0.1.1 opens, then reported dock overlap. Version 0.1.2 adds the shared safe-area container, measured dock clearance and aligned SDK patches. Retest all three tabs with three-button and gesture navigation, larger system text, keyboard open/close and the last scroll item. The 0.1.0 startup-crashing APK is superseded; 0.1.1 lacks the layout correction. Earlier evidence remains in [Status](STATUS.md). See [Expo configuration](EXPO_PREVIEW.md).

Expo Go testing is valuable but does not establish native launcher/splash, release-mode lifecycle or final manifest behavior. The repository also has an **Android internal preview** Actions workflow. It uses pinned project dependencies, Java 21, generated native code and arm64/x86_64 release-mode APKs with the template development signing key, and now requires emulator cold-launch success before uploading an artifact. This GitHub alternative requires no EAS account, subscription or production signing secret. Both build routes produce internal test artifacts, not store-ready releases.

In GitHub → Actions → Android internal preview → Run workflow, choose the intended source ref and enter the HTTPS Supabase URL and public `sb_publishable_…` key. Updating this workflow on main also starts a preview against the public test-project defaults recorded in the workflow. Ordinary app/doc pushes do not automatically compile an APK. Inputs enter the build as environment values, never interpolated shell commands. Do not enter service keys, SMTP credentials or passwords. The public key is embedded in the app as expected; authorization depends on server rules. Normal capture protection is forced and screenshot-test mode is off. The workflow runs no Metro/Docker service on the owner's PC.

After a successful run, download `loopnest-android-internal-preview` from its artifacts while signed into GitHub, extract the APK and install on an owned arm64 Android phone. Check the recorded checksum/source commit. Artifacts expire after seven days. Installation is outside the store and may require allowing that specific installer. Do not disable general device protections. Do not treat the development signing key as a production identity; establish owner-controlled release signing before distribution.

- [ ] Launcher/adaptive/themed icons and cold-start splash display correctly.
- [ ] The installed app opens without Expo Go or a running Metro server.
- [ ] Sign-in/recovery, keyboard, navigation, text/photos, receipts and individual deletion work against disposable accounts.
- [ ] Screenshots/recording are blocked with no test banner, including recording begun before entry; recent-apps previews conceal private content.
- [ ] One-time viewing closes on navigation/background/timeout and cannot reopen.
- [ ] Switching accounts, backgrounding, offline/reconnect and process restart do not expose another user's content or resume a cleared draft.
- [ ] Large system text, screen readers, reduced motion and slower/lower-memory devices remain usable.

An iOS installed build still needs macOS/Xcode and suitable owner-controlled provisioning. This Windows workspace has no Android SDK/JDK or macOS/Xcode installed. Android compilation succeeded on GitHub; an artifact is not physical-device acceptance. iOS and production signing remain separate gates. See [verification](VERIFICATION.md).
