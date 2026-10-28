// Only approved messages reach the UI; never render arbitrary server diagnostics.
export const errorMessages = {
  one_time_unavailable:
    'This one-time photo is no longer available. It may have been opened or expired.',
  photo_delivery_unavailable:
    'The photo could not be delivered. For privacy, a claimed one-time opening cannot be retried.',
  invalid_photo:
    'This photo could not be validated. Choose another image no larger than 1 MB after resizing.',
  photo_unavailable: 'This upload reservation is unavailable. Choose the photo again to retry.',
  photo_upload_unavailable: 'The photo could not be saved right now. Try again later.',
  username_taken: 'That username is already taken. Choose another username.',
  wrong_password: 'Wrong password. Enter your current password and try again.',
  auth_required: 'Your session has expired. Sign in again.',
  deletion_unavailable:
    'Your account could not be deleted right now. Try again later. If deletion is pending, use the retry option.',
  invalid_confirmation: 'Enter your current password and type DELETE to confirm.',
  rate_limited: 'Too many attempts. Wait a few minutes before trying again.',
  request_forbidden: 'This action is not permitted.',
  deletion_protocol: 'The deletion service returned an unexpected response. Refresh and try again.',
} as const;
export type UserErrorCode = keyof typeof errorMessages;
export class UserFacingError extends Error {
  readonly code: UserErrorCode;
  constructor(code: UserErrorCode) {
    super(errorMessages[code]);
    this.name = 'UserFacingError';
    this.code = code;
  }
}
const authMessages: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Verify your email before signing in.',
  otp_expired: 'That verification code is invalid or expired. Request a new code.',
  same_password: 'Choose a different password from your current password.',
  weak_password: 'Choose a stronger password with at least 12 characters.',
  email_address_invalid: 'Enter a valid email address.',
  email_address_not_authorized:
    'Email delivery is not enabled for that address. Contact the project maintainer.',
  over_email_send_rate_limit: 'Too many emails requested. Wait before requesting another code.',
  over_request_rate_limit: errorMessages.rate_limited,
  user_already_exists: 'An account with that email already exists. Sign in or reset your password.',
  signup_disabled: 'New account registration is currently disabled.',
  session_not_found: errorMessages.auth_required,
  refresh_token_not_found: errorMessages.auth_required,
  refresh_token_already_used: errorMessages.auth_required,
  bad_jwt: errorMessages.auth_required,
};
const databaseMessages: Record<string, string> = {
  'Message expired':
    'This message has expired and cannot be resent using the old attempt. Write a new message if you want to send it again.',
  'Invalid disappearing duration': 'Choose whole hours or days, from 1 hour up to 30 days.',
  'Setting limit reached':
    'Wait 10 seconds before changing the disappearing-message setting again.',
  'Create your profile first': 'Create your profile before sending invitations.',
  'Message identifier conflict':
    'This send attempt conflicts with an earlier message. Reopen the conversation and try again.',
  'Invitation unavailable':
    'This invitation is unavailable. Check the username. Existing blocks or a declined invitation can prevent contact.',
  'Invitation limit reached':
    'Invitation limit reached. Wait at least a minute between invitations; up to 20 are allowed per day.',
  'Message limit reached':
    'Message limit reached. Wait before sending again; limits are 30 per minute and 500 per day.',
  'Photo limit reached':
    'Photo upload limit reached. Up to 20 reservations per day and 100 retained photos are allowed.',
  'Report limit reached': 'You can submit up to 10 new reports per day. Try again tomorrow.',
  'Photo unavailable': 'This photo is no longer available to send. Choose the photo again.',
  'Session changed': 'Your account changed. Reopen this screen before continuing.',
  'Connection unavailable': 'This connection is unavailable. Refresh your Friends list.',
  'Not authorized':
    'Your account cannot perform this action. Refresh to check your session and access.',
  'Report unavailable': 'This message cannot be reported from your account.',
  'Privileged accounts require operator review':
    'Reports involving a moderator need review by the project operator.',
  'Recovery verification is required.': 'Verify your recovery code before changing your password.',
  'Recovery verification failed.': 'The recovery code could not be verified. Request a new code.',
  'Invalid conversation.': 'This conversation link is invalid. Return to your conversations.',
};
export function userErrorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return errorMessages[error.code];
  const value =
    error && typeof error === 'object'
      ? (error as { code?: unknown; message?: unknown; name?: unknown; status?: unknown })
      : {};
  const code = typeof value.code === 'string' ? value.code : '';
  const message = typeof value.message === 'string' ? value.message : '';
  if (Object.hasOwn(errorMessages, code)) return errorMessages[code as UserErrorCode];
  if (Object.hasOwn(authMessages, code)) return authMessages[code]!;
  if (code === '23505')
    return 'This action conflicts with an existing record. Refresh and try again.';
  if (Object.hasOwn(databaseMessages, message)) return databaseMessages[message]!;
  if (value.status === 429 || code === '429') return errorMessages.rate_limited;
  if (value.status === 401 || code === 'PGRST301') return errorMessages.auth_required;
  if (value.status === 403 || code === '42501')
    return 'You do not have permission for this action. Refresh to check your access.';
  if (
    value.name === 'FunctionsFetchError' ||
    /^(Network request failed|Failed to fetch|fetch failed)$/i.test(message)
  )
    return 'Could not reach the server. Check your internet connection and try again.';
  if (
    value.name === 'FunctionsRelayError' ||
    (typeof value.status === 'number' && value.status >= 500)
  )
    return 'The service is temporarily unavailable. Try again later.';
  if (
    error instanceof Error &&
    /^(Use |Enter |Write |Choose |Your name |Messages can |This image |Photo size )/.test(message)
  )
    return message;
  return 'Something went wrong. Try again. If it continues, contact the project maintainer.';
}
