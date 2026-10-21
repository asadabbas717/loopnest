# Backend setup

Use a **new, isolated Supabase Free project**. This rewrite does not migrate old Firebase users or data. No backend has been deployed from this workspace. Never paste database passwords or secret/service-role keys into the mobile app.

## Hosted development

1. Create a project in a Free organization. Verify the plan; do not select paid add-ons.
2. Apply `migrations/202610210001_private_chat.sql` in that project's SQL editor, or use the Supabase CLI migrations workflow. The migration creates private chat tables, restricted RPCs, RLS policies, a private JPEG bucket, and the messages Realtime publication. Apply once to an empty project. Review before applying to any other database.
3. In Auth settings keep **Confirm email enabled**, require passwords of at least 12 characters, and configure signup/sign-in limits. Configure both **Confirm signup** and **Reset password** email templates to include `{{ .Token }}`; the app accepts codes and does not consume email deep links. Matching templates are committed under `templates/`. Recovery uses an isolated session and signs out refresh sessions after changing the password. Test email delivery with addresses you own. Supabase's built-in email provider is restricted and not suitable for general public delivery.
4. Copy `mobile/.env.example` to `mobile/.env` and set the HTTPS project URL and **publishable** `sb_publishable_...` key. Restart Expo after changes. Legacy JWT anon keys and all secret keys are intentionally rejected. Public configuration is compiled into the app; RLS is the security boundary.
5. Run the mobile checks. Use three synthetic accounts to test Alice/Bob conversation consent and Eve's denial. Do not use sensitive content until native media/session checks and hosted API tests pass.

## Local development

Start Docker, then from `mobile` run `npm ci` and `npm run backend:start`. The CLI is pinned in the lockfile. This starts only the local services needed for development; no Supabase account, hosted project, SMTP provider or billing is required. Email confirmation stays enabled, and the committed email template sends codes into the local Mailpit inbox at `http://127.0.0.1:54324`.

Run `npm run backend:env -- android` for an Android emulator or `npm run backend:env` for iOS Simulator. This writes an ignored `mobile/.env` using only a local public key and refuses to overwrite existing configuration. Android uses `10.0.2.2:54321`; iOS uses `127.0.0.1:54321`. Restart Expo. Local mode requires both `EXPO_PUBLIC_USE_LOCAL_BACKEND=true` and a development runtime; release bundles reject it. Only the three explicit loopback/emulator hosts on port 54321 are allowed. Arbitrary LAN hosts, paths, credentials in URLs, admin keys and non-debug local sessions are rejected. Android's generated debug manifest permits HTTP; the main manifest is not weakened. iOS allows local networking without allowing arbitrary insecure loads.

Local mode accepts a CLI legacy anon JWT or a publishable key. Decoding the JWT's role only rejects accidental admin-key configuration; the backend must still verify its signature. Hosted builds require HTTPS and a publishable key. Never send a real account's credentials over a local-development connection. Physical-device LAN connections are intentionally outside this setup.

Use `npm run backend:stop` to stop services while preserving local data. Do not reset the database or delete Docker volumes unless you intend to discard the local data. Existing local installations need a reviewed `supabase db reset --local` to apply initial migrations; it is destructive and is not run by the test script.

## Tests and boundaries

`cd mobile; npm test` executes the actual migration in embedded PostgreSQL (PGlite), with synthetic `auth.uid()` and Storage tables and low-privilege roles. It tests anonymous/outsider denial, invitation consent, immutable identities, duplicate send idempotency, storage ownership, cross-user photo theft, block enforcement, and message/invite limits. This executes Postgres grants, RLS, and functions; it does **not** test GoTrue, PostgREST, Storage HTTP MIME/size enforcement, JWT validation, Realtime delivery, or production configuration. Full Supabase integration tests remain a release gate.

`npm run test:integration` is a separate, fail-on-missing-backend suite using the same API module as the mobile app. It exercises real local email verification, Auth sessions/refresh, PostgREST, private Storage MIME/byte limits and authenticated downloads, idempotent sends, account switching, participant-only Realtime, resubscription catch-up, and bilateral blocking. It obtains ephemeral credentials from CLI status, refuses hosted URLs, never prints keys/tokens, and cleans up its synthetic users and physical photos. It does not reset your database or delete other users. Local inbox messages from synthetic accounts are retained in Mailpit; stop/delete the isolated test environment according to your retention needs.

GitHub CI runs the real suite against an isolated Linux Docker stack, without repository secrets or a hosted backend. Native OS behavior (picker, Keychain/Keystore, ATS, Android network policy, screenshots and caching) still needs device testing.

Limits are enforced by RPCs, not just UI: 20 invitations/day with one-minute spacing; 30 messages/minute and 500/day; 20 photo reservations/day and 100 per account total; JPEG-only uploads no larger than 1 MiB. Invites and messages serialize against the sender's profile to reduce concurrent limit bypass. Authenticated clients cannot INSERT directly into messages, conversations, or photo reservations. No UPDATE grant exists for membership or messages, and Storage has no UPDATE policy. No public bucket or signed download links are created. Photo downloads use authenticated requests with caching disabled in the app.

Unattached photo reservations expire for upload after one hour. Failed/abandoned uploads can still leave reserved rows or storage objects. Cleanup/account erasure, reports/moderation, and retention procedures must be implemented before public release. Owner-only Storage DELETE is available to a trusted deletion workflow; rows intentionally remain to count quotas. Database backups, emails and copies made by recipients need separate retention handling. Do not delete Storage rows directly with SQL: delete physical objects through the Storage API.
