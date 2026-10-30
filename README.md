# Loopnest

An open-source React Native app for invitation-based conversations and private photo sharing. Built with Expo SDK 58, TypeScript, Expo Router and Supabase Free. Licensed under MIT.

Loopnest is in active development. Chats are **access-controlled, not end-to-end encrypted**: privileged backend operators can access server content. Current implementation and test evidence are recorded in [development status](docs/STATUS.md). The earlier Android/Firebase application is retained in Git history and `archive/pre-rebuild-2026-10-21`.

## Features

- Email/password accounts, email-code verification, password recovery and encrypted native session persistence.
- Invitations that require recipient acceptance, bounded message history and Realtime updates.
- Repeat invitations after a decline, with block enforcement and resend rate limits.
- Sent/Delivered indicators and optional mutual Seen sharing; [receipt behavior and privacy](docs/MESSAGE_RECEIPTS.md).
- Private, server-validated JPEG sharing and recipient-only one-time photos.
- Disappearing messages: whole-hour durations from one hour to thirty days; changes affect new messages.
- Friends, bilateral blocking/unblocking and private profile pictures with first-name initial fallbacks.
- Confirmed **Clear chat for both people**, preserving the connection and retention setting.
- Confirmed sender-only [individual message/photo deletion](docs/INDIVIDUAL_DELETION.md), with recoverable photo cleanup.
- Password-verified account deletion, scoped abuse reporting and moderator review.
- Native capture prevention, inactive-screen protection and a development-only UI capture opt-in.
- An original Loopnest logo, platform launcher icons and branded launch configuration; [branding](docs/BRANDING.md).

The mobile app contains no service-role key, advertising or analytics SDK. Media buckets are private. The project uses no Firebase or required paid cloud-build service. Free-tier limits, provider email allowances and distribution costs are explained in [free-tier policy](docs/FREE_TIER.md).

## Start on your phone

Use Node 24 (the CI version), npm and Expo Go compatible with SDK 58. Hosted testing requires an isolated Supabase Free project; Docker is needed only for the optional local backend.

For a fresh clone:

```bash
git clone https://github.com/asadabbas717/loopnest.git
cd loopnest/mobile
npm ci
cp .env.example .env
```

Follow [backend setup](supabase/README.md) to apply migrations, deploy all five Edge Functions, configure code-email delivery and obtain the HTTPS project URL and public `sb_publishable_…` key. Put only those public values in the ignored `mobile/.env`. Keep `EXPO_PUBLIC_USE_LOCAL_BACKEND=false` for hosted testing.

From `mobile`:

```bash
npm run start:device -- --clear
```

Keep the computer and phone on the same trusted Wi-Fi, then scan the terminal QR code. Android Expo Go can also open the `exp://…` URL printed by that running server. The address can change when the network changes. Keep the terminal running; stop it with **Ctrl+C**. Without backend configuration the app shows its setup screen.

If a connection times out, confirm the terminal says Metro is ready and open `http://COMPUTER_WIFI_IP:PORT/status` in the phone browser. It should say `packager-status:running`. Follow [device testing and troubleshooting](docs/DEVICE_TESTING.md) before changing dependencies or firewall settings.

### Screenshots for UI feedback

Capture prevention is on by default. Authorized UI testing can opt in with `EXPO_PUBLIC_ALLOW_TEST_SCREENSHOTS=true` in the local `.env`. This permits **both screenshots and recording** in development and shows a persistent test banner. Release builds ignore the flag. Changing it requires restarting Metro and fully reopening Expo Go. Turn it off before capture-protection acceptance. See [UI testing](docs/CINEMATIC_UI.md).

## Checks and maintenance

Run from `mobile`:

```bash
npm run check
npm run format:check
npm run audit:dependencies
npx expo install --check
npx expo-doctor
```

`check` runs strict typing, lint and unit/embedded-Postgres tests. Linux CI additionally runs isolated Supabase integration tests and Android/iOS Hermes exports. Exports are JavaScript bundles; signed APK/IPA acceptance remains a separate gate. See [verification](docs/VERIFICATION.md).

Operator content maintenance is **manual** and defaults to a read-only count preview:

```bash
npm run maintenance:content -- --project-ref YOUR_20_LETTER_PROJECT_REF
```

The explicit `--apply` flag removes eligible media and expired text. Review [maintenance and retention](docs/PHOTO_MAINTENANCE.md) before applying. Access to expired messages is denied by the database even when physical cleanup has not run. No automatic scheduler is installed.

For optional local Supabase development, see [backend setup](supabase/README.md). Native Android/iOS builds use `npm run android` / `npm run ios` and require the corresponding native toolchain. Web sign-in/persistence is intentionally disabled.

## Documentation

| Topic | Guide |
| --- | --- |
| Current work and test evidence | [Status](docs/STATUS.md), [verification](docs/VERIFICATION.md) |
| Privacy and access boundaries | [Security model](docs/SECURITY_MODEL.md), [ephemeral messages/photos](docs/EPHEMERAL_PRIVACY.md) |
| Profile pictures and shared clearing | [Private avatars and Clear Chat](docs/PRIVATE_AVATARS_AND_CLEAR_CHAT.md) |
| Data lifecycle | [Maintenance](docs/PHOTO_MAINTENANCE.md), [account erasure](docs/ACCOUNT_ERASURE.md) |
| Abuse handling and reconnects | [Moderation](docs/MODERATION.md), [connection reliability](docs/CONNECTION_RELIABILITY.md) |
| Dependencies and cost | [Dependency fixes](docs/DEPENDENCY_SECURITY_FIXES.md), [Free tier](docs/FREE_TIER.md) |

## Contribute and report security issues

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Use synthetic accounts and content in a dedicated test project. Never commit real `.env` files, credentials, session tokens, private images or database passwords. Open-source availability and passing tests do not establish an independent security certification. Broader abuse controls, monitored cleanup, signed-build/iOS acceptance and an independent review remain public-release work.
