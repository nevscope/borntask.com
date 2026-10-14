import { useSetFavourite } from '../api/queries';
import { color } from '../theme/tokens';

export function ProjectStar({ projectKey, name, starred }: { projectKey: string; name: string; starred: boolean }) {
  const star = useSetFavourite();
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${name}` : `Star ${name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        star.mutate({ key: projectKey, starred: !starred });
      }}
      style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: starred ? color.brand : color.faint, cursor: 'pointer', flex: 'none' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.2l2.6 5.4 5.9.7-4.4 4 1.2 5.8L12 16.4 6.7 19.1l1.2-5.8-4.4-4 5.9-.7z" />
      </svg>
    </button>
  );
}
