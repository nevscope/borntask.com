export type MoveRow = {
  from: string;
  to: string;
  label?: string | null;
};

export type MoveStage = {
  id: string;
  name: string;
  category?: string;
  side?: boolean;
};

export function moveKey(from: string, to: string): string {
  return `${from}->${to}`;
}

export function isDuplicateMove(rows: MoveRow[], from: string, to: string, exceptIndex?: number): boolean {
  return rows.some((row, index) => index !== exceptIndex && row.from === from && row.to === to);
}

export function duplicateMoveIndexes(rows: MoveRow[]): number[] {
  const first = new Map<string, number>();
  const extras: number[] = [];
  rows.forEach((row, index) => {
    const key = moveKey(row.from, row.to);
    const seen = first.get(key);
    if (seen === undefined) first.set(key, index);
    else extras.push(index);
  });
  return extras;
}

export function unusedMove(stages: MoveStage[], rows: MoveRow[]): { from: string; to: string } | null {
  const used = new Set(rows.map((row) => moveKey(row.from, row.to)));
  for (const from of stages) {
    for (const to of stages) {
      if (from.id === to.id) continue;
      if (!used.has(moveKey(from.id, to.id))) return { from: from.id, to: to.id };
    }
  }
  const first = stages[0];
  if (first && !used.has(moveKey('*', first.id))) return { from: '*', to: first.id };
  return null;
}

function isApproveMove(row: MoveRow): boolean {
  return (row.label ?? '').trim().toLowerCase() === 'approve';
}

function isHoldOrReject(stage: MoveStage | undefined, to: string): boolean {
  if (!stage) return to === 'on_hold' || to === 'rejected';
  if (stage.side) return true;
  if (stage.id === 'on_hold' || stage.id === 'rejected') return true;
  const name = stage.name.trim().toLowerCase();
  return name === 'on hold' || name === 'rejected';
}

/** Moves that leave an Approve-from stage (or Any stage) for a destination that is not Approve, hold or reject. */
export function movesThatBypassApprove(rows: MoveRow[], stages: MoveStage[]): MoveRow[] {
  const approves = rows.filter(isApproveMove);
  if (!approves.length) return [];
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  return rows.filter((row) => {
    if (isApproveMove(row)) return false;
    return approves.some((approve) => {
      if (row.from !== approve.from && row.from !== '*') return false;
      if (row.to === approve.to) return false;
      return !isHoldOrReject(byId.get(row.to), row.to);
    });
  });
}

export function bypassApproveWarning(rows: MoveRow[], stages: MoveStage[]): string | null {
  const bypasses = movesThatBypassApprove(rows, stages);
  if (!bypasses.length) return null;
  const nameOf = (id: string) => (id === '*' ? 'Any stage' : stages.find((stage) => stage.id === id)?.name ?? id);
  const list = bypasses.map((row) => `${nameOf(row.from)} to ${nameOf(row.to)}`).join(', ');
  const many = bypasses.length > 1;
  return `${many ? 'These moves skip' : 'This move skips'} Approve: ${list}. A task can leave Idea without a Business approval.`;
}
