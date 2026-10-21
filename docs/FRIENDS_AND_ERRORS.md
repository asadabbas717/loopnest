# Friends and clear warnings

Friends is available from Home and Account and privacy. Active friends are accepted conversation peers whose accounts/connections are available for chat. This is not online presence: no last-seen timestamp, address-book access or public directory is added. Open conversation navigates to the existing accepted chat. New connections still require username invitation and recipient consent.

Blocked users lists only people the current user blocked. Blocking is available here and in a conversation. Unblocking removes only the caller's block; if the peer also blocked them, chat remains unavailable. An accepted conversation and its history become accessible again only when both participants' accounts and block state permit it. A previously pending invitation still needs acceptance. The server never returns the peer's block list or tells the caller who blocked them.

The server filters and paginates each list at 50 rows by immutable username. Only existing conversation peers can be blocked. Block operations are idempotent and bind to the initiating account; caller-supplied actor mismatches are rejected. Client list results are tied to the account/filter and invalidated on blur or account change. Direct message/photo authorization remains enforced by existing database policies.

## Warnings

Deletion errors now include stable codes, which the app parses from the function's HTTP response. Wrong current password displays **Wrong password. Enter your current password and try again.** Authentication outages and rate limits are separate failures; they are not classified as a wrong password. Unknown errors do not claim that the connection failed.

A shared mapper handles known Auth errors (credentials, confirmation, invalid/expired codes, password strength, email/send throttling and expired sessions), invitation/message/photo/report limits, permission failures, unavailable photos, stale-account actions and invalid links. Only approved messages and local validation text reach the UI. Raw backend response bodies, database details, passwords, file paths and tokens are not displayed. Invitation failure remains intentionally ambiguous about other people's account/block state. A username that does not exist and a connection unavailable for privacy reasons do not become distinguishable through error messages.

Photo lookup now distinguishes loading from failure; unavailable/unauthorized media and download failures have honest explanations. Load errors on conversations, Friends and moderation use the same mapper. Live subscription failures still describe the observed loss of live updates rather than assuming a cause. Unexpected failures use a generic retry/support message because their actual cause cannot be established safely by the client.

## Acceptance checks

Use two disposable accepted peers: open Friends, open their existing chat, block from either menu, find them under Blocked users, unblock and verify history/photo access returns. If both accounts blocked each other, removing one block must not restore chat; remove both to restore access. Check refresh, pagination and account switching. An unrelated third account must see neither peer.

Try deleting with a wrong password and confirm the specific password warning without deleting the account. Check an invalid/expired email code, incorrect sign-in credentials, and a genuinely offline action. These cases must have different messages and must never reveal raw diagnostics. Account deletion with a correct password is destructive and should be tested only with disposable accounts. Background/app-switcher privacy acceptance is explicitly deferred at the owner's request.
