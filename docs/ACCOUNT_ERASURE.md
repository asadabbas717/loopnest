# Account deletion and retention

Account deletion is initiated by a signed-in user in Account and privacy. It requires their current password, typing `DELETE`, and a second destructive confirmation. The trusted Edge Function verifies the bearer with Supabase Auth, reauthenticates the password, and never accepts a caller-supplied target user ID. The service-role key stays in the function environment. `verify_jwt=false` delegates gateway JWT validation to this explicit Auth.getUser verification; it does not permit unauthenticated deletion.

The function first marks the account as erasing and freezes affected conversations. Restrictive database/Storage policies deny new access and writes; a Storage trigger serializes in-flight uploads against conversation freezing. Only service-role functions can enumerate the erasure scope. Physical objects are deleted through Storage, then Auth deletion cascades the profile, conversations, messages, blocks and photo metadata. Because conversations are removed from both accounts, peer-owned photos in those conversations are included in cleanup to avoid physical orphans.

If cleanup fails, the account stays frozen and Auth is not deleted. Retrying the same operation is safe. The function reports success only after Storage cleanup and Auth deletion. The UI shows erasing state rather than offering a new profile. Accounts with exceptionally large erasure scopes can need maintainer-assisted cleanup; the function has a bounded per-request batch loop. Native encrypted session cleanup still needs device verification.

Saved copies, screenshots, already downloaded files and provider backup retention cannot be revoked by this endpoint. No legal hold or immutable report evidence is copied by the deletion flow. Do not promise immediate erasure from backups. For a public deployment the operator must publish actual retention periods, verify backup behavior and provide a private support route for failed deletion.

Local backend start now includes the Edge Runtime. For hosted testing, apply migrations in order and deploy `delete-account` with the pinned CLI to your authorized Supabase Free test project. Do not expose the service key to the app or put it in `EXPO_PUBLIC_*`. Local signup/login limits are 60 per configured interval to permit the multi-account integration suite; hosted Auth limits must be reviewed separately.

Supabase Free includes an Edge Function invocation allowance; no paid plan is required for this endpoint. Stay within Free and its quotas. Source: https://supabase.com/docs/guides/functions/pricing.

Tests cover current-password enforcement, target-ID injection, body limits, freeze-before-delete ordering, media failure behavior, physical cleanup of both participants' media, Auth deletion and stale-session denial. Full service results must pass before calling the phase verified.
