import type { CSSProperties, ReactNode } from 'react';
import { useIsPhone } from '../hooks/useIsPhone';

/** Desktop page h1. On phone the shell top bar is the h1; this is omitted unless `hideOnPhone` is false, in which case it stays visible as a styled div. */
export function PageHeading({
  children,
  style,
  hideOnPhone = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  hideOnPhone?: boolean;
}) {
  const isPhone = useIsPhone();
  if (isPhone && hideOnPhone) return null;
  const Tag = isPhone ? 'div' : 'h1';
  return (
    <Tag className="bt-h1" style={style}>
      {children}
    </Tag>
  );
}
