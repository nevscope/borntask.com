import { Button, Checkbox, Popover } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { request } from '../api/http';
import { useMe, useMoveTask, useUpdateTask } from '../api/queries';
import type { TaskDetail } from '../api/types';
import { color, font, githubBadgeStyle, radius } from '../theme/tokens';
import { GitForkIcon } from './Chips';

function copy(text: string) {
  void navigator.clipboard.writeText(text);
}

function PrState({ state }: { state: string | null; checks: string | null }) {
  if (state === 'merged') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 999, background: githubBadgeStyle.merged.bg, color: githubBadgeStyle.merged.fg, fontSize: 12, fontWeight: 600 }}>
        Merged
      </span>
    );
  }
  if (state === 'open') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 9px', borderRadius: 999, background: color.brandTint, color: color.brandStrong, fontSize: 12, fontWeight: 600 }}>
        Open
      </span>
    );
  }
  return <span style={{ fontSize: 12.5, color: color.muted }}>Branch</span>;
}

function CopyBranch({ task }: { task: TaskDetail }) {
  const dev = task.development!;
  const me = useMe().data;
  const move = useMoveTask();
  const update = useUpdateTask();
  const [assign, setAssign] = useState(true);
  const [open, setOpen] = useState(false);

  async function afterCopy() {
    if (!assign) return;
    try {
      await request('POST', `/tasks/${encodeURIComponent(task.key)}/github/start-work`, null, { assignAndMove: true });
    } catch {
      if (me?.user.id) update.mutate({ key: task.key, input: { assigneeId: me.user.id } });
      move.mutate({ key: task.key, input: { toStatusId: 'wip' } });
    }
  }

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      content={
        <div role="dialog" aria-label="Start work on GitHub" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <code style={{ flex: 1, display: 'flex', alignItems: 'center', height: 36, padding: '0 10px', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.subtle, fontFamily: font.mono, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>{dev.suggestedBranch}</code>
            <Button type="primary" onClick={() => { copy(dev.suggestedBranch); void afterCopy(); }}>Copy</Button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <code style={{ flex: 1, display: 'flex', alignItems: 'center', height: 36, padding: '0 10px', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.subtle, fontFamily: font.mono, fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>{dev.gitCheckout}</code>
            <Button onClick={() => { copy(dev.gitCheckout); void afterCopy(); }}>Copy</Button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <Checkbox checked={assign} onChange={(e) => setAssign(e.target.checked)} />
            Also assign to me and move to WIP
          </label>
        </div>
      }
    >
      <Button icon={<GitForkIcon size={14} />}>Copy branch name</Button>
    </Popover>
  );
}

export function DevelopmentSection({ task }: { task: TaskDetail }) {
  const dev = task.development;
  if (!dev?.enabled) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3 style={{ flex: 1, margin: 0, fontSize: 13, fontWeight: 600, color: color.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Development</h3>
        <CopyBranch task={task} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${color.divider}`, borderRadius: 10 }}>
        {dev.links.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 13, color: color.muted }}>No branch or pull request linked yet. Copy the suggested branch name to start.</div>
        )}
        {dev.links.map((link, i) => (
          <div key={link.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '12px 14px', borderBottom: i < dev.links.length - 1 ? `1px solid ${color.divider}` : undefined }}>
            <PrState state={link.kind === 'pr' ? link.prState : null} checks={link.checks} />
            {link.url ? (
              <a href={link.url} target="_blank" rel="noreferrer" style={{ flex: '1 1 260px', color: color.ink, textDecoration: 'none', fontWeight: 500 }}>
                {link.kind === 'branch' ? <code style={{ fontFamily: font.mono, fontSize: 12.5 }}>{link.title}</code> : link.title}
              </a>
            ) : (
              <span style={{ flex: '1 1 260px' }}>{link.title}</span>
            )}
            <span style={{ fontSize: 12.5, color: color.muted }}>{[link.repo, link.author].filter(Boolean).join(' · ')}</span>
            {link.kind === 'pr' && link.prState === 'open' && link.checks && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: link.checks === 'failed' ? color.danger : link.checks === 'passed' ? color.brandStrong : color.warning }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: link.checks === 'failed' ? color.danger : link.checks === 'passed' ? color.brand : color.warning }} />
                {link.checks === 'running' || link.checks === 'pending' ? 'Checks running' : link.checks === 'passed' ? 'Checks passed' : 'Checks failed'}
              </span>
            )}
          </div>
        ))}
      </div>
      {dev.githubActivity.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.ink3 }}>Activity from GitHub</span>
          {dev.githubActivity.map((row) => (
            <span key={row.when + row.text} style={{ fontSize: 13, color: color.ink3 }}>
              <span style={{ color: color.muted }}>{dayjs(row.when).format('HH:mm')}</span>
              {' · '}
              {row.text}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
