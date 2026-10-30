# Release operations and owner decisions

This runbook prepares operational work; it does not establish that every release gate is complete. Keep the app in development until [verification](VERIFICATION.md) and the owner decisions below are satisfied.

## Routine checks

From `mobile`, use the explicitly selected dedicated project:

```bash
npm run maintenance:health -- --project-ref YOUR_20_LETTER_PROJECT_REF
npm run capacity:status -- --project-ref YOUR_20_LETTER_PROJECT_REF
```

Review failed/stale cleanup runs, pending deletions, provider storage/database/egress/Realtime/Edge/Auth quotas and SMTP allowance. The application ceilings cover accepted writes, not all provider usage. Before public traffic, establish an owner and an unattended alert destination. The repository currently records health and supports checking it; it does not deliver external alerts or guarantee continuous supervision.

When capacity is threatened, stop new traffic/admissions and investigate; do not upgrade a plan automatically. Do not erase unrelated users' live conversations to make space. Keep access-denial policies enabled during incidents. Pause only Loopnest's cleanup job through its service-only disable RPC when investigating worker faults; retry pending cleanup after repair.

## Incidents and rollback

1. Restrict the affected capability while preserving privacy guards. Collect only necessary timestamps, source/run IDs and sanitized error categories; keep credentials, message/photo content and user identifiers out of public logs/issues.
2. For a compromised account, use the established moderator suspension/erasure paths. For leaked operator credentials, revoke/rotate them through their provider, inspect access and redeploy affected server configuration. Rotate the narrow maintenance token with Configure and verify both Vault and the function environment.
3. Reproduce against synthetic content in an isolated stack and run the complete CI suite. Restore service only after the failing scenario and normal device flow pass.
4. Deploy a known-good mobile revision when necessary. Database changes are forward migrations; do not reset the hosted database or remove deletion tombstones to roll back a client. Preserve pending cleanup records so physical deletion can resume. Do not restore intentionally deleted content as an incidental rollback.

## Moderation and support

The owner must appoint trusted moderators through the existing operator workflow; ordinary users cannot grant themselves that role. Restrict reviews to reported content and the documented authorization model. Agree on response ownership, handling of appeals, suspension criteria and escalation for urgent abuse before public release. Do not request passwords, verification codes, service keys or private photos in a public issue.

The owner must choose a private support/security/privacy contact and publish the approved route. No personal email from development correspondence has been published as a contact. GitHub private vulnerability reporting can be used if the owner enables it; see [security reporting](../SECURITY.md).

## Backup/recovery and retention

Provider backups, availability and retention differ by plan; do not assume a Free project has a paid backup/recovery feature. Before collecting real public data, choose owner-controlled encrypted backup storage, access/key custody, retention, restore objectives and a deletion-reconciliation procedure. Keep backups outside Git and the mobile app. Never create an unencrypted SQL/media dump in the public workspace as a shortcut.

An actual restore drill is still required in an isolated environment, including private-bucket permissions, current RLS/functions, erased-account/deleted-content reconciliation and credential rotation. No production/private-content backup or restore has been performed by this runbook. Self-service deletion affects live storage; saved copies and provider/offline backups require their separate documented policy. Use the factual [security model](SECURITY_MODEL.md), [retention](PHOTO_MAINTENANCE.md) and [receipt semantics](MESSAGE_RECEIPTS.md) when drafting public data-handling disclosures; owner contact/retention commitments must be approved before publishing them as policy.

## Distribution and final review

Establish owner-controlled production signing and store/distribution ownership. Internal preview development keys are not production signing material. Finish installed Android/iOS, accessibility/performance and normal capture acceptance. CAPTCHA was deferred; public signup/request/egress protections remain unfinished. Arrange an independent security review of Auth/RLS, server credentials, lifecycle/media deletion and the documented dependency fork. Passing our tests/advisors is not independent review or a security certification.
