// Final BornTask mark (A4 refined: dot, dot, tick). Use LogoMark alone at 16–24 px.
export function LogoMark({ size = 26, small = false }: { size?: number; small?: boolean }) {
  if (small || size <= 18) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="12" fill="#178A5C" />
        <circle cx="13" cy="25.6" r="4.6" fill="#FFFFFF" />
        <path d="M22.5 25.6 L27.5 30.6 L39 17.5" fill="none" stroke="#FFFFFF" strokeWidth="6.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="13.5" fill="#178A5C" />
      <circle cx="8.75" cy="25.6" r="1.9" fill="#FFFFFF" fillOpacity="0.6" />
      <circle cx="16.05" cy="25.6" r="2.8" fill="#FFFFFF" fillOpacity="0.85" />
      <path d="M23.85 25.6 L28.25 30 L38.75 18" fill="none" stroke="#FFFFFF" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <LogoMark />
      <span style={{ fontFamily: 'var(--bt-display)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.035em', color: 'var(--bt-ink)' }}>borntask</span>
    </span>
  );
}
