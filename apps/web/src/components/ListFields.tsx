import { App } from 'antd';
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
}: {
  task: Task;
  detail: ProjectDetail;
  meId?: string;
  roles: ProjectRole[];
  onMove: (task: Task, statusId: string) => void;
}) {
  const { message } = App.useApp();
  const update = useUpdateTask();
  const status = statusById(detail.workflow, task.statusId);
  const user = detail.users.find((row) => row.id === task.assigneeId);
  const tone = dueTone(task.dueDate);
  const members = detail.users.filter((row) => detail.members.some((member) => member.userId === row.id));

  function save(input: UpdateTaskInput) {
    update.mutate(
      { key: task.key, input },
      { onError: (err) => void message.error(err.message) },
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
