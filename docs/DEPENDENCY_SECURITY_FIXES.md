# Dependency security fixes — October 28, 2026

The earlier five high affected-package entries represented two underlying findings, propagated through Expo's CLI/signing dependencies. A fresh audit also picked up the separate deepmerge advisory updated on October 27. This work addresses the underlying code paths; no audit exclusions, vulnerability allowlist, framework downgrade or legacy-peer/force install flag is used.

## Forge

Updated the existing compatible transitive dependency from `node-forge@1.4.0` to **1.4.2** in the lockfile. Upstream published the security fixes in 1.4.1 and a PEM Buffer compatibility follow-up in 1.4.2 on October 27. No cryptography fork is maintained here. Regression tests generate a synthetic certificate, exercise Expo's real certificate/signing helpers and PEM Buffer decoding, and reject a signature whose DigestAlgorithm contains an extra field.

Primary evidence: [upstream changelog](https://github.com/digitalbazaar/forge/blob/main/CHANGELOG.md), [signature advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Advisory pages can lag the publisher's release; verify both source and installed versions during future reviews.

## Zod

Expo CLI still declares Zod 3. A **scoped `@expo/cli` override to `zod@4.6.7`** removes the older implementation from the installed tree. The actual CLI usage was inspected: its plugin/output schemas and command-schema construction use compatible APIs. Tests load those exact installed CLI modules and exercise valid/invalid plugin definitions, typed command arguments, strict unknown-key rejection, output parsing and `.issues` error consumption. A separate bounded-array test confirms oversized constrained input is rejected before parsing its children.

This is an explicitly maintained major-version compatibility override, not an assertion that Zod 4 is a drop-in replacement for every Zod 3 consumer. Recheck the CLI's call sites and these regressions on each Expo upgrade, and remove the override when Expo declares a compatible fixed version. Other consumers are not globally overridden.

Primary evidence: [advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Zod migration guide](https://zod.dev/v4/changelog).

## Configuration merging

`deepmerge@4.3.1` still has no published fix for the newly reported prototype-poisoning issue. Replaced **only Expo config's dependency** with the explicitly named local fork `@loopnest/deepmerge@4.3.1-loopnest.1`. It preserves upstream's bundled implementation, TypeScript declarations and MIT license, adding forbidden-key checks to both write loops. The fork README records the original source hash and exact edits; tests reverse those edits and verify the hash, reject hostile inputs on both operands, preserve normal merge behavior and exercise actual Expo configuration modification in a synthetic dry-run project.

The copy deliberately excludes `__proto__`, `constructor` and `prototype` from configuration data. It does not sandbox trusted custom callbacks, proxies or arbitrary project/plugin JavaScript. See [local fork provenance](../mobile/vendor/deepmerge/README.md) and the [upstream issue](https://github.com/TehShrike/deepmerge/issues/273).

**A zero npm advisory count does not independently validate this private fork.** npm has no registry advisory history for our scoped local package; the safety evidence is the small reviewed change, source-provenance check, adversarial regressions and Expo integration checks. Replace/remove the fork once a compatible upstream solution is available. Do not silently turn a local fork into an untracked long-term dependency.

## Regression prevention and verification

`npm run audit:dependencies` fails on any reported severity, including low. The quality CI job runs it after a clean install; no advisories are filtered. This supplements, rather than replaces, the source-level tests and future security review. Changing advisories may legitimately fail a future CI run until reviewed/fixed.

`npm run test:dev-server` starts the actual Expo CLI on an automatically selected localhost port, verifies its status endpoint, and stops only the child server it created. It disables dotenv loading, outbound Expo requests and telemetry for that smoke check, never opens an emulator/phone, and does not forward raw CLI logs. It is also part of quality CI, covering CLI startup beyond successful production exports. Expo's `--offline` and `--localhost` flags are mutually exclusive; the smoke check uses the installed CLI's supported `EXPO_OFFLINE=1` environment option with `--localhost` instead.

All seven focused regressions and the full 51-test local suite pass. Expo 58.0.20, Router 58.0.27 and FileSystem 58.0.12 satisfy the SDK compatibility matrix; Expo Doctor passes 20/20 checks and the real localhost startup/status/stop smoke passes. Final native/platform checks and clean-install/full backend CI evidence are recorded in `STATUS.md` when complete. No Supabase data/configuration change, paid service or phone permission is introduced by these tooling fixes.
