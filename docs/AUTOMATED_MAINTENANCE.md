# Automatic content maintenance

Each invocation handles at most 20 pending individual deletions, 100 eligible chat photos, 20 retired/abandoned avatars and 500 expired text messages, then bounded metadata pruning. Current profile pictures and unexpired regular photos are preserved. Shared-clear conversations remain owned by their own cleanup flow. Failures leave retryable records; physical Storage removal precedes asset finalization. Independent stages can still progress after a failure.

A five-minute database lease prevents overlapping workers and records interrupted leases as failed on the next run. The worker checks a ninety-second budget between stages and uses fifteen-second network timeouts. Dates/status/numeric counts are recorded privately; no message content, credentials or paths are logged. Finished records/tombstones become eligible for pruning after thirty days, dispatch records after seven days. Cleanup is eventual, not an exact deletion-time guarantee.

## Security and schedule

The Edge endpoint accepts a dedicated random 256-bit token, compared through fixed-length digests. It does not accept user/public/service-role bearer fallbacks. The body defaults to a count-only dry run; mutation requires `dry_run:false`. Credentials never enter mobile configuration.

Operator provisioning installs pg_cron, pg_net and Vault separately from portable migrations. The narrow token is stored in Vault and function server secrets, not a cron-command literal or Git. Application roles cannot read Vault's decrypted-secret view or pg_net's request queue. Database administrators remain privileged. A leaked worker token cannot authorize general database reads or arbitrary deletion targets.

Using the platform's UTC cron default, the schedule is 00:17, 06:17, 12:17 and 18:17 UTC. Dispatch skips an empty backlog, an active lease or a dispatch within the last hour. This is backlog maintenance, not a keep-alive workaround; a Free project may still pause and outages/quotas may delay cleanup. The metadata backlog value is a pending-batch flag, not an exact row count.

## Operator commands

Apply tested migrations and deploy `content-maintenance` first. From `mobile` with an authorized CLI login:

```bash
npm run maintenance:install -- --project-ref YOUR_20_LETTER_PROJECT_REF
npm run maintenance:configure -- --project-ref YOUR_20_LETTER_PROJECT_REF
npm run maintenance:health -- --project-ref YOUR_20_LETTER_PROJECT_REF
```

For an explicitly requested first cleanup after count-only verification, add `--run-now` to Configure. It runs the same bounded worker and prints only aggregate results. A first successful run establishes health before waiting for the next scheduled tick.

Install creates functions without enabling a schedule. Configure rotates the dedicated token in server secrets, verifies a count-only Edge request, then stores it in Vault and enables the named job. It prints no credentials and writes none locally. A partial failure is fail-closed; rerun Configure to reconcile/rotate both copies. No plan upgrade or paid service is provisioned.

Health prints only schedule/run/backlog summaries and exits unsuccessfully for disabled scheduling, failed/stuck runs, failed dispatches or overdue pending work. Before the first successful run it treats pending work as unverified. Check after deployment and regularly; no external alert-delivery service is configured. Inspect Supabase Cron run history and Edge logs when health fails, keeping credential-bearing diagnostics out of public issues.

To pause, use the service-only `disable_content_maintenance` RPC. This unschedules only Loopnest's job; unrelated jobs/extensions remain. Re-enable with Configure. Expiry access denial continues independently. Explicit commands in [content retention](PHOTO_MAINTENANCE.md) remain available. See [STATUS.md](STATUS.md) for actual tested/hosted rollout.

## Local/CI

The CI job prepares an ignored, ephemeral `supabase/functions/.env` token before starting an isolated stack. It installs real scheduler extensions, dispatches via Vault/pg_net to the actual Edge worker, verifies removed eligible bytes and preserved live media, disables its job and stops the stack.

For intentional local work, place a random `LOOPNEST_MAINTENANCE_TOKEN` in ignored `supabase/functions/.env` before starting Supabase. Use `--local` for installation/configuration/health; the scheduler uses the fixed local `http://kong:8000` target. Hosted commands do not start local Docker.

References: [Supabase Cron](https://supabase.com/docs/guides/cron), [scheduling and Vault security](https://supabase.com/docs/guides/functions/schedule-functions), [secrets](https://supabase.com/docs/guides/functions/secrets).
