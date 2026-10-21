export function backendConfiguration(input: {
  url: string;
  key: string;
  allowLocal: boolean;
  development: boolean;
}) {
  const publishable =
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(input.key) && !input.key.includes('REPLACE_ME');
  const hosted = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(input.url);
  if (hosted && publishable && !input.allowLocal) return 'hosted' as const;
  const local = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2):54321$/.test(input.url);
  if (!input.development || !input.allowLocal || !local) return null;
  if (publishable) return 'local' as const;
  // This only rejects accidental admin keys. GoTrue/PostgREST still verify JWTs.
  // Legacy anon keys are accepted exclusively for an explicitly enabled local debug backend.
  try {
    const parts = input.key.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (payload && typeof payload === 'object' && 'role' in payload && payload.role === 'anon')
      return 'local' as const;
  } catch {
    /* Fail closed for malformed local configuration. */
  }
  return null;
}
