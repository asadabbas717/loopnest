import { createContext, useMemo, type PropsWithChildren } from 'react';
import type { ScrollPosition } from '../domain/scroll-intent';

export const ScrollMemory = createContext<{
  get: (path: string) => ScrollPosition | undefined;
  set: (path: string, position: ScrollPosition) => void;
} | null>(null);

// Offsets only, never content. The keyed provider is discarded on account changes.
export function ScrollMemoryProvider({ children }: PropsWithChildren) {
  const memory = useMemo(() => {
    const offsets = new Map<string, ScrollPosition>();
    return {
      get: (path: string) => offsets.get(path),
      set: (path: string, position: ScrollPosition) => {
        offsets.set(path, { offset: Math.max(0, position.offset), atEnd: position.atEnd });
        if (offsets.size > 50) offsets.delete(offsets.keys().next().value!);
      },
    };
  }, []);
  return <ScrollMemory.Provider value={memory}>{children}</ScrollMemory.Provider>;
}
