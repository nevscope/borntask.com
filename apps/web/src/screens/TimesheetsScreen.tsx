import {
  addUtcDays,
  expectedDays,
  formatMinutes,
  formatMixedTotals,
  formatYmd,
  isTimesheetLocked,
  isWorkingDay,
  parseTimeToMinutes,
  parseYmd,
  timesheetLockLabel,
  weekStartFor,
} from '@borntask/shared';
import { Alert, App, Button, Dropdown, Input, Popover, Select, Skeleton } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/http';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  useMe,
  usePeople,
  useProjects,
  useSaveDaysOff,
  useSaveTimesheets,
  useTimesheets,
  useWorkspaceSettings,
  type TimesheetEntryWrite,
} from '../api/queries';
import { LogoMark } from '../components/Logo';
import { color, font, radius } from '../theme/tokens';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function dayLabel(date: Date): string {
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function weekRangeLabel(start: Date): string {
  const end = addUtcDays(start, 6);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const left = `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}${sameYear ? '' : ` ${start.getUTCFullYear()}`}`;
  const right = `${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
  return sameMonth && sameYear
    ? `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]} - ${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]} ${end.getUTCFullYear()}`
    : `${left} - ${right}`;
}

function kindLabel(kind: string | null | undefined): string {
  if (kind === 'leave') return 'Leave';
  if (kind === 'other') return 'Other';
  return 'Off';
}

type CellDraft = { text: string; note: string; unit: 'time' | 'percent' };

function cellKey(projectId: string, periodStart: string) {
  return `${projectId}:${periodStart}`;
}

export function TimesheetsScreen() {
  const { message } = App.useApp();
  const me = useMe().data;
  const settings = useWorkspaceSettings();
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false && p.acceptsTimesheets);
  const people = usePeople();
  const weekStartSetting = settings.data?.weekStart ?? 'monday';
  const workspaceWorkingDays = settings.data?.workingDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'];
  const editDays = settings.data?.timesheetEditDays ?? 7;
  const guest = me?.workspaceRole === 'guest' || me?.workspaceRole === 'viewer';

  const [anchor, setAnchor] = useState(() => utcToday());
  const weekStart = useMemo(() => weekStartFor(anchor, weekStartSetting), [anchor, weekStartSetting]);
  const weekEnd = useMemo(() => addUtcDays(weekStart, 6), [weekStart]);
  const from = formatYmd(weekStart);
  const to = formatYmd(weekEnd);
  const lastFrom = formatYmd(addUtcDays(weekStart, -7));
  const lastTo = formatYmd(addUtcDays(weekStart, -1));

  const leadsProjects = projects.filter((p) => p.leadId === me?.user.id);
  const canViewOthers = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin' || leadsProjects.length > 0;
  const [viewUserId, setViewUserId] = useState<string | undefined>();
  const viewingOther = Boolean(viewUserId && viewUserId !== me?.user.id);
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const selfExempt = Boolean(me?.timesheetsExempt) && !viewingOther;
  const readOnly = (viewingOther && !canAdmin) || selfExempt;
  const sheetUserId = viewUserId && viewUserId !== me?.user.id ? viewUserId : undefined;

  const sheet = useTimesheets(from, to, viewUserId, !guest);
  const lastWeek = useTimesheets(lastFrom, lastTo, viewUserId, !guest);
  const workingDays = sheet.data?.workingDays ?? workspaceWorkingDays;
  const timesheetsStartOn = sheet.data?.expectedFrom
    ? parseYmd(sheet.data.expectedFrom)
    : settings.data?.timesheetsStartOn
      ? parseYmd(settings.data.timesheetsStartOn)
      : null;
  const period = sheet.data?.timesheetPeriod ?? settings.data?.timesheetPeriod ?? 'weekly';
  const unit = sheet.data?.timesheetUnit ?? settings.data?.timesheetUnit ?? 'time';
  const saveEntries = useSaveTimesheets();
  const saveDaysOff = useSaveDaysOff();

  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  const [invalidCells, setInvalidCells] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [noteCell, setNoteCell] = useState<{ projectId: string; periodStart: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [sessionShownIds, setSessionShownIds] = useState<string[] | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Map<string, TimesheetEntryWrite>>(new Map());

  useEffect(() => {
    setDrafts({});
    setInvalidCells({});
    setNoteCell(null);
    setExtraOpen(false);
    setSessionShownIds(null);
    setCopyConfirmOpen(false);
  }, [from, viewUserId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addUtcDays(weekStart, i)), [weekStart]);
  const today = utcToday();
  const weekLocked = isTimesheetLocked({ periodStart: weekStart, periodKind: 'weekly', editDays, today });
  const dayLocked = (ymd: string) =>
    isTimesheetLocked({ periodStart: parseYmd(ymd), periodKind: 'daily', editDays, today });
  const periodLocked = period === 'weekly' ? weekLocked : days.every((d) => dayLocked(formatYmd(d)));
  const holidayByDate = useMemo(() => new Map((sheet.data?.holidays ?? []).map((h) => [h.date, h.name])), [sheet.data]);
  const offByDate = useMemo(() => new Map((sheet.data?.daysOff ?? []).map((d) => [d.date, d])), [sheet.data]);

  const flush = useCallback(async () => {
    const batch = [...pending.current.values()];
    pending.current.clear();
    if (batch.length === 0 || readOnly) return;
    setSaveState('saving');
    try {
      await saveEntries.mutateAsync({ entries: batch, userId: sheetUserId });
      setSaveState('saved');
      setSaveError(null);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the timesheet.');
    }
  }, [readOnly, saveEntries, sheetUserId]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onLeave = () => { void flushRef.current(); };
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      void flushRef.current();
    };
  }, [from, sheetUserId]);

  const queueSave = useCallback(
    (entry: TimesheetEntryWrite) => {
      if (readOnly) return;
      if (isTimesheetLocked({ periodStart: parseYmd(entry.periodStart), periodKind: entry.periodKind, editDays, today: utcToday() })) return;
      pending.current.set(`${entry.projectId}:${entry.periodStart}`, entry);
      setSaveState('saving');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flush(), 450);
    },
    [editDays, flush, readOnly],
  );

  const entryOf = (projectId: string, periodStart: string) =>
    sheet.data?.entries.find((e) => e.projectId === projectId && e.periodStart === periodStart && e.periodKind === period);

  const displayCell = (projectId: string, periodStart: string): CellDraft => {
    const draft = drafts[cellKey(projectId, periodStart)];
    if (draft) return draft;
    const row = entryOf(projectId, periodStart);
    if (!row) return { text: '', note: '', unit };
    if (row.unit === 'percent') return { text: row.percent ? String(row.percent) : '', note: row.note ?? '', unit: 'percent' };
    return { text: row.minutes ? formatMinutes(row.minutes) : '', note: row.note ?? '', unit: 'time' };
  };

  const markCellInvalid = (key: string, message: string) => {
    setInvalidCells((prev) => ({ ...prev, [key]: true }));
    setSaveState('error');
    setSaveError(message);
  };

  const clearCellInvalid = (key: string) => {
    setInvalidCells((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const dayMinutesExcluding = (projectId: string, periodStart: string) =>
    projects.reduce((acc, p) => {
      if (p.id === projectId) return acc;
      const cell = displayCell(p.id, periodStart);
      if (cell.unit === 'percent') return acc;
      return acc + (parseTimeToMinutes(cell.text) ?? 0);
    }, 0);

  const commitCell = (projectId: string, periodStart: string) => {
    if (readOnly) return;
    if (isTimesheetLocked({ periodStart: parseYmd(periodStart), periodKind: period, editDays, today })) return;
    const key = cellKey(projectId, periodStart);
    const merged = displayCell(projectId, periodStart);
    const empty = !merged.text.trim() && !merged.note.trim();
    if (merged.unit === 'time') {
      if (!merged.text.trim()) {
        clearCellInvalid(key);
        queueSave({
          projectId,
          periodKind: period,
          periodStart,
          unit: 'time',
          minutes: 0,
          percent: null,
          note: merged.note || null,
          clear: empty,
        });
        return;
      }
      const minutes = parseTimeToMinutes(merged.text);
      if (minutes == null) {
        markCellInvalid(key, 'Use 2:30 or 2.5.');
        return;
      }
      if (period === 'daily' && dayMinutesExcluding(projectId, periodStart) + minutes > 24 * 60) {
        markCellInvalid(key, 'A day cannot exceed 24:00.');
        return;
      }
      const formatted = minutes === 0 ? '' : formatMinutes(minutes);
      setDrafts((prev) => ({ ...prev, [key]: { ...merged, text: formatted, unit: 'time' } }));
      clearCellInvalid(key);
      if (saveState === 'error' && Object.keys(invalidCells).every((k) => k === key || !invalidCells[k])) {
        setSaveError(null);
      }
      queueSave({
        projectId,
        periodKind: period,
        periodStart,
        unit: 'time',
        minutes,
        percent: null,
        note: merged.note || null,
        clear: empty,
      });
      return;
    }
    const percent = merged.text.trim() === '' ? 0 : Number.parseInt(merged.text, 10);
    if (merged.text.trim() && (Number.isNaN(percent) || percent < 0 || percent > 100)) {
      markCellInvalid(key, 'Use a percentage from 0 to 100.');
      return;
    }
    clearCellInvalid(key);
    queueSave({
      projectId,
      periodKind: period,
      periodStart,
      unit: 'percent',
      minutes: null,
      percent: Number.isNaN(percent) ? 0 : percent,
      note: merged.note || null,
      clear: empty,
    });
  };

  const setCell = (projectId: string, periodStart: string, next: Partial<CellDraft>) => {
    if (isTimesheetLocked({ periodStart: parseYmd(periodStart), periodKind: period, editDays, today })) return;
    const current = displayCell(projectId, periodStart);
    const merged = { ...current, ...next };
    setDrafts((prev) => ({ ...prev, [cellKey(projectId, periodStart)]: merged }));
    if (next.text !== undefined) return;
    const key = cellKey(projectId, periodStart);
    const empty = !merged.text.trim() && !merged.note.trim();
    if (merged.unit === 'time' && merged.text.trim() && parseTimeToMinutes(merged.text) == null) {
      markCellInvalid(key, 'Use 2:30 or 2.5.');
      return;
    }
    clearCellInvalid(key);
    queueSave({
      projectId,
      periodKind: period,
      periodStart,
      unit: merged.unit,
      minutes: merged.unit === 'time' ? parseTimeToMinutes(merged.text) ?? 0 : null,
      percent: merged.unit === 'percent' ? (merged.text.trim() === '' ? 0 : Number.parseInt(merged.text, 10) || 0) : null,
      note: merged.note || null,
      clear: empty,
    });
  };

  const clearLoggedCell = (projectId: string, periodStart: string) => {
    if (readOnly) return;
    if (isTimesheetLocked({ periodStart: parseYmd(periodStart), periodKind: period, editDays, today })) return;
    const current = displayCell(projectId, periodStart);
    setDrafts((prev) => ({ ...prev, [cellKey(projectId, periodStart)]: { text: '', note: '', unit: current.unit } }));
    clearCellInvalid(cellKey(projectId, periodStart));
    setNoteCell(null);
    pending.current.set(`${projectId}:${periodStart}`, {
      projectId,
      periodKind: period,
      periodStart,
      unit: current.unit,
      minutes: current.unit === 'time' ? 0 : null,
      percent: current.unit === 'percent' ? 0 : null,
      note: null,
      clear: true,
    });
    window.clearTimeout(saveTimer.current);
    void flush();
  };

  const dayHasTime = (ymd: string) =>
    projects.some((p) => {
      const cell = displayCell(p.id, ymd);
      if (cell.unit === 'percent') return Number(cell.text) > 0;
      return (parseTimeToMinutes(cell.text) ?? 0) > 0;
    });

  const dayTimeLabel = (ymd: string) => {
    let minutes = 0;
    let percent = 0;
    let usedPercent = false;
    for (const p of projects) {
      const cell = displayCell(p.id, ymd);
      if (cell.unit === 'percent') {
        usedPercent = true;
        percent += Number(cell.text) || 0;
      } else {
        minutes += parseTimeToMinutes(cell.text) ?? 0;
      }
    }
    if (usedPercent && minutes === 0) return `${percent}%`;
    if (minutes > 0 && usedPercent) return formatMixedTotals(minutes, percent);
    if (minutes > 0) return formatMinutes(minutes);
    return '';
  };

  const markOff = async (ymd: string, kind: 'leave' | 'other' | null) => {
    if (readOnly || dayLocked(ymd)) return;
    try {
      setSaveState('saving');
      await saveDaysOff.mutateAsync(
        kind
          ? { userId: sheetUserId, days: [{ date: ymd, kind }] }
          : { userId: sheetUserId, days: [{ date: ymd, clear: true }] },
      );
      setSaveState('saved');
      setSaveError(null);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not update the day off.');
    }
  };

  const weekDays = period === 'daily' ? days : [weekStart];
  const periodStarts = weekDays.map(formatYmd);

  const copyWrites = (): TimesheetEntryWrite[] =>
    (lastWeek.data?.entries ?? [])
      .filter((row) => row.periodKind === period)
      .map((row) => {
        const start = formatYmd(addUtcDays(parseYmd(row.periodStart), 7));
        return {
          projectId: row.projectId,
          periodKind: row.periodKind,
          periodStart: start,
          unit: row.unit,
          minutes: row.minutes,
          percent: row.percent,
          note: row.note,
        };
      })
      .filter((row) => !offByDate.has(row.periodStart) && !dayLocked(row.periodStart));

  const applyCopiedDrafts = (writes: TimesheetEntryWrite[]) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const row of writes) {
        const text =
          row.unit === 'percent'
            ? row.percent
              ? String(row.percent)
              : ''
            : row.minutes
              ? formatMinutes(row.minutes)
              : '';
        next[cellKey(row.projectId, row.periodStart)] = { text, note: row.note ?? '', unit: row.unit };
      }
      return next;
    });
  };

  const runCopyLastWeek = async (writes: TimesheetEntryWrite[]) => {
    setSaveState('saving');
    try {
      await saveEntries.mutateAsync({ entries: writes, userId: sheetUserId });
      applyCopiedDrafts(writes);
      setSaveState('saved');
      setSaveError(null);
      message.success(
        `Copied ${writes.length} ${writes.length === 1 ? 'entry' : 'entries'} from last week. Cells that already had time were replaced.`,
      );
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not copy last week.');
    }
  };

  const copyLastWeek = async (force = false) => {
    if (readOnly || weekLocked) return;
    const writes = copyWrites();
    if (writes.length === 0) {
      message.info('Last week has no entries to copy.');
      return;
    }
    const weekHasTime = periodStarts.some((ymd) => dayHasTime(ymd));
    if (weekHasTime && !force) {
      setCopyConfirmOpen(true);
      return;
    }
    await runCopyLastWeek(writes);
  };

  const partsOf = (projectId: string, ymd: string) => {
    const cell = displayCell(projectId, ymd);
    if (cell.unit === 'percent') return { minutes: 0, percent: Number(cell.text) || 0 };
    return { minutes: parseTimeToMinutes(cell.text) ?? 0, percent: 0 };
  };

  const addParts = (a: { minutes: number; percent: number }, b: { minutes: number; percent: number }) => ({
    minutes: a.minutes + b.minutes,
    percent: a.percent + b.percent,
  });

  const dayTotals = days.map((date) => {
    const ymd = formatYmd(date);
    if (offByDate.has(ymd)) return { kind: 'off' as const, label: kindLabel(offByDate.get(ymd)?.kind), minutes: 0, percent: 0 };
    const sum = projects.reduce((acc, p) => addParts(acc, partsOf(p.id, period === 'daily' ? ymd : from)), { minutes: 0, percent: 0 });
    return { kind: 'sum' as const, label: '', minutes: period === 'daily' ? sum.minutes : 0, percent: period === 'daily' ? sum.percent : 0 };
  });

  const weekParts = projects.reduce((acc, p) => {
    if (period === 'weekly') return addParts(acc, partsOf(p.id, from));
    return days.reduce((n, d) => addParts(n, partsOf(p.id, formatYmd(d))), acc);
  }, { minutes: 0, percent: 0 });

  const todayYmd = formatYmd(today);
  const todayParts = period === 'daily'
    ? projects.reduce((acc, p) => addParts(acc, partsOf(p.id, todayYmd)), { minutes: 0, percent: 0 })
    : weekParts;

  const lastWeekParts = (lastWeek.data?.entries ?? []).filter((row) => row.periodKind === period).reduce(
    (acc, row) => {
      if (row.unit === 'percent') return { minutes: acc.minutes, percent: acc.percent + (row.percent ?? 0) };
      return { minutes: acc.minutes + (row.minutes ?? 0), percent: acc.percent };
    },
    { minutes: 0, percent: 0 },
  );

  const holidaySet = [...holidayByDate.keys()];
  const offSet = [...offByDate.keys()];
  const daysExpected = expectedDays({
    from: weekStart,
    to: weekEnd,
    workingDays,
    holidays: holidaySet,
    daysOff: offSet,
    today,
    startOn: timesheetsStartOn,
  });
  const daysFilled = days.filter((date) => {
    const ymd = formatYmd(date);
    if (date.getTime() > today.getTime()) return false;
    if (!isWorkingDay(date, workingDays) || holidayByDate.has(ymd) || offByDate.has(ymd)) return false;
    return dayHasTime(period === 'daily' ? ymd : from);
  }).length;

  const offWhich = days.filter((d) => offByDate.has(formatYmd(d))).map((d) => DAY_SHORT[d.getUTCDay()]).join(', ');

  const mixedUnits = (sheet.data?.entries ?? []).some((e) => e.periodKind === period && e.unit !== unit);
  const openable = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, 'en-GB')),
    [projects],
  );

  useEffect(() => {
    if (!sheet.data) return;
    const hasSaved = (projectId: string) =>
      (sheet.data?.entries ?? []).some((row) => {
        if (row.projectId !== projectId || row.periodKind !== period) return false;
        return (row.minutes ?? 0) > 0 || (row.percent ?? 0) > 0 || Boolean(row.note);
      });
    const mustIds = openable.filter((p) => hasSaved(p.id)).map((p) => p.id);
    const extraIds = openable.filter((p) => !mustIds.includes(p.id)).map((p) => p.id);
    const minRows = Math.min(openable.length, Math.max(2, 4));
    setSessionShownIds((prev) => {
      const keep = new Set(prev ?? []);
      for (const id of mustIds) keep.add(id);
      for (const id of extraIds) {
        if (keep.size >= minRows) break;
        keep.add(id);
      }
      const next = openable.filter((p) => keep.has(p.id)).map((p) => p.id);
      if (prev && prev.length === next.length && prev.every((id, i) => id === next[i])) return prev;
      return next;
    });
  }, [openable, sheet.data, period]);

  const shown = extraOpen
    ? openable
    : openable.filter((p) => (sessionShownIds ?? openable.slice(0, 4).map((row) => row.id)).includes(p.id));
  const hiddenCount = Math.max(0, openable.length - shown.length);

  const lockedDays = days.filter((d) => dayLocked(formatYmd(d)));
  const openDays = days.filter((d) => !dayLocked(formatYmd(d)));
  const partialLock = period === 'daily' && !periodLocked && lockedDays.length > 0 && openDays.length > 0 && editDays >= 0;
  const firstOpen = openDays[0];
  const openDayNames = openDays.map((d) => DAY_SHORT[d.getUTCDay()]).join(', ');
  const partialLockMessage = firstOpen
    ? `Days before ${DAY_SHORT[firstOpen.getUTCDay()]} ${dayLabel(firstOpen)} are locked. ${openDayNames} ${openDays.length === 1 ? 'is' : 'are'} still open.`
    : '';
  const hideCopy = readOnly || weekLocked;
  const hideHint = viewingOther || readOnly || periodLocked;

  const viewingName = people.data?.find((p) => p.id === viewUserId)?.name;
  const maxWeeklyOff = days.filter((d) => isWorkingDay(d, workingDays) && !holidayByDate.has(formatYmd(d))).length;
  const weekOffCount = sheet.data?.daysOff.length ?? 0;
  const weekOffKind = (sheet.data?.daysOff[0]?.kind ?? 'leave') as 'leave' | 'other';
  const weekOffNote = sheet.data?.daysOff[0]?.note ?? '';

  const subtitle =
    period === 'daily'
      ? unit === 'time'
        ? 'Daily entries in hours, against projects · set by your workspace'
        : 'Daily entries as a percentage, against projects · set by your workspace'
      : unit === 'time'
        ? 'Weekly entries in hours, against projects · set by your workspace'
        : 'Weekly entries as a percentage, against projects · set by your workspace';

  const fmtParts = (parts: { minutes: number; percent: number }) => formatMixedTotals(parts.minutes, parts.percent);

  if (guest) {
    return (
      <div className="bt-page" style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center' }}>
        <LogoMark size={40} />
        <strong style={{ display: 'block', marginTop: 12, fontSize: 15 }}>Timesheets are for workspace members</strong>
        <p style={{ margin: '8px 0 0', color: color.muted, fontSize: 13 }}>
          Guests and viewers don't log time in {me?.workspace.name ?? 'this workspace'}.
        </p>
        <Link to="/" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>Back to My tasks</Link>
      </div>
    );
  }

  if (me?.timesheetsExempt && !viewingOther && !canAdmin) {
    return (
      <div className="bt-page" style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center' }}>
        <LogoMark size={40} />
        <strong style={{ display: 'block', marginTop: 12, fontSize: 15 }}>You do not fill timesheets</strong>
        <p style={{ margin: '8px 0 0', color: color.muted, fontSize: 13 }}>
          An owner or admin can change this under People and invitations.
        </p>
        <Link to="/" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>Back to My tasks</Link>
      </div>
    );
  }

  if (settings.isLoading || sheet.isLoading) {
    return <div className="bt-page"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  }

  if (openable.length === 0) {
    return (
      <div className="bt-page" style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color.faint} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <strong style={{ display: 'block', marginTop: 12, fontSize: 15 }}>No projects to log time against</strong>
        <p style={{ margin: '8px 0 0', color: color.muted, fontSize: 13 }}>A project lead or admin turns on Accept timesheets on the project. You also need a seat on that project.</p>
        <Link to="/projects" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>See projects</Link>
      </div>
    );
  }

  return (
    <div className="bt-page" style={{ maxWidth: 1120, gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <h1 className="bt-h1" style={{ fontSize: 26 }}>Timesheets</h1>
          <p style={{ margin: '6px 0 0', color: color.muted, fontSize: 13.5 }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {canViewOthers && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              Viewing
              <Select
                aria-label="Viewing"
                style={{ minWidth: 180 }}
                value={viewUserId ?? me?.user.id}
                onChange={(id) => setViewUserId(id === me?.user.id ? undefined : id)}
                options={[
                  { value: me?.user.id ?? 'me', label: 'Me' },
                  ...(people.data ?? [])
                    .filter((p) => {
                      if (p.id === me?.user.id || p.workspaceRole === 'guest' || p.workspaceRole === 'viewer') return false;
                      if (canAdmin) return true;
                      const leadIds = new Set(leadsProjects.map((proj) => proj.id));
                      return (p.projectIds ?? []).some((id) => leadIds.has(id));
                    })
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </label>
          )}
          {viewingOther && (
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: color.chip, color: color.ink3 }}>
              {canAdmin ? `Editing ${viewingName ?? 'this person'}` : 'Read-only'}
            </span>
          )}
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: saveState === 'error' ? color.danger : color.brandStrong }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Could not save' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          <span style={{ visibility: hideCopy ? 'hidden' : 'visible', pointerEvents: hideCopy ? 'none' : 'auto' }}>
            <Button onClick={() => void copyLastWeek()}>Copy last week</Button>
          </span>
          <div role="group" aria-label="Week" style={{ display: 'flex', alignItems: 'center', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface }}>
            <Button type="text" aria-label="Previous week" onClick={() => setAnchor(addUtcDays(weekStart, -7))} style={{ width: 36 }}>‹</Button>
            <span style={{ padding: '0 6px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{weekRangeLabel(weekStart)}</span>
            <Button type="text" aria-label="Next week" onClick={() => setAnchor(addUtcDays(weekStart, 7))} style={{ width: 36 }}>›</Button>
          </div>
          <Button onClick={() => setAnchor(utcToday())}>This week</Button>
        </div>
      </div>

      {saveError && <Alert type="error" showIcon message={saveError} />}
      {selfExempt && (
        <Alert type="info" showIcon message="You are marked as not filling timesheets. You can still view other people's entries." />
      )}
      {!readOnly && periodLocked && editDays >= 0 && (
        <Alert
          type="info"
          showIcon
          message={`This week is locked. People can only change timesheets for ${timesheetLockLabel(editDays)} so reports stay stable.`}
        />
      )}
      {!readOnly && partialLock && (
        <Alert type="info" showIcon message={partialLockMessage} />
      )}
      {mixedUnits && (
        <Alert
          type="info"
          showIcon
          message={`Your workspace now uses ${unit === 'percent' ? 'percentages' : 'hours'}. Earlier entries keep the unit they were saved in.`}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="This week" value={fmtParts(weekParts)} />
        <Tile
          label={period === 'daily' ? `Today, ${DAY_SHORT[today.getUTCDay()]} ${dayLabel(today)}` : `Week of ${dayLabel(weekStart)}`}
          value={fmtParts(todayParts)}
        />
        <Tile label="Last week" value={fmtParts(lastWeekParts)} />
        <Tile
          label="Days logged so far"
          value={
            <>
              {daysFilled}{' '}
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: color.muted }}>of {daysExpected} expected</span>
            </>
          }
        />
        <Tile
          label="Days off this week"
          value={
            <>
              {offSet.length}{' '}
              <span style={{ fontFamily: font.ui, fontSize: 14, fontWeight: 500, color: color.muted }}>{offWhich}</span>
            </>
          }
        />
      </div>

      {period === 'weekly' && !readOnly && !weekLocked && (
        <section style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
            <span style={{ flex: 1, fontWeight: 600 }}>Week of {dayLabel(weekStart)}</span>
            <span style={{ fontSize: 12.5, color: color.muted }}>
              {holidayByDate.size ? `${holidayByDate.size} public holiday${holidayByDate.size === 1 ? '' : 's'}` : unit === 'time' ? 'hh:mm' : 'Mon - Sun'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${color.divider}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
              {viewingOther ? 'Days off' : 'My days off'}
              <Select
                aria-label="My days off"
                value={weekOffCount}
                style={{ width: 72 }}
                options={Array.from({ length: maxWeeklyOff + 1 }, (_, n) => ({ value: n, label: String(n) }))}
                onChange={(count) => void saveDaysOff.mutateAsync({ userId: sheetUserId, week: { weekStart: from, count, kind: weekOffKind, note: weekOffNote || null } })}
              />
            </label>
            {(!viewingOther || canAdmin) && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
                  Type
                  <Select
                    aria-label="Day off type"
                    value={weekOffKind}
                    style={{ width: 120 }}
                    options={[{ value: 'leave', label: 'Leave' }, { value: 'other', label: 'Other' }]}
                    onChange={(kind) => void saveDaysOff.mutateAsync({ userId: sheetUserId, week: { weekStart: from, count: weekOffCount, kind, note: weekOffNote || null } })}
                  />
                </label>
                <Input
                  placeholder="Note (optional)"
                  aria-label="Days off note"
                  style={{ flex: '1 1 140px', maxWidth: 280 }}
                  defaultValue={weekOffNote}
                  onBlur={(e) => void saveDaysOff.mutateAsync({ userId: sheetUserId, week: { weekStart: from, count: weekOffCount, kind: weekOffKind, note: e.target.value || null } })}
                />
              </>
            )}
          </div>
          <p style={{ margin: 0, padding: '10px 16px', borderTop: `1px solid ${color.divider}`, background: color.subtle, fontSize: 12.5, color: color.muted, lineHeight: 1.45 }}>
            Expected this week: {days.filter((d) => isWorkingDay(d, workingDays)).length} working days
            {holidayByDate.size ? `, minus ${holidayByDate.size} holiday${holidayByDate.size === 1 ? '' : 's'}` : ''}
            {weekOffCount ? `, minus ${weekOffCount} days off` : ''}
            {' = '}
            {daysExpected} days. The count can't go above the working days left after holidays ({maxWeeklyOff} here).
          </p>
        </section>
      )}

      {period === 'weekly' ? (
        <WeeklyGrid
          projects={shown}
          unit={unit}
          weekStart={weekStart}
          from={from}
          displayCell={displayCell}
          setCell={setCell}
          commitCell={commitCell}
          invalidCells={invalidCells}
          readOnly={readOnly || weekLocked}
          weekParts={weekParts}
        />
      ) : (
        <DailyGrid
          projects={shown}
          days={days}
          today={today}
          holidayByDate={holidayByDate}
          offByDate={offByDate}
          workingDays={workingDays}
          displayCell={displayCell}
          setCell={setCell}
          commitCell={commitCell}
          invalidCells={invalidCells}
          readOnly={readOnly}
          dayLocked={dayLocked}
          dayHasTime={dayHasTime}
          markOff={markOff}
          dayTotals={dayTotals}
          weekParts={weekParts}
          noteCell={noteCell}
          setNoteCell={setNoteCell}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          hideOffKind={viewingOther && !canAdmin}
          dayTimeLabel={dayTimeLabel}
          clearLoggedCell={clearLoggedCell}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 40, fontSize: 12.5, color: color.muted }}>
        <span style={{ visibility: hideHint ? 'hidden' : 'visible' }}>
          {unit === 'time' ? (
            <>Type <kbd className="bt-kbd">2:30</kbd> or <kbd className="bt-kbd">2.5</kbd>. Tab moves to the next {period === 'daily' ? 'day' : 'project'}. Changes save as you go. Click a filled cell again to add a note.{period === 'daily' ? ' Open a day\'s menu to mark it off.' : ''}</>
          ) : (
            <>Type a percentage. Changes save as you go. Weeks and days usually add up to 100%, but short totals still save.</>
          )}
        </span>
        {hiddenCount > 0 && (
          <Button type="link" onClick={() => setExtraOpen(true)} style={{ fontWeight: 600 }}>
            Show {hiddenCount} more project{hiddenCount === 1 ? '' : 's'} you're on
          </Button>
        )}
      </div>

      {viewingOther && viewingName && (
        <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
          {canAdmin
            ? 'You can see this because you are an owner/admin.'
            : `You lead ${leadsProjects.map((p) => p.name).join(' and ') || 'these projects'}, so you only see ${viewingName}'s time on those. Days off show as "Off"; the type and note stay private to ${viewingName}, owners and admins.`}
        </p>
      )}
      {viewingOther && (sheet.data?.corrections ?? []).length > 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
          {(sheet.data?.corrections ?? []).map((row) => {
            const actor = people.data?.find((p) => p.id === row.actorId)?.name ?? 'Someone';
            return `${actor} updated this timesheet via ${row.via === 'app' ? 'app' : row.via}`;
          }).join(' · ')}
        </p>
      )}

      <ConfirmDialog
        open={copyConfirmOpen}
        title="Replace filled cells with last week?"
        confirmLabel="Replace"
        tone="primary"
        onCancel={() => setCopyConfirmOpen(false)}
        onConfirm={() => {
          setCopyConfirmOpen(false);
          void copyLastWeek(true);
        }}
      >
        Copied cells replace time already entered this week.
      </ConfirmDialog>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ flex: '1 1 180px', padding: '14px 16px', background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg }}>
      <div style={{ fontSize: 12.5, color: color.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: font.display, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function ProjectCell({ name, colorSwatch, meta }: { name: string; colorSwatch: string; meta?: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 16px', minWidth: 0 }}>
      <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 3, background: colorSwatch }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        {meta && <span style={{ display: 'block', fontSize: 12, color: color.muted }}>{meta}</span>}
      </span>
    </span>
  );
}

function WeeklyGrid({
  projects,
  unit,
  weekStart,
  from,
  displayCell,
  setCell,
  commitCell,
  invalidCells,
  readOnly,
  weekParts,
}: {
  projects: { id: string; name: string; color: string }[];
  unit: 'time' | 'percent';
  weekStart: Date;
  from: string;
  displayCell: (projectId: string, periodStart: string) => CellDraft;
  setCell: (projectId: string, periodStart: string, next: Partial<CellDraft>) => void;
  commitCell: (projectId: string, periodStart: string) => void;
  invalidCells: Record<string, boolean>;
  readOnly: boolean;
  weekParts: { minutes: number; percent: number };
}) {
  const pctTotal = weekParts.percent;
  return (
    <section aria-label="Time per project" style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Week of {dayLabel(weekStart)}</span>
        <span style={{ fontSize: 12.5, color: color.muted }}>{unit === 'percent' ? 'Mon - Sun' : 'hh:mm'}</span>
      </div>
      {projects.map((p) => {
        const cell = displayCell(p.id, from);
        const invalid = Boolean(invalidCells[cellKey(p.id, from)]);
        const n = cell.unit === 'percent' ? Number(cell.text) || 0 : 0;
        return (
          <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, minHeight: 48, padding: '6px 16px', borderTop: `1px solid ${color.divider}` }}>
            <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 3, background: p.color }} />
            <span style={{ flex: '1 1 140px', fontWeight: 500 }}>{p.name}</span>
            {cell.unit === 'percent' && (
              <span aria-hidden="true" style={{ width: 120, height: 6, borderRadius: 3, background: color.divider, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.min(100, n)}%`, height: 6, background: p.color }} />
              </span>
            )}
            {cell.unit === 'time' && (
              <Input
                placeholder="Note (optional)"
                aria-label={`${p.name}, week of ${dayLabel(weekStart)} note`}
                value={cell.note}
                disabled={readOnly}
                onChange={(e) => setCell(p.id, from, { note: e.target.value })}
                style={{ flex: '1 1 160px' }}
              />
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Input
                value={cell.text}
                disabled={readOnly}
                inputMode="decimal"
                status={invalid ? 'error' : undefined}
                aria-invalid={invalid}
                aria-label={`${p.name}, week of ${dayLabel(weekStart)}`}
                onChange={(e) => setCell(p.id, from, { text: e.target.value })}
                onBlur={() => commitCell(p.id, from)}
                onKeyDown={(e) => {
                  if (e.key === 'Tab' || e.key === 'Enter') commitCell(p.id, from);
                }}
                style={{ width: cell.unit === 'percent' ? 64 : 76, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              />
              {cell.unit === 'percent' && <span style={{ fontSize: 13, color: color.muted }}>%</span>}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${color.divider}`, background: color.subtle }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Total</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: weekParts.minutes === 0 && pctTotal > 0 && pctTotal !== 100 ? color.warning : color.ink }}>
          {formatMixedTotals(weekParts.minutes, weekParts.percent)}
        </span>
      </div>
      {weekParts.minutes === 0 && pctTotal > 0 && pctTotal !== 100 && (
        <Alert
          type="warning"
          showIcon
          style={{ margin: '0 12px 12px' }}
          message={`This week adds up to ${pctTotal}%. Weeks usually add up to 100%. It's saved; you can fix it any time.`}
        />
      )}
    </section>
  );
}

function DailyGrid({
  projects,
  days,
  today,
  holidayByDate,
  offByDate,
  workingDays,
  displayCell,
  setCell,
  commitCell,
  invalidCells,
  readOnly,
  dayLocked,
  dayHasTime,
  markOff,
  dayTotals,
  weekParts,
  noteCell,
  setNoteCell,
  noteDraft,
  setNoteDraft,
  hideOffKind,
  dayTimeLabel,
  clearLoggedCell,
}: {
  projects: { id: string; name: string; key: string; color: string; leadId: string }[];
  days: Date[];
  today: Date;
  holidayByDate: Map<string, string>;
  offByDate: Map<string, { kind?: string | null }>;
  workingDays: string[];
  displayCell: (projectId: string, periodStart: string) => CellDraft;
  setCell: (projectId: string, periodStart: string, next: Partial<CellDraft>) => void;
  commitCell: (projectId: string, periodStart: string) => void;
  invalidCells: Record<string, boolean>;
  readOnly: boolean;
  dayLocked: (ymd: string) => boolean;
  dayHasTime: (ymd: string) => boolean;
  markOff: (ymd: string, kind: 'leave' | 'other' | null) => void;
  dayTotals: Array<{ kind: 'off' | 'sum'; label: string; minutes: number; percent: number }>;
  weekParts: { minutes: number; percent: number };
  noteCell: { projectId: string; periodStart: string } | null;
  setNoteCell: (v: { projectId: string; periodStart: string } | null) => void;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  hideOffKind: boolean;
  dayTimeLabel: (ymd: string) => string;
  clearLoggedCell: (projectId: string, periodStart: string) => void;
}) {
  const [holidayEdit, setHolidayEdit] = useState<string | null>(null);
  const cols = `minmax(200px, 1.6fr) repeat(7, minmax(64px, 1fr)) 84px`;
  return (
    <section aria-label="Time per project and day" style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflowX: 'auto' }}>
      <div style={{ minWidth: 860 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'end', borderBottom: `1px solid ${color.divider}` }}>
          <span style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: color.muted }}>Project</span>
          {days.map((date) => {
            const ymd = formatYmd(date);
            const isToday = ymd === formatYmd(today);
            const holiday = holidayByDate.get(ymd);
            const off = offByDate.get(ymd);
            const weekend = !isWorkingDay(date, workingDays);
            const hasTime = dayHasTime(ymd);
            const locked = readOnly || dayLocked(ymd);
            const full = `${DAY_SHORT[date.getUTCDay()]} ${dayLabel(date)}`;
            const items = off
              ? [{ key: 'clear', label: 'Back to a working day', onClick: () => markOff(ymd, null) }]
              : weekend
                ? []
                : hasTime
                  ? []
                  : [
                      { key: 'leave', label: 'Mark as day off: Leave', onClick: () => markOff(ymd, 'leave') },
                      { key: 'other', label: 'Mark as day off: Other', onClick: () => markOff(ymd, 'other') },
                    ];
            return (
              <span key={ymd} style={{ position: 'relative', padding: '6px 4px', textAlign: 'center', background: holiday ? color.infoTint : isToday ? color.brandTint : 'transparent', borderRadius: '8px 8px 0 0' }}>
                <Dropdown
                  trigger={['click']}
                  disabled={locked}
                  popupRender={() => (
                    <div role="menu" aria-label={full} style={{ width: 240, padding: 6, background: color.surface, border: `1px solid ${color.border}`, borderRadius: 10, boxShadow: `0 18px 40px -16px ${color.shadow}` }}>
                      <div style={{ padding: '6px 10px 4px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: color.muted }}>{full}</div>
                      {items.map((item) => (
                        <button key={item.key} type="button" role="menuitem" onClick={item.onClick} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: 0, borderRadius: 7, background: 'transparent', font: 'inherit', fontSize: 13, color: color.ink, textAlign: 'left', cursor: 'pointer' }}>
                          {item.label}
                        </button>
                      ))}
                      {!off && !weekend && hasTime && (
                        <div style={{ padding: '6px 10px 8px', fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>
                          This day has {dayTimeLabel(ymd) || 'time'} logged. Clear it first to mark the day off.
                        </div>
                      )}
                      {weekend && (
                        <div style={{ padding: '6px 10px 8px', fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>Not a working day on this pattern. Log time here only if you worked.</div>
                      )}
                    </div>
                  )}
                >
                  <button type="button" aria-haspopup="menu" aria-label={`Options for ${full}`} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: 4, border: 0, borderRadius: 6, background: 'transparent', font: 'inherit', cursor: locked ? 'default' : 'pointer' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: holiday ? color.info : isToday ? color.brandStrong : color.ink2 }}>
                      {DAY_SHORT[date.getUTCDay()]} ▾
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: color.muted }}>{dayLabel(date)}</span>
                    {holiday && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: color.info }}>Public holiday</span>}
                  </button>
                </Dropdown>
                {off && (
                  <span style={{ display: 'inline-block', marginTop: 2, fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: color.chip, color: color.ink3 }}>
                    {hideOffKind || !off.kind ? 'Off' : `Off: ${kindLabel(off.kind)}`}
                  </span>
                )}
              </span>
            );
          })}
          <span style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: color.muted }}>Total</span>
        </div>
        {projects.map((p) => {
          const rowParts = days.reduce((acc, d) => {
            if (offByDate.has(formatYmd(d))) return acc;
            const cell = displayCell(p.id, formatYmd(d));
            if (cell.unit === 'percent') return { minutes: acc.minutes, percent: acc.percent + (Number(cell.text) || 0) };
            return { minutes: acc.minutes + (parseTimeToMinutes(cell.text) ?? 0), percent: acc.percent };
          }, { minutes: 0, percent: 0 });
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', borderBottom: `1px solid ${color.divider}` }}>
              <ProjectCell name={p.name} colorSwatch={p.color} meta={p.key} />
              {days.map((date) => {
                const ymd = formatYmd(date);
                const isToday = ymd === formatYmd(today);
                const holiday = holidayByDate.has(ymd);
                const off = offByDate.has(ymd);
                const weekend = !isWorkingDay(date, workingDays);
                const cell = displayCell(p.id, ymd);
                const filled = Boolean(cell.text.trim());
                const open = noteCell?.projectId === p.id && noteCell.periodStart === ymd;
                return (
                  <span key={ymd} style={{ position: 'relative', padding: '6px 4px', background: holiday ? color.infoTint : isToday ? color.brandTint : weekend ? color.subtle : 'transparent' }}>
                    {off ? (
                      <span aria-label={`${p.name}, ${DAY_SHORT[date.getUTCDay()]}: day off`} style={{ display: 'grid', placeItems: 'center', height: 38, borderRadius: 8, background: color.chip, fontSize: 12, fontWeight: 500, color: color.muted }}>Off</span>
                    ) : readOnly || dayLocked(ymd) ? (
                      <span style={{ display: 'grid', placeItems: 'center', height: 38, fontVariantNumeric: 'tabular-nums', color: filled ? color.ink : color.faint }}>
                        {filled ? (cell.unit === 'percent' ? `${cell.text}%` : cell.text) : holiday ? 'Holiday' : '-'}
                      </span>
                    ) : (
                      <Popover
                        open={open}
                        onOpenChange={(next) => {
                          if (next && filled && !readOnly) {
                            setNoteCell({ projectId: p.id, periodStart: ymd });
                            setNoteDraft(cell.note);
                          } else if (!next) setNoteCell(null);
                        }}
                        trigger="click"
                        title={undefined}
                        content={
                          <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 3, background: p.color }} />
                              <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.name} · {DAY_SHORT[date.getUTCDay()]} {dayLabel(date)}
                              </span>
                              <span style={{ flex: 'none', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{cell.text || '-'}</span>
                            </div>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, color: color.ink3 }}>
                              Note
                              <Input.TextArea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}>
                              <Button type="text" danger onMouseDown={(event) => event.preventDefault()} onClick={() => clearLoggedCell(p.id, ymd)}>Clear this cell</Button>
                              <span style={{ display: 'flex', flex: 'none', gap: 8 }}>
                                <Button onClick={() => setNoteCell(null)}>Cancel</Button>
                                <Button type="primary" onClick={() => { setCell(p.id, ymd, { note: noteDraft }); setNoteCell(null); }}>Save note</Button>
                              </span>
                            </div>
                          </div>
                        }
                      >
                        {holiday && !filled && holidayEdit !== `${p.id}:${ymd}` ? (
                          <button
                            type="button"
                            aria-label={`${p.name}, ${DAY_SHORT[date.getUTCDay()]} ${dayLabel(date)}: public holiday. Click to log extra time.`}
                            onClick={() => setHolidayEdit(`${p.id}:${ymd}`)}
                            style={{ display: 'grid', placeItems: 'center', width: '100%', height: 38, border: `1px solid ${color.border}`, borderRadius: 8, background: color.infoTint, font: 'inherit', fontSize: 12, fontWeight: 500, color: color.info, cursor: 'pointer' }}
                          >
                            Holiday
                          </button>
                        ) : (
                        <Input
                          inputMode="decimal"
                          value={cell.text}
                          placeholder={holiday && !filled ? 'Holiday' : '-'}
                          status={invalidCells[cellKey(p.id, ymd)] ? 'error' : undefined}
                          aria-invalid={Boolean(invalidCells[cellKey(p.id, ymd)])}
                          aria-label={`${p.name}, ${DAY_SHORT[date.getUTCDay()]} ${dayLabel(date)}`}
                          autoFocus={holidayEdit === `${p.id}:${ymd}`}
                          onChange={(e) => setCell(p.id, ymd, { text: e.target.value })}
                          onBlur={() => {
                            commitCell(p.id, ymd);
                            if (!displayCell(p.id, ymd).text.trim()) setHolidayEdit(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' || e.key === 'Enter') commitCell(p.id, ymd);
                          }}
                          style={{ height: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderColor: invalidCells[cellKey(p.id, ymd)] ? color.danger : isToday ? color.brandBorder : color.border, background: holiday && !filled ? color.infoTint : color.surface }}
                        />
                        )}
                      </Popover>
                    )}
                    {cell.note && !off && (
                      <span title="Has a note" aria-label="Has a note" style={{ position: 'absolute', top: 9, right: 9, width: 6, height: 6, borderRadius: '50%', background: color.brand }} />
                    )}
                  </span>
                );
              })}
              <span style={{ padding: '0 16px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatMixedTotals(rowParts.minutes, rowParts.percent)}
              </span>
            </div>
          );
        })}
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', background: color.subtle }}>
          <span style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600 }}>Day total</span>
          {dayTotals.map((t, i) => {
            const date = days[i];
            if (!date) return null;
            const ymd = formatYmd(date);
            const empty = t.minutes === 0 && t.percent === 0;
            const pastEmpty = t.kind === 'sum' && empty && date.getTime() <= today.getTime() && isWorkingDay(date, workingDays) && !holidayByDate.has(ymd);
            const short = t.kind === 'sum' && t.minutes === 0 && t.percent > 0 && t.percent < 100;
            const label = t.kind === 'off' ? t.label : formatMixedTotals(t.minutes, t.percent);
            return (
              <span key={ymd} style={{ padding: '14px 4px', textAlign: 'center', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.kind === 'off' ? color.muted : short || pastEmpty ? color.warning : !empty ? (t.minutes === 0 && t.percent === 100 ? color.brandStrong : color.ink) : color.faint }}>
                {label}
                {short && <span style={{ display: 'block', fontSize: 11, fontWeight: 500 }}>{100 - t.percent}% short</span>}
              </span>
            );
          })}
          <span style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {formatMixedTotals(weekParts.minutes, weekParts.percent)}
          </span>
        </div>
      </div>
    </section>
  );
}
