# Contributing

Use a dedicated test backend and synthetic accounts. Keep secrets and user data out of code, tests, issues, screenshots, and logs. Read the security model before changing auth, database grants, storage, or chat membership. Never weaken RLS to make a screen work.

Run `npm ci` then `npm run check` and `npm run format:check` in `mobile`. Database changes belong in versioned migrations with adversarial authorization tests; tests must include an outsider using the public API. Describe behavior, validation, and limitations in each contribution. Keep changes small and reviewable. Dependency upgrades must be Expo-compatible and reviewed for advisories and license compatibility. Native output is generated, not hand-edited.

Use local builds and a Free backend. Do not enable billing or deploy backend changes as part of a contribution without the project owner's authorization. Contributions are provided under the repository's MIT license.
