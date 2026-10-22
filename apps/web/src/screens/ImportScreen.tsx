import { Alert, Button, Input, Progress, Select, Upload } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatImportError, guessImportStatusSlug } from '@borntask/shared';
import { BASE_URL } from '../api/http';
import { useImportProgress, useProject, useProjects } from '../api/queries';
import type { WorkflowStatus } from '../api/types';
import { color } from '../theme/tokens';

const XLSX_MESSAGE = 'Save the Asana export as CSV for now. XLSX parsing is not bundled yet.';

const FIELDS = [
  { value: 'skip', label: 'Skip' },
  { value: 'asanaTaskId', label: 'Asana ID (for re-imports)' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'assigneeEmail', label: 'Assignee' },
  { value: 'section', label: 'Section' },
  { value: 'status', label: 'Status (see right)' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'startDate', label: 'Start date' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'completedAt', label: 'Completed date' },
  { value: 'updatedAt', label: 'Last modified' },
  { value: 'labels', label: 'Labels (tags)' },
  { value: 'type', label: 'Task type' },
  { value: 'parentAsanaId', label: 'Parent task (subtask)' },
];

const STEPS = ['Upload', 'Map columns', 'Preview', 'Import'] as const;

type ImportState = {
  id: string;
  fileName: string;
  projectKey: string;
  rowsTotal: number;
  headers: string[];
  mapping: Record<string, string>;
  preview: Record<string, string>[];
  unknownEmails: string[];
  matchedEmailCount?: number;
  sectionValues?: { name: string; n: number }[];
  statusValues?: { name: string; n: number }[];
  status?: string;
  rowsDone?: number;
  errors?: unknown;
  phase?: string;
};

export function ImportScreen() {
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false);
  const [projectKey, setProjectKey] = useState('');
  const [job, setJob] = useState<ImportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sectionsAs, setSectionsAs] = useState<'sections' | 'statuses'>('statuses');
  const [showPreview, setShowPreview] = useState(false);
  const [asanaProject, setAsanaProject] = useState('');
  const [asanaToken, setAsanaToken] = useState('');

  const step = !job ? 0 : job.status === 'running' ? 3 : showPreview ? 2 : 1;
  const destKey = job?.projectKey || projectKey;
  const project = projects.find((p) => p.key === destKey);
  const detail = useProject(job?.projectKey ?? projectKey).data;
  const stages = detail?.workflow.statuses ?? [];
  const progress = useImportProgress(job?.id, job?.status === 'running');

  useEffect(() => {
    const next = progress.data;
    if (!next || !job) return;
    if (next.status === job.status && next.rowsDone === job.rowsDone && next.rowsTotal === job.rowsTotal && next.phase === job.phase) return;
    setJob({ ...job, status: next.status, rowsDone: next.rowsDone, rowsTotal: next.rowsTotal, errors: next.errors, phase: next.phase });
  }, [progress.data, job]);

  const pickFile = (file: File) => {
    if (!projectKey) {
      setError('Choose a project first.');
      return false;
    }
    if (file.name.toLowerCase().endsWith('.xlsx') || file.type.includes('spreadsheet')) {
      setError(XLSX_MESSAGE);
      return false;
    }
    void upload(file).catch((e: Error) => setError(e.message));
    return false;
  };

  const upload = async (file: File) => {
    setError(null);
    const body = new FormData();
    body.append('file', file);
    body.append('projectKey', projectKey);
    const res = await fetch(`${BASE_URL}/imports?projectKey=${encodeURIComponent(projectKey)}`, {
      method: 'POST',
      credentials: 'include',
      body,
    });
    const json = await res.json() as ImportState & { message?: string };
    if (!res.ok) throw new Error(json.message ?? 'Upload failed');
    setJob(json);
    setProjectKey(json.projectKey);
    setShowPreview(false);
  };

  const saveAndRun = async () => {
    if (!job) return;
    if (!destKey) {
      setError('Choose a project first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetch(`${BASE_URL}/imports/${job.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: job.mapping, sectionsAs, projectKey: destKey }),
      });
      const res = await fetch(`${BASE_URL}/imports/${job.id}/run`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Could not start import');
      setJob({ ...job, status: 'running' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const startAsana = async () => {
    if (!projectKey) {
      setError('Choose a project first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/imports/asana`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectKey,
          asanaProject,
          token: asanaToken,
          sectionsAs,
        }),
      });
      const json = await res.json() as ImportState & { message?: string };
      if (!res.ok) throw new Error(json.message ?? 'Could not start the Asana migration.');
      setAsanaToken('');
      setJob(json);
      setProjectKey(json.projectKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Asana migration.');
    } finally {
      setBusy(false);
    }
  };

  const apiJob = Boolean(job && (job.headers.length === 0 || job.fileName.startsWith('Asana')));

  return (
    <div className="bt-page" style={{ maxWidth: 1160, margin: '0 auto', width: '100%', gap: 20, paddingTop: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 className="bt-h1" style={{ flex: 1 }}>Import from Asana</h1>
        <Link to="/projects"><Button>Cancel</Button></Link>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px 0 6px', borderRadius: 999,
                background: current ? color.ink : done ? color.brandTint : color.surface,
                color: current ? color.surface : done ? color.brandStrong : color.ink3,
                fontWeight: current || done ? 600 : 400,
                border: current || done ? 0 : `1px solid ${color.border}`,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: current ? color.surface : done ? color.brand : color.chip,
                color: current ? color.ink : done ? color.surface : color.ink3,
                fontSize: 12,
              }}
              >
                {i + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      {error && <Alert type="error" message={error} />}
      {!job && (
        <>
          <section className="bt-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Asana account</h2>
            <p style={{ margin: 0, fontSize: 13, color: color.ink3, lineHeight: 1.5 }}>
              Pulls tasks, descriptions, subtasks, comments and Asana activity. Create a personal access token in Asana under Settings, Apps, then Developer tools. The token is used for this job only and is not stored.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <Select
                style={{ minWidth: 280 }}
                placeholder="Choose a BornTask project"
                value={projectKey || null}
                allowClear
                onChange={(key) => setProjectKey(key ?? '')}
                options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
              />
              <Input
                style={{ minWidth: 320, flex: 1 }}
                placeholder="Asana project URL or ID"
                value={asanaProject}
                onChange={(e) => setAsanaProject(e.target.value)}
              />
            </div>
            <Input.Password
              placeholder="Asana personal access token"
              value={asanaToken}
              onChange={(e) => setAsanaToken(e.target.value)}
              autoComplete="off"
            />
            <div>
              <Button type="primary" loading={busy} disabled={!projectKey || !asanaProject.trim() || asanaToken.trim().length < 8} onClick={() => void startAsana()}>
                Start Asana migration
              </Button>
            </div>
          </section>
          <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: color.muted, width: '100%' }}>Or upload an Asana CSV. Comments and activity are not in that file.</span>
            <Select
              style={{ minWidth: 280 }}
              placeholder="Choose a project"
              value={projectKey || null}
              allowClear
              onChange={(key) => setProjectKey(key ?? '')}
              options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
            />
            <Upload accept=".csv,.tsv,.txt" showUploadList={false} disabled={!projectKey} beforeUpload={pickFile}>
              <Button disabled={!projectKey}>Choose CSV</Button>
            </Upload>
          </section>
        </>
      )}
      {job && !apiJob && (
        <>
          <section className="bt-card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: color.brandTint, color: color.brandStrong, fontSize: 11, fontWeight: 600 }}>{job.fileName.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'CSV'}</span>
            <span style={{ flex: '1 1 260px' }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{job.fileName}</span>
              <span style={{ fontSize: 12.5, color: color.muted }}>{job.rowsTotal} rows · {job.headers.length} columns</span>
            </span>
            <Select
              style={{ minWidth: 280 }}
              placeholder="Choose a project"
              value={destKey || null}
              disabled={job.status === 'running' || job.status === 'done'}
              onChange={(key) => {
                const next = key ?? '';
                setProjectKey(next);
                setJob({ ...job, projectKey: next });
              }}
              options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
            />
            <Upload accept=".csv,.tsv,.txt" showUploadList={false} beforeUpload={pickFile}>
              <Button>Replace file</Button>
            </Upload>
          </section>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
            <section className="bt-card" style={{ flex: '999 1 560px', minWidth: 0 }}>
              <div className="bt-group-head" style={{ height: 'auto', padding: '14px 16px' }}>
                <h2 style={{ flex: 1, margin: 0, fontSize: 15 }}>Columns</h2>
                <span style={{ fontSize: 12.5, color: color.muted, fontWeight: 400 }}>{job.headers.filter((h) => (job.mapping[h] ?? 'skip') !== 'skip').length} matched · {job.headers.filter((h) => (job.mapping[h] ?? 'skip') === 'skip').length} to check</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px 210px minmax(0, 1fr)', gap: 12, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: color.muted, borderBottom: `1px solid ${color.divider}` }}>
                <span>Asana column</span><span>BornTask field</span><span>Example from row 1</span>
              </div>
              {job.headers.map((header) => {
                const field = job.mapping[header] ?? 'skip';
                const warn = field === 'skip';
                return (
                  <div key={header} style={{ display: 'grid', gridTemplateColumns: '180px 210px minmax(0, 1fr)', gap: 12, alignItems: 'center', minHeight: 46, padding: '0 16px', borderBottom: `1px solid ${color.divider}`, background: warn ? color.warningTint : color.surface }}>
                    <span style={{ fontWeight: 500 }}>{header}</span>
                    <Select
                      style={{ width: '100%' }}
                      value={field}
                      options={FIELDS}
                      onChange={(next) => setJob({ ...job, mapping: { ...job.mapping, [header]: next } })}
                    />
                    <span style={{ fontSize: 13, color: color.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.preview[0]?.[header] || '-'}</span>
                  </div>
                );
              })}
            </section>
            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {hasMapped(job.mapping, 'section') && (
              <section className="bt-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>Asana sections become</h2>
                <div role="group" aria-label="Asana sections become" style={{ display: 'flex', padding: 3, border: `1px solid ${color.border}`, borderRadius: 9 }}>
                  {(['sections', 'statuses'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={sectionsAs === v}
                      onClick={() => setSectionsAs(v)}
                      style={{
                        flex: 1, height: 30, border: 0, borderRadius: 6,
                        background: sectionsAs === v ? color.ink : 'transparent',
                        color: sectionsAs === v ? color.surface : color.ink3,
                        font: 'inherit', fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      {v === 'sections' ? 'Sections' : 'Statuses'}
                    </button>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
                  {sectionsAs === 'statuses'
                    ? 'Section or column names from Asana are mapped onto this project\'s workflow stages.'
                    : 'Section or column names from Asana become list sections in this project.'}
                </p>
                {sectionsAs === 'statuses' && (
                  <StatusMap values={valuesFor(job, 'section')} stages={stages} />
                )}
              </section>
              )}
              {hasMapped(job.mapping, 'status') && sectionsAs !== 'statuses' && (
                <section className="bt-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 15 }}>Status map</h2>
                  <StatusMap values={valuesFor(job, 'status')} stages={stages} />
                </section>
              )}
              <section className="bt-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 15 }}>People</h2>
                {job.unknownEmails.length > 0 ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13, color: color.ink3, lineHeight: 1.5 }}>
                      {job.matchedEmailCount ? `${job.matchedEmailCount} ${job.matchedEmailCount === 1 ? 'assignee matches' : 'assignees match'} people already here. ` : null}
                      <strong>{job.unknownEmails.length} {job.unknownEmails.length === 1 ? 'email is' : 'emails are'} new</strong> and will receive an invitation as a Member.
                    </p>
                    {job.unknownEmails.slice(0, 6).map((e) => (
                      <div key={e} style={{ padding: '8px 10px', borderRadius: 8, background: color.warningTint, fontSize: 13, color: color.warning }}>{e} · invite as Member</div>
                    ))}
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: color.ink3 }}>Assignees match on email. Display names in Asana are ignored.</p>
                )}
              </section>
              <section style={{ background: color.subtle, border: `1px dashed ${color.dashed}`, borderRadius: 12, padding: '14px 16px', fontSize: 12.5, color: color.muted, lineHeight: 1.5 }}>
                Type comes from Tags (Bug, Feature, Improve). Status comes from Section/Column when you choose Statuses. Assignee comes from Assignee Email. Comments and attachments are not in Asana's spreadsheet export. Re-importing updates tasks matched on Asana task ID.
              </section>
            </div>
          </div>
          {showPreview && (
            <section className="bt-card">
              <div className="bt-group-head">Preview 20 rows</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>{job.headers.slice(0, 6).map((h) => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${color.border}` }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {job.preview.map((row, i) => (
                      <tr key={i}>
                        {job.headers.slice(0, 6).map((h) => <td key={h} style={{ padding: 8, borderBottom: `1px solid ${color.divider}`, color: color.muted }}>{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <div className="bt-card" style={{ padding: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: '1 1 300px', fontSize: 13.5 }}><strong>{job.rowsTotal} tasks</strong> into {project?.name ?? destKey}</span>
            <Link to="/projects"><Button>Back</Button></Link>
            {job.projectKey && (
              <Link to={`/p/${job.projectKey}/list`}>
                <Button>Open project</Button>
              </Link>
            )}
            {!showPreview && job.status !== 'running' && job.status !== 'done' && job.status !== 'failed' && (
              <Button type="primary" onClick={() => setShowPreview(true)}>Preview 20 rows</Button>
            )}
            {showPreview && job.status !== 'running' && job.status !== 'done' && (
              <Button type="primary" loading={busy} onClick={() => void saveAndRun()}>
                {job.status === 'failed' ? 'Retry import' : 'Start import'}
              </Button>
            )}
          </div>
          {(job.status === 'running' || job.status === 'done' || job.status === 'failed') && (
            <ImportProgressCard
              status={job.status}
              rowsDone={job.rowsDone ?? 0}
              rowsTotal={job.rowsTotal}
              errors={job.errors}
              projectKey={job.projectKey}
              projectName={project?.name ?? job.projectKey}
              phase={job.phase}
            />
          )}
        </>
      )}
      {job && apiJob && (
        <ImportProgressCard
          status={job.status ?? 'running'}
          rowsDone={job.rowsDone ?? 0}
          rowsTotal={job.rowsTotal}
          errors={job.errors}
          projectKey={job.projectKey}
          projectName={project?.name ?? job.projectKey}
          phase={job.phase}
        />
      )}
    </div>
  );
}

function doneCopy(rowsDone: number, skipped: number, projectName: string) {
  const imported = Math.max(0, rowsDone - skipped);
  if (skipped === 0) return `${imported.toLocaleString('en-GB')} tasks are in ${projectName}.`;
  return `${imported.toLocaleString('en-GB')} tasks are in ${projectName}. ${skipped} ${skipped === 1 ? 'row was' : 'rows were'} skipped.`;
}

function errorList(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.filter((item): item is string => typeof item === 'string');
}

function ImportProgressCard({
  status,
  rowsDone,
  rowsTotal,
  errors,
  projectKey,
  projectName,
  phase,
}: {
  status: string;
  rowsDone: number;
  rowsTotal: number;
  errors: unknown;
  projectKey: string;
  projectName: string;
  phase?: string;
}) {
  const pct = rowsTotal > 0 ? Math.min(100, Math.round((rowsDone / rowsTotal) * 100)) : 0;
  const failed = errorList(errors);
  const runningCopy = phase === 'listing'
    ? `Listing Asana tasks (${rowsTotal.toLocaleString('en-GB')} so far).`
    : phase === 'reading'
      ? `Reading comments and activity: ${rowsDone.toLocaleString('en-GB')} of ${rowsTotal.toLocaleString('en-GB')}.`
      : rowsTotal === 0
        ? 'Reading the Asana project. Comments and activity are fetched per task, so this can take a while.'
        : `Writing tasks into ${projectName}. You can open the project while this runs.`;
  return (
    <section className="bt-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>
          {status === 'done' ? 'Import finished' : status === 'failed' ? 'Import stopped' : 'Importing into the project'}
        </strong>
        <span style={{ fontSize: 13, color: color.muted }}>{rowsDone.toLocaleString('en-GB')} of {rowsTotal.toLocaleString('en-GB')}</span>
      </div>
      <Progress percent={pct} showInfo={false} status={status === 'running' && pct === 0 ? 'active' : undefined} strokeColor={status === 'failed' ? color.warning : color.brand} />
      <p style={{ margin: 0, fontSize: 13, color: color.ink3 }}>
        {status === 'running' && runningCopy}
        {status === 'done' && doneCopy(rowsDone, failed.length, projectName)}
        {status === 'failed' && 'The worker stopped. Tasks already written stay in the project. Retry to continue from Asana IDs that already exist.'}
      </p>
      {failed.length > 0 && (
        <Alert
          type={status === 'failed' ? 'error' : 'warning'}
          message={`${failed.length} ${failed.length === 1 ? 'row was' : 'rows were'} skipped`}
          description={
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {failed.slice(0, 8).map((item) => (
                <li key={item}>{formatImportError(item)}</li>
              ))}
              {failed.length > 8 && <li>and {failed.length - 8} more</li>}
            </ul>
          }
        />
      )}
      {projectKey && (
        <Link to={`/p/${projectKey}/list`} style={{ fontSize: 13, color: color.brandStrong, fontWeight: 600 }}>View {projectName}</Link>
      )}
    </section>
  );
}

function hasMapped(mapping: Record<string, string>, field: string) {
  return Object.values(mapping).includes(field);
}

function valuesFor(job: ImportState, field: 'section' | 'status') {
  const col = Object.entries(job.mapping).find(([, f]) => f === field)?.[0];
  const fromApi = field === 'section' ? job.sectionValues : job.statusValues;
  if (fromApi?.length) return fromApi;
  if (!col) return [];
  const map = new Map<string, number>();
  for (const row of job.preview) {
    const name = (row[col] ?? '').trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, n]) => ({ name, n }));
}

function guessStage(name: string, stages: WorkflowStatus[]) {
  const slug = guessImportStatusSlug(name, stages.map((stage) => ({ slug: stage.id, name: stage.name })));
  return stages.find((s) => s.id === slug) ?? stages[0];
}

function StatusMap({ values, stages }: { values: { name: string; n: number }[]; stages: WorkflowStatus[] }) {
  if (values.length === 0) return <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>No values in the mapped column yet.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {values.map((v) => {
        const to = guessStage(v.name, stages);
        return (
          <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ flex: 1, color: color.ink3 }}>{v.name}</span>
            <span aria-hidden="true" style={{ color: color.muted }}>to</span>
            <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: to?.colour ?? color.dashed }} />
              {to?.name ?? 'Unmapped'}
            </span>
            <span style={{ fontSize: 12, color: color.muted }}>{v.n}</span>
          </div>
        );
      })}
    </div>
  );
}
