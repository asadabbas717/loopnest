# Device testing and connection troubleshooting

Use disposable accounts and synthetic photos. The owner tested the latest UI on Android and iOS; profile pictures, clearing, photos and account privacy passed. Phase 23 keyboard/scroll fixes still need a focused retest; actual one-hour expiry remains unobserved. See [device results](DEVICE_ACCEPTANCE_2026_10_29.md). Exact evidence is in [STATUS.md](STATUS.md).

## Start and stop

For hosted testing, Docker is not required. From `mobile` in VS Code/Git Bash:

```bash
npm run start:device -- --clear
```

Keep the PC and phone on the same trusted Wi-Fi. Wait until the terminal prints **Metro: exp://…** and scan its current QR code. Android Expo Go can enter that URL manually. A first development bundle after clearing caches can take about a minute on the tested PC. Keep the server terminal open; **Ctrl+C** stops it. A stopped server cannot serve a previously scanned project URL.

The latest reported connection failure was resolved by starting Metro and using its current LAN URL; the owner confirmed the app opened. Do not hardcode that PC address in the repo. Expo is currently stopped at the owner's request; restart it only when testing is ready.

## If Expo Go cannot connect

1. Check the terminal for the ready URL or an actual startup error. Confirm Expo Go supports SDK 58. Distinguish connection timeouts from a red JavaScript error screen or a privacy/session loading screen.
2. On the phone, open `http://COMPUTER_WIFI_IP:PORT/status` using the host/port from the current Expo URL. Expected response: `packager-status:running`.
3. If the phone cannot reach status, check matching Wi-Fi, VPNs, guest/client isolation and the current PC IP. Check the Node executable's Windows firewall rule/profile; do not disable the firewall or assume a new executable inherits another Node installation's rule.
4. If status works but launching fails, fully close/reopen Expo Go and use the current URL. Collect the exact phone and terminal error. A localhost smoke or successful export does not prove phone reachability.
5. An explicit `npx expo start --go --tunnel` can be an optional fallback. It uses an external tunnel and may require a helper. It is not started automatically and does not tunnel a local Supabase backend.

Official instructions: [Expo device startup](https://docs.expo.dev/get-started/start-developing/), [Expo CLI](https://docs.expo.dev/more/expo-cli/).

## Functional checklist

- Sign up/confirm two owned emails, sign in, reset a password and verify wrong credentials have accurate warnings. Check paste/autofill and long forms with the keyboard.
- Invite/accept, exchange text and regular photos, block/unblock and return to the conversation. Verify outsider/blocked access is denied.
- Interrupt/reconnect networking; verify catch-up, subsequent live delivery and retry without duplicates. See [connection reliability](CONNECTION_RELIABILITY.md).
- Follow the current [UI, retention, profile-photo and Clear Chat checklist](PRIVATE_AVATARS_AND_CLEAR_CHAT.md). Clear Chat intentionally affects both people and needs disposable content.
- Wrong deletion passwords must preserve the account. Correct erasure must prevent sign-in and remove the shared conversation/photos from the peer after refresh.
- Background, sign out and change accounts; old private content must not appear. Test returning to scroll positions without restoring old-account data.

## Capture acceptance

Local UI feedback may opt in with `EXPO_PUBLIC_ALLOW_TEST_SCREENSHOTS=true`; a banner identifies relaxed screenshot/recording protection. Release runtimes ignore this flag. For security acceptance, set it to false, restart Metro and fully reopen Expo Go before testing:

- Screenshots and recordings of chat and one-time media, including recording started before opening the app.
- Recent-apps previews, rapid background/foreground, cold launch and account switching.
- One-time close on background/navigation/deadline, with no reopening.
- Failure to enable native protection must hide private screens. No screenshot-detection or broad media permission is required.

Repeat in signed builds and on iOS before release. An external camera or modified/rooted device cannot be reliably prevented from capturing delivered content.
