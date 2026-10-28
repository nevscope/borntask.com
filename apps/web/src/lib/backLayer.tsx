import { createContext, useCallback, useContext, useEffect, useId, useRef, type ReactNode } from 'react';

type Layer = { id: string; close: () => boolean | void };

type Api = {
  register: (id: string, close: () => boolean | void) => void;
  release: (id: string) => void;
  dismiss: (id: string, after?: () => void) => void;
};

const BackLayerContext = createContext<Api | null>(null);

function isLayer(state: unknown, id: string) {
  return Boolean(state && typeof state === 'object' && 'btLayer' in state && (state as { btLayer: string }).btLayer === id);
}

export function BackLayerProvider({ children }: { children: ReactNode }) {
  const stack = useRef<Layer[]>([]);
  const ignore = useRef(0);

  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current -= 1;
        return;
      }
      const top = stack.current.pop();
      if (!top) return;
      const keep = top.close();
      if (keep === true) {
        stack.current.push(top);
        history.pushState({ btLayer: top.id }, '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const register = useCallback((id: string, close: () => boolean | void) => {
    const existing = stack.current.find((layer) => layer.id === id);
    if (existing) {
      existing.close = close;
      return;
    }
    stack.current.push({ id, close });
    history.pushState({ btLayer: id }, '');
  }, []);

  const release = useCallback((id: string) => {
    const index = stack.current.findIndex((layer) => layer.id === id);
    if (index === -1) return;
    const top = index === stack.current.length - 1;
    stack.current.splice(index, 1);
    if (top && isLayer(history.state, id)) {
      ignore.current += 1;
      history.back();
    }
  }, []);

  const dismiss = useCallback((id: string, after?: () => void) => {
    const index = stack.current.findIndex((layer) => layer.id === id);
    if (index === -1) {
      after?.();
      return;
    }
    const top = index === stack.current.length - 1;
    stack.current.splice(index, 1);
    if (top && isLayer(history.state, id)) {
      ignore.current += 1;
      const finish = () => {
        window.removeEventListener('popstate', finish);
        after?.();
      };
      window.addEventListener('popstate', finish);
      history.back();
      return;
    }
    after?.();
  }, []);

  return <BackLayerContext.Provider value={{ register, release, dismiss }}>{children}</BackLayerContext.Provider>;
}

/** Close this overlay on device/in-app Back before the page behind it. Return true from `close` to keep it (unsaved). */
export function useBackLayer(open: boolean, close: () => boolean | void) {
  const ctx = useContext(BackLayerContext);
  const id = useId();
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!ctx || !open) return;
    ctx.register(id, () => closeRef.current());
    return () => ctx.release(id);
  }, [ctx, id, open]);

  return {
    dismiss: (after?: () => void) => ctx?.dismiss(id, after) ?? after?.(),
  };
}
