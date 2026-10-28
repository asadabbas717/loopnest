# Loopnest

An open-source React Native app for invitation-only conversations and private photo sharing. Fresh implementation started October 21, 2026. The previous Android/Firebase app is retained only in Git history and `archive/pre-rebuild-2026-10-21`.

Expo SDK 58, TypeScript, Expo Router, and Supabase Free. Email authentication/recovery, accepted invitations, private chat/photos, Friends with block/unblock controls, account erasure, scoped moderation, and encrypted native session persistence are implemented. Operator-only abandoned-photo maintenance defaults to a read-only preview. No Firebase, required cloud-build subscription, analytics, advertising, public media bucket, or service-role credential in the client. MIT licensed.

This is a development implementation, not a certified or production-ready secure messenger. Conversations are access-controlled, not end-to-end encrypted. See [security model](docs/SECURITY_MODEL.md), [free-tier policy](docs/FREE_TIER.md), [development status](docs/STATUS.md), and [verification/release gates](docs/VERIFICATION.md).

## Run

The app also includes server-enforced disappearing messages, one-time photos, private profile pictures with initial fallbacks, and confirmed shared-chat clearing. See [privacy and fresh-history behavior](docs/PRIVATE_AVATARS_AND_CLEAR_CHAT.md) and [ephemeral privacy](docs/EPHEMERAL_PRIVACY.md) for access rules, cleanup boundaries and device tests.

To open the app on a physical phone, install Expo Go, use the same Wi-Fi as the computer, and run `npm run start:device` from `mobile`. Scan its QR code. Backend setup can wait; the app shows a setup screen until configured. See [device testing](docs/DEVICE_TESTING.md).

Use Node 22.13+ and npm. Follow [backend setup](supabase/README.md), copy `mobile/.env.example` to `mobile/.env`, then from `mobile` run `npm ci`, `npm run check`, and `npm start`. Without configuration, the app shows an honest setup screen. Android/iOS local native builds use `npm run android` / `npm run ios` and require Android SDK/JDK or macOS/Xcode respectively. No paid EAS builds are required. Native platforms only; web persistence is intentionally disabled.

For entirely local backend development, start Docker and run `npm run backend:start`, then `npm run backend:env -- android` (Android emulator) or `npm run backend:env` (iOS Simulator). Run `npm run test:integration` for real-service checks. Local mode is debug-only; no hosted account or billing is needed. Docker is not needed when testing against hosted Supabase. See [development status](docs/STATUS.md) for current backend/device evidence and [photo maintenance](docs/PHOTO_MAINTENANCE.md) for bounded cleanup commands.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never commit a real `.env`, user content, session tokens, database passwords, or a Supabase secret/service-role key. Historical client configuration in the archived app is not a server credential; the archived app is not deployed or maintained by this rewrite.
