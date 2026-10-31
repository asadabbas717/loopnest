# Current build blocker — 1 November 2026

The clean Android preview audit and a fresh local audit report **25 moderate findings** propagated from two reviewed advisories: [glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) (patched in 14.0.2) and [minimatch pattern amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) (patched in 11.0.1). Installed dependencies include glob 13.0.6 and minimatch 3.1.5/10.2.6. These are tooling dependencies, but the configured audit gate still applies.

The audit's suggested forced Expo downgrade to SDK 51 is not a compatible SDK 58 repair. A blanket minimatch 11 replacement also changes the legacy callable CommonJS API used by lint tooling. No forced downgrade, unverified cross-major override, advisory suppression or audit-threshold relaxation was applied. A reviewed compatible dependency update/backport and full clean-install checks are required before retrying the installed build. Earlier zero-advisory counts below are historical snapshots.

# Dependency review — October 21, 2026

## Security fixes — October 28, 2026

The previous Forge/Zod findings are addressed with Forge 1.4.2 and a scoped, compatibility-tested Expo CLI Zod 4.6.7 override. The fresh deepmerge advisory is addressed by a minimal documented local fork scoped to Expo config, with source provenance, preserved license and adversarial/real-config regressions. npm audit now reports zero known vulnerabilities; it does not independently audit our private fork. A new CI audit gate rejects reported advisories at any severity. See `DEPENDENCY_SECURITY_FIXES.md` and `STATUS.md` for verification, scope and maintenance requirements. Earlier inventories below are historical and are not the current dependency status.

## SDK 58 review — October 26, 2026

Upgraded to Expo 58.0.19 / Router 58.0.26, React Native 0.88.0 and React 19.3.0 with SDK-compatible modules. The SDK 58 router no longer depends on `query-string`; the installed tree/lockfile contain neither that package nor `decode-uri-component`. Removed the local decoder dependency, override, compatibility source and its two now-obsolete package tests. No custom parser replacement is needed. React DOM is explicitly aligned to 19.3.0 to avoid the resolver selecting a peer-incompatible patch.

The new audit still reports five high affected packages, zero moderate and zero critical: the Expo CLI/signing dependency paths for Forge and Zod remain unresolved. SDK alignment does not waive those release blockers. `expo-doctor` passes all 20 checks and `npm ls --all` reports no invalid peers. Native/device verification and CI evidence are tracked in `STATUS.md`. Earlier review snapshots below explain the previous SDK 57 workaround and should not be read as the current dependency graph.

## Current review — October 25, 2026

The unchanged lockfile now audits as eight affected packages (five high, three moderate), rather than the October 22 registry's 21. That initial reduction reflects updated registry advisories, not thirteen newly patched packages. The current review replaces the vulnerable routing decoder with a checked-in CommonJS adaptation of upstream `decode-uri-component@0.5.0`; the only source change is the export syntax. Its provenance, hashes and MIT license are in `mobile/vendor/decode-uri-component`. An npm override makes `query-string` consume that copy. Tests verify the installed resolution, source hash, Unicode/query semantics and bounded completion for long malformed input in an isolated process.

After this change the audit reports five high affected packages, zero moderate and zero critical. These represent two underlying findings: `node-forge@1.4.0` and `zod@3.25.76`, propagated through Expo's CLI/signing dependencies. Forge's registry latest remains 1.4.0. The Zod advisory lists 4.6.6 as fixed; Expo CLI declares Zod 3 and lint tooling also consumes its v3 API, so no untested global major override is applied. These findings remain unresolved release blockers. Keep the development server on a trusted network and do not treat an audit count or successful build as an independent security review.

Primary advisories: [decoder](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [Forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The historical snapshots below are retained as evidence of earlier reviews, not today's complete inventory. Remove the decoder compatibility copy when a tested Expo upgrade no longer needs it; review upstream fixes in the meantime.

October 22 update: after compatible Expo 57.0.31/Router 57.0.29 patches and adding SDK-compatible keyboard handling, a fresh audit reports 21 affected packages (18 high, 3 moderate, no critical). `decode-uri-component`, `braces` and `node-forge` findings remain. Reanimated/Worklets are also flagged through their affected dependency paths; these are not independent new advisories. No framework-breaking downgrade or override was applied. The table below records the phase-4 analysis and must not be read as a current complete package inventory. Review the current lockfile and audit again before release.

The phase-4 lockfile reports 24 npm advisories: 18 high, 6 moderate, no critical. npm counts affected dependents as well as the underlying vulnerable package, so this is not a count of 24 independent flaws. No forced Expo/React Native downgrade or untested major-version override was applied.

| Package / dependency path | Evidence and action |
| --- | --- |
| `braces@3.0.3` through Expo Metro → file-map → micromatch | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): excessive nesting can exhaust the stack; advisory lists no patched version. This path processes build-tool glob patterns. No production-message parser uses this library in our code; that is a source-path assessment, not a complete exploitability proof. Keep development servers private and review upstream fixes. |
| `node-forge@1.4.0` through Expo CLI/code-signing tools | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv): RSA signature verification issue; no patched version listed. Our chat auth does not use Forge. Signing/update infrastructure and imported certificates still require assessment before release. |
| `decode-uri-component@0.2.2` through Expo Router → query-string@7 | [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr): malformed URI decoding can cause denial of service. Patched version 0.5.0 is ESM, while this query-string version calls it as a CommonJS function. A blind override would change module interoperability and can break routing. A compatible upstream router/parser update and adversarial native deep-link tests are required; this remains a runtime release blocker. |
| `uuid@7.0.3` through xcode config tooling | [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): buffer bounds issue in older v3/v5/v6 APIs, fixed in 11.1.1. The inspected xcode caller uses `v4()` without a caller-provided buffer. That specific path does not invoke the reported affected APIs, but a major dependency override needs an iOS build/tooling check before adoption. |

Supabase CLI 2.121.0 is pinned as a development dependency. It is never imported into the app. Backend credentials discovered for tests come only from local CLI status, remain in memory, and are not checked in or forwarded to logs. GitHub Actions are pinned to immutable commits; Dependabot proposes dependency updates for review.

These findings are **not waived** and a passing build is not a clean security audit. Re-run `npm audit`, inspect affected versions and actual calling code, and apply reviewed compatible fixes before a public release. The real backend integration suite verifies access-control behavior, not framework parser/signature vulnerabilities.
