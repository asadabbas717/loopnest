type Protection = {
  prevent: () => Promise<void>;
  allow: () => Promise<void>;
  enableOverlay: () => Promise<void>;
  disableOverlay: () => Promise<void>;
};
// Serialize native transitions and retain protection across overlapping mounts
// (including Strict Mode). An old cleanup cannot unprotect a new owner.
export function createScreenProtection(deps: Protection) {
  let owners = 0;
  let queue = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  return {
    acquire() {
      owners++;
      let released = false;
      const ready = enqueue(async () => {
        await deps.prevent();
        await deps.enableOverlay();
      });
      return {
        ready,
        release() {
          if (released) return queue;
          released = true;
          owners--;
          return enqueue(async () => {
            if (owners === 0) {
              await deps.disableOverlay();
              await deps.allow();
            }
          });
        },
      };
    },
  };
}
