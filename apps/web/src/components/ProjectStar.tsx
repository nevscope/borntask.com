import { useSetFavourite } from '../api/queries';
import { color } from '../theme/tokens';

export function ProjectStar({ projectKey, name, starred, compact = false }: { projectKey: string; name: string; starred: boolean; compact?: boolean }) {
  const star = useSetFavourite();
  const size = compact ? 24 : 32;
  return (
    <button
      type="button"
      className={`bt-project-star${starred ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}
      aria-pressed={starred}
      aria-label={starred ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        star.mutate({ key: projectKey, starred: !starred });
      }}
      style={{ width: size, height: size, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: starred ? color.brand : color.faint, cursor: 'pointer', flex: 'none' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.2l2.6 5.4 5.9.7-4.4 4 1.2 5.8L12 16.4 6.7 19.1l1.2-5.8-4.4-4 5.9-.7z" />
      </svg>
    </button>
  );
}
