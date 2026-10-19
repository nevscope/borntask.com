// Quick add (screen 5). Opens from "New task", "+ Add task" in a section, or Q anywhere.
// Title line understands @name, !priority and dates; description is a blank WYSIWYG field;
// screenshots can be pasted (Ctrl/Cmd+V) or dropped. Enter creates, Shift+Enter creates and opens.
import { Button, Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCreateTask, useMe, useMoveTask, useProject, useProjects } from '../api/queries';
import { useWorkspaceCatalog } from '../api/catalog';
import type { BuiltinTaskType, Priority, ProjectRole, TaskType, User } from '../api/types';
import { dueLabel } from '../lib/dates';
import {
  mentionHandle,
  parseQuickTitle,
  PRIORITY_TOKENS,
  replaceQuickToken,
  stripTypeTokens,
  tokenAtCursor,
  TYPE_TOKENS,
} from '../lib/quickParse';
import { checkMove, initialStatusFor, moveOptions, statusById } from '../lib/workflow';
import { color, priorityStyle, radius, typeStyle } from '../theme/tokens';
import { rememberTaskAttachments } from '../lib/attachmentSession';
import { uploadPendingFile } from '../lib/uploadAttachment';
import { isEmptyDescription, persistDescription } from '../lib/descriptionHtml';
import { AttachmentTiles, filesFromClipboard, itemsFromFiles, type AttachmentItem } from './AttachmentTiles';
import { ConfirmDialog } from './ConfirmDialog';
import { DescriptionEditor } from './DescriptionEditor';
import { Avatar } from './Chips';
import { AssigneePicker, DuePicker, MenuPicker, PriorityPicker, StatusMenu } from './FieldPickers';
import { useStatusToast } from './StatusToast';
import { useIsPhone } from '../hooks/useIsPhone';

const TYPES: BuiltinTaskType[] = ['idea', 'bug', 'improvement', 'feature'];

function typeLook(type: string) {
  return type in typeStyle ? typeStyle[type as BuiltinTaskType] : { label: type, bg: color.chip, fg: color.ink3 };
}

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

function projectKeyFromPath(pathname: string) {
  return pathname.match(/^\/p\/([^/]+)/)?.[1];
}

function QuickAddModal({ opts, onClose }: { opts: OpenOptions; onClose: () => void }) {
  const toast = useStatusToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const me = useMe().data;
  const projects = useProjects().data ?? [];
  const [projectKey, setProjectKey] = useState(opts.projectKey ?? projectKeyFromPath(pathname) ?? '');
  const detail = useProject(projectKey).data;
  const [sectionId, setSectionId] = useState<string | undefined>(opts.sectionId);
  const [type, setType] = useState<TaskType>(opts.type ?? 'idea');
  const [raw, setRaw] = useState('');
  const catalog = useWorkspaceCatalog();
  const typeList = catalog.types.length ? catalog.types.map((item) => item.slug) : TYPES;
  const [description, setDescription] = useState('');
  const [assigneeOverride, setAssigneeOverride] = useState<string | null | undefined>(undefined);
  const [dueOverride, setDueOverride] = useState<string | null | undefined>(undefined);
  const [priorityOverride, setPriorityOverride] = useState<Priority | undefined>(undefined);
  const [statusPick, setStatusPick] = useState<string | undefined>(undefined);
  const [moveComment, setMoveComment] = useState('');
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const titleRef = useRef<InputRef>(null);
  const create = useCreateTask();
  const move = useMoveTask();
  const isPhone = useIsPhone();

  useEffect(() => {
    if (!projects.length) return;
    const known = (key: string | undefined) => !!key && projects.some((p) => p.key === key);
    if (known(projectKey)) return;
    const next = [opts.projectKey, projectKeyFromPath(pathname), projects[0]?.key].find(known);
    if (next) setProjectKey(next);
  }, [projects, projectKey, opts.projectKey, pathname]);

  useEffect(() => {
    if (!detail) return;
    if (!sectionId || !detail.sections.some((s) => s.id === sectionId)) setSectionId(detail.sections[0]?.id);
  }, [detail, sectionId]);

  const people = useMemo(
    () => (detail ? detail.users.filter((u) => detail.members.some((m) => m.userId === u.id)) : []),
    [detail],
  );
  const parsed = parseQuickTitle(raw, people);
  const token = tokenAtCursor(raw, caret);
  const suggestions = useMemo(
    () => (token && !suggestDismissed ? suggestionsFor(token.kind, token.query, people) : []),
    [token, suggestDismissed, people],
  );
  const suggestOpen = !!token && !suggestDismissed;

  useEffect(() => {
    setSuggestIndex(0);
  }, [token?.kind, token?.query, token?.start]);
  const assigneeId = assigneeOverride !== undefined ? assigneeOverride : parsed.assigneeId;
  const dueDate = dueOverride !== undefined ? dueOverride : parsed.dueDate;
  const priority = priorityOverride ?? parsed.priority ?? 'none';
  const assignee = people.find((p) => p.id === assigneeId);
  const myRoles: ProjectRole[] = detail?.members.find((member) => member.userId === me?.user.id)?.roles ?? [];
  const startStatus = detail ? statusById(detail.workflow, initialStatusFor(type, detail.workflow)) : undefined;
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

  const hasDraft = raw.trim() !== '' || !isEmptyDescription(description) || files.length > 0 || moveComment.trim() !== '';

  function readCaret() {
    const el = titleRef.current?.input;
    setCaret(el?.selectionStart ?? raw.length);
  }

  function applySuggestion(insert: string) {
    if (!token) return;
    const next = replaceQuickToken(raw, token, insert);
    const piece = insert.endsWith(' ') ? insert : `${insert} `;
    const nextCaret = token.start + piece.length;
    setRaw(next);
    setSuggestDismissed(true);
    requestAnimationFrame(() => {
      const el = titleRef.current?.input;
      el?.focus();
      el?.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  }

  function onTitleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (suggestOpen && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const pick = suggestions[suggestIndex] ?? suggestions[0];
        if (pick) {
          e.preventDefault();
          applySuggestion(pick.insert);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setSuggestDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(e.shiftKey);
    }
  }

  function requestClose() {
    if (hasDraft) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  }

  function finish(taskKey: string, taskProjectKey: string, openAfter: boolean) {
    toast.show({ text: <><strong>{taskKey}</strong> created</> });
    onClose();
    if (openAfter) navigate(`/p/${taskProjectKey}/list?task=${taskKey}`);
  }

  function submit(openAfter: boolean) {
    if (!parsed.title) return;
    if (!projectKey || !sectionId) {
      toast.show({ kind: 'error', text: 'Pick a project and section.' });
      return;
    }
    if (needsComment && !moveComment.trim()) {
      toast.show({ kind: 'error', text: 'Add a comment to move it there.' });
      return;
    }
    const cleanDescription = persistDescription(description);
    void (async () => {
      let uploaded = files;
      try {
        if (files.length) {
          uploaded = [];
          for (const item of files) {
            const local = item as AttachmentItem & { file?: File };
            const file = local.file;
            if (!file) throw new Error('That file is no longer available. Attach it again.');
            uploaded.push(await uploadPendingFile(file));
          }
          setFiles(uploaded);
        }
      } catch (err) {
        toast.show({ kind: 'error', text: err instanceof Error ? err.message : 'Could not upload attachments.' });
        return;
      }
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
        attachmentIds: uploaded.map((f) => f.id),
      },
      {
        onSuccess: (task) => {
          rememberTaskAttachments(task.key, uploaded);
          if (chosenStatusId && chosenStatusId !== task.statusId) {
            move.mutate(
              { key: task.key, input: { toStatusId: chosenStatusId, comment: needsComment ? moveComment.trim() : undefined } },
              {
                onSuccess: () => finish(task.key, task.projectKey, openAfter),
                onError: () => {
                  toast.show({ kind: 'error', text: 'Created, but could not move it to that stage.' });
                  finish(task.key, task.projectKey, openAfter);
                },
              },
            );
            return;
          }
          finish(task.key, task.projectKey, openAfter);
        },
        onError: () => toast.show({ kind: 'error', text: 'Could not create this task.' }),
      },
    );
    })();
  }

  return (
    <>
    <Modal
      open
      centered={!isPhone}
      onCancel={requestClose}
      footer={null}
      title={null}
      width={isPhone ? '100%' : 660}
      closable={false}
      keyboard={!discardOpen}
      mask={{ closable: false }}
      rootClassName={isPhone ? 'bt-quick-add-phone' : undefined}
      styles={{
        wrapper: isPhone ? { overflow: 'hidden', padding: 0 } : { overflow: 'auto', padding: 16 },
        container: {
          padding: 0,
          borderRadius: isPhone ? 0 : radius.xl,
          width: isPhone ? '100%' : undefined,
          maxWidth: isPhone ? '100%' : undefined,
          height: isPhone ? '100dvh' : undefined,
          maxHeight: isPhone ? '100dvh' : 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
        },
        body: {
          padding: 0,
          overflow: 'hidden',
          borderRadius: isPhone ? 0 : radius.xl,
          height: isPhone ? '100dvh' : undefined,
          maxHeight: isPhone ? '100dvh' : 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <div
        role="dialog"
        aria-label="New task"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: isPhone ? '100dvh' : 'calc(100dvh - 32px)', height: isPhone ? '100dvh' : undefined }}
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
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '14px 18px 0' }}>
          <span style={{ fontSize: 12.5, color: color.muted, marginRight: 4 }}>Type</span>
          {typeList.map((t) => {
            const on = type === t;
            const s = typeLook(t);
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

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 18px 6px', position: 'relative' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>Title</span>
          <Input
            ref={titleRef}
            autoFocus
            variant="borderless"
            value={raw}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen}
            aria-controls="quick-title-suggest"
            onChange={(e) => {
              setRaw(e.target.value);
              setSuggestDismissed(false);
              setCaret(e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={readCaret}
            onKeyUp={readCaret}
            onSelect={readCaret}
            onKeyDown={onTitleKeyDown}
            placeholder="What needs doing? A short summary"
            styles={{ input: { padding: 0, fontFamily: 'var(--bt-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em' } }}
          />
          {suggestOpen && (
            <ul
              id="quick-title-suggest"
              role="listbox"
              style={{
                position: 'absolute',
                left: 18,
                right: 18,
                top: '100%',
                zIndex: 2,
                margin: 0,
                padding: 4,
                listStyle: 'none',
                border: `1px solid ${color.border}`,
                borderRadius: radius.md,
                background: color.surface,
                maxHeight: 240,
                overflow: 'auto',
              }}
            >
              {suggestions.length === 0 ? (
                <li style={{ padding: '8px 10px', fontSize: 13, color: color.muted }}>
                  {token?.kind === '@' ? 'No matching people' : token?.kind === '#' ? 'No matching type' : 'No matching priority'}
                </li>
              ) : (
                suggestions.map((item, index) => {
                  const on = index === suggestIndex;
                  return (
                    <li key={item.id} role="option" aria-selected={on}>
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setSuggestIndex(index)}
                        onClick={() => applySuggestion(item.insert)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          borderRadius: radius.sm,
                          padding: '7px 8px',
                          font: 'inherit',
                          fontSize: 13,
                          background: on ? color.brandTint : 'transparent',
                          color: color.ink,
                          cursor: 'pointer',
                        }}
                      >
                        {item.kind === '@' && item.user ? <Avatar user={item.user} size={22} /> : (
                          <span style={{ width: 8, height: 8, borderRadius: 2, flex: 'none', background: item.swatch ?? color.faint }} />
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
                        <span style={{ fontSize: 12, color: color.muted }}>{item.insert}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 18px 6px', minHeight: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>Description</span>
          <DescriptionEditor
            value={description}
            people={people}
            minHeight={112}
            placeholder="Add details."
            onChange={setDescription}
            onEditorKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e.shiftKey); }}
          />
          <span style={{ fontSize: 12, color: color.muted }}>
            Use the toolbar to format.
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
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 18px', background: color.subtle, borderTop: `1px solid ${color.divider}`, flex: 'none' }}>
          <span style={{ flex: '1 1 260px', fontSize: 12.5, color: color.muted }}>
            Type <strong style={{ color: color.ink3 }}>@</strong> for people, <strong style={{ color: color.ink3 }}>#</strong> for type, <strong style={{ color: color.ink3 }}>!</strong> for priority, dates like <strong style={{ color: color.ink3 }}>fri</strong> or <strong style={{ color: color.ink3 }}>next week</strong>
          </span>
          <Button onClick={() => submit(true)} disabled={!parsed.title} loading={create.isPending || move.isPending} style={{ height: 36, fontSize: 13 }}>
            Create and open {!isPhone && <kbd className="bt-kbd" style={{ marginLeft: 6 }}>Shift ↵</kbd>}
          </Button>
          <Button type="primary" onClick={() => submit(false)} disabled={!parsed.title} loading={create.isPending || move.isPending} style={{ height: 36, fontSize: 13, fontWeight: 600 }}>
            Create task {!isPhone && <kbd className="bt-kbd" style={{ marginLeft: 8, background: 'transparent', color: color.brandOn, borderColor: color.brandOnMuted }}>↵</kbd>}
          </Button>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={discardOpen}
      title="Discard this task?"
      cancelLabel="Stay"
      confirmLabel="Discard"
      onCancel={() => setDiscardOpen(false)}
      onConfirm={() => {
        setDiscardOpen(false);
        onClose();
      }}
    >
      This task has not been created yet.
    </ConfirmDialog>
    </>
  );
}

interface TitleSuggestion {
  id: string;
  kind: '@' | '#' | '!';
  label: string;
  insert: string;
  swatch?: string;
  user?: User;
}

function suggestionsFor(kind: '@' | '#' | '!', query: string, people: User[]): TitleSuggestion[] {
  const q = query.toLowerCase();
  if (kind === '@') {
    return people
      .filter((person) => person.name.toLowerCase().includes(q) || person.email.toLowerCase().includes(q))
      .slice(0, 8)
      .map((person) => ({
        id: person.id,
        kind: '@' as const,
        label: person.name,
        insert: `@${mentionHandle(person, people)}`,
        user: person,
      }));
  }
  if (kind === '#') {
    return TYPE_TOKENS
      .filter((item) => item.token.includes(q) || typeLook(item.type).label.toLowerCase().includes(q))
      .map((item) => ({
        id: item.type,
        kind: '#' as const,
        label: typeLook(item.type).label,
        insert: `#${item.token}`,
        swatch: typeLook(item.type).fg,
      }));
  }
  return PRIORITY_TOKENS
    .filter((item) => item.token.includes(q) || priorityStyle[item.priority].label.toLowerCase().includes(q) || priorityStyle[item.priority].key === q)
    .map((item) => ({
      id: item.priority,
      kind: '!' as const,
      label: priorityStyle[item.priority].label,
      insert: `!${item.token}`,
      swatch: priorityStyle[item.priority].color,
    }));
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
