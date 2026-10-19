import { useStatusToast } from './StatusToast';
import { useUpdateTask } from '../api/queries';
import type { ProjectDetail, ProjectRole, Task, UpdateTaskInput } from '../api/types';
import { dueColor, dueLabel, dueTone } from '../lib/dates';
import { moveOptions, statusById } from '../lib/workflow';
import { color } from '../theme/tokens';
import { Avatar, PriorityLabel, StatusPill, TypeTag } from './Chips';
import { AssigneePicker, DuePicker, PriorityPicker, StatusMenu, TypePicker } from './FieldPickers';

export function ListFields({
  task,
  detail,
  meId,
  roles,
  onMove,
  compact = false,
}: {
  task: Task;
  detail: ProjectDetail;
  meId?: string;
  roles: ProjectRole[];
  onMove: (task: Task, statusId: string) => void;
  compact?: boolean;
}) {
  const toast = useStatusToast();
  const update = useUpdateTask();
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
      <span style={{ width: 110 }}>
        <TypePicker bare trigger={<TypeTag type={task.type} />} value={task.type} onChange={(type) => save({ type })} />
      </span>
      <span style={{ width: 160 }}>
        <StatusMenu
          bare
          name={status?.name ?? task.statusId}
          dot={null}
          trigger={<StatusPill status={status} />}
          options={moveOptions(detail.workflow, task, roles)}
          onMove={(statusId) => onMove(task, statusId)}
        />
      </span>
      <span style={{ width: 160 }}>
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
      <span style={{ width: 90, color: dueColor[tone], fontWeight: tone === 'overdue' || tone === 'today' ? 600 : 400, fontSize: 13 }}>
        <DuePicker bare value={task.dueDate} trigger={<span>{dueLabel(task.dueDate)}</span>} onChange={(dueDate) => save({ dueDate })} />
      </span>
      <span style={{ width: 100 }}>
        <PriorityPicker bare value={task.priority} trigger={<PriorityLabel priority={task.priority} />} onChange={(priority) => save({ priority })} />
      </span>
    </>
  );
}
