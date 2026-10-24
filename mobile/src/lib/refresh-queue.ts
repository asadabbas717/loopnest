// One scoped read at a time. Events received during a read trigger one catch-up
// read, so an older response cannot overwrite a newer snapshot. Dispose on blur.
export function createRefreshQueue<T>(options: {
  read: () => Promise<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  delay?: number;
}) {
  let disposed = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function request() {
    if (disposed) return;
    pending = true;
    if (running || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void read();
    }, options.delay ?? 300);
  }
  async function read() {
    if (disposed) return;
    running = true;
    pending = false;
    try {
      const value = await options.read();
      if (!disposed) options.onValue(value);
    } catch (error) {
      if (!disposed) options.onError(error);
    } finally {
      running = false;
      if (pending) request();
    }
  }
  return {
    request,
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
