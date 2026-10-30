# Free-tier policy

Use a **Supabase Free organization**, without paid add-ons or an upgrade. As verified October 28, 2026, the Free plan lists 500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, 50,000 monthly active users, two active projects and 500,000 Edge Function invocations. Free projects may pause after a week of inactivity. Quotas and provider terms can change; free is not unlimited or an availability guarantee.

Sources: [plan limits](https://supabase.com/pricing), [Edge Function quota](https://supabase.com/docs/guides/functions/pricing), [Storage access](https://supabase.com/docs/guides/storage/security/access-control).

Keep images small, load bounded pages, keep one current-chat subscription plus one account-scoped foreground delivery subscription, and release inactive subscriptions. No SMS, paid image transformation, AI, Firebase Storage, required paid SMTP, cloud builds, or keep-alive automation. Development email delivery has strict provider restrictions: use local Supabase emails or authorized test addresses; do not disable email verification for a public deployment. Check the live dashboard before enabling a public signup flow.

Local Supabase CLI with Docker provides a cloud-free development option. Local infrastructure uses your machine's resources. Hosted free-tier quotas cannot be enforced by a mobile client; backend limits reduce per-user abuse but do not guarantee protection from aggregate denial of service. Stop development traffic at quota rather than upgrade automatically.

Apple/Google store registration and distribution have their own fees; they are not prerequisites for source development and local Android testing. This project does not promise free app-store distribution.

Project-wide accepted-write ceilings and remaining Auth/request/egress gaps are documented in [capacity safeguards](PROJECT_CAPACITY.md). CAPTCHA setup is deferred; public bot protection is not complete.
