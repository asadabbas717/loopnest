# Loopnest identity

The original linked-loop mark uses lime and cyan on `#080C11`. Two rounded loops suggest a connection and a sheltered shared space. The SVG source and deterministic PNG generator are included under the repository's MIT license; there is no downloaded artwork, external font in the mark or image-generation service dependency.

Assets live in `mobile/assets/brand`: `mark.svg` for editing, transparent `mark.png` for the interface, opaque 1024-pixel `icon.png` for iOS/general launchers, and transparent Android adaptive foreground/monochrome layers. Android layers include extra safe-zone padding. Do not add rounded corners to the opaque app icon; the platform applies its mask.

Regenerate from `mobile` with `node scripts/generate-brand.mjs`. The Node-only generator creates supersampled PNGs from the same rounded-loop geometry without installing drawing libraries. The app header and font-loading screen use the mark. Expo config declares the native launcher assets and the SDK-compatible `expo-splash-screen` plugin.

Expo Go can display the in-app mark, but its host icon and splash behavior do not prove the installed Loopnest launcher/splash. Verify icon masks, Android themed icons and the native launch screen in a preview/release build. See [Expo's icon and splash guide](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/).
