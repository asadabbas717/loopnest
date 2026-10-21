# Development status

## Phase 1 — clean foundation

Previous source, native projects, Firebase client files, icons, migration documents, and old CI were removed from the working tree. Git history and an archive branch preserve the previous project. A fresh Expo/React Native application, strict TypeScript, quality scripts, MIT license, contributor guidance, and documented security/cost boundaries replace them.

Next phases implement database authorization/private storage and the mobile workflows, then regression tests and CI. No remote database has been created or modified. Docker is installed but its engine is not running in this workspace; backend integration tests cannot run until it is available.
