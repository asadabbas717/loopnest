# Dependency review — October 21, 2026

The phase-4 lockfile reports 24 npm advisories: 18 high, 6 moderate, no critical. npm counts affected dependents as well as the underlying vulnerable package, so this is not a count of 24 independent flaws. No forced Expo/React Native downgrade or untested major-version override was applied.

| Package / dependency path | Evidence and action |
| --- | --- |
| `braces@3.0.3` through Expo Metro → file-map → micromatch | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): excessive nesting can exhaust the stack; advisory lists no patched version. This path processes build-tool glob patterns. No production-message parser uses this library in our code; that is a source-path assessment, not a complete exploitability proof. Keep development servers private and review upstream fixes. |
| `node-forge@1.4.0` through Expo CLI/code-signing tools | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): RSA signature verification issue; no patched version listed. Our chat auth does not use Forge. Signing/update infrastructure and imported certificates still require assessment before release. |
| `decode-uri-component@0.2.2` through Expo Router → query-string@7 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr): malformed URI decoding can cause denial of service. Patched version 0.5.0 is ESM, while this query-string version calls it as a CommonJS function. A blind override would change module interoperability and can break routing. A compatible upstream router/parser update and adversarial native deep-link tests are required; this remains a runtime release blocker. |
| `uuid@7.0.3` through xcode config tooling | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): buffer bounds issue in older v3/v5/v6 APIs, fixed in 11.1.1. The inspected xcode caller uses `v4()` without a caller-provided buffer. That specific path does not invoke the reported affected APIs, but a major dependency override needs an iOS build/tooling check before adoption. |

Supabase CLI 2.121.0 is pinned as a development dependency. It is never imported into the app. Backend credentials discovered for tests come only from local CLI status, remain in memory, and are not checked in or forwarded to logs. GitHub Actions are pinned to immutable commits; Dependabot proposes dependency updates for review.

These findings are **not waived** and a passing build is not a clean security audit. Re-run `npm audit`, inspect affected versions and actual calling code, and apply reviewed compatible fixes before a public release. The real backend integration suite verifies access-control behavior, not framework parser/signature vulnerabilities.
