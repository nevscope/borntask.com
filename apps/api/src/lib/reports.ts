import {
  addUtcDays,
  countsAsClosed,
  expectedDays,
  formatMinutes,
  formatYmd,
  missingDays,
  parseYmd,
  workingDatesInRange,
} from '@borntask/shared';
import type { Authed } from '../context.js';
import { holidaysInRange, isOwnerAdmin, workspaceTimesheetSettings, ymdOf } from './timesheets.js';
import { forbidden } from '../errors.js';

function averageDays(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, n) => acc + n, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

function medianDays(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

function daysPhrase(n: number | null, suffix: 'days' | 'd'): string {
  if (n == null) return '-';
  return `${n} ${suffix}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function dayLabel(date: Date, withMonth = true): string {
  const day = `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()}`;
  return withMonth ? `${day} ${MONTHS[date.getUTCMonth()]}` : day;
}

function compactSpans(dates: Date[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  const flush = () => {
    const sameMonth = start.getUTCMonth() === prev.getUTCMonth();
    if (formatYmd(start) === formatYmd(prev)) parts.push(dayLabel(start));
    else if (sameMonth) parts.push(`${dayLabel(start, false)} - ${dayLabel(prev)}`);
    else parts.push(`${dayLabel(start)} - ${dayLabel(prev)}`);
  };
  for (const date of sorted.slice(1)) {
    if (date.getTime() - prev.getTime() <= 86400000 + 1) {
      prev = date;
      continue;
    }
    flush();
    start = date;
    prev = date;
  }
  flush();
  return parts.join(', ');
}

function missingDetail(missingDates: Date[], leaveDates: Date[]): string {
  if (missingDates.length === 0) {
    return leaveDates.length === 0 ? 'No time and no days off this period' : `on leave ${compactSpans(leaveDates)}`;
  }
  const leave = leaveDates.length ? ` · on leave ${compactSpans(leaveDates)}` : '';
  return `Missing ${compactSpans(missingDates)}${leave}`;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function msToDays(ms: number): number {
  return ms / (24 * 60 * 60 * 1000);
}

export async function workspaceReports(
  auth: Authed,
  range: { from: string; to: string; projectId?: string; today?: Date },
) {
  if (!isOwnerAdmin(auth.workspaceRole)) throw forbidden('Owners and admins only.');
  const from = parseYmd(range.from);
  const to = parseYmd(range.to);
  const today = range.today ?? new Date();
  const settings = await workspaceTimesheetSettings(auth);
  const holidayRows = await holidaysInRange(auth, from, to);
  const holidaySet = new Set(holidayRows.map((row) => ymdOf(row.date)));

  const taskWhere = {
    deletedAt: null,
    ...(range.projectId ? { projectId: range.projectId } : {}),
  };

  const [tasks, members, entries, daysOff, projects] = await Promise.all([
    auth.db.task.findMany({
      where: taskWhere,
      include: {
        status: true,
        project: { select: { id: true, name: true, colour: true, key: true } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    auth.db.tenantMember.findMany({
      where: { isActive: true, tenantRole: { notIn: ['guest', 'viewer'] } },
      include: { user: { select: { id: true, name: true } } },
    }),
    auth.db.timesheetEntry.findMany({
      where: {
        periodStart: { gte: from, lte: to },
        ...(range.projectId ? { projectId: range.projectId } : {}),
      },
    }),
    auth.db.timesheetDayOff.findMany({
      where: { date: { gte: from, lte: to } },
    }),
    auth.db.project.findMany({
      where: range.projectId ? { id: range.projectId } : {},
      select: { id: true, name: true, colour: true, key: true },
    }),
  ]);

  const startMoves = await auth.db.activityLog.findMany({
    where: {
      taskId: { in: tasks.map((t) => t.id) },
      action: { contains: 'moved' },
    },
    orderBy: { at: 'asc' },
  });

  const firstStart = new Map<string, Date>();
  const statusById = new Map(tasks.map((t) => [t.statusId, t.status]));
  const statuses = await auth.db.workflowStatus.findMany();
  const categoryBySlug = new Map(statuses.map((s) => [s.slug, s.category]));
  for (const move of startMoves) {
    const to = move.toJson && typeof move.toJson === 'object' && 'status' in move.toJson
      ? String((move.toJson as { status: unknown }).status)
      : '';
    const category = categoryBySlug.get(to);
    if (category !== 'active' && category !== 'review') continue;
    if (move.taskId && !firstStart.has(move.taskId)) firstStart.set(move.taskId, move.at);
  }

  const opened = tasks.filter((t) => t.createdAt >= from && t.createdAt <= addEnd(to));
  const closed = tasks.filter((t) => t.completedAt && t.completedAt >= from && t.completedAt <= addEnd(to));
  const open = tasks.filter((t) => !countsAsClosed(t.status.category));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const inFlight = open.filter((t) => t.status.category === 'active' || t.status.category === 'review');
  const unscheduled = open.filter((t) => !t.dueDate).length;
  const deployed = closed.filter((t) => t.status.slug === 'deployed').length;
  const rejected = closed.filter((t) => t.status.slug === 'rejected').length;
  const onHold = open.filter((t) => t.status.slug === 'on-hold').length;
  const weekAhead = addUtcDays(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), 7);
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const closeDays = closed
    .filter((t) => t.completedAt)
    .map((t) => msToDays(t.completedAt!.getTime() - t.createdAt.getTime()));
  const startDays = [...firstStart.entries()]
    .map(([taskId, at]) => {
      const task = tasks.find((t) => t.id === taskId);
      return task ? msToDays(at.getTime() - task.createdAt.getTime()) : null;
    })
    .filter((n): n is number => n !== null);

  const closeDaysByProject = new Map<string, number[]>();
  const startDaysByProject = new Map<string, number[]>();
  const closeDaysByPerson = new Map<string | null, number[]>();
  const byPerson = new Map<string | null, { name: string; open: number; closed: number; overdue: number }>();
  const bumpPerson = (userId: string | null, name: string, field: 'open' | 'closed' | 'overdue') => {
    const row = byPerson.get(userId) ?? { name, open: 0, closed: 0, overdue: 0 };
    row[field] += 1;
    byPerson.set(userId, row);
  };

  const byProject = new Map<string, { name: string; colour: string; key: string; opened: number; closed: number; open: number; flight: number; overdue: number }>();
  for (const project of projects) {
    byProject.set(project.id, { name: project.name, colour: project.colour, key: project.key, opened: 0, closed: 0, open: 0, flight: 0, overdue: 0 });
  }
  for (const task of tasks) {
    const row = byProject.get(task.projectId) ?? {
      name: task.project.name,
      colour: task.project.colour,
      key: task.project.key,
      opened: 0,
      closed: 0,
      open: 0,
      flight: 0,
      overdue: 0,
    };
    if (task.createdAt >= from && task.createdAt <= addEnd(to)) row.opened += 1;
    if (task.completedAt && task.completedAt >= from && task.completedAt <= addEnd(to)) {
      row.closed += 1;
      const days = msToDays(task.completedAt.getTime() - task.createdAt.getTime());
      const list = closeDaysByProject.get(task.projectId) ?? [];
      list.push(days);
      closeDaysByProject.set(task.projectId, list);
      const personList = closeDaysByPerson.get(task.assigneeId) ?? [];
      personList.push(days);
      closeDaysByPerson.set(task.assigneeId, personList);
      bumpPerson(task.assigneeId, task.assignee?.name ?? 'Unassigned', 'closed');
    }
    if (!countsAsClosed(task.status.category)) {
      row.open += 1;
      bumpPerson(task.assigneeId, task.assignee?.name ?? 'Unassigned', 'open');
      if (task.status.category === 'active' || task.status.category === 'review') row.flight += 1;
      if (task.dueDate && task.dueDate < today) {
        row.overdue += 1;
        bumpPerson(task.assigneeId, task.assignee?.name ?? 'Unassigned', 'overdue');
      }
    }
    const startedAt = firstStart.get(task.id);
    if (startedAt) {
      const list = startDaysByProject.get(task.projectId) ?? [];
      list.push(msToDays(startedAt.getTime() - task.createdAt.getTime()));
      startDaysByProject.set(task.projectId, list);
    }
    byProject.set(task.projectId, row);
  }

  const offByUser = new Map<string, Set<string>>();
  for (const row of daysOff) {
    const set = offByUser.get(row.userId) ?? new Set<string>();
    set.add(ymdOf(row.date));
    offByUser.set(row.userId, set);
  }
  const timeByUserDay = new Map<string, Set<string>>();
  const minutesByUserProject = new Map<string, Map<string, number>>();
  let minutesTotal = 0;
  const peopleWithTime = new Set<string>();
  for (const entry of entries) {
    const mins = entry.unit === 'time' ? entry.minutes ?? 0 : 0;
    minutesTotal += mins;
    if ((entry.minutes ?? 0) > 0 || (entry.percent ?? 0) > 0) peopleWithTime.add(entry.userId);
    const byProjectMins = minutesByUserProject.get(entry.userId) ?? new Map<string, number>();
    byProjectMins.set(entry.projectId, (byProjectMins.get(entry.projectId) ?? 0) + mins);
    minutesByUserProject.set(entry.userId, byProjectMins);
    if (entry.periodKind === 'daily' && ((entry.minutes ?? 0) > 0 || (entry.percent ?? 0) > 0)) {
      const set = timeByUserDay.get(entry.userId) ?? new Set<string>();
      set.add(ymdOf(entry.periodStart));
      timeByUserDay.set(entry.userId, set);
    }
    if (entry.periodKind === 'weekly' && ((entry.minutes ?? 0) > 0 || (entry.percent ?? 0) > 0)) {
      const set = timeByUserDay.get(entry.userId) ?? new Set<string>();
      for (const date of workingDatesInRange({
        from: entry.periodStart,
        to: new Date(entry.periodStart.getTime() + 6 * 86400000),
        workingDays: settings.workingDays,
        holidays: holidaySet,
        today,
      })) {
        set.add(formatYmd(date));
      }
      timeByUserDay.set(entry.userId, set);
    }
  }

  const people = members.map((m) => {
    const daysOffCount = offByUser.get(m.userId)?.size ?? 0;
    const loggedDays = timeByUserDay.get(m.userId)?.size ?? 0;
    const expected = expectedDays({
      from,
      to,
      workingDays: settings.workingDays,
      holidays: holidaySet,
      daysOff: offByUser.get(m.userId) ?? [],
      today,
    });
    const projectMins = minutesByUserProject.get(m.userId) ?? new Map();
    const minutes = [...projectMins.values()].reduce((a, b) => a + b, 0);
    const expectedDates = workingDatesInRange({
      from,
      to,
      workingDays: settings.workingDays,
      holidays: holidaySet,
      today,
    }).filter((date) => !(offByUser.get(m.userId)?.has(formatYmd(date)) ?? false));
    const logged = timeByUserDay.get(m.userId) ?? new Set<string>();
    const missingDates = expectedDates.filter((date) => !logged.has(formatYmd(date)));
    const leaveDates = [...(offByUser.get(m.userId) ?? [])].map(parseYmd);
    const missing = missingDays(expected, loggedDays);
    return {
      userId: m.userId,
      name: m.user.name,
      minutes,
      time: formatMinutes(minutes),
      off: daysOffCount,
      loggedDays,
      expected,
      missing,
      complete: loggedDays === expected,
      byProject: Object.fromEntries([...projectMins.entries()].map(([id, mins]) => [id, formatMinutes(mins)])),
      missingDetail: missingDetail(missingDates, leaveDates),
    };
  });

  const complete = people.filter((p) => p.complete).length;
  const missingDayCount = people.reduce((acc, p) => acc + p.missing, 0);
  const daysOffCount = people.reduce((acc, p) => acc + p.off, 0);

  const timeByProject = projects.map((project) => {
    let minutes = 0;
    const who = new Set<string>();
    for (const entry of entries) {
      if (entry.projectId !== project.id) continue;
      minutes += entry.unit === 'time' ? entry.minutes ?? 0 : 0;
      if ((entry.minutes ?? 0) > 0 || (entry.percent ?? 0) > 0) who.add(entry.userId);
    }
    return {
      projectId: project.id,
      name: project.name,
      colour: project.colour,
      minutes,
      time: formatMinutes(minutes),
      people: who.size,
      share: minutesTotal ? `${Math.round((minutes / minutesTotal) * 100)}%` : '0%',
    };
  });

  const medianClose = medianDays(closeDays);
  const medianStart = medianDays(startDays);
  const avgClose = averageDays(closeDays);
  const avgStart = averageDays(startDays);
  const workingDaysSoFar = expectedDays({
    from,
    to,
    workingDays: settings.workingDays,
    holidays: holidaySet,
    today,
  });

  const upcoming = open
    .filter((t) => t.dueDate && t.dueDate >= todayStart && t.dueDate <= weekAhead)
    .sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0))
    .slice(0, 8)
    .map((t) => {
      const dueYmd = t.dueDate ? ymdOf(t.dueDate) : '';
      const todayYmd = formatYmd(todayStart);
      return {
        key: `${t.project.key}-${t.number}`,
        title: t.title,
        who: t.assignee?.name ?? 'Unassigned',
        status: t.status.name,
        due: dueYmd === todayYmd ? 'Today' : dayLabel(t.dueDate!),
        dueTone: dueYmd === todayYmd ? 'today' as const : 'normal' as const,
      };
    });

  void statusById;
  return {
    range: { from: range.from, to: range.to },
    timeZone: settings.timeZone,
    workingDaysSoFar,
    holidays: holidayRows.map((row) => ({ date: ymdOf(row.date), name: row.name })),
    tasks: {
      opened: opened.length,
      closed: closed.length,
      closedHint: closed.length ? `${deployed} deployed · ${rejected} rejected` : '',
      open: open.length,
      openHint: `${inFlight.length} in flight · ${onHold} on hold`,
      overdue: overdue.length,
      unscheduled,
      inFlight: inFlight.length,
      closeDays: daysPhrase(medianClose, 'days'),
      closeHint: avgClose != null ? `median · average ${avgClose} days` : '',
      startDays: daysPhrase(medianStart, 'days'),
      startHint: avgStart != null ? `median · average ${avgStart} days · to first move into WIP or review` : '',
      avgCloseDays: avgClose,
      avgStartDays: avgStart,
      medianCloseDays: medianClose,
      medianStartDays: medianStart,
      byProject: [...byProject.entries()].map(([projectId, row]) => ({
        projectId,
        ...row,
        close: daysPhrase(medianDays(closeDaysByProject.get(projectId) ?? []), 'd'),
        start: daysPhrase(medianDays(startDaysByProject.get(projectId) ?? []), 'd'),
      })),
      byPerson: [...byPerson.entries()].map(([userId, row]) => ({
        userId,
        name: row.name,
        initials: initialsOf(row.name),
        open: row.open,
        closed: row.closed,
        overdue: row.overdue,
        close: daysPhrase(medianDays(closeDaysByPerson.get(userId) ?? []), 'd'),
      })),
      upcoming,
    },
    timesheets: {
      minutes: minutesTotal,
      time: formatMinutes(minutesTotal),
      peopleWithTime: peopleWithTime.size,
      peopleTotal: members.length,
      complete,
      missingDays: missingDayCount,
      daysOff: daysOffCount,
      people,
      byProject: timeByProject,
      missing: people
        .filter((p) => p.missing > 0)
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          missing: p.missing,
          off: p.off,
          detail: p.missingDetail,
        })),
    },
  };
}

function addEnd(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
}
