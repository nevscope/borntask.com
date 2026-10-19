import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

function matchesPhone() {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

/** True at the phone shell breakpoint (767px and below). Desktop is 768+. */
export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(matchesPhone);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return isPhone;
}
