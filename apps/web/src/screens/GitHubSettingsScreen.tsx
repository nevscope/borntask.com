import { Button, Input, Modal, Select, Switch } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useGithubSettings, useMe, useSaveGithub } from '../api/queries';
import { SettingsFrame } from '../components/SettingsNav';
import { color, font, toneStyle } from '../theme/tokens';

const RULE_ROWS: { key: 'branchCreated' | 'prOpened' | 'draftPr' | 'prMerged' | 'prClosedUnmerged'; when: string; to: string; tone: keyof typeof toneStyle | 'dashed' }[] = [
  { key: 'branchCreated', when: 'Branch created', to: 'WIP', tone: 'blue' },
  { key: 'prOpened', when: 'Pull request opened', to: 'Ready for testing', tone: 'amber' },
  { key: 'draftPr', when: 'Draft pull request', to: 'No change', tone: 'dashed' },
  { key: 'prMerged', when: 'Pull request merged', to: 'Ready for testing (if not yet)', tone: 'amber' },
  { key: 'prClosedUnmerged', when: 'Pull request closed unmerged', to: 'Comment only', tone: 'dashed' },
];

function eventColor(tone: string) {
  if (tone === 'brand') return color.brandStrong;
  if (tone === 'warning') return color.warning;
  return color.ink3;
}

export function GitHubSettingsScreen() {
  const { projectKey = '' } = useParams();
  const me = useMe().data;
  const github = useGithubSettings(projectKey);
  const save = useSaveGithub(projectKey);
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const data = github.data;
  const canManage = Boolean(data?.canManage);
  const [template, setTemplate] = useState('{type}/{key}-{title}');
  const [addOpen, setAddOpen] = useState(false);
  const [addRepo, setAddRepo] = useState<string | null>(null);

  useEffect(() => {
    if (data?.branchTemplate) setTemplate(data.branchTemplate);
  }, [data?.branchTemplate]);

  const linked = new Set(data?.repos.map((r) => r.name) ?? []);
  const toAdd = (data?.availableRepos ?? []).filter((r) => !linked.has(r.name));

  return (
    <SettingsFrame projectKey={projectKey} canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <h1 className="bt-h1">GitHub</h1>
      <p style={{ color: color.muted, margin: '6px 0 0' }}>Link branches, pull requests and commits to tasks, and move tasks automatically as code moves.</p>

      <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: color.ink, color: color.surface, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>GH</span>
        {data?.connected ? (
          <>
            <span style={{ flex: '1 1 280px' }}>
              <span style={{ display: 'block', fontWeight: 600 }}>
                Connected to the GitHub organisation <span style={{ fontFamily: font.mono, fontSize: 13 }}>{data.accountLogin}</span>
              </span>
              <span style={{ fontSize: 13, color: color.muted }}>
                BornTask GitHub App · installed by {data.installedByName ?? 'a teammate'} · access to {data.repoAccessCount} {data.repoAccessCount === 1 ? 'repository' : 'repositories'}
              </span>
            </span>
            {data.receivingEvents && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 999, background: color.brandTint, color: color.brandStrong, fontSize: 12.5, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.brand }} />
                Receiving events
              </span>
            )}
            {data.manageUrl && (
              <Button href={data.manageUrl} target="_blank">Manage on GitHub</Button>
            )}
          </>
        ) : (
          <>
            <span style={{ flex: '1 1 280px' }}>
              <span style={{ display: 'block', fontWeight: 600 }}>GitHub App is not installed yet</span>
              <span style={{ fontSize: 13, color: color.muted }}>When it is, branches and pull requests that mention a task key such as {projectKey}-142 will link here.</span>
            </span>
            <Button
              type="primary"
              disabled={!data?.appConfigured || !canManage}
              onClick={() => {
                window.location.href = `${BASE_URL}${data?.installPath ?? `/github/install?project=${encodeURIComponent(projectKey)}`}`;
              }}
            >
              Install GitHub App
            </Button>
          </>
        )}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 340px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Repositories for this project</h2>
            {canManage && data?.connected && (
              <Button type="link" onClick={() => setAddOpen(true)} style={{ height: 30, fontWeight: 600 }}>+ Add</Button>
            )}
          </div>
          {(data?.repos ?? []).map((repo) => (
            <div key={repo.name} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
              <span style={{ flex: 1, fontFamily: font.mono, fontSize: 13 }}>{repo.name}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>default branch {repo.defaultBranch}</span>
              {canManage && (
                <Button type="link" onClick={() => save.mutate({ removeRepo: repo.name })}>Remove</Button>
              )}
            </div>
          ))}
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>How tasks are recognised</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: color.ink3 }}>
              Any branch, PR title or commit containing <code style={{ fontFamily: font.mono, fontSize: 12.5, padding: '1px 6px', borderRadius: 5, background: color.chip }}>{projectKey}-142</code> links to that task.
            </span>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
              Suggested branch name
              <Input
                value={template}
                disabled={!canManage}
                onChange={(e) => setTemplate(e.target.value)}
                onBlur={() => {
                  if (template !== data?.branchTemplate) save.mutate({ branchTemplate: template });
                }}
                style={{ fontFamily: font.mono, fontSize: 13 }}
              />
              <span style={{ fontWeight: 400, fontSize: 12.5, color: color.muted }}>
                Example: <code style={{ fontFamily: font.mono }}>{data?.exampleBranch ?? `bug/${projectKey}-142-checkout-fails-on-safari-17`}</code>
              </span>
            </label>
          </div>
        </section>

        <section className="bt-card" style={{ flex: '1.3 1 420px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 600 }}>Move tasks automatically</h2>
            <span style={{ fontSize: 12.5, color: color.muted }}>Only forward, never back past Testing</span>
          </div>
          {RULE_ROWS.map((row) => {
            const on = data?.rules[row.key] ?? row.key !== 'draftPr';
            const dot = row.tone === 'dashed' ? color.dashed : toneStyle[row.tone].dot;
            return (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) 20px minmax(150px, 1fr) 52px', gap: 10, alignItems: 'center', minHeight: 52, padding: '0 16px', borderBottom: `1px solid ${color.divider}` }}>
                <span style={{ fontSize: 13.5 }}>{row.when}</span>
                <span aria-hidden="true" style={{ color: color.muted }}>→</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                  {row.to}
                </span>
                <Switch
                  size="small"
                  checked={on}
                  disabled={!canManage}
                  onChange={(checked) => data && save.mutate({ rules: { ...data.rules, [row.key]: checked } })}
                />
              </div>
            );
          })}
          <div style={{ padding: '12px 16px', fontSize: 12.5, color: color.muted, lineHeight: 1.5 }}>
            Automatic moves skip role checks but are logged as "via GitHub". A move into Testing or Deployed is never automatic; a Tester still decides.
          </div>
        </section>
      </div>

      <section className="bt-card">
        <h2 style={{ margin: 0, padding: '14px 16px', fontSize: 15, fontWeight: 600, borderBottom: `1px solid ${color.divider}` }}>Recent events</h2>
        {(data?.events ?? []).length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: 13.5, color: color.muted }}>Events appear here once the GitHub App is installed and a linked repository receives a push or pull request.</div>
        )}
        {(data?.events ?? []).map((event) => (
          <div key={event.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', minHeight: 44, padding: '6px 16px', borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
            <span style={{ width: 64, fontSize: 12.5, color: color.muted }}>{new Date(event.when).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ flex: '1 1 320px' }}>{event.text}</span>
            <span style={{ fontSize: 12.5, color: eventColor(event.tone), fontWeight: 600 }}>{event.result}</span>
          </div>
        ))}
      </section>

      <Modal
        title="Add a repository"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => {
          if (addRepo) save.mutate({ addRepo });
          setAddOpen(false);
        }}
        okButtonProps={{ disabled: !addRepo }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder={toAdd.length ? 'Choose a repository' : 'No further repositories on this install'}
          value={addRepo}
          onChange={setAddRepo}
          options={toAdd.map((r) => ({ value: r.name, label: r.name }))}
        />
      </Modal>
    </SettingsFrame>
  );
}
