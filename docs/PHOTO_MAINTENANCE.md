# Abandoned-photo maintenance

Only photo reservations older than 48 hours that are not referenced by any message are eligible. This includes failed/cancelled uploads and empty reservations. Sent photos, reported photos attached to messages and recent reservations are preserved. The delay also preserves the rolling one-day reservation quota. Successful cleanup releases the account's total reservation capacity.

The database marks a bounded batch before deleting bytes. Attachment and upload triggers lock the same asset and reject use after marking. A separate check after the claim lock protects a message that committed before cleanup acquired the lock. Physical files are removed with the Storage API; only then can the privileged finalization RPC delete application metadata. Storage metadata is never deleted directly by production code. Interrupted removal/finalization is retryable, including already-missing files. Retrying account erasure and cleanup concurrently is safe because finalization tolerates already-deleted application rows.

## Operator commands

From `mobile`, use the pinned Supabase CLI login belonging to an authorized project operator. Do not paste privileged credentials into chat, app configuration or the repository. The runner obtains the legacy service-role API key from that authorized CLI session into memory; it never stores or prints it. It does not use the mobile `.env` to select a target.

```bash
# Read-only preview: counts only; no file paths or user identities are printed.
npm run maintenance:photos -- --project-ref YOUR_20_LETTER_PROJECT_REF

# Physically remove eligible abandoned media in that explicit project.
npm run maintenance:photos -- --project-ref YOUR_20_LETTER_PROJECT_REF --apply

# Isolated local testing; requires Docker/local Supabase running.
npm run maintenance:photos -- --local
npm run maintenance:photos -- --local --apply
```

Dry run is the default. An apply run processes at most ten batches of 100 assets. Its summary includes the remaining eligible count; rerun if nonzero. Another worker can hold locks, so a temporarily empty batch does not prove that the entire backlog is gone. On errors, the runner exits unsuccessfully without forwarding credential-bearing backend diagnostics. Marked photos cannot be attached later; create a fresh reservation to resend an abandoned draft.

No hosted timer, billing change or paid worker is installed. During private development, the maintainer must preview and run this command regularly (for example daily while testing) and check the remaining count. A monitored scheduler and quota alerts remain requirements before public launch. CLI login is a privileged operator capability; restrict access to the development machine.

## Retention boundaries

Sent conversations/photos are retained until account erasure; blocking restricts access and does not delete content. Abandoned photos are eligible after 48 hours but are not guaranteed to disappear at precisely that age: maintenance must run successfully. Account erasure removes affected conversations/media for both participants. It cannot revoke recipients' copies, screenshots, already delivered email or provider backups. Provider retention and a support/appeal route must be published before public use. This maintenance phase does not add automatic expiry for messages, reports, audit records, Auth logs or backups.

The SQL authorization/trigger checks and injected Storage failure tests run in `npm test`. The real local integration suite also tests physical deletion, retrying marked assets, exclusion of shared/recent assets and client privilege denial. See `STATUS.md` for verified execution evidence.
