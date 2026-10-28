# Temporary configuration-tooling security fork

This is a private, checked-in fork of the MIT-licensed `deepmerge@4.3.1` npm package's `dist/cjs.js`. The upstream package has no published fix for GHSA-gcqx-w48m-w2h4 as of October 28, 2026. The issue is disputed in its tracker, but the null-placeholder prototype-poisoning case is reproducible. This copy is named **`@loopnest/deepmerge@4.3.1-loopnest.1`** to identify it honestly as local modified code, not an upstream release.

The only JavaScript changes add a `keyIsForbidden` helper and skip `__proto__`, `constructor` and `prototype` **before reading or assigning** keys in both the target-copy and source-merge loops. This also covers nested merges and null-prototype/placeholder targets. The existing merge algorithm, symbol handling, cloning, array options and `all()` API are preserved. Those three property names are intentionally excluded from configuration data. Custom merge callbacks and proxies are trusted program code and cannot be made safe by this data-key guard alone.

Original bundled-source SHA-256: `2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`. Tests reverse exactly the documented edits and check that hash, test the malicious cases and verify normal merge semantics. The original MIT notice and TypeScript declarations are preserved. No package download or patch script runs during installation.

The root manifest overrides `deepmerge` with this local package for Expo's configuration tooling. It is not imported by app source. npm reports no registry advisories after replacement; **npm does not audit this private fork as a known upstream release**. Its safety evidence is the reviewed small diff and tests, not that audit count. Keep this maintenance responsibility explicit and replace/remove the fork when Expo adopts a compatible fixed upstream dependency. Do not rename or bump versions merely to hide advisories.

Primary references: [advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), [upstream discussion and proposed key guard](https://github.com/TehShrike/deepmerge/issues/273), [upstream source](https://github.com/TehShrike/deepmerge/blob/v4.3.1/index.js).
