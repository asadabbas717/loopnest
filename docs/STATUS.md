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

Later environment update: Docker became accessible after the owner's update. The local development stack now starts without resetting existing Docker data. The earlier socket failure describes the phase 4 environment only.

## Phase 5 — email-code account recovery

Added password recovery with a separate non-persistent Supabase client, delivered email codes, a password-reset screen, single-use code checks, and global refresh-session sign-out after changing a password. Recovery verification never signs the main app into chat. If sign-out fails after a password change, retrying completion does not repeat that change. Existing access JWTs may remain valid until their expiry; global sign-out is not a promise of immediate revocation of all cached access tokens.

Typing, lint and 17 local regression/Postgres/configuration tests pass. Recovery-code delivery, rejection of reused codes and old passwords, and successful new-password sign-in passed in [CI run 39647760704](https://github.com/asadabbas717/loopnest/actions/runs/39647760704), source commit `f433147`. Phase 5 is complete. The owner reports the app opened correctly on a physical Android device; no broader native security assurance is inferred from that launch.

## Phase 6 — account and shared-media erasure

Implemented a password-reauthenticated, server-side account erasure function, frozen-account state, restrictive policies, upload/freeze serialization, physical Storage removal before Auth deletion, and a native confirmation/retry screen. Peer-owned media in conversations removed by account deletion is included in cleanup. The client cannot choose a deletion target, use privileged database functions or hold the service key. Failures leave a frozen, retryable account rather than reporting false success.

Typing, lint and 21 local tests pass, including the full migration chain and failed-media cleanup cases. Real Edge Runtime/Storage/Auth erasure and the full backend suite passed in [CI run 39649023485](https://github.com/asadabbas717/loopnest/actions/runs/39649023485), source commit `a70a387`. Phase 6 is complete. See `ACCOUNT_ERASURE.md` for behavior, retention boundaries and deployment steps.

## Phase 7 — scoped reporting and moderation

Implemented rate-limited message reports, explicitly disclosed sharing of selected content, a restricted review queue, server-assigned moderator roles, decision audit records and immediate database-enforced account suspension. Reported-photo access ends after resolution; moderators do not gain ordinary access to unrelated conversations. Suspended accounts retain the account-erasure path. See `MODERATION.md` for operator responsibilities and limits.

Strict typing, lint and 22 local tests pass, including all three migrations. The real local Docker suite passes all 12 tests. Both quality/platform exports and real backend integration passed in [CI run 39651009414](https://github.com/asadabbas717/loopnest/actions/runs/39651009414), source commit `4182eb1`. Phase 7 is complete.

## Phase 8 — hosted Free test setup (device acceptance pending)

Connected the owner's dedicated Supabase Free test project using existing authorized CLI access. Applied all three migrations, deployed `delete-account`, and enforced email confirmation and a minimum password length of 12. The app's HTTPS URL and public publishable key are saved only in ignored `mobile/.env`. Anonymous hosted requests to profiles, messages and reports are denied; the hosted erasure function rejects requests without a bearer token. No real users or test emails were created by these checks.

Supabase initially rejected custom confirmation/recovery templates with `ConfigPushAuthUpdateStatusError`: template modification is unavailable on Free with the default email provider. The owner subsequently configured Brevo SMTP directly in Supabase. Both committed code-email templates were then applied successfully; a scoped configuration comparison reports no pending declared changes. No plan upgrade was attempted and SMTP credentials were not copied into the app or repository. No moderator account has been appointed.

On October 22, 2026, the owner reported successful Android Expo Go tests against the hosted project: two email-account registrations, password recovery, subsequent sign-in, invitation/acceptance, chat and photo sending. These are user-reported acceptance results, not an independent device security audit. Phase 8's core hosted workflows are accepted; iOS, background/session privacy, failure handling, reporting/blocking and deletion still require device checks.

## Device feedback — password visibility and keyboard overlap

Added accessible Show/Hide controls to all password fields (signup/sign-in, recovery and erasure reauthentication). Passwords default to hidden, remask on blur/backgrounding, and do not use spell checking or autocorrection. Switching sign-in/signup resets visibility. Shared pages now avoid the keyboard on Android and iOS, measure the actual header offset, and scroll the focused field into view when the keyboard opens or the form resizes. Native Android builds explicitly use keyboard resize mode; Expo Go uses its own host configuration.

Physical-device acceptance of these two visual fixes is pending. Retest with long passwords, the last field on long forms, larger system text, keyboard dismissal/reopening and switching between fields while the keyboard stays open. Expo remains stopped following the owner's stop request.

Strict typing, Expo lint, formatting, all 22 regression tests and Android/iOS Hermes exports pass for the fixes. The first export was blocked by sandbox temporary-file permissions; rerunning outside that restriction succeeded. The checks do not simulate an Android/iOS keyboard or establish visual acceptance; that requires the device checklist in `DEVICE_TESTING.md`.

### Keyboard follow-up after Android feedback

The owner confirmed Show/Hide works, but supplied an Android screenshot showing the current-password input still covered on the account screen. The earlier keyboard implementation is therefore not accepted on device. Replaced its JavaScript keyboard events, manual measurements and nested avoiding view with SDK-compatible `react-native-keyboard-controller` and `KeyboardAwareScrollView` across shared pages. A root `KeyboardProvider` supplies native keyboard/focused-input tracking; preloading is disabled to avoid a startup keyboard flash. The scroll view reserves keyboard space and keeps a 24-point gap above the keyboard. Reanimated/Worklets are explicitly installed at SDK-compatible versions. These modules are included in SDK 57 Expo Go. The SDK dependency check also requested the compatible Router patch 57.0.29.

The reported invitation failure after blocking matches the deliberate bilateral block policy. The app has no unblock control; no block behavior was changed, as requested. The SQL regression now explicitly checks that both participants are denied repeat invitations while blocked. The revised keyboard behavior still requires retesting on the owner's phone.

For this follow-up, strict typing, lint, formatting, all 22 tests, SDK dependency compatibility and fresh Android/iOS Hermes exports pass. Exports were rerun after all package installations completed. No device keyboard result is inferred from successful bundling.

Expo was patched to 57.0.31 and Router to 57.0.29 as requested by the SDK compatibility check. Installation now reports 21 dependency advisories (18 high, 3 moderate); unresolved findings remain production-release blockers. At the owner's request, Docker Desktop was stopped: hosted Supabase/Expo Go testing and the local unit/Postgres checks do not require its engine. Restart Docker only when local full-service integration testing is needed; its data was not deleted.

The owner subsequently confirmed that the revised keyboard handling works as intended on the phone. The password-visibility and keyboard defects are accepted on that device; this does not imply iOS or signed-build acceptance.

## Phase 9 — abandoned-media cleanup

Implemented an operator-only dry-run/apply command and service-only database functions for unattached reservations older than 48 hours. Asset locks and triggers prevent attaching/uploading a photo after cleanup marks it. Physical Storage deletion precedes metadata finalization; failures retain retryable state. Sent and recent photos are excluded, and batch limits bound each invocation. The command retrieves privileged credentials only into memory from the authorized CLI session and prints counts only.

Strict typing, lint, formatting and 26 local tests pass, including the migration chain, privilege denial, shared/recent-photo protection, physical-delete-before-finalization and failure ordering. Both quality/platform exports and all 13 real backend tests passed in [CI run 39668907564](https://github.com/asadabbas717/loopnest/actions/runs/39668907564), source commit `c97984b`. The new real Storage scenario verifies dry-run preservation, retrying marked assets, physical removal and retaining shared/recent media. Docker remains stopped locally; the full stack ran on Linux CI.

Applied the tested migration to the owner's dedicated hosted project. A privileged count-only dry run reports zero eligible assets and zero removed; no hosted photo deletion was performed. Hosted anonymous requests to all three maintenance functions are denied. Phase 9 is complete as a manual development maintenance workflow. A monitored scheduler and broader retention/content validation remain public-release requirements. See `PHOTO_MAINTENANCE.md`.

### Additional Android acceptance — October 22, 2026

The owner reports that a wrong password preserved the account; the correct password permanently deleted it; subsequent sign-in was rejected; and the shared conversation disappeared from the peer's account. Sign-out and account switching did not show the previous account's content. These are user-reported Expo Go results. They do not independently establish physical hosted-photo deletion, backup erasure or background/app-switcher privacy. Physical deletion is covered by the isolated real-backend CI suite; hosted storage inspection and native background/signed-build checks remain separate acceptance work.

## Phase 10 — Friends and specific warnings

Added a paginated Friends screen with accepted active peers, the caller's blocked users, existing-conversation navigation and block/unblock controls. Server checks prevent directory enumeration, stale-actor writes and removing someone else's block. Unblocking does not bypass reciprocal blocks or invitation consent. Active denotes an available connection, not online presence.

Deletion now returns machine-readable safe errors and the client reads them from HTTP invocation failures. Wrong password, expired session, throttling and unavailable services have distinct messages. Shared warning mapping covers known Auth/database/quota failures; unknown errors no longer incorrectly suggest a connection problem. Photo loading and failure states are distinct.

Thirty local tests, strict typing, lint and formatting pass. Android/iOS exports and all 14 real backend tests passed in [CI run 39673522166](https://github.com/asadabbas717/loopnest/actions/runs/39673522166), source commit `21db500`. The real suite verifies private Friends lists, mutual block/unblock, restored history/photos and the exact wrong-password UI message decoded from the live deletion endpoint. Applied the tested Friends migration and redeployed `delete-account` to the owner's Free test project. Hosted anonymous access to both Friends functions is denied; the deployed deletion endpoint returns its expected `auth_required` contract without authentication. No hosted account was deleted or block state changed by these deployment checks.

Phase 10 implementation/deployment is complete; physical-device acceptance of the new screen/messages remains pending. See `FRIENDS_AND_ERRORS.md`. Background/app-switcher testing is deferred as requested, not accepted as passed. Docker remains stopped locally.

## Phase 11 — Android feedback: autofill, deletion warning and recent-apps privacy

The owner confirmed Friends unblocking, navigation to conversation and restoration of previous chats. The supplied screenshots also show a suffixed email after autofill, a generic deletion warning, and private chat/photo content visible in Android recent apps. The previous deletion-message and app-switcher behavior are therefore not accepted on that device.

Email fields now explicitly disable correction/spell checking while keeping appropriate account autofill hints. Native input owns the editing value to avoid rewriting IME composition on each change; the app still reads changes for submission. It does not strip arbitrary suffixes or guess the intended address. Third-party keyboard/password-manager saved values and the actual device behavior still need retesting.

Deletion parsing now accepts the SDK's structural HTTP response and reads JSON once, without requiring the global Response constructor, clone() or Error subclass identity. Approved error codes survive native/polyfill boundaries. A wrong password no longer triggers profile refresh/remount and clears the fields. Tests cover response objects without Response prototypes or clone support; this reproduces a gap in the earlier Node-only response coverage, not an independent diagnosis of the exact phone runtime.

Added SDK-compatible native screen-capture prevention before mounting private screens, plus iOS native app-switcher protection and an opaque JavaScript cover while inactive. Native setup failure hides private screens and offers retry. Native transitions are serialized and ownership-counted, including overlapping mounts; one shared manager survives Fast Refresh. Android's secure window protects recent-apps previews and also blocks screenshots/recordings throughout Loopnest. No screenshot-detection or extra photo-access permission is requested. This cannot revoke old snapshots, recipient copies or camera photos and does not protect an actively visible phone from another person looking at it.

Strict typing, lint, formatting and 34 local tests pass. Platform exports and all 14 real backend tests passed in [CI run 39677390494](https://github.com/asadabbas717/loopnest/actions/runs/39677390494), source commit `40d78c8`. Android native generation also passes. The subsequent least-permission configuration was type/format checked and generated AndroidManifest.xml contains explicit removal directives for READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE and DETECT_SCREEN_CAPTURE; generated native files remain ignored. No APK/IPA was compiled.

All three device defects require a full Expo Go reload and owner retest; a successful bundle or injected native lifecycle test is not proof of OS snapshot/autofill behavior. Docker remains stopped and no hosted backend changes were needed for this phase. Friends unblock/navigation/history restoration are recorded as accepted on Android.

The owner subsequently confirmed email autofill, the specific wrong-password warning, protected recent-apps preview and blocked screenshots all work as intended on the Android Expo Go device. This closes those reported Android regressions; iOS/signed-build acceptance remains separate.

## Phase 12 — trusted photo processing (integration verification pending)

Implemented authenticated, one-use reservation claims and a server JPEG decode/re-encode pipeline for new photos. Disabled direct client Storage INSERT and require trusted validation before a new photo can be attached to a message. Bounded streams, dimensions, decoder memory and output size; only pixels/dimensions are re-encoded, excluding submitted metadata/comments/trailing payload. Trusted writes now recheck conversation/account freeze state rather than bypassing erasure protection. Existing shared photos remain legacy assets; no hosted files have been rewritten or deleted.

Strict typing, lint and 39 local tests pass, including maximum-size codec validation, metadata stripping, malformed input, privilege denial and blocked trusted uploads. Platform/real Edge Runtime integration is pending; hosted deployment is pending. The exact pinned codec fixes its published old infinite-loop advisory; the project's 21 other dependency findings are not waived. See `PHOTO_VALIDATION.md`. Docker remains stopped locally and no paid service is introduced.
