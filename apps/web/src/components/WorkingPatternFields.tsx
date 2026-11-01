import { Checkbox, Input } from 'antd';
import { useEffect, useState } from 'react';
import { color } from '../theme/tokens';

const DAY_CHIPS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const;

function sameDays(a: string[], b: string[]) {
  const left = [...a].sort().join(',');
  const right = [...b].sort().join(',');
  return left === right;
}

export function WorkingPatternFields({
  workingDays,
  workspaceDays,
  hoursPerWeek,
  disabled,
  onSave,
}: {
  workingDays: string[] | null;
  workspaceDays: string[];
  hoursPerWeek: number | null;
  disabled?: boolean;
  onSave: (next: { workingDays: string[] | null; hoursPerWeek: number | null }) => void;
}) {
  const inherited = workingDays == null;
  const days = workingDays ?? workspaceDays;
  const [hoursDraft, setHoursDraft] = useState(hoursPerWeek == null ? '' : String(hoursPerWeek));
  useEffect(() => {
    setHoursDraft(hoursPerWeek == null ? '' : String(hoursPerWeek));
  }, [hoursPerWeek]);

  function saveDays(next: string[]) {
    if (next.length === 0 || sameDays(next, workspaceDays)) {
      onSave({ workingDays: null, hoursPerWeek });
      return;
    }
    onSave({ workingDays: next, hoursPerWeek });
  }

  function commitHours() {
    const trimmed = hoursDraft.trim();
    if (!trimmed) {
      if (hoursPerWeek != null) onSave({ workingDays, hoursPerWeek: null });
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 168) return;
    if (n !== hoursPerWeek) onSave({ workingDays, hoursPerWeek: n });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>Working days</span>
        <Checkbox.Group
          disabled={disabled}
          value={days}
          onChange={(values) => saveDays(values.map(String))}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
        >
          {DAY_CHIPS.map((day) => {
            const on = days.includes(day.key);
            return (
              <Checkbox
                key={day.key}
                value={day.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 28,
                  padding: '0 8px',
                  margin: 0,
                  border: `1px solid ${on ? color.brand : color.border}`,
                  borderRadius: 999,
                  background: on ? color.brandTint : color.surface,
                  fontSize: 12,
                  fontWeight: on ? 600 : 400,
                  color: on ? color.brandStrong : color.ink2,
                }}
              >
                {day.label}
              </Checkbox>
            );
          })}
        </Checkbox.Group>
        <span style={{ fontSize: 12, color: color.muted }}>
          {inherited ? 'Uses the workspace working days.' : 'Custom pattern. Days off this pattern are not expected.'}
        </span>
      </span>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: color.muted }}>
        Hours per week
        <Input
          disabled={disabled}
          value={hoursDraft}
          inputMode="decimal"
          placeholder="No hour target"
          aria-label="Hours per week"
          style={{ width: 140, height: 32 }}
          onChange={(e) => setHoursDraft(e.target.value)}
          onBlur={commitHours}
        />
      </label>
      {!inherited && !disabled && (
        <button
          type="button"
          onClick={() => onSave({ workingDays: null, hoursPerWeek })}
          style={{ border: 0, background: 'transparent', color: color.brandStrong, font: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          Use workspace days
        </button>
      )}
    </div>
  );
}
