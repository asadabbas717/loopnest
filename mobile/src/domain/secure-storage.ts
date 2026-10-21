export type Vault = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// All pieces remain in the native encrypted vault. No plaintext fallback.
// Versioned manifests commit last, so an interrupted write cannot mix sessions.
export function createSessionStorage(vault: Vault, randomId: () => string) {
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  const manifest = async (key: string) => {
    const value = await vault.getItem(key);
    if (!value) return null;
    const result: unknown = JSON.parse(value);
    if (
      !result ||
      typeof result !== 'object' ||
      !('version' in result) ||
      !('count' in result) ||
      typeof result.version !== 'string' ||
      !/^[a-zA-Z0-9-]+$/.test(result.version) ||
      typeof result.count !== 'number' ||
      !Number.isInteger(result.count) ||
      result.count < 1 ||
      result.count > 256
    )
      throw new Error('Invalid stored session.');
    return { version: result.version, count: result.count };
  };
  const clean = async (key: string, previous: { version: string; count: number } | null) => {
    if (previous)
      for (let i = 0; i < previous.count; i++)
        await vault.removeItem(`${key}.${previous.version}.${i}`);
  };
  return {
    getItem: (key: string) =>
      serialize(async () => {
        const current = await manifest(key);
        if (!current) return null;
        let result = '';
        for (let i = 0; i < current.count; i++) {
          const part = await vault.getItem(`${key}.${current.version}.${i}`);
          if (part === null) throw new Error('Incomplete stored session.');
          result += part;
        }
        return result;
      }),
    setItem: (key: string, value: string) =>
      serialize(async () => {
        if (!value || value.length > 100000) throw new Error('Session size is unsupported.');
        const previous = await manifest(key);
        const version = randomId();
        // <=1600 UTF-8 bytes per chunk, below native 2 KiB value constraints.
        const characters = Array.from(value);
        const parts: string[] = [];
        for (let i = 0; i < characters.length; i += 400)
          parts.push(characters.slice(i, i + 400).join(''));
        if (parts.length > 256) throw new Error('Session size is unsupported.');
        try {
          for (const [i, part] of parts.entries())
            await vault.setItem(`${key}.${version}.${i}`, part);
          await vault.setItem(key, JSON.stringify({ version, count: parts.length }));
        } catch (error) {
          await clean(key, { version, count: parts.length }).catch(() => undefined);
          throw error;
        }
        await clean(key, previous);
      }),
    removeItem: (key: string) =>
      serialize(async () => {
        const previous = await manifest(key);
        await vault.removeItem(key);
        await clean(key, previous);
      }),
  };
}
