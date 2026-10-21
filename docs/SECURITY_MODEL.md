# Security model and boundaries

Protect credentials, refresh tokens, messages, relationship metadata, and photos from anonymous callers and other authenticated users. Treat the mobile client, object paths, uploaded MIME labels, and all public API calls as untrusted. The Supabase publishable key is public by design; authorization must be enforced by Postgres RLS and Storage RLS. Never ship an admin key.

The implementation requires email-authenticated users, recipient acceptance before chat, participant-scoped message and photo access, bilateral blocking, immutable message identity, bounded content, private storage, and native credential storage. Objects have random names without emails or original filenames. Photo processing re-encodes selected images without requesting EXIF; verify metadata removal on real devices before accepting sensitive images. Client MIME declarations and re-encoding do not replace trusted server-side content validation.

This is **not end-to-end encryption**: the database operator and appropriately privileged infrastructure administrators can read server content. TLS and provider storage encryption do not change that. No custom cryptography will be described as secure messaging. E2EE, if required later, needs a vetted protocol, key verification, multi-device design, recovery policy, and independent review.

Short-lived file access, blocking, and deletion cannot revoke a recipient's downloaded copy, screenshot, or previously issued bearer URL immediately. Minimize local media caching and purge visible data on sign-out. Do not log content or tokens. Device compromise and malicious infrastructure administrators are outside the current protection boundary.

Release gates: executable RLS/storage adversarial tests; device tests for session lifecycle, media metadata and logout; abuse reporting/moderation; account and object deletion; dependency review; SMTP delivery and rate limits; accessibility; recovery/backup procedures; and independent security review. Open-source publication does not establish a security guarantee.
