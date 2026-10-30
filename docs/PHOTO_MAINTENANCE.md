# Content maintenance and retention

Physical cleanup supports a bounded scheduled worker and explicit operator commands. See [automatic scheduling, security and health checks](AUTOMATED_MAINTENANCE.md) and [tested/hosted status](STATUS.md). Database rules deny expired/consumed media immediately according to their access policy; physical objects and metadata require successful cleanup. Do not promise exact physical deletion times.

## Commands

From `mobile`, using the pinned CLI and an authorized operator login:

```bash
# Default: counts only. No messages, paths or credentials are printed.
npm run maintenance:content -- --project-ref YOUR_20_LETTER_PROJECT_REF

# Explicit mutation: remove eligible media, then purge expired text.
npm run maintenance:content -- --project-ref YOUR_20_LETTER_PROJECT_REF --apply

# Optional isolated local backend, only when Docker is intentionally running.
npm run maintenance:content -- --local
```

The earlier `maintenance:photos` command is a compatibility alias for the same content workflow. Its summary now has `photos` and `messages` sections. Hosted credentials come from the authorized CLI session into memory, not the mobile `.env`; no privileged key is written or logged. A dry run changes no rows. An apply run processes at most ten batches of 100 photo assets and ten batches of 500 expired text messages; inspect remaining counts and rerun as needed. Bounded work or a temporarily locked batch is not proof that every eligible object has been removed.

## Eligibility and ordering

| Content | Eligible physical cleanup |
| --- | --- |
| Unattached photo reservation/object | Older than 48 hours |
| Photo attached to an expired message | At the message deadline |
| Consumed one-time photo | After a five-minute delivery grace |
| Expired text/placeholder without a photo | At its server deadline |
| Active shared-clear conversation | Owned by Clear Chat's retryable worker; excluded from general photo batches |
| Current unexpired regular photo | Preserved until shared clearing/account erasure or later expiry |

Photo cleanup marks a batch, removes physical objects through Storage and only then finalizes metadata/messages. Upload/attachment guards reject marked assets. Failures keep retryable metadata; do not delete Storage metadata directly with SQL. Expired text deletion leaves private delivery tombstones so an old send cannot resurrect it and rolling message quotas remain enforced.

Deleting recent photo assets through clear/expiry/cleanup now retains a private quota receipt containing only reservation ID, owner ID and time. It preserves the 20-per-day allowance after deletion, contains no path/bytes/conversation ID, cascades on owner erasure and is eligible for pruning after 24 hours on the owner's next reservation. This does not reconstruct previously deleted reservations from before the hardening migration.

Private delivery tombstones become eligible for removal after thirty days and are pruned by `purge_expired_messages`; clear-request metadata is pruned by later clear finalization. These are operator/activity-dependent cleanup passes, not exact deletion deadlines.

Profile-photo cleanup is separate: replacement/removal revokes reads first, then its Edge Function removes retired bytes. Remove/reset or a later upload can retry failure; stale unattached profile reservations become eligible after an hour. Already-purged avatar metadata becomes eligible after thirty days and is pruned on a later reservation. Account erasure removes all the account's profile-photo bytes before Auth deletion. See [private avatars](PRIVATE_AVATARS_AND_CLEAR_CHAT.md).

## Operating limits

Preview and run maintenance regularly during private testing; inspect failures and remaining counts. The scheduler records private run/lease summaries and provides an operator health command. External alert delivery, global quota/abuse controls, retention/support procedures and backup policy remain public-release work. Blocking revokes access but does not erase unexpired history. Clear Chat removes one shared history for both participants; account erasure removes affected conversations/media from both participants. Neither can revoke downloaded copies or provider backups.

Injected failure tests verify physical-delete ordering and bounded work. Embedded PostgreSQL and real-service CI verify privileges, expiry, Storage deletion and quotas. Refer to [STATUS.md](STATUS.md) for the exact tested/deployed revision.
