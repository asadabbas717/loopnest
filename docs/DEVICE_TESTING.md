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

Current hosted setup: the app's ignored local configuration points to the owner's Free test project; database migrations and the erasure function are deployed. The owner configured Brevo SMTP and the verification/recovery code templates are applied. Actual inbox delivery remains unverified. Expo is stopped; restart it explicitly when phone testing is ready. Use an email address you control to create a test account, confirm that the code arrives (including checking spam), and verify it in the app. Use only synthetic messages/photos during testing. Do not share passwords or verification codes in issues or chat.

## Connection troubleshooting

- Keep Expo Go updated and verify SDK compatibility before changing project dependencies.
- A QR URL is tied to the computer's current Wi-Fi address; restart Expo after changing networks.
- Allow the development server through the Windows firewall on your trusted private network if prompted. VPNs, guest Wi-Fi and client-isolation settings may prevent devices reaching each other. No firewall rules are automatically changed by this project.
- `npx expo start --go --tunnel` is an optional Expo-supported fallback. It uses an external tunnel and may require installing its helper; it is not started automatically. Tunneling the JavaScript server does not tunnel a local Supabase backend.
- Expo Go tests do not replace a signed native build test: native permissions, Keychain/Keystore, backgrounding and app-specific configuration still need verification in the actual app.

Official connection instructions: https://docs.expo.dev/get-started/start-developing/.
