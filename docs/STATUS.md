# Development status

## Phase 1 — clean foundation

Previous source, native projects, Firebase client files, icons, migration documents, and old CI were removed from the working tree. Git history and an archive branch preserve the previous project. A fresh Expo/React Native application, strict TypeScript, quality scripts, MIT license, contributor guidance, and documented security/cost boundaries replace them.

Next phases implement database authorization/private storage and the mobile workflows, then regression tests and CI. No remote database has been created or modified. Docker is installed but its engine is not running in this workspace; backend integration tests cannot run until it is available.

## Phase 2 — private chat and photos

Implemented email/password signup/sign-in with email-code verification, encrypted native session persistence, profile onboarding, exact-username invitations, recipient acceptance/decline, bounded message history, active-conversation Realtime subscription, JPEG resizing/upload, authenticated photo display without disk caching, bilateral blocking, and sign-out. The app hides conversation content when backgrounded. It has no demo data or credential fallback.

The versioned SQL migration enforces participant authorization, no direct membership/message writes, content/size limits, server-generated timestamps and asset paths, idempotent message IDs, per-account invitation/message/photo limits, and private Storage policies. The migration executes successfully in embedded PostgreSQL, including adversarial tests using anonymous, outsider, and participant roles. The Auth and Storage service boundaries are simulated there; hosted integration and native-device tests remain unverified. No live Supabase or Firebase backend has been changed.

Before public use: password recovery, verified metadata stripping/content validation, reporting/moderation, account/media deletion, retention/cleanup, full Supabase HTTP/Realtime integration tests, secure-store device tests, accessibility, signing, and independent security review. The current implementation is access-controlled, not E2EE. It is a development foundation, not a production release.
