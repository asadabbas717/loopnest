# Message delivery and read receipts

Outgoing chat messages display a check/status label:

- **Sent:** the server accepted the message. It does not assert device delivery.
- **Delivered:** the recipient's foreground app acknowledged that message's ID. This is not proof of a photo download, offline persistence or a human reading it.
- **Seen:** the recipient's active chat reported the message footer visible after scrolling settled, with read sharing enabled by both people.
- **Status unavailable:** receipt lookup failed; message content remains independently usable. Refresh/reconnect retries the status.

Account → Read receipts starts **Off**. Enabling shares read acknowledgements and permits seeing a peer's shared acknowledgements; both people must opt in. Turning it off hides Seen states in either direction and stops new read acknowledgements. Existing boolean acknowledgements remain until their messages are deleted, so enabling sharing again can reveal historical Seen states. Delivery acknowledgements remain enabled while signed in and foregrounded. There is no online, last-seen or exact read/delivery-time display.

The app does not run a background delivery service or push notifications. A closed/backgrounded app can leave a message at Sent until it returns, reconnects and acknowledges it. Metadata catch-up is bounded to 100 IDs per batch. Seen queues contain only bounded, account-scoped IDs and are discarded on background/account changes; they do not persist private message bytes. Realtime conversation revisions trigger status refreshes without exposing a separate publicly readable receipt table.

The server binds acknowledgements to the authenticated expected actor, accepted/unblocked participation, recipient identity and unexpired content. Senders and outsiders cannot acknowledge a recipient's delivery. The acknowledgement table is private; RPCs return permitted states without activity timestamps. Duplicate acknowledgements do not repeatedly signal updates. Clear Chat/account deletion/physical expired-message deletion cascade acknowledgement removal; expired or blocked content denies receipt reads immediately. These acknowledgements are distinct from the older private retry/quota tombstones, which have their own retention policy.

A Seen label on a one-time-photo **message** does not mean the photo was opened and does not change its atomic opening rule. Read receipts are app acknowledgements, not proof of human attention or trusted-device attestation; a modified recipient client can lie about its own reading.

## Two-phone acceptance

Use disposable content. Restart Metro and reopen Expo Go on both phones after updating.

- [ ] Recipient app fully closed: sender sees Sent, not Delivered/Seen.
- [ ] Recipient opens Home without entering the chat: sender changes to Delivered.
- [ ] Default read sharing off on either phone: entering the chat never shows Seen.
- [ ] Enable Read receipts in Account on both phones. Open the recipient chat and scroll the new message into view: sender changes to Seen.
- [ ] While the recipient reads older history, send a new message below the viewport: it stays Delivered until scrolled into view. Returning from a photo/report screen must preserve history position.
- [ ] Turn sharing off on either phone: shared Seen states fall back to Delivered after the live update/Refresh. New reads stay private.
- [ ] Disconnect/reconnect and background/reopen: statuses catch up without duplicate messages or revealing another account's content.
- [ ] Blocking prevents receipt access; clearing/deletion removes the affected history. One-time messages still require explicit recipient-only opening.
- [ ] Long timestamps/labels and large system text fit on Android and iOS.

Automated SQL/service checks verify authorization and state transitions. Native visibility geometry still requires the owner-device checks above.
