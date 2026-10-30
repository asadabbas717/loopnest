# Delete an individual message or photo

Your own messages have a trash action. Confirm **Delete for both** to remove the message and its caption/attached photo from both participants' accounts. Received messages retain reporting controls; this feature does not let someone delete a peer's individual message. Clear Chat remains the separate shared-history action.

The authenticated endpoint verifies the actor with Auth.getUser. Service-only SQL binds the actor to the original sender and accepted, unblocked conversation. Client table DELETE and cleanup functions are not granted. A durable deletion job hides only the selected message from history, receipts and moderation, and marks any attached photo unreadable. The rest of the conversation stays usable. Storage bytes must be removed before final message/asset metadata deletion. Physical cleanup failure is visible and retryable, including after re-entering the chat.

Near-term retries are idempotent. The existing thirty-day private content-free delivery tombstone prevents old send attempts from restoring deleted content and preserves message quotas; photo quota receipts preserve the rolling reservation cap. Read acknowledgements and reports cascade away with the message. Deletion-job metadata contains identifiers, not message bodies/photos, and finished jobs are pruned after thirty days on subsequent maintenance activity. Already delivered/saved copies and provider backups cannot be recalled.

## Device acceptance

- [ ] Cancel the confirmation: content remains unchanged.
- [ ] Delete your own text: it disappears on both phones after the live update/Refresh; surrounding messages remain.
- [ ] Delete your own regular photo with a caption: both the photo and caption disappear; the other person's messages remain.
- [ ] Delete your own unopened/consumed one-time-photo message: it cannot be opened again through history.
- [ ] The recipient has no Delete for both action on your messages; reporting still works.
- [ ] Interrupt a deletion/reconnect and use Retry deletion if shown; re-entering preserves any pending cleanup retry. No false success is shown on failure.
- [ ] Fresh text/photos, read indicators, keyboard handling and scrolling work after deletion.
