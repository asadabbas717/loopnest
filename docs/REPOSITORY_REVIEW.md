# Repository review — October 28, 2026

Reviewed the native auth/session lifecycle, client account binding, SQL/Storage authorization, media cleanup and quotas, CI/configuration and operator/contributor docs. This is a focused maintainer review with executable regressions; it is not independent security certification or physical-device acceptance.

## Findings and corrections

| Finding | Correction and evidence |
| --- | --- |
| A late bootstrap/retry session read could overwrite a newer auth event | Added auth revision/disposal guards. Deferred-read regressions cover sign-out, account replacement, stale errors and later retries. |
| Corrupt/incomplete vault metadata could keep later sign-in/clearing unusable | Invalidate unusable commit markers and clean known chunks without returning partial data. Clearing tolerates malformed markers; transient vault read failures do not erase valid sessions. Unidentifiable fragments can remain encrypted if a corrupt marker no longer identifies them; no claim of complete forensic erasure is made. |
| Mobile supplied deprecated `processLock`, producing the observed SDK warning/zero-timeout messages | Removed the custom lock and use the installed SDK's default refresh single-flight/commit guard. Added a real-service concurrent refresh/sign-out scenario through the serialized vault adapter. |
| Clear/expiry deletion reset the daily photo reservation count | Reproduced the missing rejection in embedded PostgreSQL. New migration retains private reservation ID/owner/time receipts for recent deleted assets; no bytes, path or conversation is retained. A clear no longer resets the daily allowance. Existing previously deleted reservations cannot be reconstructed. |
| General photo cleanup could overlap an already-active shared-clear scope | Exclude conversations with clearing in progress from count/claim. A regression includes an otherwise-eligible abandoned reservation in a frozen chat. |
| Operator maintenance omitted expired text despite the backend supporting purge | Added count-only/default text preview and explicit bounded apply, with service-only counts and failure/bounds tests. `maintenance:content` is the preferred alias; the previous alias remains supported. |
| Recovery exit did not close SDK background resources | Dispose the isolated Auth client after local sign-out, including failure. Deferred component cleanup avoids disposing an immediately reused Strict Mode client. |
| Nine SDK 58 package patches were behind Expo's recommended versions | Applied SDK-compatible patch alignment. Retained the scoped, documented CLI security fixes; audit and compatibility checks are rerun. |
| Setup/release/maintenance docs described older phases as current or omitted newer functions/features | Rewrote README, backend setup, device/verification, security and content-maintenance guides. Clarified historical evidence, all five function deployments, test capture mode, current media/reporting rules and physical retention boundaries. Added a local Markdown link check to CI. |

The lock migration follows the installed SDK's [official coordination notes](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md). The encrypted vault's own serialized/chunked storage behavior remains in place.

At the phase 22 review, Expo 58.0.21's native-template table recommended React Native 0.88.1 while the live Expo Go validator required 0.88.0. On 31 October the live validator also requires 0.88.1, so phase 26 aligns to that patch without excluding validation. Native generation preserves all six permission-removal directives. Signed builds remain unverified.

## Verification and rollout

Local checks cover strict typing, lint, formatting, SQL/domain/handler regressions, Markdown file links, SDK compatibility, Expo Doctor and registry audit. Full-service CI verifies actual API/Storage cleanup, upload quota preservation and concurrent refresh/sign-out; its source/run outcome is recorded in [STATUS.md](STATUS.md). Android/iOS Hermes exports are not signed APK/IPA builds.

Clean-install quality/audit/docs checks, 75 local tests, Android/iOS Hermes exports and all 19 backend tests passed in [CI run 40747259494](https://github.com/asadabbas717/loopnest/actions/runs/40747259494), source `29ca5d1`. Local Expo Doctor passes 20/20 and dependency compatibility passes. Registry audit reports zero known vulnerabilities; the documented local-fork maintenance caveat remains.

Applied only the tested `202610280005_review_hardening.sql` migration to the dedicated Free test project after CI. Hosted rollout verification confirms anonymous count denial and uses count-only maintenance: one eligible photo, zero expired text rows, zero removed. No cleanup apply or chat clearing was invoked. No Edge Function redeployment was needed for this migration/client/operator change.

Expo and the local Docker engine remain stopped at the owner's request. The latest two-phone UI/profile/clearing and signed-build/iOS acceptance remain pending. Automatic monitored cleanup, aggregate signup/egress protections, support/appeal and backup/recovery policy, and independent review remain public-release work; this phase does not claim to close those gates.
