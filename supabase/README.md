# Backend setup

Use a **new, isolated Supabase Free project**. This rewrite does not migrate old Firebase users or data. No backend has been deployed from this workspace. Never paste database passwords or secret/service-role keys into the mobile app.

## Hosted development

1. Create a project in a Free organization. Verify the plan; do not select paid add-ons.
2. Apply `migrations/202610210001_private_chat.sql` in that project's SQL editor, or use the Supabase CLI migrations workflow. The migration creates private chat tables, restricted RPCs, RLS policies, a private JPEG bucket, and the messages Realtime publication. Apply once to an empty project. Review before applying to any other database.
3. In Auth settings keep **Confirm email enabled**, require passwords of at least 12 characters, and configure signup/sign-in limits. Configure the **Confirm signup** email template to include `{{ .Token }}`; the app accepts that code and does not consume email deep links. Test email delivery with addresses you own. Supabase's built-in email provider is restricted and not suitable for general public delivery. Password recovery is not implemented yet.
4. Copy `mobile/.env.example` to `mobile/.env` and set the HTTPS project URL and **publishable** `sb_publishable_...` key. Restart Expo after changes. Legacy JWT anon keys and all secret keys are intentionally rejected. Public configuration is compiled into the app; RLS is the security boundary.
5. Run the mobile checks. Use three synthetic accounts to test Alice/Bob conversation consent and Eve's denial. Do not use sensitive content until native media/session checks and hosted API tests pass.

## Local development

Install the Supabase CLI and run Docker. From the repository root use `supabase start`, `supabase db reset`, and `supabase status`. The configured local email inbox runs on port 54324; retrieve test confirmation codes there. `config.toml` requires email confirmation. **The mobile URL guard currently permits hosted HTTPS Supabase project URLs only**, so local backend use needs a reviewed development-only URL configuration before connecting a device. Do not weaken the production guard or use cleartext on an untrusted network.

## Tests and boundaries

`cd mobile; npm test` executes the actual migration in embedded PostgreSQL (PGlite), with synthetic `auth.uid()` and Storage tables and low-privilege roles. It tests anonymous/outsider denial, invitation consent, immutable identities, duplicate send idempotency, storage ownership, cross-user photo theft, block enforcement, and message/invite limits. This executes Postgres grants, RLS, and functions; it does **not** test GoTrue, PostgREST, Storage HTTP MIME/size enforcement, JWT validation, Realtime delivery, or production configuration. Full Supabase integration tests remain a release gate.

Limits are enforced by RPCs, not just UI: 20 invitations/day with one-minute spacing; 30 messages/minute and 500/day; 20 photo reservations/day and 100 per account total; JPEG-only uploads no larger than 1 MiB. Invites and messages serialize against the sender's profile to reduce concurrent limit bypass. Authenticated clients cannot INSERT directly into messages, conversations, or photo reservations. No UPDATE grant exists for membership or messages, and Storage has no UPDATE policy. No public bucket or signed download links are created. Photo downloads use authenticated requests with caching disabled in the app.

Unattached photo reservations expire for upload after one hour. Failed/abandoned uploads can still leave reserved rows or storage objects. Cleanup/account erasure, reports/moderation, and retention procedures must be implemented before public release. Owner-only Storage DELETE is available to a trusted deletion workflow; rows intentionally remain to count quotas. Database backups, emails and copies made by recipients need separate retention handling. Do not delete Storage rows directly with SQL: delete physical objects through the Storage API.
