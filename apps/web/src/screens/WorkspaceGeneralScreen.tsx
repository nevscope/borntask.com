import { Alert, Button, Checkbox, Form, Input, Radio, Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { BASE_URL } from '../api/http';
import {
  applyMockWorkspaceSettings,
  qk,
  USE_MOCKS,
  useChatAppStatus,
  useMe,
  useWorkspaceHolidays,
  useWorkspaceSettings,
  type WorkspaceHoliday,
  type WorkspaceSettings,
} from '../api/queries';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SettingsFrame } from '../components/SettingsNav';
import { useStatusToast } from '../components/StatusToast';
import { useIsPhone } from '../hooks/useIsPhone';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { holidayCountryOptions, timeZoneSelectOptions } from '@borntask/shared';
import { color, radius } from '../theme/tokens';

const SAVED_FIELDS = [
  'name',
  'timeZone',
  'weekStart',
  'defaultWorkflowId',
  'bugsStartIn',
  'allowGoogle',
  'allowMicrosoft',
  'membersCanInviteGuests',
  'timesheetPeriod',
  'timesheetUnit',
  'timesheetEditDays',
  'workingDays',
] as const;

const DAY_CHIPS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

const DEFAULT_WORKING_DAYS: WorkspaceSettings['workingDays'] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function settingsSnapshot(values: Partial<WorkspaceSettings> | undefined) {
  if (!values) return '';
  return JSON.stringify(
    SAVED_FIELDS.map((key) => {
      const value = values[key];
      if (key === 'workingDays' && Array.isArray(value)) return [...value].sort();
      return value ?? null;
    }),
  );
}

function withDefaults(data: WorkspaceSettings): WorkspaceSettings {
  return {
    ...data,
    timesheetPeriod: data.timesheetPeriod ?? 'weekly',
    timesheetUnit: data.timesheetUnit ?? 'time',
    timesheetEditDays: data.timesheetEditDays ?? 7,
    workingDays: data.workingDays?.length ? data.workingDays : [...DEFAULT_WORKING_DAYS],
  };
}

function radioCard(selected: boolean) {
  return {
    flex: '1 1 220px',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
    padding: '12px 14px',
    border: selected ? `1.5px solid ${color.brand}` : `1px solid ${color.border}`,
    borderRadius: 10,
    background: selected ? color.brandTint : color.surface,
    marginInlineEnd: 0,
  } as const;
}

export function WorkspaceGeneralScreen() {
  const me = useMe().data;
  const chatApp = useChatAppStatus();
  const canAdmin = me?.workspaceRole === 'owner' || me?.workspaceRole === 'admin';
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [logoVersion, setLogoVersion] = useState(0);
  const [slugOpen, setSlugOpen] = useState(false);
  const [slugDraft, setSlugDraft] = useState('');
  const [slugNote, setSlugNote] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugBusy, setSlugBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [holidayYear, setHolidayYear] = useState(() => dayjs().year());
  const [showAllHolidays, setShowAllHolidays] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCountry, setImportCountry] = useState('MT');
  const [importError, setImportError] = useState<string | null>(null);
  const [countries, setCountries] = useState(() => holidayCountryOptions());
  const [addDate, setAddDate] = useState('');
  const [addName, setAddName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [holidayBusy, setHolidayBusy] = useState(false);
  const toast = useStatusToast();
  const phone = useIsPhone();
  const twoCol = { display: 'grid', gridTemplateColumns: phone ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 14 } as const;
  const isOwner = me?.workspaceRole === 'owner';
  const ws = useWorkspaceSettings();
  const holidaysQ = useWorkspaceHolidays(holidayYear, canAdmin);
  const draft = Form.useWatch([], form) as Partial<WorkspaceSettings> | undefined;
  const hydrated = typeof draft?.name === 'string';
  const dirty = Boolean(ws.data && hydrated && settingsSnapshot(draft) !== settingsSnapshot(withDefaults(ws.data)));
  const unsaved = useUnsavedChanges(dirty);

  useEffect(() => {
    if (!ws.data || dirty) return;
    form.setFieldsValue(withDefaults(ws.data));
  }, [ws.data, form, dirty]);
  useEffect(() => {
    if (!canAdmin) return;
    void fetch(`${BASE_URL}/workspace/holidays/countries`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json().catch(() => ({})) as { countries?: { code: string; name: string }[] };
        if (!res.ok || !json.countries?.length) return;
        setCountries(holidayCountryOptions(json.countries));
      })
      .catch(() => undefined);
  }, [canAdmin]);
  const weekStart = (draft?.weekStart ?? ws.data?.weekStart ?? 'monday') === 'sunday' ? 'Sunday' : 'Monday';
  const workingDays = (draft?.workingDays ?? ws.data?.workingDays ?? DEFAULT_WORKING_DAYS) as WorkspaceSettings['workingDays'];
  const period = draft?.timesheetPeriod ?? ws.data?.timesheetPeriod ?? 'weekly';
  const unit = draft?.timesheetUnit ?? ws.data?.timesheetUnit ?? 'time';

  const holidays = holidaysQ.data?.holidays ?? [];
  const todayYmd = dayjs().format('YYYY-MM-DD');
  const upcoming = holidays.filter((row) => row.date >= todayYmd);
  const visibleHolidays = showAllHolidays ? holidays : upcoming;
  const yearOptions = [holidayYear, holidayYear + 1, dayjs().year(), dayjs().year() + 1]
    .filter((year, i, all) => all.indexOf(year) === i)
    .sort();

  const initials = (ws.data?.name ?? me?.workspace.name ?? 'BT')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const storeHolidays = (year: number, rows: WorkspaceHoliday[]) => {
    qc.setQueryData(qk.workspaceHolidays(year), { year, holidays: rows });
  };

  const addHoliday = async () => {
    setAddError(null);
    if (!addDate || Number(addDate.slice(0, 4)) !== holidayYear) {
      setAddError(`Choose a date in ${holidayYear}.`);
      return;
    }
    const name = addName.trim();
    if (!name) {
      setAddError('Enter a holiday name.');
      return;
    }
    if (holidays.some((row) => row.date === addDate)) {
      setAddError('That date already has a holiday.');
      return;
    }
    setHolidayBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/workspace/holidays`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: addDate, name }),
      });
      const json = await res.json().catch(() => ({})) as { holidays?: WorkspaceHoliday[]; message?: string };
      if (!res.ok) {
        setAddError(json.message ?? 'Could not save public holidays.');
        return;
      }
      storeHolidays(holidayYear, json.holidays ?? []);
      toast.show('Holiday added.');
      if (addDate < todayYmd) setShowAllHolidays(true);
      setAddOpen(false);
      setAddDate('');
      setAddName('');
    } finally {
      setHolidayBusy(false);
    }
  };

  const removeHoliday = async (date: string) => {
    setHolidayBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/workspace/holidays?date=${encodeURIComponent(date)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({})) as { holidays?: WorkspaceHoliday[]; message?: string };
      if (!res.ok) {
        toast.show(json.message ?? 'Could not save public holidays.');
        return;
      }
      storeHolidays(holidayYear, json.holidays ?? []);
      toast.show('Holiday removed.');
    } finally {
      setHolidayBusy(false);
    }
  };

  const copyToNextYear = async () => {
    setHolidayBusy(true);
    try {
      const to = holidayYear + 1;
      const res = await fetch(`${BASE_URL}/workspace/holidays/copy`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: holidayYear, to }),
      });
      const json = await res.json().catch(() => ({})) as {
        copied?: number;
        skippedMovable?: { name: string }[];
        message?: string;
      };
      if (!res.ok) {
        toast.show(json.message ?? 'Could not copy holidays.');
        return;
      }
      void qc.invalidateQueries({ queryKey: qk.workspaceHolidays(to) });
      const skipped = json.skippedMovable?.length
        ? ` Check movable ones like ${json.skippedMovable.map((row) => row.name).join(', ')}.`
        : ' Check movable ones like Good Friday.';
      toast.show(`Copied ${json.copied ?? 0} dates to ${to}.${skipped}`);
    } finally {
      setHolidayBusy(false);
    }
  };

  const checkSlugDraft = async (raw: string) => {
    const slug = raw.trim();
    if (slug.length < 2 || slug === ws.data?.slug) {
      setSlugNote(null);
      return;
    }
    const res = await fetch(`${BASE_URL}/workspaces/slug-available?slug=${encodeURIComponent(slug)}`, { credentials: 'include' });
    const json = await res.json() as { available?: boolean; message?: string };
    if (!res.ok) {
      setSlugNote(json.message ?? null);
      return;
    }
    setSlugNote(json.available ? 'Available' : (json.message ?? 'That address is taken.'));
  };

  const changeSlug = async () => {
    const next = slugDraft.trim();
    if (!next || next === ws.data?.slug) return;
    setSlugBusy(true);
    setSlugError(null);
    try {
      const res = await fetch(`${BASE_URL}/workspace`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: next, confirmSlugChange: true }),
      });
      const json = await res.json().catch(() => ({})) as WorkspaceSettings & { message?: string; url?: string };
      if (!res.ok) {
        if (USE_MOCKS && (res.status === 401 || res.status === 404)) {
          const saved = applyMockWorkspaceSettings({ slug: next });
          qc.setQueryData(qk.workspaceSettings, saved);
          form.setFieldsValue(withDefaults(saved));
          setSlugOpen(false);
          toast.show('Web address updated.');
          return;
        }
        setSlugError(json.message ?? 'Could not change the web address.');
        return;
      }
      applyMockWorkspaceSettings(json);
      qc.setQueryData(qk.workspaceSettings, json);
      form.setFieldsValue(withDefaults(json));
      setSlugOpen(false);
      toast.show('Web address updated.');
      void qc.invalidateQueries({ queryKey: qk.me });
      if (json.url) {
        try {
          const dest = new URL(json.url, window.location.origin);
          if (dest.origin !== window.location.origin) {
            window.location.assign(dest.href);
            return;
          }
        } catch {
          /* stay on this page */
        }
      }
    } catch {
      if (USE_MOCKS) {
        const saved = applyMockWorkspaceSettings({ slug: next });
        qc.setQueryData(qk.workspaceSettings, saved);
        form.setFieldsValue(withDefaults(saved));
        setSlugOpen(false);
        toast.show('Web address updated.');
        return;
      }
      setSlugError('Could not change the web address.');
    } finally {
      setSlugBusy(false);
    }
  };

  const weekHint = useMemo(
    () => `One line per project per week. Weeks start on ${weekStart}, as set above.`,
    [weekStart],
  );

  return (
    <SettingsFrame canAdmin={canAdmin} isOwner={me?.workspaceRole === 'owner'}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: '1 1 280px' }}>
          <h1 className="bt-h1">Workspace</h1>
          <p style={{ color: color.muted, margin: '6px 0 0' }}>Owners and admins only.</p>
        </div>
        {canAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {dirty && !saved && !busy && <span style={{ fontSize: 13, color: color.warning }}>Unsaved changes</span>}
            <Button type="primary" loading={busy} disabled={!dirty} onClick={() => form.submit()}>
              {saved && !dirty ? 'Saved' : 'Save changes'}
            </Button>
          </div>
        )}
      </div>
      {!canAdmin && <Alert type="warning" message="You can view this page, but only an owner or admin can save changes." />}
      {ws.error && <Alert type="error" showIcon message={ws.error.message} />}
      {saveError && <Alert type="error" showIcon message={saveError} />}
      <Form
        form={form}
        layout="vertical"
        disabled={!canAdmin}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        onValuesChange={() => {
          setSaved(false);
          setSaveError(null);
        }}
        onFinish={async (values: Partial<WorkspaceSettings>) => {
          setSaveError(null);
          setSaved(false);
          setBusy(true);
          const days = values.workingDays?.length ? values.workingDays : [...DEFAULT_WORKING_DAYS];
          try {
            const res = await fetch(`${BASE_URL}/workspace`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: values.name,
                timeZone: values.timeZone,
                weekStart: values.weekStart,
                defaultWorkflowId: values.defaultWorkflowId ?? null,
                bugsStartIn: values.bugsStartIn,
                allowGoogle: values.allowGoogle,
                allowMicrosoft: values.allowMicrosoft,
                membersCanInviteGuests: values.membersCanInviteGuests,
                timesheetPeriod: values.timesheetPeriod,
                timesheetUnit: values.timesheetUnit,
                timesheetEditDays: values.timesheetEditDays,
                workingDays: days,
              }),
            });
            const json = await res.json().catch(() => ({})) as WorkspaceSettings & { message?: string };
            if (!res.ok) {
              if (USE_MOCKS && (res.status === 401 || res.status === 404)) {
                const next = applyMockWorkspaceSettings({ ...values, workingDays: days });
                qc.setQueryData(qk.workspaceSettings, next);
                form.setFieldsValue(withDefaults(next));
                setSaved(true);
                toast.show('Workspace saved.');
                void qc.invalidateQueries({ queryKey: ['timesheets'] });
                return;
              }
              setSaveError(json.message ?? 'Could not save workspace settings.');
              return;
            }
            applyMockWorkspaceSettings(json);
            qc.setQueryData(qk.workspaceSettings, json);
            form.setFieldsValue(withDefaults(json));
            setSaved(true);
            toast.show('Workspace saved.');
            void qc.invalidateQueries({ queryKey: qk.me });
            void qc.invalidateQueries({ queryKey: ['timesheets'] });
          } catch {
            if (USE_MOCKS) {
              const next = applyMockWorkspaceSettings({ ...values, workingDays: days });
              qc.setQueryData(qk.workspaceSettings, next);
              form.setFieldsValue(withDefaults(next));
              setSaved(true);
              toast.show('Workspace saved.');
              void qc.invalidateQueries({ queryKey: ['timesheets'] });
              return;
            }
            setSaveError('Could not save workspace settings.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="bt-card" style={{ padding: 18, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {ws.data?.logo ? (
              <img src={`${BASE_URL}/workspace/logo?v=${logoVersion}`} alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'cover' }} />
            ) : (
              <span style={{ width: 64, height: 64, borderRadius: 14, display: 'grid', placeItems: 'center', background: color.brand, color: color.surface, fontSize: 20, fontWeight: 600 }}>{initials}</span>
            )}
            <label style={{ height: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', border: `1px solid ${color.border}`, borderRadius: 8, background: color.surface, fontSize: 12.5, cursor: canAdmin ? 'pointer' : 'default' }}>
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={!canAdmin}
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const body = new FormData();
                  body.append('file', file);
                  void fetch(`${BASE_URL}/workspace/logo`, { method: 'POST', credentials: 'include', body }).then(async (res) => {
                    if (!res.ok) return;
                    setLogoVersion((n) => n + 1);
                    toast.show('Workspace logo updated.');
                    void qc.invalidateQueries({ queryKey: qk.workspaceSettings });
                    void qc.invalidateQueries({ queryKey: qk.me });
                  });
                }}
              />
            </label>
          </div>
          <div style={{ flex: '1 1 360px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, alignItems: 'end' }}>
            <Form.Item name="name" label="Name" style={{ marginBottom: 0 }}><Input /></Form.Item>
            <div>
              <div style={{ marginBottom: 8, fontSize: 14 }}>Web address</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
                <span style={{ fontSize: 14 }}>{ws.data?.slug ?? '—'}.borntask.com</span>
                {canAdmin && (
                  <Button
                    htmlType="button"
                    onClick={() => {
                      setSlugDraft(ws.data?.slug ?? '');
                      setSlugNote(null);
                      setSlugError(null);
                      setSlugOpen(true);
                    }}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Defaults</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: color.muted }}>Used for new projects and for how dates are shown.</p>
          </div>
          <div style={twoCol}>
            <Form.Item name="timeZone" label="Default time zone" style={{ marginBottom: 0 }}>
              <Select
                showSearch
                optionFilterProp="label"
                options={timeZoneSelectOptions()}
              />
            </Form.Item>
            <Form.Item name="weekStart" label="Week starts on" style={{ marginBottom: 0 }}>
              <Select options={[{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }]} />
            </Form.Item>
            <Form.Item name="defaultWorkflowId" label="Default workflow for new projects" style={{ marginBottom: 0 }}>
              <Select options={(ws.data?.workflows ?? []).map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <Form.Item name="bugsStartIn" label="Bugs start in" style={{ marginBottom: 0 }}>
              <Select options={[
                { value: 'approved', label: 'Approved (skip approval)' },
                { value: 'idea', label: 'Idea (needs approval)' },
              ]}
              />
            </Form.Item>
          </div>
        </section>
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Timesheets</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: color.muted }}>Members log their time against projects. Guests and viewers don't fill timesheets.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.ink2 }}>How people log</h3>
          <Form.Item name="timesheetPeriod" label="Each entry covers" style={{ marginBottom: 0 }}>
            <Radio.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%' }}>
              <Radio value="daily" style={radioCard(period === 'daily')}>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>A day</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>One line per project per day. Best when people switch projects during the week.</span>
                </span>
              </Radio>
              <Radio value="weekly" style={radioCard(period === 'weekly')}>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>A week</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>{weekHint}</span>
                </span>
              </Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="timesheetUnit" label="People enter" style={{ marginBottom: 0 }}>
            <Radio.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: '100%' }}>
              <Radio value="time" style={radioCard(unit === 'time')}>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Time</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>Hours and minutes, for example 2:30.</span>
                </span>
              </Radio>
              <Radio value="percent" style={radioCard(unit === 'percent')}>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Percentage</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>Share of the day or week. Lines should add up to 100%; we warn but still save.</span>
                </span>
              </Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="timesheetEditDays"
            label="How far back people can fix a timesheet"
            style={{ marginBottom: 0 }}
            extra="After that the period is locked so reports don't change. Widen this only if someone needs a genuine correction."
          >
            <Select
              style={{ maxWidth: 280 }}
              options={[
                { value: 0, label: 'Today only' },
                { value: 3, label: '3 days' },
                { value: 7, label: '1 week' },
                { value: 14, label: '2 weeks' },
                { value: 30, label: '1 month' },
                { value: -1, label: 'Never lock' },
              ]}
            />
          </Form.Item>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: color.ink2 }}>Working calendar</h3>
          <Form.Item name="workingDays" label="Working days" style={{ marginBottom: 0 }}>
            <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DAY_CHIPS.map((day) => {
                const on = workingDays.includes(day.key);
                return (
                  <Checkbox
                    key={day.key}
                    value={day.key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 34,
                      padding: '0 12px',
                      margin: 0,
                      border: `1px solid ${on ? color.brand : color.border}`,
                      borderRadius: 999,
                      background: on ? color.brandTint : color.surface,
                      fontSize: 13,
                      fontWeight: on ? 600 : 400,
                      color: on ? color.brandStrong : color.ink2,
                    }}
                  >
                    {day.label}
                  </Checkbox>
                );
              })}
            </Checkbox.Group>
          </Form.Item>
          <span style={{ fontSize: 12.5, color: color.muted, marginTop: -6 }}>Only working days count as expected in Reports. Anyone can still log time on other days.</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: '1 1 200px' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>Public holidays</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, color: color.muted }}>Shown on everyone's timesheet as "Public holiday" and never counted as missing.</span>
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span className="bt-sr-only">Year</span>
                <Select
                  aria-label="Year"
                  value={holidayYear}
                  onChange={(year) => { setHolidayYear(year); setShowAllHolidays(false); }}
                  options={yearOptions.map((year) => ({ value: year, label: String(year) }))}
                  style={{ width: 92 }}
                  disabled={!canAdmin}
                />
              </label>
              <Button
                htmlType="button"
                disabled={!canAdmin || holidayBusy || holidaysQ.isLoading}
                onClick={() => {
                  setImportError(null);
                  setImportOpen(true);
                }}
              >
                Import from country
              </Button>
              <Button htmlType="button" disabled={!canAdmin || holidayBusy || holidaysQ.isLoading} onClick={() => { setAddError(null); setAddDate(`${holidayYear}-01-01`); setAddName(''); setAddOpen(true); }}>
                + Add holiday
              </Button>
            </div>
            <div style={{ border: `1px solid ${color.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: color.subtle, fontSize: 12.5, color: color.muted }}>
                <span style={{ flex: 1 }}>
                  {holidaysQ.isLoading
                    ? `Loading holidays in ${holidayYear}`
                    : `${holidays.length} ${holidays.length === 1 ? 'holiday' : 'holidays'} in ${holidayYear} - ${upcoming.length} still to come`}
                </span>
                {holidays.length > 0 && (
                  <Button type="link" onClick={() => setShowAllHolidays((v) => !v)} style={{ height: 28, padding: '0 8px', fontWeight: 600 }}>
                    {showAllHolidays ? 'Show upcoming' : 'Show all'}
                  </Button>
                )}
              </div>
              {holidaysQ.error && (
                <Alert type="error" showIcon message={holidaysQ.error.message} style={{ borderRadius: 0, border: 0 }} />
              )}
              {visibleHolidays.length === 0 && !holidaysQ.isLoading && (
                <div style={{ padding: '12px 14px', fontSize: 12.5, color: color.muted, borderTop: `1px solid ${color.divider}` }}>
                  {holidays.length === 0 ? `No holidays in ${holidayYear}.` : 'No upcoming holidays. Show all to see earlier dates.'}
                </div>
              )}
              {visibleHolidays.map((row) => {
                const day = dayjs(row.date);
                const weekday = day.format('ddd');
                const weekdayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[day.day()];
                const idle = !workingDays.includes(weekdayKey);
                return (
                  <div key={row.date} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 46, padding: '6px 14px', borderTop: `1px solid ${color.divider}` }}>
                    <span style={{ width: 92, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{day.format('D MMM')}</span>
                    <span style={{ width: 40, fontSize: 12.5, color: color.muted }}>{weekday}</span>
                    <span style={{ flex: '1 1 180px' }}>
                      {row.name}
                      {idle && <span style={{ fontSize: 12.5, color: color.muted }}> - not a working day, no effect</span>}
                    </span>
                    <Button
                      type="text"
                      htmlType="button"
                      danger
                      disabled={!canAdmin || holidayBusy}
                      aria-label={`Remove ${row.name}`}
                      onClick={() => void removeHoliday(row.date)}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${color.divider}`, background: color.subtle }}>
                <span style={{ flex: '1 1 260px', fontSize: 12.5, color: color.muted }}>Copy to {holidayYear + 1} brings over fixed dates. Check movable ones like Good Friday.</span>
                <Button htmlType="button" disabled={!canAdmin || holidayBusy || holidays.length === 0} onClick={() => void copyToNextYear()}>
                  Copy to {holidayYear + 1}
                </Button>
              </div>
            </div>
          </div>
          </div>
          <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: radius.md, background: color.subtle, fontSize: 12.5, lineHeight: 1.5, color: color.ink2 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none', marginTop: 2, color: color.muted }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            <span>
              Changing period or unit doesn't change saved timesheets. Each entry keeps the period and unit it was saved with. Once a period is older than the lock window, nobody can edit it - that keeps <Link to="/reports">Reports</Link> stable. People mark their own days off (Leave or Other) on the Timesheets page.
            </span>
          </p>
        </section>
        <section className="bt-card" style={{ padding: '16px 18px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600 }}>Security</h2>
          <Form.Item name="allowGoogle" valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox className="bt-check-row">Allow sign-in with Google</Checkbox></Form.Item>
          <Form.Item name="allowMicrosoft" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox className="bt-check-row">Allow sign-in with Microsoft <span style={{ fontSize: 12.5, color: color.muted }}>(needed for most client guests)</span></Checkbox>
          </Form.Item>
          <Form.Item name="membersCanInviteGuests" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox className="bt-check-row">Members can invite guests <span style={{ fontSize: 12.5, color: color.muted }}>(otherwise only admins and project leads)</span></Checkbox>
          </Form.Item>
        </section>
      </Form>
      {isOwner && (
        <section className="bt-card" style={{ padding: '16px 18px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: '1 1 320px' }}>
            <span style={{ display: 'block', fontWeight: 600, color: color.danger }}>Delete workspace</span>
            <span style={{ fontSize: 13, color: color.muted }}>Removes every project, task and file after 30 days. Owners only, and you will be asked to type the workspace name.</span>
          </span>
          <Button danger onClick={() => { setConfirmName(''); setDeleteError(null); setDeleteOpen(true); }}>Delete workspace…</Button>
        </section>
      )}
      <section className="bt-card" style={{ padding: '16px 18px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600 }}>Google Chat app</h2>
        <p style={{ margin: 0, fontSize: 13, color: color.muted, lineHeight: 1.5 }}>
          {chatApp.data?.configured
            ? 'The Chat app is configured on this server. Slash commands, Create BornTask task, and idea Approve / Reject use it. Space webhooks still work. Direct messages need the app to be allowed on your Google Workspace.'
            : chatApp.isLoading
              ? 'Checking whether the Chat app is configured on this server.'
              : 'The Chat app is not configured on this server yet. Space webhooks still work.'}
        </p>
      </section>
      <ConfirmDialog
        open={slugOpen}
        title="Change web address"
        confirmLabel="Change address"
        tone="primary"
        confirmDisabled={!slugDraft.trim() || slugDraft.trim() === (ws.data?.slug ?? '')}
        busy={slugBusy}
        onCancel={() => setSlugOpen(false)}
        onConfirm={() => void changeSlug()}
      >
        <p style={{ marginTop: 0 }}>
          The workspace will move to a new URL. The old address stops working. Bookmarks, invite links and email sign-in links that use the old address will fail. Someone else may then claim the old address.
        </p>
        {slugError && <Alert type="error" message={slugError} style={{ marginBottom: 12 }} />}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          New address
          <Input
            value={slugDraft}
            addonAfter=".borntask.com"
            maxLength={40}
            onChange={(e) => {
              setSlugDraft(e.target.value);
              setSlugNote(null);
            }}
            onBlur={() => void checkSlugDraft(slugDraft)}
            aria-label="New web address"
          />
        </label>
        {slugNote && <p style={{ margin: '8px 0 0', fontSize: 13, color: color.muted }}>{slugNote}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={importOpen}
        title={`Import public holidays for ${holidayYear}`}
        confirmLabel="Import holidays"
        tone="primary"
        confirmDisabled={!importCountry}
        busy={holidayBusy}
        onCancel={() => setImportOpen(false)}
        onConfirm={() => {
          setHolidayBusy(true);
          setImportError(null);
          void fetch(`${BASE_URL}/workspace/holidays/import`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year: holidayYear, countryCode: importCountry }),
          }).then(async (res) => {
            const json = await res.json().catch(() => ({})) as { holidays?: WorkspaceHoliday[]; added?: number; updated?: number; message?: string };
            setHolidayBusy(false);
            if (!res.ok) {
              setImportError(json.message ?? 'Could not import public holidays.');
              return;
            }
            storeHolidays(holidayYear, json.holidays ?? []);
            setImportOpen(false);
            toast.show(`Imported ${(json.added ?? 0) + (json.updated ?? 0)} holidays.`);
          }).catch(() => {
            setHolidayBusy(false);
            setImportError('Could not import public holidays.');
          });
        }}
      >
        <p style={{ marginTop: 0 }}>
          Loads the official public holiday list for that country from Nager Date. Existing dates in {holidayYear} keep their place; matching dates are updated. You can still add or remove days afterwards.
        </p>
        {importError && <Alert type="error" message={importError} style={{ marginBottom: 12 }} />}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          Country
          <Select
            showSearch
            optionFilterProp="label"
            value={importCountry}
            onChange={setImportCountry}
            options={holidayCountryOptions(countries).map((row) => ({ value: row.code, label: `${row.name} (${row.code})` }))}
            placeholder="Choose a country"
          />
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={addOpen}
        title="Add holiday"
        confirmLabel="Add holiday"
        tone="primary"
        confirmDisabled={!addDate || !addName.trim()}
        busy={holidayBusy}
        onCancel={() => setAddOpen(false)}
        onConfirm={() => void addHoliday()}
      >
        <p style={{ marginTop: 0, color: color.muted, fontSize: 13 }}>Shown on everyone's timesheet as a public holiday.</p>
        {addError && <Alert type="error" message={addError} style={{ marginBottom: 12 }} />}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
          Date
          <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
          Name
          <Input value={addName} onChange={(e) => setAddName(e.target.value)} maxLength={80} />
        </label>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteOpen}
        title="Delete workspace"
        confirmLabel="Delete workspace"
        confirmDisabled={confirmName !== (ws.data?.name ?? '')}
        busy={deleteBusy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteError(null);
          setDeleteBusy(true);
          void fetch(`${BASE_URL}/workspace/delete`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: confirmName }),
          }).then(async (res) => {
            const json = await res.json().catch(() => ({})) as { message?: string; next?: string };
            setDeleteBusy(false);
            if (!res.ok) {
              setDeleteError(json.message ?? 'Could not delete the workspace.');
              return;
            }
            window.location.href = json.next ?? '/create-workspace';
          });
        }}
      >
        <p style={{ marginTop: 0 }}>Type <strong>{ws.data?.name}</strong> to close this workspace. It is removed for good after 30 days.</p>
        {deleteError && <Alert type="error" message={deleteError} style={{ marginBottom: 12 }} />}
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} aria-label="Workspace name" />
      </ConfirmDialog>
      {unsaved}
    </SettingsFrame>
  );
}
