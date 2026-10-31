import {
  addUtcDays,
  expectedDays,
  formatMinutes,
  formatYmd,
  isTimesheetLocked,
  isWorkingDay,
  parseTimeToMinutes,
  parseYmd,
  timesheetLockLabel,
  weekStartFor,
} from '@borntask/shared';
import { Alert, Button, Dropdown, Input, Popover, Select, Skeleton } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/http';
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
  const me = useMe().data;
  const settings = useWorkspaceSettings();
  const projects = (useProjects().data ?? []).filter((p) => p.canOpen !== false);
  const people = usePeople();
  const weekStartSetting = settings.data?.weekStart ?? 'monday';
  const workingDays = settings.data?.workingDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'];
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
  const readOnly = viewingOther;

  const sheet = useTimesheets(from, to, viewUserId, !guest);
  const lastWeek = useTimesheets(lastFrom, lastTo, viewUserId, !guest);
  const period = sheet.data?.timesheetPeriod ?? settings.data?.timesheetPeriod ?? 'weekly';
  const unit = sheet.data?.timesheetUnit ?? settings.data?.timesheetUnit ?? 'time';
  const saveEntries = useSaveTimesheets();
  const saveDaysOff = useSaveDaysOff();

  const [drafts, setDrafts] = useState<Record<string, CellDraft>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [extraOpen, setExtraOpen] = useState(false);
  const [noteCell, setNoteCell] = useState<{ projectId: string; periodStart: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<Map<string, TimesheetEntryWrite>>(new Map());

  useEffect(() => {
    setDrafts({});
    setNoteCell(null);
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
      await saveEntries.mutateAsync(batch);
      setSaveState('saved');
      setSaveError(null);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not save the timesheet.');
    }
  }, [readOnly, saveEntries]);

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
    sheet.data?.entries.find((e) => e.projectId === projectId && e.periodStart === periodStart);

  const displayCell = (projectId: string, periodStart: string): CellDraft => {
    const draft = drafts[cellKey(projectId, periodStart)];
    if (draft) return draft;
    const row = entryOf(projectId, periodStart);
    if (!row) return { text: '', note: '', unit };
    if (row.unit === 'percent') return { text: row.percent ? String(row.percent) : '', note: row.note ?? '', unit: 'percent' };
    return { text: row.minutes ? formatMinutes(row.minutes) : '', note: row.note ?? '', unit: 'time' };
  };

  const setCell = (projectId: string, periodStart: string, next: Partial<CellDraft>) => {
    if (isTimesheetLocked({ periodStart: parseYmd(periodStart), periodKind: period, editDays, today })) return;
    const current = displayCell(projectId, periodStart);
    const merged = { ...current, ...next };
    setDrafts((prev) => ({ ...prev, [cellKey(projectId, periodStart)]: merged }));
    const cellUnit = merged.unit;
    const minutes = cellUnit === 'time' ? parseTimeToMinutes(merged.text) : null;
    const percent = cellUnit === 'percent' ? (merged.text.trim() === '' ? 0 : Number.parseInt(merged.text, 10) || 0) : null;
    const empty = !merged.text.trim() && !merged.note.trim();
    queueSave({
      projectId,
      periodKind: period,
      periodStart,
      unit: cellUnit,
      minutes: cellUnit === 'time' ? minutes ?? 0 : null,
      percent: cellUnit === 'percent' ? percent : null,
      note: merged.note || null,
      clear: empty,
    });
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
    if (minutes > 0) return formatMinutes(minutes);
    return '';
  };

  const markOff = async (ymd: string, kind: 'leave' | 'other' | null) => {
    if (readOnly || dayLocked(ymd)) return;
    try {
      setSaveState('saving');
      await saveDaysOff.mutateAsync(
        kind ? { days: [{ date: ymd, kind }] } : { days: [{ date: ymd, clear: true }] },
      );
      setSaveState('saved');
      setSaveError(null);
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not update the day off.');
    }
  };

  const copyLastWeek = async () => {
    if (readOnly || weekLocked) return;
    const rows = lastWeek.data?.entries ?? [];
    const writes: TimesheetEntryWrite[] = rows.map((row) => {
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
    }).filter((row) => !offByDate.has(row.periodStart));
    if (writes.length === 0) return;
    setSaveState('saving');
    try {
      await saveEntries.mutateAsync(writes);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof ApiError ? err.message : 'Could not copy last week.');
    }
  };

  const valueOf = (projectId: string, ymd: string) => {
    const cell = displayCell(projectId, ymd);
    if (cell.unit === 'percent') return Number(cell.text) || 0;
    return parseTimeToMinutes(cell.text) ?? 0;
  };

  const weekDays = period === 'daily' ? days : [weekStart];
  const periodStarts = weekDays.map(formatYmd);

  const dayTotals = days.map((date) => {
    const ymd = formatYmd(date);
    if (offByDate.has(ymd)) return { kind: 'off' as const, label: kindLabel(offByDate.get(ymd)?.kind), value: 0 };
    const sum = projects.reduce((acc, p) => acc + valueOf(p.id, period === 'daily' ? ymd : from), 0);
    return { kind: 'sum' as const, label: '', value: period === 'daily' ? sum : 0 };
  });

  const weekTotal = projects.reduce((acc, p) => {
    if (period === 'weekly') return acc + valueOf(p.id, from);
    return acc + days.reduce((n, d) => n + valueOf(p.id, formatYmd(d)), 0);
  }, 0);

  const todayYmd = formatYmd(today);
  const todayTotal = period === 'daily' ? projects.reduce((acc, p) => acc + valueOf(p.id, todayYmd), 0) : weekTotal;

  const lastWeekTotal = (lastWeek.data?.entries ?? []).reduce((acc, row) => {
    if (row.unit === 'percent') return acc + (row.percent ?? 0);
    return acc + (row.minutes ?? 0);
  }, 0);

  const holidaySet = [...holidayByDate.keys()];
  const offSet = [...offByDate.keys()];
  const daysExpected = expectedDays({
    from: weekStart,
    to: weekEnd,
    workingDays,
    holidays: holidaySet,
    daysOff: offSet,
    today,
  });
  const daysFilled = days.filter((date) => {
    const ymd = formatYmd(date);
    if (date.getTime() > today.getTime()) return false;
    if (!isWorkingDay(date, workingDays) || holidayByDate.has(ymd) || offByDate.has(ymd)) return false;
    return dayHasTime(period === 'daily' ? ymd : from);
  }).length;

  const offWhich = days.filter((d) => offByDate.has(formatYmd(d))).map((d) => DAY_SHORT[d.getUTCDay()]).join(', ');

  const mixedUnits = (sheet.data?.entries ?? []).some((e) => e.unit !== unit);
  const openable = projects;
  const withTime = openable.filter((p) => periodStarts.some((ymd) => valueOf(p.id, ymd) > 0 || displayCell(p.id, ymd).note));
  const extras = openable.filter((p) => !withTime.includes(p));
  const shown = extraOpen ? openable : [...withTime, ...extras].slice(0, Math.max(4, withTime.length));
  const hiddenCount = Math.max(0, openable.length - shown.length);

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

  const fmt = (value: number, cellUnit = unit) => (cellUnit === 'percent' ? `${value}%` : formatMinutes(value));

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
        <p style={{ margin: '8px 0 0', color: color.muted, fontSize: 13 }}>Once a project lead adds you to a project, it shows up here.</p>
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
                    .filter((p) => p.id !== me?.user.id && p.workspaceRole !== 'guest' && p.workspaceRole !== 'viewer')
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </label>
          )}
          {readOnly && (
            <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: color.chip, color: color.ink3 }}>Read-only</span>
          )}
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: saveState === 'error' ? color.danger : color.brandStrong }}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Could not save' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          {!readOnly && !weekLocked && <Button onClick={() => void copyLastWeek()}>Copy last week</Button>}
          <div role="group" aria-label="Week" style={{ display: 'flex', alignItems: 'center', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface }}>
            <Button type="text" aria-label="Previous week" onClick={() => setAnchor(addUtcDays(weekStart, -7))} style={{ width: 36 }}>‹</Button>
            <span style={{ padding: '0 6px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{weekRangeLabel(weekStart)}</span>
            <Button type="text" aria-label="Next week" onClick={() => setAnchor(addUtcDays(weekStart, 7))} style={{ width: 36 }}>›</Button>
          </div>
          <Button onClick={() => setAnchor(utcToday())}>This week</Button>
        </div>
      </div>

      {saveError && <Alert type="error" showIcon message={saveError} />}
      {!readOnly && periodLocked && editDays >= 0 && (
        <Alert
          type="info"
          showIcon
          message={`This week is locked. People can only change timesheets for ${timesheetLockLabel(editDays)} so reports stay stable.`}
        />
      )}
      {mixedUnits && (
        <Alert
          type="info"
          showIcon
          message={`Your workspace now uses ${unit === 'percent' ? 'percentages' : 'hours'}. Earlier entries keep the unit they were saved in.`}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="This week" value={fmt(weekTotal)} />
        <Tile
          label={period === 'daily' ? `Today, ${DAY_SHORT[today.getUTCDay()]} ${dayLabel(today)}` : `Week of ${dayLabel(weekStart)}`}
          value={fmt(todayTotal)}
        />
        <Tile label="Last week" value={fmt(lastWeekTotal, lastWeek.data?.entries[0]?.unit ?? unit)} />
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
              My days off
              <Select
                aria-label="My days off"
                value={weekOffCount}
                style={{ width: 72 }}
                options={Array.from({ length: maxWeeklyOff + 1 }, (_, n) => ({ value: n, label: String(n) }))}
                onChange={(count) => void saveDaysOff.mutateAsync({ week: { weekStart: from, count, kind: weekOffKind, note: weekOffNote || null } })}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
              Type
              <Select
                aria-label="Day off type"
                value={weekOffKind}
                style={{ width: 120 }}
                options={[{ value: 'leave', label: 'Leave' }, { value: 'other', label: 'Other' }]}
                onChange={(kind) => void saveDaysOff.mutateAsync({ week: { weekStart: from, count: weekOffCount, kind, note: weekOffNote || null } })}
              />
            </label>
            <Input
              placeholder="Note (optional)"
              aria-label="Days off note"
              style={{ flex: '1 1 140px', maxWidth: 280 }}
              defaultValue={weekOffNote}
              onBlur={(e) => void saveDaysOff.mutateAsync({ week: { weekStart: from, count: weekOffCount, kind: weekOffKind, note: e.target.value || null } })}
            />
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
          readOnly={readOnly || weekLocked}
          weekTotal={weekTotal}
        />
      ) : (
        <DailyGrid
          projects={shown}
          days={days}
          today={today}
          unit={unit}
          holidayByDate={holidayByDate}
          offByDate={offByDate}
          workingDays={workingDays}
          displayCell={displayCell}
          setCell={setCell}
          readOnly={readOnly}
          dayLocked={dayLocked}
          dayHasTime={dayHasTime}
          markOff={markOff}
          dayTotals={dayTotals}
          weekTotal={weekTotal}
          noteCell={noteCell}
          setNoteCell={setNoteCell}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          viewingOther={viewingOther}
          dayTimeLabel={dayTimeLabel}
        />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: color.muted }}>
        <span>
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

      {readOnly && viewingName && (
        <p style={{ margin: 0, fontSize: 12.5, color: color.muted }}>
          You lead {leadsProjects.map((p) => p.name).join(' and ') || 'these projects'}, so you only see {viewingName}'s time on those.
          Days off show as "Off"; the type and note stay private to {viewingName}, owners and admins.
        </p>
      )}
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
  readOnly,
  weekTotal,
}: {
  projects: { id: string; name: string; color: string }[];
  unit: 'time' | 'percent';
  weekStart: Date;
  from: string;
  displayCell: (projectId: string, periodStart: string) => CellDraft;
  setCell: (projectId: string, periodStart: string, next: Partial<CellDraft>) => void;
  readOnly: boolean;
  weekTotal: number;
}) {
  const pctTotal = unit === 'percent' ? weekTotal : 0;
  return (
    <section aria-label="Time per project" style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Week of {dayLabel(weekStart)}</span>
        <span style={{ fontSize: 12.5, color: color.muted }}>{unit === 'percent' ? 'Mon - Sun' : 'hh:mm'}</span>
      </div>
      {projects.map((p) => {
        const cell = displayCell(p.id, from);
        const n = unit === 'percent' ? Number(cell.text) || 0 : 0;
        return (
          <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, minHeight: 48, padding: '6px 16px', borderTop: `1px solid ${color.divider}` }}>
            <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 3, background: p.color }} />
            <span style={{ flex: '1 1 140px', fontWeight: 500 }}>{p.name}</span>
            {unit === 'percent' && (
              <span aria-hidden="true" style={{ width: 120, height: 6, borderRadius: 3, background: color.divider, overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.min(100, n)}%`, height: 6, background: p.color }} />
              </span>
            )}
            {unit === 'time' && (
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
                aria-label={`${p.name}, week of ${dayLabel(weekStart)}`}
                onChange={(e) => setCell(p.id, from, { text: e.target.value })}
                style={{ width: unit === 'percent' ? 64 : 76, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              />
              {unit === 'percent' && <span style={{ fontSize: 13, color: color.muted }}>%</span>}
            </span>
          </div>
        );
      })}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${color.divider}`, background: color.subtle }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Total</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: unit === 'percent' && pctTotal !== 100 ? color.warning : color.ink }}>
          {unit === 'percent' ? `${pctTotal}%` : formatMinutes(weekTotal)}
        </span>
      </div>
      {unit === 'percent' && pctTotal !== 100 && (
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
  unit,
  holidayByDate,
  offByDate,
  workingDays,
  displayCell,
  setCell,
  readOnly,
  dayLocked,
  dayHasTime,
  markOff,
  dayTotals,
  weekTotal,
  noteCell,
  setNoteCell,
  noteDraft,
  setNoteDraft,
  viewingOther,
  dayTimeLabel,
}: {
  projects: { id: string; name: string; key: string; color: string; leadId: string }[];
  days: Date[];
  today: Date;
  unit: 'time' | 'percent';
  holidayByDate: Map<string, string>;
  offByDate: Map<string, { kind?: string | null }>;
  workingDays: string[];
  displayCell: (projectId: string, periodStart: string) => CellDraft;
  setCell: (projectId: string, periodStart: string, next: Partial<CellDraft>) => void;
  readOnly: boolean;
  dayLocked: (ymd: string) => boolean;
  dayHasTime: (ymd: string) => boolean;
  markOff: (ymd: string, kind: 'leave' | 'other' | null) => void;
  dayTotals: Array<{ kind: 'off' | 'sum'; label: string; value: number }>;
  weekTotal: number;
  noteCell: { projectId: string; periodStart: string } | null;
  setNoteCell: (v: { projectId: string; periodStart: string } | null) => void;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  viewingOther: boolean;
  dayTimeLabel: (ymd: string) => string;
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
                        <div style={{ padding: '6px 10px 8px', fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>Not a working day in this workspace. Log time here only if you worked.</div>
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
                    {viewingOther || !off.kind ? 'Off' : `Off: ${kindLabel(off.kind)}`}
                  </span>
                )}
              </span>
            );
          })}
          <span style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: color.muted }}>Total</span>
        </div>
        {projects.map((p) => {
          const rowTotal = days.reduce((acc, d) => acc + (offByDate.has(formatYmd(d)) ? 0 : (displayCell(p.id, formatYmd(d)).unit === 'percent' ? Number(displayCell(p.id, formatYmd(d)).text) || 0 : parseTimeToMinutes(displayCell(p.id, formatYmd(d)).text) ?? 0)), 0);
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
                        {filled ? (unit === 'percent' ? `${cell.text}%` : cell.text) : holiday ? 'Holiday' : '-'}
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
                              <Button type="text" danger onClick={() => { setCell(p.id, ymd, { text: '', note: '' }); setNoteCell(null); }}>Clear this cell</Button>
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
                          aria-label={`${p.name}, ${DAY_SHORT[date.getUTCDay()]} ${dayLabel(date)}`}
                          autoFocus={holidayEdit === `${p.id}:${ymd}`}
                          onChange={(e) => setCell(p.id, ymd, { text: e.target.value })}
                          onBlur={() => { if (!displayCell(p.id, ymd).text.trim()) setHolidayEdit(null); }}
                          style={{ height: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums', borderColor: isToday ? color.brandBorder : color.border, background: holiday && !filled ? color.infoTint : color.surface }}
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
                {rowTotal ? (unit === 'percent' ? `${rowTotal}%` : formatMinutes(rowTotal)) : '-'}
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
            const pastEmpty = t.kind === 'sum' && t.value === 0 && date.getTime() <= today.getTime() && isWorkingDay(date, workingDays) && !holidayByDate.has(ymd);
            const short = unit === 'percent' && t.kind === 'sum' && t.value > 0 && t.value < 100;
            const label = t.kind === 'off' ? t.label : t.value ? (unit === 'percent' ? `${t.value}%` : formatMinutes(t.value)) : '-';
            return (
              <span key={ymd} style={{ padding: '14px 4px', textAlign: 'center', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.kind === 'off' ? color.muted : short || pastEmpty ? color.warning : t.value ? (unit === 'percent' && t.value === 100 ? color.brandStrong : color.ink) : color.faint }}>
                {label}
                {short && <span style={{ display: 'block', fontSize: 11, fontWeight: 500 }}>{100 - t.value}% short</span>}
              </span>
            );
          })}
          <span style={{ padding: '14px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {unit === 'percent' ? `${weekTotal}%` : formatMinutes(weekTotal)}
          </span>
        </div>
      </div>
    </section>
  );
}
