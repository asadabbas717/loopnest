# Project-wide content admission limits

Conservative server ceilings supplement per-account limits. App clients cannot change limits, clear counters or read telemetry. Admissions serialize across accounts. Daily counters have no account IDs/foreign keys, so deleting content/accounts cannot reset them; failed transactions do not consume successful-admission counters.

| Content | Retained ceiling | Admissions per UTC day |
| --- | ---: | ---: |
| Messages | 10,000 | 2,000 |
| Chat-photo reservations, including unfinished uploads | 400 | 200 |
| Current/pending/retired-but-unpurged profile photos | 200 | 50 |
| App profiles | 500 | 50 |

Photo reservations represent at most about 450 MiB of app media: 400 × 1-MiB chat files plus 200 × 256-KiB avatars. This is a logical admission bound, not provider usage measurement or a guarantee about unrelated objects, database indexes or administrator writes. Message bodies stay capped at 4,000 characters. Limits do not upgrade the plan or purchase capacity.

Initial counters backfill currently known retained/tombstoned activity; already-erased pre-installation history cannot be reconstructed. Future counters survive erasure and become eligible for pruning after thirty-one days on later admission activity. The UTC calendar-day limit differs from rolling per-account windows. Storage capacity can be freed by deletion; daily budgets require waiting for reset. Warnings identify the actual limit rather than suggesting a connection failure.

From `mobile`, operators can inspect aggregate summaries:

```bash
npm run capacity:status -- --project-ref YOUR_20_LETTER_PROJECT_REF
```

Private database configuration can tighten limits. Constraints reject values above the reviewed ceilings; raising them requires a reviewed migration and renewed Free-quota assessment. Monitor the provider dashboard as well.

## Public-abuse gaps

These controls bound accepted app writes, not every HTTP/Realtime/Auth request, media download/egress or unprofiled Auth account. Malicious callers can still exhaust availability/Free allowances before reaching an app guard. Keep paid upgrades/add-ons disabled and stop traffic if quotas are threatened.

The owner chose public signup and then explicitly deferred CAPTCHA setup. No CAPTCHA dependency, provider credential or test-key bypass was installed. Signup protection, request/egress controls and unattended external alerts remain release gates. Do not declare public release ready from these limits alone. See [verification](VERIFICATION.md).
