import dayjs from 'dayjs';
import type { Notification } from '../api/types';

export type BellTab = 'action' | 'mentions' | 'updates' | 'all';
export type BellChip = 'reported' | 'assigned' | 'access';

export function stillNeedsAction(note: Notification): boolean {
  if (note.outcome) return false;
  if (note.kind === 'access_request') return note.needsAction !== false;
  return Boolean(note.needsAccept) || Boolean(note.needsAction && note.kind !== 'assigned');
}

export function isBellUnread(note: Notification): boolean {
  return !note.readAt;
}

export function inTab(note: Notification, tab: BellTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'action') {
    if (note.outcome) return false;
    if (note.kind === 'assigned') return !note.readAt;
    return stillNeedsAction(note);
  }
  if (tab === 'mentions') return note.kind === 'mention';
  if (note.kind === 'access_request' && note.outcome) return true;
  if (note.kind === 'assigned' && note.readAt) return true;
  return note.kind === 'moved' || note.kind === 'comment' || note.kind === 'github';
}

/** Opening the task drawer marks these as read. Invites and access requests stay until you accept or decline. */
export function unreadIdsClearedByOpeningTask(items: Notification[], taskKey: string): string[] {
  return items
    .filter((note) => {
      if (note.readAt || note.taskKey !== taskKey) return false;
      if (stillNeedsAction(note)) return false;
      return true;
    })
    .map((note) => note.id);
}

export function matchesFilters(
  note: Notification,
  chips: ReadonlySet<BellChip>,
  meId: string | undefined,
  projectKey: string | null,
  openOnly = false,
): boolean {
  if (projectKey && note.projectKey !== projectKey) return false;
  if (chips.has('reported') && note.reporterId !== meId) return false;
  if (chips.has('assigned') && note.kind !== 'assigned') return false;
  if (chips.has('access') && note.kind !== 'access_request') return false;
  if (openOnly && note.taskKey && note.statusCategory === 'done') return false;
  return true;
}

export type BellItem = {
  id: string;
  ids: string[];
  latest: Notification;
  fromStatus: string | null;
  toStatus: string | null;
  moveCount: number;
  commentCount: number;
};

function canCollapse(note: Notification): boolean {
  return Boolean(note.taskKey) && (note.kind === 'moved' || note.kind === 'comment');
}

export function collapseBellItems(items: Notification[]): BellItem[] {
  const byTask = new Map<string, Notification[]>();
  for (const note of items) {
    if (!canCollapse(note) || !note.taskKey) continue;
    const list = byTask.get(note.taskKey) ?? [];
    list.push(note);
    byTask.set(note.taskKey, list);
  }
  const seen = new Set<string>();
  const out: BellItem[] = [];
  for (const note of items) {
    if (!canCollapse(note) || !note.taskKey) {
      out.push({
        id: note.id,
        ids: [note.id],
        latest: note,
        fromStatus: note.fromStatus ?? null,
        toStatus: note.toStatus ?? null,
        moveCount: note.kind === 'moved' ? 1 : 0,
        commentCount: note.kind === 'comment' ? 1 : 0,
      });
      continue;
    }
    if (seen.has(note.taskKey)) continue;
    seen.add(note.taskKey);
    const group = byTask.get(note.taskKey) ?? [note];
    const chronological = [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const latest = chronological[chronological.length - 1]!;
    const moves = chronological.filter((row) => row.kind === 'moved');
    const comments = chronological.filter((row) => row.kind === 'comment');
    const firstFrom = moves.find((row) => row.fromStatus)?.fromStatus ?? null;
    const lastTo = [...moves].reverse().find((row) => row.toStatus)?.toStatus ?? null;
    out.push({
      id: latest.id,
      ids: group.map((row) => row.id),
      latest,
      fromStatus: firstFrom,
      toStatus: lastTo,
      moveCount: moves.length,
      commentCount: comments.length,
    });
  }
  return out;
}

export function dateGroupLabel(iso: string, now = dayjs()): string {
  const at = dayjs(iso);
  if (at.isSame(now, 'day')) return 'Today';
  if (at.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  if (now.diff(at, 'day') < 7) return 'Earlier this week';
  return 'Earlier';
}

export function groupBellByDate(items: BellItem[], now = dayjs()): { label: string; items: BellItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, BellItem[]>();
  for (const item of items) {
    const label = dateGroupLabel(item.latest.createdAt, now);
    if (!map.has(label)) {
      map.set(label, []);
      order.push(label);
    }
    map.get(label)!.push(item);
  }
  return order.map((label) => ({ label, items: map.get(label)! }));
}

export function updateSummary(item: BellItem): string | null {
  const bits: string[] = [];
  if (item.fromStatus && item.toStatus) bits.push(`${item.fromStatus} → ${item.toStatus}`);
  const counts: string[] = [];
  if (item.moveCount > 1) counts.push(`${item.moveCount} moves`);
  if (item.commentCount > 0) counts.push(`${item.commentCount} comment${item.commentCount === 1 ? '' : 's'}`);
  if (counts.length) bits.push(counts.join(', '));
  return bits.length ? bits.join(' · ') : null;
}

export function itemHeading(item: BellItem): string {
  const note = item.latest;
  if (note.outcome && note.projectKey) {
    const who = note.actor?.name?.trim() || 'Someone';
    return `${who} asked to open ${note.projectKey}`;
  }
  if (note.taskKey) return `${note.taskKey} ${note.taskTitle ?? ''}`.trim();
  return note.text;
}
