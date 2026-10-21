import { Button } from 'antd';
import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useMe, useMoveTask, useMyTasks, useProject, useProjectTasks, useProjects } from '../api/queries';
import type { BuiltinProjectRole, Task } from '../api/types';
import { StatusPill, TypeTag } from './Chips';
import { useQuickAdd } from './QuickAdd';
import { useTaskParam } from './useTaskParam';
import { readWelcome } from '../lib/welcome';
import { statusById } from '../lib/workflow';
import { categoryBar, color, font, roleStyle } from '../theme/tokens';

function firstName(name: string | undefined) {
  return name?.trim().split(/\s+/)[0] || 'there';
}

export function MemberEmpty() {
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false);
  const quickAdd = useQuickAdd();
  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '44px 24px', background: color.surface, border: `1px solid ${color.border}`, borderRadius: 14 }}>
        <svg width="150" height="56" viewBox="0 0 260 96" aria-hidden="true">
          <circle cx="24" cy="56" r="9" fill={color.brand} opacity="0.25" />
          <circle cx="72" cy="56" r="14" fill={color.brand} opacity="0.45" />
          <path d="M124 56 L156 86 L236 12" fill="none" stroke={color.brand} strokeOpacity="0.7" strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 style={{ margin: '4px 0 0', fontFamily: font.display, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}>Nothing assigned to you yet</h2>
        <p style={{ margin: 0, maxWidth: 460, fontSize: 14, lineHeight: 1.5, color: color.ink3 }}>
          When someone assigns you a task, it lands here, sorted by what is due first. Meanwhile, have a look around the projects you can open.
        </p>
        <Button type="primary" onClick={() => quickAdd.open()} style={{ marginTop: 6 }}>
          Create your first task <kbd className="bt-kbd" style={{ marginLeft: 6, background: 'transparent', color: color.brandOn, borderColor: color.brandOnMuted }}>Q</kbd>
        </Button>
      </section>
      {projects.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Projects you can open</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {projects.map((p) => (
              <Link key={p.key} to={`/p/${p.key}/list`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 12, color: color.ink, textDecoration: 'none' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: color.chip, color: color.ink3, fontSize: 10.5, fontWeight: 600 }}>{p.key}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 12.5, color: color.muted }}>{p.openCount} open{p.leadName ? ` · ${p.leadName}` : ''}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: color.muted }}>
        <span><kbd className="bt-kbd">Q</kbd> new task</span>
        <span><kbd className="bt-kbd">/</kbd> search</span>
        <span><kbd className="bt-kbd">Ctrl K</kbd> do anything</span>
      </div>
    </>
  );
}

export function GuestWelcome() {
  const me = useMe().data;
  const stored = readWelcome();
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false);
  const projectKey = stored?.projectKey || projects[0]?.key || '';
  const detail = useProject(projectKey).data;
  const taskQuery = useProjectTasks(projectKey);
  const approvals = useMyTasks().data?.approvals ?? [];
  const move = useMoveTask();
  const { openTask } = useTaskParam();
  const project = detail?.project ?? projects.find((p) => p.key === projectKey);
  const roleSlug = stored?.projectRole;
  const role = roleSlug && roleSlug in roleStyle ? roleStyle[roleSlug as BuiltinProjectRole].label : 'a guest';
  const projectName = stored?.projectName || project?.name || 'your project';
  const ideas = (taskQuery.data ?? []).filter((t) => t.statusId === 'idea');
  const waiting = approvals.length ? approvals : ideas;
  const progress = (taskQuery.data ?? []).filter((t) => {
    const status = detail ? statusById(detail.workflow, t.statusId) : undefined;
    return t.statusId !== 'idea' && status?.category !== 'done';
  });
  const business = roleSlug === 'business' || roleSlug === 'lead';
  const [cardOpen, setCardOpen] = useState(true);

  const approve = (t: Task) => move.mutate({ key: t.key, input: { toStatusId: 'approved' } });

  return (
    <div className="bt-page" style={{ maxWidth: 1100, margin: '0 auto', width: '100%', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12.5, color: color.muted }}>{project?.key ?? 'Project'}</div>
        <h1 className="bt-h1" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: project?.color ?? categoryBar.done }} />
          {projectName}
        </h1>
      </div>
      {cardOpen && (
      <section aria-label="Welcome" style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start', padding: '20px 22px', border: `1px solid ${color.brandBorder}`, borderRadius: 14, background: color.brandTint }}>
        <svg width="56" height="56" viewBox="0 0 48 48" aria-hidden="true" style={{ flex: 'none' }}>
          <rect width="48" height="48" rx="13.5" fill={color.brand} />
          <circle cx="8.75" cy="25.6" r="1.9" fill={color.surface} opacity="0.6" />
          <circle cx="16.05" cy="25.6" r="2.8" fill={color.surface} opacity="0.85" />
          <path d="M23.85 25.6 L28.25 30 L38.75 18" fill="none" stroke={color.surface} strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 28 }}>
          <h2 style={{ margin: 0, fontFamily: font.display, fontSize: 19, fontWeight: 600, letterSpacing: '-0.02em' }}>Welcome, {firstName(me?.user.name)}. You're in.</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: color.ink2, maxWidth: 640 }}>
            {business
              ? <>You joined <strong>{projectName}</strong> as <strong>{role}</strong>. You can raise ideas, approve them for the team, and follow every task through to deployed.</>
              : <>You joined <strong>{projectName}</strong> as <strong>{role}</strong>. You only see the projects you were invited to, and you can follow the work through to deployed.</>}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span style={tip}><kbd className="bt-kbd">Q</kbd> Add an idea from anywhere</span>
            {business && <span style={tip}><span style={{ width: 8, height: 8, borderRadius: '50%', background: categoryBar.active }} /> Approve ideas to send them to the developers</span>}
            <span style={tip}><strong>@</strong> Mention someone in a comment to ask them</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {waiting.length > 0 && (
              <a href="#approvals" style={{ display: 'inline-flex', alignItems: 'center', height: 36, padding: '0 14px', borderRadius: 8, background: color.brand, color: color.surface, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
                Review {waiting.length} {waiting.length === 1 ? 'idea' : 'ideas'} waiting for you
              </a>
            )}
            <button type="button" onClick={() => setCardOpen(false)} style={{ height: 36, padding: '0 14px', border: `1px solid ${color.brandBorder}`, borderRadius: 8, background: color.surface, font: 'inherit', fontSize: 13.5, color: color.brandStrong, cursor: 'pointer' }}>Got it</button>
          </div>
        </div>
        <button type="button" aria-label="Dismiss welcome" onClick={() => setCardOpen(false)} style={{ position: 'absolute', top: 10, right: 10, width: 34, height: 34, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: color.ink3, cursor: 'pointer' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </section>
      )}
      <section id="approvals" className="bt-card">
        <div className="bt-group-head" style={{ color: roleStyle.business.fg }}>Waiting for your approval <span style={{ fontWeight: 500, color: color.muted }}>{waiting.length}</span></div>
        {waiting.length === 0 && <p style={{ margin: 0, padding: '0 16px 14px', color: color.muted }}>Nothing is waiting for you.</p>}
        {waiting.map((t) => (
          <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
            <span className="bt-key">{t.key}</span>
            <button type="button" className="bt-row-title" onClick={() => openTask(t.key)}>{t.title}</button>
            <TypeTag type="idea" />
            <Button size="small" type="primary" loading={move.isPending && move.variables?.key === t.key} onClick={() => approve(t)}>Approve</Button>
            <Button size="small" onClick={() => openTask(t.key)}>Reject</Button>
          </div>
        ))}
      </section>
      <section className="bt-card">
        <div className="bt-group-head">
          In progress <span style={{ fontWeight: 500, color: color.muted }}>{progress.length}</span>
          {project && <Link to={`/p/${project.key}/board`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500 }}>Open board</Link>}
        </div>
        {progress.length === 0 && <p style={{ margin: 0, padding: '0 16px 14px', color: color.muted }}>No work in progress yet.</p>}
        {progress.map((t) => (
          <div key={t.key} className="bt-row" style={{ paddingLeft: 16 }}>
            <span className="bt-key">{t.key}</span>
            <button type="button" className="bt-row-title" onClick={() => openTask(t.key)}>{t.title}</button>
            <TypeTag type={t.type} />
            {detail && <StatusPill status={statusById(detail.workflow, t.statusId)} />}
          </div>
        ))}
      </section>
    </div>
  );
}

const tip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  background: color.surface,
  border: `1px solid ${color.brandBorder}`,
  fontSize: 13,
};
