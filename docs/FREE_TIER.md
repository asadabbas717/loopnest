# Free-tier policy

Use a **Supabase Free organization**, without paid add-ons or an upgrade. As verified October 21, 2026, the Free plan lists 500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, 50,000 monthly active users, and two active projects. Free projects may pause after a week of inactivity. Quotas and provider terms can change; free is not unlimited or an availability guarantee.

Source: https://supabase.com/pricing. Storage access: https://supabase.com/docs/guides/storage/security/access-control.

Keep images small, load bounded pages, subscribe only to the current conversation, and release subscriptions when leaving. No SMS, paid image transformation, AI, Firebase Storage, required paid SMTP, cloud builds, or keep-alive automation. Development email delivery has strict provider restrictions: use local Supabase emails or authorized test addresses; do not disable email verification for a public deployment. Check the live dashboard before enabling a public signup flow.

Local Supabase CLI with Docker provides a cloud-free development option. Local infrastructure uses your machine's resources. Hosted free-tier quotas cannot be enforced by a mobile client; backend limits reduce per-user abuse but do not guarantee protection from aggregate denial of service. Stop development traffic at quota rather than upgrade automatically.

Apple/Google store registration and distribution have their own fees; they are not prerequisites for source development and local Android testing. This project does not promise free app-store distribution.
