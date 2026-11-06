import type { CSSProperties, ReactNode } from 'react';
import { useIsPhone } from '../hooks/useIsPhone';

/** Visible h1 on desktop. On phone the shell top bar is the heading, so this is omitted. */
export function PageHeading({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const isPhone = useIsPhone();
  if (isPhone) return null;
  return (
    <h1 className="bt-h1" style={style}>
      {children}
    </h1>
  );
}
