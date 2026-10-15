// Quick add (screen 5). Opens from "New task", "+ Add task" in a section, or Q anywhere.
// Title line understands @name, !priority and dates; description starts from the type's template;
// screenshots can be pasted (Ctrl/Cmd+V) or dropped. Enter creates, Shift+Enter creates and opens.
import { App, Button, Input, Modal } from 'antd';
import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateTask, useMe, useMoveTask, useProject, useProjects } from '../api/queries';
import type { Priority, ProjectRole, TaskType } from '../api/types';
import { dueLabel } from '../lib/dates';
import { parseQuickTitle, stripTypeTokens } from '../lib/quickParse';
import { checkMove, initialStatusFor, moveOptions, statusById } from '../lib/workflow';
import { color, priorityStyle, radius, typeStyle } from '../theme/tokens';
import { rememberTaskAttachments } from '../lib/attachmentSession';
import { AttachmentTiles, filesFromClipboard, itemsFromFiles, type AttachmentItem } from './AttachmentTiles';
import { Avatar } from './Chips';
import { AssigneePicker, DuePicker, MenuPicker, PriorityPicker, StatusMenu } from './FieldPickers';

const TEMPLATES: Record<TaskType, string> = {
  idea: 'Problem\n\nWho benefits\n',
  bug: 'Steps to reproduce\n1. \n\nExpected\n\nActual\n',
  improvement: 'Today\n\nProposed\n',
  feature: 'Acceptance criteria\n- \n',
};

const TYPES: TaskType[] = ['idea', 'bug', 'improvement', 'feature'];

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

function QuickAddModal({ opts, onClose }: { opts: OpenOptions; onClose: () => void }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const me = useMe().data;
  const projects = useProjects().data ?? [];
  const [projectKey, setProjectKey] = useState(opts.projectKey ?? 'WEB');
  const detail = useProject(projectKey).data;
  const [sectionId, setSectionId] = useState<string | undefined>(opts.sectionId);
  const [type, setType] = useState<TaskType>(opts.type ?? 'idea');
  const [raw, setRaw] = useState('');
  const [description, setDescription] = useState(TEMPLATES[opts.type ?? 'idea']);
  const [descTouched, setDescTouched] = useState(false);
  const [assigneeOverride, setAssigneeOverride] = useState<string | null | undefined>(undefined);
  const [dueOverride, setDueOverride] = useState<string | null | undefined>(undefined);
  const [priorityOverride, setPriorityOverride] = useState<Priority | undefined>(undefined);
  const [statusPick, setStatusPick] = useState<string | undefined>(undefined);
  const [moveComment, setMoveComment] = useState('');
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const create = useCreateTask();
  const move = useMoveTask();

  useEffect(() => {
    if (!detail) return;
    if (!sectionId || !detail.sections.some((s) => s.id === sectionId)) setSectionId(detail.sections[0]?.id);
  }, [detail, sectionId]);

  const people = useMemo(
    () => (detail ? detail.users.filter((u) => detail.members.some((m) => m.userId === u.id)) : []),
    [detail],
  );
  const parsed = parseQuickTitle(raw, people);
  const assigneeId = assigneeOverride !== undefined ? assigneeOverride : parsed.assigneeId;
  const dueDate = dueOverride !== undefined ? dueOverride : parsed.dueDate;
  const priority = priorityOverride ?? parsed.priority ?? 'none';
  const assignee = people.find((p) => p.id === assigneeId);
  const myRoles: ProjectRole[] = detail?.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const startStatus = detail ? statusById(detail.workflow, initialStatusFor(type)) : undefined;
  const chosenStatusId = statusPick ?? startStatus?.id;
  const chosenStatus = detail && chosenStatusId ? statusById(detail.workflow, chosenStatusId) : startStatus;
  const moveCheck = detail && startStatus && chosenStatusId && chosenStatusId !== startStatus.id
    ? checkMove(detail.workflow, { statusId: startStatus.id, previousStatusId: null }, chosenStatusId, myRoles)
    : null;
  const needsComment = moveCheck?.kind === 'allowed' && moveCheck.transition.requireComment;
  const statusOptions = detail && startStatus
    ? [
        { status: startStatus, check: { kind: 'allowed' as const, transition: { from: startStatus.id, to: startStatus.id, roles: [] as ProjectRole[], requireComment: false, label: 'Start here' } } },
        ...moveOptions(detail.workflow, { statusId: startStatus.id, previousStatusId: null }, myRoles),
      ]
    : [];

  function changeType(t: TaskType) {
    setType(t);
    setStatusPick(undefined);
    setMoveComment('');
    if (!descTouched) setDescription(TEMPLATES[t]);
  }

  useEffect(() => {
    if (parsed.type && parsed.type !== type) changeType(parsed.type);
  }, [parsed.type, type]);

  function pickType(t: TaskType) {
    setRaw((prev) => stripTypeTokens(prev));
    changeType(t);
  }

  function addFiles(list: FileList | File[]) {
    const next = itemsFromFiles(list);
    if (next.length) setFiles((prev) => [...prev, ...next]);
  }

  function finish(taskKey: string, taskProjectKey: string, openAfter: boolean) {
    void message.success(`${taskKey} created`);
    onClose();
    if (openAfter) navigate(`/p/${taskProjectKey}/list?task=${taskKey}`);
  }

  function submit(openAfter: boolean) {
    if (!parsed.title || !sectionId) return;
    if (needsComment && !moveComment.trim()) {
      void message.error('Add a comment to move it there.');
      return;
    }
    const cleanDescription = description.trim() === TEMPLATES[type].trim() ? '' : description;
    create.mutate(
      {
        projectKey,
        sectionId,
        type,
        title: parsed.title,
        description: cleanDescription,
        assigneeId: assigneeId ?? null,
        priority,
        dueDate: dueDate ?? null,
        labels: [],
        attachmentIds: files.map((f) => f.id),
      },
      {
        onSuccess: (task) => {
          rememberTaskAttachments(task.key, files);
          if (chosenStatusId && chosenStatusId !== task.statusId) {
            move.mutate(
              { key: task.key, input: { toStatusId: chosenStatusId, comment: needsComment ? moveComment.trim() : undefined } },
              {
                onSuccess: () => finish(task.key, task.projectKey, openAfter),
                onError: (e) => {
                  void message.error(e.message);
                  finish(task.key, task.projectKey, openAfter);
                },
              },
            );
            return;
          }
          finish(task.key, task.projectKey, openAfter);
        },
        onError: (e) => void message.error(e.message),
      },
    );
  }

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      title={null}
      width={660}
      closable={false}
      styles={{ body: { padding: 0, overflow: 'hidden', borderRadius: radius.xl }, container: { padding: 0, borderRadius: radius.xl } }}
    >
      <div
        role="dialog"
        aria-label="New task"
        onPaste={(e) => {
          const pasted = filesFromClipboard(e.clipboardData);
          if (pasted.length) {
            e.preventDefault();
            addFiles(pasted);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '14px 18px 0' }}>
          <span style={{ fontSize: 12.5, color: color.muted, marginRight: 4 }}>Type</span>
          {TYPES.map((t) => {
            const on = type === t;
            const s = typeStyle[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => pickType(t)}
                style={{
                  height: 28,
                  padding: '0 10px',
                  border: `1px solid ${on ? s.bg : color.border}`,
                  borderRadius: 7,
                  background: on ? s.bg : color.surface,
                  font: 'inherit',
                  fontSize: 12.5,
                  fontWeight: on ? 600 : 400,
                  color: on ? s.fg : color.ink3,
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 18px 6px' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>Title</span>
          <Input
            autoFocus
            variant="borderless"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onPressEnter={(e) => submit(e.shiftKey)}
            placeholder="What needs doing? A short summary"
            styles={{ input: { padding: 0, fontFamily: 'var(--bt-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' } }}
          />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 18px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>Description</span>
            <span style={{ fontSize: 12, color: color.muted }}>· {typeStyle[type].label} template</span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => { setDescription(''); setDescTouched(true); }}
              style={{ height: 26, padding: '0 8px', border: 0, borderRadius: 6, background: 'transparent', font: 'inherit', fontSize: 12, color: color.muted, cursor: 'pointer' }}
            >
              Clear template
            </button>
          </div>
          <Input.TextArea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e.shiftKey); }}
            autoSize={{ minRows: 8, maxRows: 14 }}
            style={{ background: color.subtle, borderRadius: 10 }}
          />
          <span style={{ fontSize: 12, color: color.muted }}>
            Markdown and @mentions work here. Switching type swaps the template if you haven't typed in it yet.
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 18px 16px' }}>
          <Chip style={{ maxWidth: '100%', minWidth: 0 }}>
            <span style={{ width: 8, height: 8, flex: 'none', borderRadius: 3, background: detail?.project.color ?? color.brand }} />
            <MenuPicker
              ariaLabel="Project"
              label={<span style={clipLabel}>{detail?.project.name ?? projectKey}</span>}
              items={projects.map((project) => ({ id: project.key, label: project.name }))}
              onPick={(key) => { setProjectKey(key); setSectionId(undefined); setAssigneeOverride(undefined); }}
            />
            <span aria-hidden="true" style={{ flex: 'none', color: color.muted }}>·</span>
            <MenuPicker
              ariaLabel="Section"
              label={<span style={clipLabel}>{detail?.sections.find((section) => section.id === sectionId)?.name ?? 'Section'}</span>}
              items={(detail?.sections ?? []).map((section) => ({ id: section.id, label: section.name }))}
              onPick={setSectionId}
            />
          </Chip>
          <Chip>
            {detail ? (
              <AssigneePicker
                bare
                value={assigneeId ?? null}
                users={people}
                detail={detail}
                meId={me?.user.id}
                trigger={assignee ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar user={assignee} size={22} />{assignee.name}</span> : 'Unassigned'}
                onChange={setAssigneeOverride}
              />
            ) : 'Unassigned'}
          </Chip>
          <Chip>
            <DuePicker
              bare
              value={dueDate ?? null}
              trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CalendarIcon />{dueLabel(dueDate ?? null)}</span>}
              onChange={setDueOverride}
            />
          </Chip>
          <Chip>
            <PriorityPicker
              bare
              value={priority}
              trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: priorityStyle[priority].color }} />{priorityStyle[priority].label}</span>}
              onChange={setPriorityOverride}
            />
          </Chip>
          {chosenStatus && (
            <Chip muted>
              <StatusMenu
                bare
                name={chosenStatus.name}
                dot={null}
                trigger={<span>Status: {chosenStatus.name}</span>}
                options={statusOptions}
                onMove={(statusId) => {
                  setStatusPick(statusId === startStatus?.id ? undefined : statusId);
                  setMoveComment('');
                }}
              />
            </Chip>
          )}
          {needsComment && (
            <Input
              value={moveComment}
              onChange={(event) => setMoveComment(event.target.value)}
              placeholder="Comment for this move"
              style={{ flex: '1 1 220px', minWidth: 180 }}
            />
          )}
        </div>

        <div style={{ padding: '0 18px 16px' }}>
          <AttachmentTiles items={files} onAdd={addFiles} onRemove={(id) => setFiles((p) => p.filter((x) => x.id !== id))} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 18px', background: color.subtle, borderTop: `1px solid ${color.divider}` }}>
          <span style={{ flex: '1 1 260px', fontSize: 12.5, color: color.muted }}>
            Type <strong style={{ color: color.ink3 }}>@</strong> for people, <strong style={{ color: color.ink3 }}>#</strong> for type, <strong style={{ color: color.ink3 }}>!</strong> for priority, dates like <strong style={{ color: color.ink3 }}>fri</strong> or <strong style={{ color: color.ink3 }}>next week</strong>
          </span>
          <Button onClick={() => submit(true)} disabled={!parsed.title} loading={create.isPending || move.isPending} style={{ height: 36, fontSize: 13 }}>
            Create and open <kbd className="bt-kbd" style={{ marginLeft: 6 }}>Shift ↵</kbd>
          </Button>
          <Button type="primary" onClick={() => submit(false)} disabled={!parsed.title} loading={create.isPending || move.isPending} style={{ height: 36, fontSize: 13, fontWeight: 600 }}>
            Create task <kbd className="bt-kbd" style={{ marginLeft: 8, background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}>↵</kbd>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const clipLabel: CSSProperties = {
  display: 'block',
  maxWidth: 140,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function Chip({ children, muted = false, style }: { children: ReactNode; muted?: boolean; style?: CSSProperties }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '0 10px', borderRadius: radius.md, background: color.chip, fontSize: 13, color: muted ? color.muted : color.ink, ...style }}>
      {children}
    </span>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
