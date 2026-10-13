// Quick add (screen 5). Opens from "New task", "+ Add task" in a section, or Q anywhere.
// Title line understands @name, !priority and dates; description starts from the type's template;
// screenshots can be pasted (Ctrl/Cmd+V) or dropped. Enter creates, Shift+Enter creates and opens.
import { App, Button, Input, Modal, Segmented, Select } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTask, useProject, useProjects } from '../api/queries';
import type { Priority, TaskType } from '../api/types';
import { dueLabel } from '../lib/dates';
import { parseQuickTitle } from '../lib/quickParse';
import { initialStatusFor, statusById } from '../lib/workflow';
import { priorityStyle, typeStyle } from '../theme/tokens';
import { Avatar } from './Chips';

const TEMPLATES: Record<TaskType, string> = {
  idea: 'Problem\n\nWho benefits\n',
  bug: 'Steps to reproduce\n1. \n\nExpected\n\nActual\n',
  improvement: 'Today\n\nProposed\n',
  feature: 'Acceptance criteria\n- \n',
};

interface OpenOptions {
  projectKey?: string;
  sectionId?: string;
  type?: TaskType;
}

const QuickAddContext = createContext<{ open: (o?: OpenOptions) => void }>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

function isTypingTarget(el: EventTarget | null) {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable);
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; opts: OpenOptions }>({ open: false, opts: {} });
  const open = (opts: OpenOptions = {}) => setState({ open: true, opts });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'q' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setState({ open: true, opts: {} });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <QuickAddContext.Provider value={{ open }}>
      {children}
      {state.open && <QuickAddModal opts={state.opts} onClose={() => setState({ open: false, opts: {} })} />}
    </QuickAddContext.Provider>
  );
}

interface LocalFile {
  id: string;
  name: string;
  size: number;
}

function QuickAddModal({ opts, onClose }: { opts: OpenOptions; onClose: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const projects = useProjects().data ?? [];
  const [projectKey, setProjectKey] = useState(opts.projectKey ?? 'WEB');
  const detail = useProject(projectKey).data;
  const [sectionId, setSectionId] = useState<string | undefined>(opts.sectionId);
  const [type, setType] = useState<TaskType>(opts.type ?? 'idea');
  const [raw, setRaw] = useState('');
  const [description, setDescription] = useState(TEMPLATES[opts.type ?? 'idea']);
  const [descTouched, setDescTouched] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const create = useCreateTask();

  // Default to the first section of the chosen project.
  useEffect(() => {
    if (!detail) return;
    if (!sectionId || !detail.sections.some((s) => s.id === sectionId)) setSectionId(detail.sections[0]?.id);
  }, [detail, sectionId]);

  const people = useMemo(
    () => (detail ? detail.users.filter((u) => detail.members.some((m) => m.userId === u.id)) : []),
    [detail],
  );
  const parsed = parseQuickTitle(raw, people);
  const assignee = people.find((p) => p.id === parsed.assigneeId);
  const startStatus = detail ? statusById(detail.workflow, initialStatusFor(type)) : undefined;

  function changeType(t: TaskType) {
    setType(t);
    if (!descTouched) setDescription(TEMPLATES[t]);
  }

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list).map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name || 'Pasted screenshot.png', size: f.size }));
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }

  function submit(openAfter: boolean) {
    if (!parsed.title || !sectionId) return;
    const cleanDescription = description.trim() === TEMPLATES[type].trim() ? '' : description;
    create.mutate(
      {
        projectKey,
        sectionId,
        type,
        title: parsed.title,
        description: cleanDescription,
        assigneeId: parsed.assigneeId,
        priority: (parsed.priority ?? 'none') as Priority,
        dueDate: parsed.dueDate,
        labels: [],
        attachmentIds: files.map((f) => f.id), // real app: ids from the upload endpoint
      },
      {
        onSuccess: (task) => {
          void message.success(`${task.key} created`);
          onClose();
          if (openAfter) navigate(`/p/${task.projectKey}/list?task=${task.key}`);
        },
        onError: (e) => void message.error(e.message),
      },
    );
  }

  return (
    <Modal open onCancel={onClose} footer={null} title={null} width={680} closable={false}>
      <div
        onPaste={(e) => e.clipboardData.files.length && addFiles(e.clipboardData.files)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <Segmented<TaskType>
          value={type}
          onChange={changeType}
          options={(['idea', 'bug', 'improvement', 'feature'] as const).map((t) => ({ value: t, label: typeStyle[t].label }))}
        />

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6157' }}>Title</span>
          <Input
            autoFocus
            variant="filled"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onPressEnter={(e) => submit(e.shiftKey)}
            placeholder="What needs doing? Try: Fix hreflang tags @karl fri !high"
            style={{ height: 48, padding: '0 12px', fontFamily: 'var(--bt-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' }}
          />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select
            size="small"
            value={projectKey}
            onChange={(v) => { setProjectKey(v); setSectionId(undefined); }}
            options={projects.map((p) => ({ value: p.key, label: p.name }))}
            style={{ minWidth: 170 }}
            aria-label="Project"
          />
          <Select
            size="small"
            value={sectionId}
            onChange={setSectionId}
            options={(detail?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
            style={{ minWidth: 130 }}
            aria-label="Section"
          />
          {assignee && <Chip><Avatar user={assignee} size={20} /> {assignee.name}</Chip>}
          {parsed.dueDate && <Chip>Due {dueLabel(parsed.dueDate)}</Chip>}
          {parsed.priority && (
            <Chip><span style={{ width: 8, height: 8, borderRadius: 2, background: priorityStyle[parsed.priority].color }} /> {priorityStyle[parsed.priority].label}</Chip>
          )}
          {startStatus && <Chip muted>Starts in {startStatus.name}{type !== 'bug' ? ' · needs Business approval' : ''}</Chip>}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#5B6157' }}>Description · {typeStyle[type].label} template</span>
          <Input.TextArea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e.shiftKey); }}
            autoSize={{ minRows: 4, maxRows: 12 }}
            style={{ background: '#FAFBF9' }}
          />
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {files.map((f) => (
            <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 6px 0 10px', borderRadius: 8, border: '1px solid #E8EBE6', fontSize: 13 }}>
              {f.name} <span style={{ color: '#5B6157' }}>{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <Button size="small" type="text" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>×</Button>
            </span>
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 8, border: '1.5px dashed #CDD2C9', fontSize: 13, cursor: 'pointer' }}>
            Attach file
            <input type="file" multiple className="bt-sr-only" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </label>
          <span style={{ fontSize: 12.5, color: '#5B6157' }}>or paste a screenshot with <kbd className="bt-kbd">Ctrl V</kbd></span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 12, borderTop: '1px solid #EEF0EC' }}>
          <span style={{ flex: '1 1 240px', fontSize: 12.5, color: '#5B6157' }}>
            <strong style={{ color: '#3A3F38' }}>@</strong> people · <strong style={{ color: '#3A3F38' }}>!</strong> priority · dates like <strong style={{ color: '#3A3F38' }}>fri</strong>
          </span>
          <Button onClick={() => submit(true)} disabled={!parsed.title} loading={create.isPending}>Create and open <kbd className="bt-kbd" style={{ marginLeft: 6 }}>Shift ↵</kbd></Button>
          <Button type="primary" onClick={() => submit(false)} disabled={!parsed.title} loading={create.isPending}>Create task <kbd className="bt-kbd" style={{ marginLeft: 6, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>↵</kbd></Button>
        </div>
      </div>
    </Modal>
  );
}

function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 8, background: '#F1F2EF', fontSize: 12.5, color: muted ? '#5B6157' : '#121417' }}>
      {children}
    </span>
  );
}
