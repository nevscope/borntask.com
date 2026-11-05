import { Checkbox, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { holidayCountryName, holidayCountryOptions } from '@borntask/shared';
import { color, radius } from '../theme/tokens';

const DAY_CHIPS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'S' },
  { key: 'sun', label: 'S' },
] as const;

const PART_TIME = ['tue', 'thu'];

function sameDays(a: string[], b: string[]) {
  return [...a].sort().join(',') === [...b].sort().join(',');
}

export function WorkingPatternFields({
  workingDays,
  workspaceDays,
  hoursPerWeek,
  holidayCountry,
  workspaceHolidayCountry,
  showHolidayCountry = false,
  timesheetsExempt = false,
  showTimesheetsExempt = false,
  disabled,
  onSave,
}: {
  workingDays: string[] | null;
  workspaceDays: string[];
  hoursPerWeek: number | null;
  holidayCountry?: string | null;
  workspaceHolidayCountry?: string | null;
  showHolidayCountry?: boolean;
  timesheetsExempt?: boolean;
  showTimesheetsExempt?: boolean;
  disabled?: boolean;
  onSave: (next: { workingDays: string[] | null; hoursPerWeek: number | null; holidayCountry?: string | null; timesheetsExempt?: boolean }) => void;
}) {
  const inherited = workingDays == null;
  const days = workingDays ?? workspaceDays;
  const [hoursDraft, setHoursDraft] = useState(hoursPerWeek == null ? '' : String(hoursPerWeek));
  useEffect(() => {
    setHoursDraft(hoursPerWeek == null ? '' : String(hoursPerWeek));
  }, [hoursPerWeek]);

  function persist(next: { workingDays?: string[] | null; hoursPerWeek?: number | null; holidayCountry?: string | null; timesheetsExempt?: boolean }) {
    onSave({
      workingDays: next.workingDays !== undefined ? next.workingDays : workingDays,
      hoursPerWeek: next.hoursPerWeek !== undefined ? next.hoursPerWeek : hoursPerWeek,
      holidayCountry: next.holidayCountry !== undefined ? next.holidayCountry : holidayCountry ?? null,
      timesheetsExempt: next.timesheetsExempt !== undefined ? next.timesheetsExempt : timesheetsExempt,
    });
  }

  function saveDays(next: string[]) {
    if (next.length === 0 || sameDays(next, workspaceDays)) {
      persist({ workingDays: null });
      return;
    }
    persist({ workingDays: next });
  }

  function commitHours() {
    const trimmed = hoursDraft.trim();
    if (!trimmed) {
      if (hoursPerWeek != null) persist({ hoursPerWeek: null });
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 168) return;
    if (n !== hoursPerWeek) persist({ hoursPerWeek: n });
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(210px, 1.2fr) minmax(160px, 0.9fr) 120px minmax(160px, 0.8fr)',
        gap: '10px 16px',
        alignItems: 'end',
        padding: '10px 12px',
        borderRadius: radius.md,
        background: color.subtle,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: color.muted, letterSpacing: '0.01em' }}>Working days</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          {DAY_CHIPS.map((day) => {
            const on = days.includes(day.key);
            return (
              <button
                key={day.key}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                aria-label={day.key}
                onClick={() => {
                  const next = on ? days.filter((d) => d !== day.key) : [...days, day.key];
                  saveDays(next);
                }}
                style={{
                  width: 26,
                  height: 26,
                  padding: 0,
                  border: `1px solid ${on ? color.brand : color.border}`,
                  borderRadius: 6,
                  background: on ? color.brandTint : color.surface,
                  color: on ? color.brandStrong : color.ink3,
                  font: 'inherit',
                  fontSize: 11.5,
                  fontWeight: on ? 700 : 500,
                  cursor: disabled ? 'default' : 'pointer',
                }}
              >
                {day.label}
              </button>
            );
          })}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: color.muted }}>
          {inherited ? 'Workspace days' : 'Custom pattern'}
          {!disabled && (
            <>
              <button
                type="button"
                onClick={() => saveDays(PART_TIME)}
                style={{ border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                Tue and Thu
              </button>
              {!inherited && (
                <button
                  type="button"
                  onClick={() => persist({ workingDays: null })}
                  style={{ border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  Use workspace days
                </button>
              )}
            </>
          )}
        </span>
      </span>
      {showHolidayCountry ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, fontWeight: 600, color: color.muted }}>
          Holiday country
          <Select
            disabled={disabled}
            allowClear
            value={holidayCountry ?? undefined}
            placeholder={workspaceHolidayCountry ? `Default (${holidayCountryName(workspaceHolidayCountry)})` : 'Everyone only'}
            aria-label="Holiday country"
            style={{ width: '100%' }}
            options={holidayCountryOptions().map((row) => ({ value: row.code, label: row.name }))}
            onChange={(value) => persist({ holidayCountry: value ?? null })}
          />
        </label>
      ) : (
        <span />
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, fontWeight: 600, color: color.muted }}>
        Hours / week
        <Input
          disabled={disabled}
          value={hoursDraft}
          inputMode="decimal"
          placeholder="Not set"
          aria-label="Hours per week"
          style={{ height: 32 }}
          onChange={(e) => setHoursDraft(e.target.value)}
          onBlur={commitHours}
        />
      </label>
      {showTimesheetsExempt ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5, fontWeight: 600, color: color.muted }}>
          Timesheets
          <Checkbox
            disabled={disabled}
            checked={!timesheetsExempt}
            onChange={(e) => persist({ timesheetsExempt: !e.target.checked })}
          >
            Fills timesheets
          </Checkbox>
        </label>
      ) : (
        <span />
      )}
    </div>
  );
}
