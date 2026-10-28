# Supabase backend setup

Use a new, isolated **Supabase Free** project and synthetic content. This rewrite does not migrate Firebase accounts/data. The owner's dedicated project is configured; see [status](../docs/STATUS.md) for deployment evidence. Public repository readers must configure their own project.

## Hosted development

1. Create a project in a Free organization and keep paid add-ons disabled.
2. Apply every file in `migrations/` in filename order, once, through the CLI migrations workflow or SQL editor. They enforce accepted membership, blocking, private media, server validation, expiry, shared clearing, private avatars, quotas, erasure and moderation. Add new migrations for changes; never rewrite already-applied history.
3. Deploy **all five Edge Functions** from the repository root using the pinned CLI in `mobile/node_modules`: `upload-photo`, `open-photo`, `clear-chat`, `profile-photo` and `delete-account`. For a fresh project, the following is one example after operator login/linking:

```bash
cd mobile
npx supabase --workdir .. login
npx supabase --workdir .. link --project-ref YOUR_20_LETTER_PROJECT_REF
npx supabase --workdir .. db push --dry-run
# Review the target and pending migrations before applying.
npx supabase --workdir .. db push
npx supabase --workdir .. functions deploy delete-account
npx supabase --workdir .. functions deploy upload-photo
npx supabase --workdir .. functions deploy open-photo
npx supabase --workdir .. functions deploy clear-chat
npx supabase --workdir .. functions deploy profile-photo
```

For an existing project, update account erasure before enabling new profile uploads so profile bytes are included in cleanup. Functions use platform service credentials only on the server. Their `verify_jwt=false` gateway setting delegates validation to explicit `Auth.getUser`; it is not anonymous authorization. Browser-origin requests are rejected.

4. Keep **Confirm email** enabled, require passwords of at least 12 characters and review Auth signup/email rate limits. Configure both confirmation and recovery templates to include `{{ .Token }}`; committed templates are in `templates/`. The app accepts codes and does not consume auth deep links. Recovery uses an isolated, nonpersistent client and closes its SDK resources on exit.
5. Configure an SMTP provider within its free allowance for test addresses you own. Supabase's default provider is restricted; this project's hosted setup refused custom code templates until custom SMTP was configured. The owner's Brevo configuration is external to this repo. Never commit SMTP credentials or disable email confirmation to bypass delivery setup.
6. For a fresh clone, copy `mobile/.env.example` to `mobile/.env`, enter the HTTPS project URL and public **`sb_publishable_…`** key, and leave `EXPO_PUBLIC_USE_LOCAL_BACKEND=false`. Hosted legacy anon JWTs and secret/service-role keys are rejected by client configuration. Restart Metro after changes. No privileged key belongs in `EXPO_PUBLIC_*`.
7. Run app checks and the device checklist. Test with accounts/content you control. Per-account quotas do not replace aggregate signup/request/egress controls before public release.

## Optional local backend

Docker is required only for this path. When intentionally ready, from `mobile` run:

```bash
npm ci
npm run backend:start
npm run backend:env -- android  # Android emulator
# Or: npm run backend:env       # iOS Simulator
npm run test:integration
npm run backend:stop
```

The CLI starts local Auth, PostgREST, Storage, Realtime, Mailpit and Edge Runtime. `backend:env` writes an ignored `.env` with public local configuration and refuses to overwrite an existing one. Mailpit receives code emails at `http://127.0.0.1:54324`.

Debug local mode permits only `10.0.2.2:54321` for Android or loopback on port 54321; it requires both `EXPO_PUBLIC_USE_LOCAL_BACKEND=true` and a development runtime. Release bundles reject it. Local legacy anon JWT acceptance checks the role to catch accidental admin configuration; backend signature verification is still required. Arbitrary LAN backend hosts are deliberately excluded, so physical phones should use the hosted HTTPS test project. Expo's LAN JavaScript URL is separate from the backend URL.

Stopping the local stack preserves data. CI uses an isolated Linux stack and does not contact the hosted project. Keep the owner's local Docker engine stopped unless explicitly restarting local backend work.

## Security and operations

Both `chat-photos` and `profile-photos` are private. Clients cannot upload unvalidated bytes directly. One-time photos have no ordinary Storage download path; the authenticated recipient claim returns non-cacheable bytes once. Profile images are limited to current validated media visible to the owner and accepted, unblocked contacts. Account/shared clearing removes physical files before final metadata deletion.

Review [security model](../docs/SECURITY_MODEL.md), [manual content maintenance](../docs/PHOTO_MAINTENANCE.md), [ephemeral privacy](../docs/EPHEMERAL_PRIVACY.md), [account erasure](../docs/ACCOUNT_ERASURE.md) and [moderation](../docs/MODERATION.md). A monitored scheduler, global abuse controls, support/appeal processes and backup/recovery policy remain release gates. Do not deploy to another person's backend without authorization.
