import { createContext, useMemo, type PropsWithChildren } from 'react';

export const ScrollMemory = createContext<{
  get: (path: string) => number | undefined;
  set: (path: string, offset: number) => void;
} | null>(null);

// Offsets only, never content. The keyed provider is discarded on account changes.
export function ScrollMemoryProvider({ children }: PropsWithChildren) {
  const memory = useMemo(() => {
    const offsets = new Map<string, number>();
    return {
      get: (path: string) => offsets.get(path),
      set: (path: string, offset: number) => {
        offsets.set(path, Math.max(0, offset));
        if (offsets.size > 50) offsets.delete(offsets.keys().next().value!);
      },
    };
  }, []);
  return <ScrollMemory.Provider value={memory}>{children}</ScrollMemory.Provider>;
}
