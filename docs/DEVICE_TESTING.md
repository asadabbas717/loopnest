# Open Loopnest on your phone with Expo Go

The fresh app uses Expo SDK 57. Its current native libraries are included in Expo Go; no custom Firebase modules or paid cloud build are required. The owner confirmed that it opens on Android. Full sign-in, media and native security checks remain unverified.

1. Install Expo Go on your Android phone or iPhone. Use an Expo Go version compatible with SDK 57. Follow [Expo's environment setup](https://docs.expo.dev/get-started/set-up-your-environment/) if the installed client reports an SDK mismatch.
2. Connect your phone and development computer to the same trusted Wi-Fi network.
3. In `mobile`, run `npm ci` if dependencies are missing, then `npm run start:device`.
4. Scan the terminal QR code with Expo Go on Android, or the Camera app on iPhone. Android also supports entering the displayed `exp://...` URL manually. Keep the development server running while testing. Save code edits to reload the phone.
5. If the iPhone client requires sign-in, use the same free Expo account in Expo Go and the computer's Expo CLI (`npx expo login`). No app-store developer subscription is needed for Expo Go testing.

## Backend can wait

You do **not** need Supabase just to open the app. Without `mobile/.env`, it deliberately shows a setup screen. That confirms device connection and loading; it does not provide working authentication or a simulated chat. Live signup, email verification, invitations, chat and photos require the Supabase connection described in `supabase/README.md`. There are no fake accounts, disabled access controls or pretend upload success.

When ready to test live features on multiple phones, use a dedicated Supabase Free project with its HTTPS URL and public publishable key. That works independently of the computer's network address. Never enter a service-role/secret key. Local backend addresses `127.0.0.1` and `10.0.2.2` are for simulators/emulators and do not point to the computer from a physical phone. Do not weaken the backend URL guard to work around this.

Current hosted setup: the app's ignored local configuration points to the owner's Free test project; database migrations and the erasure function are deployed. The owner configured Brevo SMTP and the verification/recovery code templates are applied. On October 22, 2026, the owner confirmed two successful registrations, password recovery and sign-in, invitation/acceptance, chat and photo sending on Android Expo Go. Use only synthetic messages/photos during testing. Do not share passwords or verification codes in issues or chat.

## Next device checks

Accepted on the owner's Android device: password Show/Hide, revised keyboard handling, wrong-password deletion denial, correct-password account deletion, rejection of deleted-account sign-in, disappearance of the peer's shared conversation, and sign-out/account switching without cross-account content. Background/app-switcher behavior, offline/reconnect and physical hosted-photo deletion have not been explicitly confirmed. The checklist below includes repeatable regression steps as well as outstanding checks.

After the keyboard follow-up, fully restart Metro with `npm run start:device -- --clear` and reload the project in Expo Go. New keyboard dependencies require a fresh bundle rather than relying on Fast Refresh. SDK 57 Expo Go includes these modules; an existing standalone development build needs rebuilding to include them. The account screen's password and DELETE fields are the primary regression case from the owner's screenshot.

1. Verify Show/Hide on sign-in, signup and recovery without losing typed characters or the cursor. Leaving the password field or backgrounding the app must hide it again. Repeat with a long password and larger system text.
2. Open each form's bottom field, switch fields while the keyboard remains open, dismiss/reopen the keyboard and scroll to the submit button. Check signup, recovery, profile onboarding, account deletion confirmation (without submitting) and the chat composer.
3. With two disposable accounts, block the peer and verify neither can send or retrieve more chat/photo content or re-invite the other. Open Friends → Blocked users and unblock them. With an accepted connection and no reciprocal block, the existing chat/history should be available again under Active friends. If both users blocked each other, removing one block must not lift the other's restriction. Report a message before blocking to check submission; moderator review needs an operator-appointed moderator.
4. Using disposable accounts only, test account deletion with a wrong password (must preserve the account), then the correct password and DELETE confirmation. Confirm the account cannot sign in again and its shared conversation/photos disappear from the peer's app after refresh. Deletion affects both participants' conversation, so never use valuable test content.
5. Background/reopen, sign out, and switch accounts: no previous account's messages or photos should appear. Repeat offline/reconnect without creating duplicate messages.

Expo is stopped; restart it explicitly when phone testing is ready. These checks do not replace signed-build and iOS testing.

Background/app-switcher testing is currently deferred by the owner. Next requested-feature checks are Friends navigation, block/unblock, and the specific wrong-password deletion warning. See `FRIENDS_AND_ERRORS.md`; do not repeat destructive deletion with an account you want to keep.

## Connection troubleshooting

- Keep Expo Go updated and verify SDK compatibility before changing project dependencies.
- A QR URL is tied to the computer's current Wi-Fi address; restart Expo after changing networks.
- Allow the development server through the Windows firewall on your trusted private network if prompted. VPNs, guest Wi-Fi and client-isolation settings may prevent devices reaching each other. No firewall rules are automatically changed by this project.
- `npx expo start --go --tunnel` is an optional Expo-supported fallback. It uses an external tunnel and may require installing its helper; it is not started automatically. Tunneling the JavaScript server does not tunnel a local Supabase backend.
- Expo Go tests do not replace a signed native build test: native permissions, Keychain/Keystore, backgrounding and app-specific configuration still need verification in the actual app.

Official connection instructions: https://docs.expo.dev/get-started/start-developing/.
