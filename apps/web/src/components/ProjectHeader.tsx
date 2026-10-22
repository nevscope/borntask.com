import { Input } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BASE_URL } from '../api/http';
import { qk, useAcceptProjectInvite, useMe, useProjects } from '../api/queries';
import type { ProjectDetail } from '../api/types';
import { color, font, radius } from '../theme/tokens';
import { Avatar, EditIcon } from './Chips';
import { InvitePeopleButton } from './InvitePeople';
import { ProjectStar } from './ProjectStar';
import { projectViewSearch } from './ProjectViewBar';
import { useStatusToast } from './StatusToast';

export function ProjectHeader({ detail }: { detail: ProjectDetail }) {
  const { project } = detail;
  const listed = useProjects().data?.find((p) => p.key === project.key);
  const starred = listed?.starred ?? project.starred;
  const people = detail.members.map((m) => detail.users.find((u) => u.id === m.userId)).filter((u) => !!u);
  const [params] = useSearchParams();
  const search = projectViewSearch(params);
  const me = useMe().data;
  const qc = useQueryClient();
  const toast = useStatusToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(project.name);
  }, [project.name, editing]);

  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const myRoles = detail.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const canRename = Boolean(canAdmin || myRoles.includes('lead') || project.leadId === me?.user.id);

  async function saveName() {
    const next = draft.trim();
    if (!canRename) {
      setEditing(false);
      setDraft(project.name);
      return;
    }
    if (savingRef.current) return;
    if (next.length < 2 || next === project.name) {
      setEditing(false);
      setDraft(project.name);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/projects/${encodeURIComponent(project.key)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      });
      const json = await res.json().catch(() => ({})) as { message?: string; name?: string };
      if (!res.ok) throw new Error(json.message ?? 'Could not rename this project.');
      setDraft(json.name ?? next);
      setEditing(false);
      void qc.invalidateQueries({ queryKey: qk.projects });
      void qc.invalidateQueries({ queryKey: qk.project(project.key) });
      void qc.invalidateQueries({ queryKey: qk.myTasks });
      void qc.invalidateQueries({ queryKey: ['search'] });
    } catch (err) {
      setDraft(project.name);
      setEditing(false);
      toast.show({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not rename this project.',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const accept = useAcceptProjectInvite();
  const pendingInvite = Boolean(project.pendingInvite || listed?.pendingInvite);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pendingInvite && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: radius.md, background: color.brandTint, color: color.ink }}>
          <span style={{ flex: 1, fontSize: 13.5 }}>You have been invited to this project. Join to add and change tasks.</span>
          <button
            type="button"
            onClick={() => {
              void accept.mutateAsync(project.key).catch((err: unknown) => {
                toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not join this project.' });
              });
            }}
            disabled={accept.isPending}
            style={{ height: 34, padding: '0 14px', border: 0, borderRadius: radius.md, background: color.brandFill, color: color.brandOn, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: accept.isPending ? 'wait' : 'pointer' }}
          >
            {accept.isPending ? 'Joining…' : 'Join project'}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ fontSize: 12.5, color: color.muted }}>Projects / {project.key}</div>
          <h1 className="bt-h1" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 12, height: 12, borderRadius: 4, background: project.color, flex: 'none' }} />
            {editing ? (
              <Input
                autoFocus
                value={draft}
                disabled={saving}
                maxLength={80}
                aria-label="Project name"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void saveName()}
                onPressEnter={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setDraft(project.name);
                    setEditing(false);
                  }
                }}
                style={{
                  fontFamily: font.display,
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: '-0.03em',
                  maxWidth: 420,
                  height: 40,
                  background: color.subtle,
                  borderRadius: radius.md,
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!canRename) return;
                  setDraft(project.name);
                  setEditing(true);
                }}
                disabled={!canRename}
                title={canRename ? 'Rename project' : undefined}
                style={{
                  margin: 0,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  letterSpacing: 'inherit',
                  textAlign: 'left',
                  cursor: canRename ? 'text' : 'default',
                  minWidth: 0,
                }}
              >
                {project.name}
              </button>
            )}
            <Link
              to={`/p/${project.key}/settings/details`}
              aria-label="Name, colour and workflow"
              title="Name, colour and workflow"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: radius.sm,
                color: color.muted,
                flex: 'none',
              }}
            >
              <EditIcon />
            </Link>
          </h1>
        </div>
        <ProjectStar projectKey={project.key} name={project.name} starred={starred} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {people.map((u, i) => (
            <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', border: `2px solid ${color.canvas}`, display: 'inline-flex' }}>
              <Avatar user={u} size={28} />
            </span>
          ))}
          <InvitePeopleButton projectId={project.id} projectName={project.name} />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, borderBottom: `1px solid ${color.border}` }}>
        {(['list', 'board', 'trash', 'members', 'structure'] as const).map((view) => (
          <NavLink
            key={view}
            to={`${view === 'members' || view === 'structure' ? `/p/${project.key}/settings/${view}` : `/p/${project.key}/${view}`}${view === 'list' || view === 'board' ? search : ''}`}
            style={({ isActive }) => ({
              height: 38,
              padding: '0 12px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 13.5,
              textDecoration: 'none',
              color: isActive ? color.ink : color.muted,
              fontWeight: isActive ? 600 : 400,
              borderBottom: isActive ? `2px solid ${color.brand}` : '2px solid transparent',
              marginBottom: -1,
            })}
          >
            {view === 'list' ? 'List' : view === 'board' ? 'Board' : view === 'trash' ? 'Trash' : view === 'members' ? 'Members' : 'Sections'}
          </NavLink>
        ))}
        <span id="bt-saved-views" style={{ display: 'contents' }} />
      </div>
    </div>
  );
}
