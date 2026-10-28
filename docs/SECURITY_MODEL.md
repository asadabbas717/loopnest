# Security model and boundaries

Protect credentials, sessions, messages, relationships and media from anonymous callers and other authenticated accounts. Treat the client, public keys, object paths, MIME labels and request bodies as untrusted. Supabase Auth verifies identity; PostgreSQL and Storage policies enforce authorization. Service credentials remain in trusted server/operator environments.

## Identity and isolation

The native app persists sessions only in the encrypted Keychain/Keystore adapter, using bounded chunks, commit-last manifests and serialized vault operations. There is no plaintext/web fallback. The installed Supabase SDK's default refresh coordination handles concurrent refreshes and guards against late writes after sign-out; the deprecated custom process lock is removed. App-level auth revisions also prevent late bootstrap/retry reads from replacing newer sign-out/account-change events. Recovery uses an isolated nonpersistent client.

The profile, conversation, message and Storage policies enforce accepted participants, disabled-account denial and bilateral blocks. UI hiding is supplementary. Session/account changes reset navigation and account-scoped scroll memory. No online-status directory, public profile-photo bucket or reusable signed media URL is introduced.

## Content lifecycle

- New chat photos pass a trusted bounded JPEG decode/re-encode pipeline. Submitted EXIF/comments/trailing payload are discarded. Previously shared legacy photos are not retroactively asserted to be validated.
- Expiration is stamped by the server. Message/photo access and moderator review deny expired content. Official clients use conservative server-anchored monotonic deadlines; physical deletion is operator-dependent.
- One-time media can be claimed atomically by its recipient once. Delivery failure consumes the claim. The viewer keeps bytes in memory and closes on leaving, backgrounding or the earlier of sixty seconds and message expiry.
- Profile photos have smaller byte/dimension limits, one-use reservations and current-photo-only access for the owner and accepted, unblocked contacts. Replacement/removal revokes old reads before cleanup.
- Shared clearing and password-verified account erasure freeze writes, remove physical bytes through Storage, then finalize metadata. Clearing affects both participants; account erasure also removes the account's profile-photo bytes.
- Private message-delivery and photo-quota receipts retain identifiers/times without content to prevent retry resurrection and quota resets. Metadata removal depends on the documented maintenance/activity passes. See [retention](PHOTO_MAINTENANCE.md).

## Visual protection

Native screenshot/recording prevention is enabled before private screens mount and remains outside navigation/session changes. Setup failure hides private screens. Inactive covers and iOS app-switcher protection supplement Android's secure window. No screenshot-detection permission or broad media-read permission is requested.

The owner authorized `EXPO_PUBLIC_ALLOW_TEST_SCREENSHOTS=true` in local development for UI feedback. A visible banner and accurate copy identify the relaxed policy; screenshots and recording are enabled together. The default/example is false and release runtimes ignore it. A full Metro/Expo Go restart is required when changing it. Test normal capture protection with the flag off.

An external camera, modified client/device, saved copy or content already delivered cannot be reliably recalled. The app is **not end-to-end encrypted**: privileged infrastructure/database operators can read server content. TLS, provider storage encryption and encrypted session persistence do not change that boundary. No custom cryptography is presented as secure messaging.

## Release work

See [verification gates](VERIFICATION.md): current two-phone/signed-build/iOS/accessibility acceptance, aggregate abuse and Free quota controls, monitored physical cleanup, dependency/fork maintenance, moderator/support/appeal procedures, backup/recovery policy and an independent security review. Open-source availability and passing tests do not establish a security certification.
