import { DatePicker, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe, useProjects, useWorkspaceReports, useWorkspaceSettings, type WorkspaceReports } from '../api/queries';
import { Avatar } from '../components/Chips';
import { SettingsFrame } from '../components/SettingsNav';
import { color, font } from '../theme/tokens';
import { expectedDays, parseWorkingDays, parseYmd } from '@borntask/shared';

type Period = 'week' | 'month' | 'last' | 'custom';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: 'custom', label: 'Custom...' },
];

function rangeFor(period: Period, custom: [Dayjs, Dayjs], weekStart: 'monday' | 'sunday') {
  const today = dayjs();
  if (period === 'month') {
    return { from: today.startOf('month').format('YYYY-MM-DD'), to: today.endOf('month').format('YYYY-MM-DD') };
  }
  if (period === 'last') {
    const last = today.subtract(1, 'month');
    return { from: last.startOf('month').format('YYYY-MM-DD'), to: last.endOf('month').format('YYYY-MM-DD') };
  }
  if (period === 'week') {
    const dow = today.day();
    const offset = weekStart === 'sunday' ? dow : (dow + 6) % 7;
    const start = today.subtract(offset, 'day');
    return { from: start.format('YYYY-MM-DD'), to: start.add(6, 'day').format('YYYY-MM-DD') };
  }
  return { from: custom[0].format('YYYY-MM-DD'), to: custom[1].format('YYYY-MM-DD') };
}

function peoplePhrase(n: number) {
  return n === 1 ? '1 person' : `${n} people`;
}

function formatRangeCopy(from: string, to: string, working: number, holidays: { name: string }[], tz: string) {
  const start = dayjs(from);
  const end = dayjs(to);
  const dates =
    start.month() === end.month() && start.year() === end.year()
      ? `${start.date()}-${end.date()} ${start.format('MMMM YYYY')}`
      : `${start.format('D MMMM')} - ${end.format('D MMMM YYYY')}`;
  const hol =
    holidays.length === 0
      ? 'no public holidays'
      : holidays.length === 1
        ? `including ${holidays[0]!.name}`
        : `${holidays.length} public holidays`;
  return `${dates} · ${working} working days so far, ${hol} · times in ${tz}`;
}

function Tile({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint: string;
  valueColor?: string;
}) {
  return (
    <div className="bt-card" style={{ flex: '1 1 150px', padding: '14px 16px' }}>
      <div style={{ fontSize: 12.5, color: color.muted }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: font.display, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: valueColor ?? color.ink }}>
        {value}
      </div>
      {hint ? <div style={{ marginTop: 2, fontSize: 12, color: color.muted }}>{hint}</div> : null}
    </div>
  );
}

function CssBar({ pct, fill, height = 6 }: { pct: number; fill: string; height?: number }) {
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <span aria-hidden="true" style={{ flex: 1, height, borderRadius: height / 2, background: color.divider, overflow: 'hidden' }}>
      <span style={{ display: 'block', width, height, background: fill }} />
    </span>
  );
}

function initialsOf(name: string, fallback: string) {
  return fallback || name.split(/\s+/).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase();
}

export function WorkspaceReportsScreen() {
  const me = useMe().data;
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const settings = useWorkspaceSettings();
  const projects = useProjects();
  const [period, setPeriod] = useState<Period>('month');
  const [custom, setCustom] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const weekStart = settings.data?.weekStart ?? 'monday';
  const range = rangeFor(period, custom, weekStart);
  const reports = useWorkspaceReports(range.from, range.to, projectId, canAdmin, settings.data?.timeZone ?? 'UTC');
  const data = reports.data;

  const workingDaysSoFar = useMemo(() => {
    if (!data) return 0;
    if (data.workingDaysSoFar) return data.workingDaysSoFar;
    const workingDays = parseWorkingDays(settings.data?.workingDays);
    return expectedDays({
      from: parseYmd(data.range.from),
      to: parseYmd(data.range.to),
      workingDays,
      holidays: data.holidays.map((h) => h.date),
    });
  }, [data, settings.data?.workingDays]);

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ flex: '1 1 300px' }}>
          <h1 className="bt-h1">Reports</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: color.muted }}>
            Owners and admins only. Top-level tasks, Trash excluded. Project leads see time on their projects in Timesheets.
          </p>
        </div>
        {canAdmin && (
          <>
            <div role="group" aria-label="Period" style={{ display: 'flex', padding: 3, border: `1px solid ${color.border}`, borderRadius: 9, background: color.surface }}>
              {PERIODS.map((p) => {
                const on = period === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPeriod(p.id)}
                    style={{
                      height: 30,
                      padding: '0 12px',
                      border: 0,
                      borderRadius: 6,
                      background: on ? color.ink : 'transparent',
                      color: on ? color.surface : color.ink2,
                      font: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {period === 'custom' && (
              <DatePicker.RangePicker
                value={custom}
                onChange={(v) => {
                  if (v?.[0] && v[1]) setCustom([v[0], v[1]]);
                }}
                allowClear={false}
              />
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: color.ink2 }}>
              Project
              <Select
                value={projectId ?? 'all'}
                onChange={(v) => setProjectId(v === 'all' ? undefined : v)}
                style={{ minWidth: 180 }}
                options={[
                  { value: 'all', label: 'All projects' },
                  ...(projects.data ?? []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </label>
          </>
        )}
      </div>

      {!canAdmin && (
        <p style={{ margin: 0, fontSize: 13.5, color: color.muted }}>
          Reports are for workspace owners and admins. Ask an admin if you need these numbers.
        </p>
      )}

      {canAdmin && reports.isError && (
        <p style={{ margin: 0, color: color.danger }}>Could not load reports. Sign in as an owner or admin and try again.</p>
      )}

      {canAdmin && data && (
        <ReportsBody
          data={data}
          workingDaysSoFar={workingDaysSoFar}
          timeZone={settings.data?.timeZone ?? data.timeZone}
          projectKeys={Object.fromEntries((projects.data ?? []).map((p) => [p.id, p.key]))}
        />
      )}
    </SettingsFrame>
  );
}

function ReportsBody({
  data,
  workingDaysSoFar,
  timeZone,
  projectKeys,
}: {
  data: WorkspaceReports;
  workingDaysSoFar: number;
  timeZone: string;
  projectKeys: Record<string, string>;
}) {
  const t = data.tasks;
  const ts = data.timesheets;
  return (
    <>
      <p style={{ margin: '-4px 0 0', fontSize: 12.5, color: color.muted }}>
        {formatRangeCopy(data.range.from, data.range.to, workingDaysSoFar, data.holidays, timeZone)}
      </p>

      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Tasks</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="Opened" value={String(t.opened)} hint="created in the period" />
        <Tile label="Closed" value={String(t.closed)} hint={t.closedHint || 'closed in the period'} />
        <Tile label="Open now" value={String(t.open)} hint={t.openHint || 'not closed'} />
        <Tile label="Overdue" value={String(t.overdue)} hint="past due, not closed" valueColor={t.overdue > 0 ? color.danger : color.ink} />
        {t.unscheduled != null && <Tile label="Unscheduled" value={String(t.unscheduled)} hint="open, no due date" />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="Time to close" value={t.closeDays} hint={t.closeHint} />
        <Tile label="Time to start" value={t.startDays} hint={t.startHint} />
      </div>

      <section className="bt-card" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>By project</h3>
          </div>
          <GridHead cols="minmax(200px, 1.6fr) repeat(7, minmax(70px, 1fr))" cells={['Project', 'Opened', 'Closed', 'Open', 'In flight', 'Overdue', 'Median close', 'Median start']} />
          {t.byProject.map((row) => {
            const key = row.key ?? projectKeys[row.projectId];
            return (
              <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.6fr) repeat(7, minmax(70px, 1fr))', alignItems: 'center', minHeight: 46, borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: row.colour }} />
                  {key ? <Link to={`/p/${key}/list`} style={{ color: color.ink, textDecoration: 'none', fontWeight: 500 }}>{row.name}</Link> : <span style={{ fontWeight: 500 }}>{row.name}</span>}
                </span>
                <Num>{row.opened}</Num>
                <Num>{row.closed}</Num>
                <Num>{row.open}</Num>
                <Num>{row.flight}</Num>
                <Num color={row.overdue > 0 ? color.danger : undefined} weight={row.overdue ? 600 : 400}>{row.overdue}</Num>
                <Num>{row.close}</Num>
                <Num>{row.start}</Num>
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.6fr) repeat(7, minmax(70px, 1fr))', alignItems: 'center', minHeight: 44, background: color.subtle, fontSize: 13.5, fontWeight: 600 }}>
            <span style={{ padding: '0 16px' }}>Workspace</span>
            <Num>{t.opened}</Num>
            <Num>{t.closed}</Num>
            <Num>{t.open}</Num>
            <Num>{t.byProject.reduce((a, r) => a + r.flight, 0)}</Num>
            <Num color={t.overdue > 0 ? color.danger : undefined}>{t.overdue}</Num>
            <Num>{t.closeDays.replace(' days', ' d')}</Num>
            <Num>{t.startDays.replace(' days', ' d')}</Num>
          </div>
        </div>
      </section>

      {(t.byPerson.length > 0 || t.upcoming.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          {t.byPerson.length > 0 && (
            <section className="bt-card" style={{ flex: '1 1 440px', padding: 0, overflowX: 'auto' }}>
              <div style={{ minWidth: 440 }}>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>By person</h3>
                </div>
                <GridHead cols="minmax(200px, 1.6fr) repeat(4, minmax(80px, 1fr))" cells={['Assignee', 'Open', 'Closed', 'Overdue', 'Median close']} />
                {t.byPerson.map((p) => (
                  <div key={p.userId ?? 'unassigned'} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.6fr) repeat(4, minmax(80px, 1fr))', alignItems: 'center', minHeight: 44, borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                      <Avatar user={p.userId ? { id: p.userId, name: p.name, email: '', initials: initialsOf(p.name, p.initials) } : null} size={26} fontSize={10.5} />
                      {p.name}
                    </span>
                    <Num>{p.open}</Num>
                    <Num>{p.closed}</Num>
                    <Num color={p.overdue > 0 ? color.danger : color.muted}>{p.overdue}</Num>
                    <Num>{p.close}</Num>
                  </div>
                ))}
              </div>
            </section>
          )}
          {t.upcoming.length > 0 && (
            <section className="bt-card" style={{ flex: '1 1 340px', padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
                <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600 }}>Due in the next 7 days</h3>
                <span style={{ fontSize: 12.5, color: color.muted }}>{t.upcoming.length} tasks</span>
              </div>
              {t.upcoming.map((u) => (
                <Link
                  key={u.key}
                  to={`/p/${u.key.split('-')[0]}/list?task=${u.key}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '6px 16px', borderBottom: `1px solid ${color.divider}`, color: color.ink, textDecoration: 'none' }}
                >
                  <span style={{ width: 58, fontSize: 12.5, color: color.muted, fontVariantNumeric: 'tabular-nums' }}>{u.key}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</span>
                    <span style={{ display: 'block', fontSize: 12, color: color.muted }}>{u.who} · {u.status}</span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: u.dueTone === 'today' ? 600 : 400, color: u.dueTone === 'today' ? color.brandStrong : color.ink2, whiteSpace: 'nowrap' }}>{u.due}</span>
                </Link>
              ))}
            </section>
          )}
        </div>
      )}

      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Timesheets</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: color.muted }}>Hours from everyone who fills timesheets. Guests and viewers are not counted.</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Tile label="Time logged" value={ts.time} hint="hours and minutes" />
        <Tile label="People with time" value={`${ts.peopleWithTime} of ${ts.peopleTotal}`} hint="members who fill timesheets" />
        <Tile label="Complete" value={String(ts.complete)} hint="logged every expected day" />
        <Tile label="Missing days" value={String(ts.missingDays)} hint={`expected days with no time, across ${peoplePhrase(ts.missingPeople)}`} valueColor={ts.missingDays > 0 ? color.warning : color.ink} />
        <Tile label="Days off" value={String(ts.daysOff)} hint={`leave and other, across ${peoplePhrase(ts.daysOffPeople)}`} />
      </div>

      <section className="bt-card" style={{ padding: 0, overflowX: 'auto' }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h3 style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 600 }}>By person and project</h3>
            <span style={{ fontSize: 12.5, color: color.muted }}>hh:mm · days logged out of days expected (working days minus days off and holidays)</span>
          </div>
          <PersonProjectTable data={ts} />
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="bt-card" style={{ flex: '1 1 440px', padding: 0, overflowX: 'auto' }}>
          <div style={{ minWidth: 440 }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>By project</h3>
            </div>
            <GridHead cols="minmax(200px, 1.4fr) 100px 80px minmax(200px, 2fr)" cells={['Project', 'Time', 'People', 'Share of time logged']} />
            {ts.byProject.map((p) => {
              const pct = Number.parseInt(p.share, 10) || 0;
              return (
                <div key={p.projectId} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.4fr) 100px 80px minmax(200px, 2fr)', alignItems: 'center', minHeight: 46, borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: p.colour }} />
                    {p.name}
                  </span>
                  <Num weight={600}>{p.time}</Num>
                  <Num>{p.people}</Num>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
                    <CssBar pct={pct} fill={p.colour} height={8} />
                    <span style={{ width: 46, fontSize: 12.5, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.share}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="bt-card" style={{ flex: '1 1 340px', padding: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${color.divider}` }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Missing timesheets</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: color.muted }}>Expected working days with no time and no day off.</p>
          </div>
          {ts.missing.map((m) => (
            <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '6px 16px', borderBottom: `1px solid ${color.divider}` }}>
              <Avatar user={{ id: m.userId, name: m.name, email: '', initials: initialsOf(m.name, m.initials) }} size={26} fontSize={10.5} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 500 }}>{m.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: color.muted }}>{m.detail}</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: m.tone === 'danger' ? color.danger : color.warning, whiteSpace: 'nowrap' }}>{m.count}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function PersonProjectTable({ data }: { data: WorkspaceReports['timesheets'] }) {
  const cols = `minmax(200px, 1.4fr) repeat(${data.projects.length}, minmax(76px, 1fr)) 84px 56px minmax(170px, 1.2fr)`;
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${color.divider}` }}>
        <HeadCell align="left">Person</HeadCell>
        {data.projects.map((p) => (
          <HeadCell key={p.id}>{shortProject(p.name)}</HeadCell>
        ))}
        <HeadCell>Total</HeadCell>
        <HeadCell>Off</HeadCell>
        <HeadCell align="left">Logged / expected</HeadCell>
      </div>
      {data.people.map((row) => {
        const full = row.loggedDays === row.expected && row.expected > 0;
        const none = row.loggedDays === 0;
        const pct = row.expected ? Math.round((row.loggedDays / row.expected) * 100) : 0;
        const daysColor = none ? color.danger : full ? color.brandStrong : color.warning;
        return (
          <div key={row.userId} style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 46, borderBottom: `1px solid ${color.divider}`, fontSize: 13.5 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
              <Avatar user={{ id: row.userId, name: row.name, email: '', initials: initialsOf(row.name, row.initials) }} size={26} fontSize={10.5} />
              {row.name}
            </span>
            {data.projects.map((p) => {
              const cell = row.byProject[p.id];
              return <Num key={p.id} color={cell ? color.ink : color.faint}>{cell ?? '-'}</Num>;
            })}
            <Num weight={600}>{row.total}</Num>
            <Num color={row.off ? color.ink2 : color.faint}>{row.off ? row.off : '-'}</Num>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
              <CssBar pct={pct} fill={full ? color.brand : color.warning} />
              <span style={{ width: 60, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: daysColor, fontWeight: full ? 400 : 600 }}>
                {row.loggedDays} / {row.expected}
              </span>
            </span>
          </div>
        );
      })}
      <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: 44, background: color.subtle, fontSize: 13.5, fontWeight: 600 }}>
        <span style={{ padding: '0 16px' }}>Total</span>
        {data.projects.map((p) => (
          <Num key={p.id}>{String(data.projectTotals[p.id] ?? '0:00')}</Num>
        ))}
        <Num>{data.projectTotals.total}</Num>
        <Num>{data.projectTotals.off}</Num>
        <span style={{ padding: '0 16px', fontWeight: 400, fontSize: 12.5, color: color.muted }}>{data.completeLabel}</span>
      </div>
    </>
  );
}

function shortProject(name: string) {
  if (name === 'Website relaunch') return 'Website';
  if (name === 'Mobile app') return 'Mobile';
  if (name === 'Client onboarding') return 'Onboarding';
  if (name === 'Internal ops') return 'Internal';
  return name;
}

function GridHead({ cols, cells }: { cols: string; cells: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${color.divider}` }}>
      {cells.map((c, i) => (
        <HeadCell key={c} align={i === 0 || c.startsWith('Logged') || c.startsWith('Share') ? 'left' : 'right'}>{c}</HeadCell>
      ))}
    </div>
  );
}

function HeadCell({ children, align = 'right' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <span style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: color.muted, textAlign: align, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}

function Num({ children, color: fg, weight }: { children: string | number; color?: string; weight?: number }) {
  return (
    <span style={{ padding: '0 16px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: fg, fontWeight: weight }}>
      {children}
    </span>
  );
}

