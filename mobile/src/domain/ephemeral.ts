// Anchor expiry to server time and monotonic elapsed time, conservatively
// subtracting the entire round trip. Phone wall-clock changes cannot extend it.
export function expirationDeadline(
  expires: string | null,
  server: string,
  started: number,
  received: number,
): number | undefined {
  if (expires === null) return undefined;
  const remaining = Date.parse(expires) - Date.parse(server) - Math.max(0, received - started);
  return Number.isFinite(remaining) ? received + Math.max(0, remaining) : received;
}
