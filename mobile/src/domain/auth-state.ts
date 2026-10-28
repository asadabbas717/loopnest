// Auth events are newer than an earlier asynchronous storage read. A late
// bootstrap/retry result must never restore a signed-out or replaced account.
export function createAuthState<T>(options: {
  onSession: (session: T | null) => void;
  onError: () => void;
}) {
  let revision = 0;
  let closed = false;
  return {
    event(session: T | null) {
      if (closed) return;
      revision++;
      options.onSession(session);
    },
    async read(load: () => Promise<{ session: T | null; error: unknown }>) {
      const started = ++revision;
      try {
        const result = await load();
        if (closed || started !== revision) return;
        if (result.error) options.onError();
        else options.onSession(result.session);
      } catch {
        if (!closed && started === revision) options.onError();
      }
    },
    close() {
      closed = true;
      revision++;
    },
  };
}
