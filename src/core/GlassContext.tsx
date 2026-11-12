import { createContext, useContext, useCallback, useState, type RefObject } from 'react';

export type GlassHole = {
  id: string;
  element: RefObject<HTMLElement | null>;
};

export type GlassContextValue = {
  registerHole: (hole: GlassHole) => void;
  unregisterHole: (id: string) => void;
  holes: GlassHole[];
  copying?: boolean;
};

const GlassContext = createContext<GlassContextValue | null>(null);

export function useGlassParent() {
  return useContext(GlassContext);
}

export function useGlassHoles() {
  const [holes, setHoles] = useState<GlassHole[]>([]);

  const registerHole = useCallback((hole: GlassHole) => {
    setHoles(prev => {
      if (prev.some(h => h.id === hole.id)) return prev;
      return [...prev, hole];
    });
  }, []);

  const unregisterHole = useCallback((id: string) => {
    setHoles(prev => prev.filter(h => h.id !== id));
  }, []);

  return { holes, registerHole, unregisterHole };
}

export { GlassContext };
