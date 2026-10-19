import { ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { antdThemeFor } from './antdThemes';
import type { Appearance, ThemeMode } from './palettes';

const STORAGE_KEY = 'bt-theme';

function readAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* private mode */
  }
  return 'system';
}

function resolveMode(appearance: Appearance): ThemeMode {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

type ThemeContextValue = {
  appearance: Appearance;
  resolved: ThemeMode;
  setAppearance: (next: Appearance) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useThemePreference() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(readAppearance);
  const [resolved, setResolved] = useState<ThemeMode>(() => resolveMode(readAppearance()));

  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    try {
      localStorage.setItem(STORAGE_KEY, appearance);
    } catch {
      /* ignore */
    }
    const apply = () => setResolved(resolveMode(appearance));
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [appearance]);

  const value = useMemo<ThemeContextValue>(
    () => ({ appearance, resolved, setAppearance: setAppearanceState }),
    [appearance, resolved],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={antdThemeFor(resolved)} locale={enGB}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
