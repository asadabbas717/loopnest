import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserFacingError, userErrorMessage } from '../src/domain/user-errors.ts';
import { createAccountApi } from '../src/lib/account-api.ts';

function apiResponse(status, body) {
  return createAccountApi(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          name: 'FunctionsHttpError',
          context: new Response(JSON.stringify(body), { status }),
        },
      }),
    },
  }));
}
test('deletion uses its structured wrong-password response instead of a connection warning', async () => {
  await assert.rejects(
    apiResponse(403, { code: 'wrong_password', message: 'internal diagnostics' }).deleteAccount(
      'private-password',
      'DELETE',
    ),
    (error) => {
      assert.equal(
        userErrorMessage(error),
        'Wrong password. Enter your current password and try again.',
      );
      return true;
    },
  );
});
test('deletion distinguishes session expiry, throttling and service failure without reflecting diagnostics', async () => {
  for (const [status, code] of [
    [401, 'auth_required'],
    [429, 'rate_limited'],
    [503, 'deletion_unavailable'],
  ]) {
    await assert.rejects(
      apiResponse(status, { message: 'secret diagnostic text' }).deleteAccount(
        'private-password',
        'DELETE',
      ),
      (error) => error instanceof UserFacingError && error.code === code,
    );
  }
  await assert.rejects(
    apiResponse(403, { code: 'arbitrary-secret-value', message: 'private-password' }).deleteAccount(
      'private-password',
      'DELETE',
    ),
    (error) => {
      assert.equal(error.code, 'request_forbidden');
      assert.equal(userErrorMessage(error).includes('private-password'), false);
      return true;
    },
  );
});
test('known Auth, quota and permission failures have accurate safe messages', () => {
  assert.match(userErrorMessage({ code: 'otp_expired' }), /invalid or expired/);
  assert.match(userErrorMessage({ code: 'email_not_confirmed' }), /Verify your email/);
  assert.match(userErrorMessage({ message: 'Invitation limit reached' }), /20.*per day/);
  assert.match(userErrorMessage({ message: 'Session changed', code: '42501' }), /account changed/);
  assert.match(userErrorMessage({ message: 'Invitation unavailable' }), /Check the username/);
  assert.match(userErrorMessage({ code: '42501' }), /permission/);
  assert.match(userErrorMessage({ name: 'FunctionsFetchError' }), /internet connection/);
  assert.equal(
    userErrorMessage(new Error('database credential or private message')),
    'Something went wrong. Try again. If it continues, contact the project maintainer.',
  );
});
test('mobile response objects without the global Response prototype or clone still yield the password warning', async () => {
  let reads = 0;
  const mobileResponse = {
    status: 403,
    json: async () => {
      reads++;
      return { code: 'wrong_password' };
    },
  };
  const api = createAccountApi(() => ({
    functions: {
      invoke: async () => ({
        data: null,
        error: { name: 'FunctionsHttpError', context: mobileResponse },
      }),
    },
  }));
  await assert.rejects(
    api.deleteAccount('private-password', 'DELETE'),
    (issue) => issue.code === 'wrong_password',
  );
  assert.equal(reads, 1);
  assert.match(
    userErrorMessage({ name: 'UserFacingError', code: 'wrong_password' }),
    /^Wrong password/,
  );
  assert.equal(typeof userErrorMessage({ code: 'constructor' }), 'string');
});
