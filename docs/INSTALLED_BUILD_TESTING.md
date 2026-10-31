# Installed-build acceptance

The first build attempt, [run 41238276121](https://github.com/asadabbas717/loopnest/actions/runs/41238276121), stopped at the security audit before native compilation. The [dependency repair](DEPENDENCIES.md) now passes complete CI. [Build 41239899447](https://github.com/asadabbas717/loopnest/actions/runs/41239899447) succeeded from `49f3a5e`; [download its APK archive](https://github.com/asadabbas717/loopnest/actions/runs/41239899447/artifacts/13056874461). Extract `app-release.apk`. SHA-256: `f3d3cefa8c9ccfa562409ef091be57bc619d2d41417742b59c95256b6e61e779` (33,469,732 bytes). The GitHub artifact expires 8 November 2026 at 01:51 PKT. A verified local copy is in ignored `build-artifacts/Loopnest-0.1.0-preview-49f3a5e.apk` at the repository root. Installed-device acceptance remains pending.

Expo Go testing is valuable but does not establish native launcher/splash, release-mode lifecycle or final manifest behavior. The repository has a manually started **Android internal preview** Actions workflow. It uses the pinned project dependencies, Java 21, generated native code and an arm64 release-mode APK with the template development signing key. It requires no EAS account, subscription or production signing secret. This is an internal test artifact, not a store-ready release.

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
