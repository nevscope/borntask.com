import { Alert, Button, Select, Table, Upload } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BASE_URL } from '../api/http';
import { useProjects } from '../api/queries';
import { color } from '../theme/tokens';

const FIELDS = [
  { value: 'skip', label: 'Skip' },
  { value: 'asanaTaskId', label: 'Asana Task ID' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'assigneeEmail', label: 'Assignee email' },
  { value: 'section', label: 'Section' },
  { value: 'status', label: 'Status' },
  { value: 'dueDate', label: 'Due date' },
  { value: 'type', label: 'Type' },
  { value: 'parentAsanaId', label: 'Parent Asana ID' },
];

type ImportState = {
  id: string;
  fileName: string;
  projectKey: string;
  rowsTotal: number;
  headers: string[];
  mapping: Record<string, string>;
  preview: Record<string, string>[];
  unknownEmails: string[];
  status?: string;
  rowsDone?: number;
};

export function ImportScreen() {
  const projects = useProjects().data ?? [];
  const [projectKey, setProjectKey] = useState(projects[0]?.key ?? '');
  const [job, setJob] = useState<ImportState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  };

  const saveAndRun = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      await fetch(`${BASE_URL}/imports/${job.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping: job.mapping, sectionsAs: 'sections' }),
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

  return (
    <div className="bt-page">
      <h1 className="bt-h1">Import from Asana</h1>
      <p style={{ color: color.muted }}>CSV from Asana. Preview the first 20 rows, map columns, then run as a background job. Unknown emails are invited as Member. Re-import matches on Asana Task ID.</p>
      {error && <Alert type="error" message={error} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <Select
          style={{ minWidth: 240 }}
          placeholder="Import into project"
          value={projectKey || undefined}
          onChange={setProjectKey}
          options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
        />
        <Upload
          accept=".csv,.tsv,.txt,.xlsx"
          showUploadList={false}
          beforeUpload={(file) => {
            void upload(file).catch((e: Error) => setError(e.message));
            return false;
          }}
        >
          <Button disabled={!projectKey}>Choose CSV</Button>
        </Upload>
        <Link to="/projects">Back to projects</Link>
      </div>
      {job && (
        <>
          <Alert type="info" message={`${job.fileName} · ${job.rowsTotal} rows · into ${job.projectKey}`} />
          <Table
            rowKey={(r) => r.header}
            pagination={false}
            dataSource={job.headers.map((header) => ({
              header,
              field: job.mapping[header] ?? 'skip',
              sample: job.preview[0]?.[header] ?? '',
            }))}
            columns={[
              { title: 'Asana column', dataIndex: 'header' },
              {
                title: 'BornTask field',
                render: (_, r) => (
                  <Select
                    style={{ minWidth: 180 }}
                    value={r.field}
                    options={FIELDS}
                    onChange={(field) => setJob({ ...job, mapping: { ...job.mapping, [r.header]: field } })}
                  />
                ),
              },
              { title: 'Example from row 1', dataIndex: 'sample', ellipsis: true },
            ]}
          />
          <section className="bt-card">
            <div className="bt-group-head">Preview 20 rows</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {job.headers.slice(0, 6).map((h) => (
                      <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: `1px solid ${color.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {job.preview.map((row, i) => (
                    <tr key={i}>
                      {job.headers.slice(0, 6).map((h) => (
                        <td key={h} style={{ padding: 8, borderBottom: `1px solid ${color.divider}`, color: color.muted }}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {job.unknownEmails.length > 0 && (
            <Alert type="warning" message={`${job.unknownEmails.length} emails are not in the workspace and will be invited as Member: ${job.unknownEmails.slice(0, 8).join(', ')}`} />
          )}
          <div style={{ display: 'flex', gap: 12 }}>
            <Button type="primary" loading={busy} onClick={() => void saveAndRun()}>
              {job.status === 'running' ? 'Import queued' : 'Start import'}
            </Button>
            {job.status === 'running' && <span style={{ color: color.muted }}>Worker is processing the job. Invite URLs print in the API/worker console.</span>}
          </div>
        </>
      )}
    </div>
  );
}
