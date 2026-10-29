import { useStatusToast } from './StatusToast';
import { useUpdateTask } from '../api/queries';
import type { ProjectDetail, ProjectRole, Task, UpdateTaskInput } from '../api/types';
import { allowedTypeSlugs, LIST_FIELD_WIDTH, type ListField } from '../lib/taskFilters';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { useWorkspaceCatalog } from '../api/catalog';
import { completeTarget, moveOptions, statusById } from '../lib/workflow';
import { color } from '../theme/tokens';
import { Avatar, PriorityLabel, StatusPill, TypeTag } from './Chips';
import { AssigneePicker, DuePicker, PriorityPicker, StatusMenu, TypePicker } from './FieldPickers';

export function CompleteTick({
  task,
  detail,
  roles: _roles,
  onComplete,
  always = false,
}: {
  task: Task;
  detail: ProjectDetail;
  roles: ProjectRole[];
  onComplete: (task: Task) => void;
  always?: boolean;
}) {
  const target = completeTarget(detail.workflow, task);
  if (!target) return null;
  return (
    <button
      type="button"
      className={`bt-complete${always ? ' always' : ''}`}
      aria-label={`Mark ${task.key} as completed`}
      onClick={(event) => {
        event.stopPropagation();
        onComplete(task);
      }}
    >
      <span className="bt-complete-dot" aria-hidden="true" />
      Completed
    </button>
  );
}

export function ListFields({
  task,
  detail,
  meId,
  roles,
  onMove,
  onComplete,
  compact = false,
  hiddenCols = [],
}: {
  task: Task;
  detail: ProjectDetail;
  meId?: string;
  roles: ProjectRole[];
  onMove: (task: Task, statusId: string) => void;
  onComplete: (task: Task) => void;
  compact?: boolean;
  hiddenCols?: ListField[];
}) {
  const toast = useStatusToast();
  const catalog = useWorkspaceCatalog();
  const update = useUpdateTask();
  const allowed = allowedTypeSlugs(detail, catalog.types.length ? catalog.types.map((item) => item.slug) : ['idea', 'bug', 'improvement', 'feature', 'story', 'epic']);
  const show = (field: ListField) => !hiddenCols.includes(field);
  const status = statusById(detail.workflow, task.statusId);
  const user = detail.users.find((row) => row.id === task.assigneeId);
  const tone = dueTone(task.dueDate);
  const members = detail.users.filter((row) => detail.members.some((member) => member.userId === row.id));

  function save(input: UpdateTaskInput) {
    update.mutate(
      { key: task.key, input },
      { onError: () => toast.show({ kind: 'error', text: 'Could not save this field.' }) },
    );
  }

  const canComplete = Boolean(completeTarget(detail.workflow, task));

  if (compact) {
    return (
      <>
        <StatusMenu
          bare
          name={status?.name ?? task.statusId}
          dot={null}
          trigger={<span style={{ fontSize: 12, color: color.muted }}>{status?.name ?? task.statusId}</span>}
          options={moveOptions(detail.workflow, task, roles)}
          onMove={(statusId) => onMove(task, statusId)}
        />
        <span style={{ marginLeft: 'auto', color: dueColor[tone], fontWeight: tone === 'overdue' || tone === 'today' ? 600 : 400, fontSize: 12 }}>
          <DuePicker bare value={task.dueDate} trigger={<span>{dueLabel(task.dueDate)}</span>} onChange={(dueDate) => save({ dueDate })} />
        </span>
      </>
    );
  }

  return (
    <>
      {canComplete && (
        <span className="bt-complete-slot">
          <CompleteTick task={task} detail={detail} roles={roles} onComplete={onComplete} />
        </span>
      )}
      {show('type') && (
      <span style={{ width: LIST_FIELD_WIDTH.type }}>
        <TypePicker allowed={allowed} bare trigger={<TypeTag type={task.type} />} value={task.type} onChange={(type) => save({ type })} />
      </span>
      )}
      {show('status') && (
      <span style={{ width: LIST_FIELD_WIDTH.status, display: 'inline-flex', alignItems: 'center' }}>
        <StatusMenu
          bare
          name={status?.name ?? task.statusId}
          dot={null}
          trigger={<StatusPill status={status} />}
          options={moveOptions(detail.workflow, task, roles)}
          onMove={(statusId) => onMove(task, statusId)}
        />
      </span>
      )}
      {show('assignee') && (
      <span style={{ width: LIST_FIELD_WIDTH.assignee }}>
        <AssigneePicker
          bare
          value={task.assigneeId}
          users={members}
          detail={detail}
          meId={meId}
          trigger={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.ink3, maxWidth: '100%' }}>
              <Avatar user={user} /> {user?.name ?? 'Unassigned'}
            </span>
          )}
          onChange={(assigneeId) => save({ assigneeId })}
        />
      </span>
      )}
      {show('due') && (
      <span style={{ width: LIST_FIELD_WIDTH.due, color: dueColor[tone], fontWeight: tone === 'overdue' || tone === 'today' ? 600 : 400, fontSize: 13 }}>
        <DuePicker bare value={task.dueDate} trigger={<span>{dueLabel(task.dueDate)}</span>} onChange={(dueDate) => save({ dueDate })} />
      </span>
      )}
      {show('priority') && (
      <span style={{ width: LIST_FIELD_WIDTH.priority }}>
        <PriorityPicker bare value={task.priority} trigger={<PriorityLabel priority={task.priority} />} onChange={(priority) => save({ priority })} />
      </span>
      )}
    </>
  );
}
