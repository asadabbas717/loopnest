# Phase 4 — backend integration and security verification

Scope: real local Supabase API tests, debug-only local connectivity, email-code configuration, retries/account changes and dependency review. No hosted deployment, billing change or production data migration.

Implemented a pinned Supabase CLI and local start/stop/public-env commands. The local email template retains verification and delivers a code via Mailpit without a third-party provider. The native connection policy permits explicit loopback/emulator endpoints only in a debug runtime. Release bundles continue to reject local mode and legacy JWT keys. Tests run the exact mobile chat API through the real Supabase SDK rather than duplicating its request-building code.

The integration suite covers Auth/email verification, API outsider denial and invitation consent, Storage ownership/MIME/size/public-route denial, immutable uploads, private photo downloads, send retries, stale-account sends, refresh-token rotation, Realtime participant filtering, disconnect/resubscription catch-up, blocking, and account switching. It refuses hosted URLs, obtains only local credentials and cleans up its synthetic media/accounts.

## Verification state

- Local typing, lint and 15 unit/Postgres/configuration tests pass.
- Local full-stack execution is blocked: Docker Desktop fails during startup on a locked `sailor-ingest.sock`. No Docker data was removed or reset. The integration runner fails explicitly rather than skipping this prerequisite.
- The real suite has been added to Linux CI. Its result must be checked before this phase can be called verified.
- Native-device and hosted-environment behavior remain separate release gates.

## Dependency review

The current install reports 24 advisories (18 high, 6 moderate). Investigate compatible patches and upstream fixed ranges; do not force npm's obsolete framework downgrades. Findings in development tooling do not automatically establish native runtime exploitability, but unresolved reachable vulnerabilities block release. No finding is waived simply because lint or bundle export passes.
