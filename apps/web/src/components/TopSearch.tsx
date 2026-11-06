import { Input, type InputRef } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '../api/queries';
import { recordRecentSearch, useRecentSearches } from '../lib/recentSearches';
import { isTaskKey } from '../lib/search';
import { color, radius } from '../theme/tokens';

export function TopSearch() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const workspaceId = useMe().data?.workspace.id;
  const recent = useRecentSearches(workspaceId);
  const urlQ = pathname === '/search' ? (params.get('q') ?? '') : '';
  const [value, setValue] = useState(urlQ);
  const [open, setOpen] = useState(false);
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
    if (workspaceId) recordRecentSearch(workspaceId, next);
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

  const suggestions = value.trim()
    ? recent.filter((item) => item.toLowerCase().includes(value.trim().toLowerCase()) && item.toLowerCase() !== value.trim().toLowerCase())
    : recent;

  return (
    <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 520 }}>
      <Input
        ref={inputRef}
        allowClear
        aria-label="Search tasks"
        placeholder="Search tasks or jump to a task key"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onPressEnter={() => goSearch(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') inputRef.current?.blur?.();
        }}
        suffix={<kbd className="bt-kbd">{pathname === '/search' && value ? 'Esc' : '/'}</kbd>}
        styles={{
          root: { width: '100%', height: 38, padding: '0 12px', background: color.subtle, borderRadius: radius.md, fontSize: 13.5 },
          input: { fontSize: 13.5 },
        }}
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Recent searches"
          style={{
            position: 'absolute',
            top: 42,
            left: 0,
            right: 0,
            zIndex: 20,
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.lg,
            boxShadow: color.shadow,
            overflow: 'hidden',
          }}
        >
          <div className="bt-nav-heading" style={{ padding: '10px 12px 6px' }}>Recent searches</div>
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(item);
                setOpen(false);
                goSearch(item);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                border: 0,
                background: 'transparent',
                color: color.ink,
                textAlign: 'left',
                font: 'inherit',
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
