# Conversation reconnect behavior

An active foreground conversation subscribes to its own Realtime channel. The channel waits for server replication readiness before reporting subscription success, then reads the latest authorized history. A new subscription after foregrounding or manual Refresh performs the same catch-up. Events are hints to re-read authorized data, never trusted message payloads appended directly to the screen.

Refresh now replaces the live channel as well as checking current conversation access. Failed, timed-out and unexpectedly closed channels show a reconnect warning. The warning clears only after a successful history read while subscribed. Automatic SDK resubscription also triggers catch-up. No background polling, persistent offline message queue or new paid service is added.

History refreshes are serialized and event bursts coalesced. An event during a running read schedules one follow-up rather than starting competing reads whose responses could overwrite newer data. Disposal cancels scheduled work and suppresses late successes/failures after leaving the scope. Initial history finishes before the live reader starts. A failed refresh removes displayed history and shows the approved error; subsequent refreshes can recover. Reads remain bounded to the latest 40 messages; older history is manually paginated.

Sending still uses an idempotent message ID for retries of the unchanged attempt, with server enforcement of the initiating sender. The real backend suite tests retrying a committed send, rejecting conflicting reuse and stale-account sends. There is no automatic retry that claims delivery while offline. Backgrounding deliberately clears the draft and its retry reference, so cleared text cannot be silently resent by a later tap. This does not cancel a send already submitted by the user.

## Device acceptance

On October 28, 2026, the owner reported both phones passed the requested live-delivery, offline catch-up, continued live delivery after reconnection, and unchanged failed-send retry tests, along with photo, form/navigation and privacy checks, in SDK 58 Expo Go. Initial catch-up was allowed to use Refresh; the owner did not specify whether it was needed. This accepts the requested core network scenarios without asserting every interruption/lifecycle variant below was independently exercised.

Use disposable accounts and synthetic content. Reload the updated app first.

1. With both accounts in the conversation, disconnect the receiving phone from the network, send two messages from the other phone, then reconnect. The missing messages should appear after reconnection; use Refresh if needed. The disconnection warning must clear when live updates and the history read recover.
2. Send a further message from the peer. It should arrive without pressing Refresh, confirming the live channel was restored.
3. Try sending a text message while offline. It must not claim success. Reconnect and retry the unchanged message; the receiver should see one copy. Repeat without valuable content because the initial server response may be lost.
4. Background/reopen and leave/re-enter a conversation while a refresh is pending. No content from a previous account/conversation should appear. Cleared drafts must not be sent by tapping Send later.

Unit timing/failure tests and local-service integration are automated evidence, not a substitute for these physical network/device checks, native token-expiry checks or broader performance testing.
