export function username(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(normalized))
    throw new Error('Use 3–24 letters, numbers or underscores, starting with a letter.');
  return normalized;
}
export function displayName(value: string) {
  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > 60)
    throw new Error('Your name must contain 1–60 characters.');
  return normalized;
}
export function credentials(email: string, password: string, register: boolean) {
  const normalized = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email.');
  if (!password || (register && password.length < 12))
    throw new Error(
      register ? 'Use at least 12 characters for your password.' : 'Enter your password.',
    );
  return { email: normalized, password };
}
export function messageText(value: string, hasPhoto: boolean) {
  const normalized = value.trim();
  if (!normalized && !hasPhoto) throw new Error('Write a message or choose a photo.');
  if (Array.from(normalized).length > 4000)
    throw new Error('Messages can contain up to 4,000 characters.');
  return normalized;
}
export function uuid(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error('Invalid conversation.');
  return value;
}
