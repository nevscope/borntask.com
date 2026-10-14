import { Input, type InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { isTaskKey } from '../lib/search';

export function TopSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const urlQ = pathname === '/search' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQ);
  const inputRef = useRef<InputRef>(null);
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    if (pathname === '/search') setValue(params.get('q') ?? '');
  }, [pathname, params]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goSearch = (q: string) => {
    const next = q.trim();
    if (!next) {
      if (pathname === '/search') navigate('/search', { replace: true });
      return;
    }
    if (isTaskKey(next)) {
      const nextParams = new URLSearchParams(pathname === '/search' ? params : undefined);
      nextParams.set('q', next);
      nextParams.set('task', next.toUpperCase());
      navigate(`${pathname === '/search' ? '/search' : pathname}?${nextParams.toString()}`);
      return;
    }
    navigate(`/search?q=${encodeURIComponent(next)}`, { replace: pathname === '/search' });
  };

  const onChange = (next: string) => {
    setValue(next);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (next.trim().length >= 2) goSearch(next);
    }, 320);
  };

  return (
    <Input
      ref={inputRef}
      allowClear
      aria-label="Search tasks"
      placeholder="Search tasks or jump to WEB-142"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPressEnter={() => goSearch(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') inputRef.current?.blur?.();
      }}
      suffix={<kbd className="bt-kbd">{pathname === '/search' && value ? 'Esc' : '/'}</kbd>}
      style={{ flex: '1 1 280px', maxWidth: 520, background: '#FAFBF9' }}
    />
  );
}
