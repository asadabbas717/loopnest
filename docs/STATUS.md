# Development status

## Phase 1 — clean foundation

Previous source, native projects, Firebase client files, icons, migration documents, and old CI were removed from the working tree. Git history and an archive branch preserve the previous project. A fresh Expo/React Native application, strict TypeScript, quality scripts, MIT license, contributor guidance, and documented security/cost boundaries replace them.

Next phases implement database authorization/private storage and the mobile workflows, then regression tests and CI. No remote database has been created or modified. Docker is installed but its engine is not running in this workspace; backend integration tests cannot run until it is available.

## Phase 2 — private chat and photos

Implemented email/password signup/sign-in with email-code verification, encrypted native session persistence, profile onboarding, exact-username invitations, recipient acceptance/decline, bounded message history, active-conversation Realtime subscription, JPEG resizing/upload, authenticated photo display without disk caching, bilateral blocking, and sign-out. The app hides conversation content when backgrounded. It has no demo data or credential fallback.

The versioned SQL migration enforces participant authorization, no direct membership/message writes, content/size limits, server-generated timestamps and asset paths, idempotent message IDs, per-account invitation/message/photo limits, and private Storage policies. The migration executes successfully in embedded PostgreSQL, including adversarial tests using anonymous, outsider, and participant roles. The Auth and Storage service boundaries are simulated there; hosted integration and native-device tests remain unverified. No live Supabase or Firebase backend has been changed.

Before public use: password recovery, verified metadata stripping/content validation, reporting/moderation, account/media deletion, retention/cleanup, full Supabase HTTP/Realtime integration tests, secure-store device tests, accessibility, signing, and independent security review. The current implementation is access-controlled, not E2EE. It is a development foundation, not a production release.

## Phase 3 — regression checks and contributor CI

Added input/session regression tests, an authorization test executing the migration in embedded PostgreSQL, immutable GitHub Action references, and Dependabot configuration. Fixed timestamp-tie pagination and bound in-flight sends to the account that initiated them. Private photo requests avoid bearer URLs and use no image caching; transformed local files are discarded on removal, send, navigation, and backgrounding, with best-effort native cleanup. Picker cache copies are cleaned only inside the app cache, never from the user's library.

All 12 local tests pass, including the multi-account SQL authorization scenario. Strict typing, Expo lint, and formatting pass. Both platform JavaScript exports and Android native generation pass. Framework dependencies were patched within SDK 57; remaining dependency advisories block production release. The detailed evidence and remaining tests are in `VERIFICATION.md`. CI is added for future pushes; its remote run is not yet verified. No hosted deployment or real-account/device test was performed.

## Phase 4 — backend integration verified

Completed the local backend configuration and pinned CLI tooling, email-code template, shared mobile/API request implementation, and real Supabase Auth/PostgREST/Storage/Realtime suite. Fixed a Realtime replication-readiness race found by the first real test run. All 15 local unit/Postgres/configuration tests pass; standard quality/bundle checks and all eight integration tests pass in [CI run 39642114879](https://github.com/asadabbas717/loopnest/actions/runs/39642114879), source commit `401d830`.

The local Windows Docker engine still fails on a locked startup socket; no system data was reset. The integration suite ran on isolated Linux containers and verifies synthetic accounts, not real-user/device or hosted-production behavior. Dependency findings are reviewed in `DEPENDENCIES.md` (24 remaining, including unresolved runtime URI-decoding risk). See `PHASE_4.md` for evidence and reproducible commands. Next work is account recovery, account/media erasure, abuse reporting/moderation, and native security validation before any public release.

## Phase 5 — email-code account recovery

Added password recovery with a separate non-persistent Supabase client, delivered email codes, a password-reset screen, single-use code checks, and global refresh-session sign-out after changing a password. Recovery verification never signs the main app into chat. If sign-out fails after a password change, retrying completion does not repeat that change. Existing access JWTs may remain valid until their expiry; global sign-out is not a promise of immediate revocation of all cached access tokens.

Typing, lint and 17 local regression/Postgres/configuration tests pass. Recovery-code delivery, rejection of reused codes and old passwords, and successful new-password sign-in passed in [CI run 39647760704](https://github.com/asadabbas717/loopnest/actions/runs/39647760704), source commit `f433147`. Phase 5 is complete. The owner reports the app opened correctly on a physical Android device; no broader native security assurance is inferred from that launch.

## Phase 6 — account and shared-media erasure

Implemented a password-reauthenticated, server-side account erasure function, frozen-account state, restrictive policies, upload/freeze serialization, physical Storage removal before Auth deletion, and a native confirmation/retry screen. Peer-owned media in conversations removed by account deletion is included in cleanup. The client cannot choose a deletion target, use privileged database functions or hold the service key. Failures leave a frozen, retryable account rather than reporting false success.

Typing, lint and 21 local tests pass, including the full migration chain and failed-media cleanup cases. The new real Edge Runtime/Storage/Auth deletion test is awaiting verification. See `ACCOUNT_ERASURE.md` for behavior, retention boundaries and deployment steps.
