# Verification and release gates

## Performed locally

- TypeScript strict mode and Expo lint.
- Domain regressions: Unicode boundaries, handle/UUID validation and password preservation.
- Native-session adapter regressions using an injected vault: bounded Unicode chunking, failed chunk/manifest writes, refresh/read/logout serialization, cleanup, and corrupt-data denial. These tests do not establish device Keychain/Keystore behavior or power-loss guarantees.
- The actual SQL migration executed in embedded PostgreSQL with RLS and low-privilege roles. Tested outsider/anonymous denial, consent, immutable identity, wrong-owner photo reuse, private Storage access, blocking, duplicate sends, and server rate limits. Auth and Storage service tables are simulated; see the backend README for the untested service boundaries.
- Android and iOS Hermes JavaScript exports succeeded.
- Android native project generation succeeded. No APK/IPA has been compiled or installed.

## Dependency review

The initial fresh install reported 29 advisories (19 high, 10 moderate); compatible Expo SDK 57 patch updates reduced this to 28 (18 high, 10 moderate). Findings include transitive Expo/Metro tooling and URL handling dependencies. npm suggested breaking downgrades to obsolete Expo/React Native versions; these were not applied. Compatible patches were installed with Expo's dependency resolver. A successful framework compatibility check is not a clean vulnerability audit. Review the current lockfile advisories and their runtime reachability before release; known unpatched upstream findings remain a release blocker. Dependabot is configured to propose updates, not merge them automatically.

## Required before public deployment

1. Run local Supabase or an isolated hosted test backend; exercise real JWT verification, PostgREST RPC response shapes, Storage upload/download MIME and byte limits, and Realtime authorization/disconnects using three accounts.
2. Test iOS and Android Keychain/Keystore, token rotation, session corruption, backgrounding, sign-out/account switch, and native picker lifecycles. Verify EXIF/GPS stripping on multiple image formats and OS versions. Neither MIME labels nor client re-encoding are server-side file-content validation.
3. Add a trusted content validation/moderation path, abuse reporting, account recovery/erasure, media cleanup, and a documented retention policy. Orphan reservations/objects count toward small development quotas and are not automatically removed yet.
4. Verify email confirmation delivery, CAPTCHA/signup controls, backend aggregate rate limits, free-tier quota behavior, and privacy/terms appropriate to the deployment. No public launch is authorized by this source rebuild.
5. Device accessibility and performance, signing and rollback, backup/recovery, dependency advisory assessment, and independent security review.

No production credentials, live backend writes, billing changes, app-store publishing, or user-data migration were performed. Chat is not end-to-end encrypted. This repository is a reviewed development starting point, not a completed secure-messenger assurance process.
