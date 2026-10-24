# CommonJS compatibility copy

This directory contains `decode-uri-component@0.5.0` from the npm registry, with exactly one source change: `export default function` becomes `module.exports = function`. Expo Router 57's `query-string@7.1.3` expects a callable CommonJS export. The upstream fixed decoder is ESM; substituting that package unchanged breaks this calling convention.

Original `index.js` SHA-256: `9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa`.
Registry tarball SHA-1: `4592fa1e1d640ec5e2760e2e168ad2ab5f2c9da1`.

The npm override routes all consumers to this local copy. The version identifies the upstream source, not a published Loopnest package. Preserve the MIT license. No install-time download or patch hook is used. Review upstream changes and remove this compatibility copy when a tested Expo upgrade consumes the fixed decoder directly.

References: https://github.com/SamVerschueren/decode-uri-component and https://github.com/advisories/GHSA-vcc3-ghjq-m6fr.
