# Loopnest

An open-source React Native app for invitation-only conversations and private photo sharing. Fresh implementation started October 21, 2026. The previous Android/Firebase app is retained only in Git history and `archive/pre-rebuild-2026-10-21`.

Expo SDK 57, TypeScript, Expo Router, and Supabase Free. No Firebase, required cloud-build subscription, analytics, advertising, public media bucket, or service-role credential in the client. MIT licensed.

This is a development implementation, not a certified or production-ready secure messenger. Conversations will be access-controlled, not end-to-end encrypted. See [security model](docs/SECURITY_MODEL.md), [free-tier policy](docs/FREE_TIER.md), and [development status](docs/STATUS.md).

## Run

Use Node 22.13+ and npm. From `mobile`, run `npm ci`, then `npm start`. Android/iOS local native builds use `npm run android` / `npm run ios` and require Android SDK/JDK or macOS/Xcode respectively. No paid EAS builds are required. Backend setup will be documented alongside the schema in the next phase.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Never commit a real `.env`, user content, session tokens, database passwords, or a Supabase secret/service-role key. Historical client configuration in the archived app is not a server credential; the archived app is not deployed or maintained by this rewrite.
