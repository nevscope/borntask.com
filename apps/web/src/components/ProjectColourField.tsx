import { Input } from 'antd';
import { chipSwatchFor, color, font, parseProjectHex, projectSwatches } from '../theme/tokens';

type Swatch = { id: string; label: string; hex: string; bg?: string; fg?: string };

export function ColourSwatchRow({
  colour,
  onColour,
  disabled = false,
  swatches = projectSwatches,
}: {
  colour: string;
  onColour: (hex: string) => void;
  disabled?: boolean;
  swatches?: readonly Swatch[];
}) {
  const chip = chipSwatchFor(colour);
  const customColour = !swatches.some((s) => s.hex.toLowerCase() === colour.toLowerCase()) && !(chip && swatches.some((s) => s.hex.toLowerCase() === chip.hex.toLowerCase()));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {swatches.map((s) => {
        const onThisChip = Boolean(s.bg) && chip?.hex.toLowerCase() === s.hex.toLowerCase();
        const selected = colour.toLowerCase() === s.hex.toLowerCase() || onThisChip;
        const ink = s.fg ?? s.hex;
        const wash = s.bg;
        const tinted = Boolean(wash && wash.toLowerCase() !== ink.toLowerCase());
        return (
          <button
            key={s.id}
            type="button"
            aria-label={selected ? `${s.label}, selected` : s.label}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onColour(s.hex)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 8,
              border: 0,
              padding: 0,
              display: 'grid',
              placeItems: 'center',
              background: tinted ? wash : ink,
              cursor: disabled ? 'default' : 'pointer',
              boxShadow: selected
                ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${ink}`
                : tinted
                  ? `inset 0 0 0 1px ${color.border}`
                  : undefined,
            }}
          >
            {tinted ? <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: ink }} /> : null}
          </button>
        );
      })}
      <label
        style={{
          position: 'relative',
          width: 24,
          height: 24,
          borderRadius: 8,
          overflow: 'hidden',
          cursor: disabled ? 'default' : 'pointer',
          display: 'grid',
          placeItems: 'center',
          background: customColour ? colour : color.subtle,
          boxShadow: customColour ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${colour}` : `inset 0 0 0 1px ${color.dashed}`,
        }}
      >
        <span className="bt-sr-only">Custom colour</span>
        <input
          type="color"
          value={parseProjectHex(colour) ?? color.faint}
          aria-label="Custom colour"
          disabled={disabled}
          onChange={(e) => onColour(e.target.value.toUpperCase())}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: disabled ? 'default' : 'pointer', border: 0, padding: 0, width: '100%', height: '100%' }}
        />
      </label>
    </div>
  );
}

export function ProjectColourField({
  colour,
  hexDraft,
  onColour,
  onHexDraft,
  disabled = false,
}: {
  colour: string;
  hexDraft: string;
  onColour: (hex: string) => void;
  onHexDraft: (value: string) => void;
  disabled?: boolean;
}) {
  const customColour = !projectSwatches.some((s) => s.hex.toLowerCase() === colour.toLowerCase());

  return (
    <fieldset disabled={disabled} style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <legend style={{ padding: '0 0 8px', fontSize: 13, fontWeight: 500 }}>Colour</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {projectSwatches.map((s) => {
          const selected = colour.toLowerCase() === s.hex.toLowerCase();
          return (
            <button
              key={s.id}
              type="button"
              aria-label={selected ? `${s.label}, selected` : s.label}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => {
                onColour(s.hex);
                onHexDraft(s.hex);
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: 0,
                background: s.hex,
                cursor: disabled ? 'default' : 'pointer',
                boxShadow: selected ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${s.hex}` : undefined,
              }}
            />
          );
        })}
        <label
          style={{
            position: 'relative',
            width: 28,
            height: 28,
            borderRadius: 8,
            overflow: 'hidden',
            cursor: disabled ? 'default' : 'pointer',
            display: 'grid',
            placeItems: 'center',
            background: customColour ? colour : color.subtle,
            color: customColour ? color.surface : color.muted,
            boxShadow: customColour ? `0 0 0 2px ${color.surface}, 0 0 0 4px ${colour}` : `inset 0 0 0 1px ${color.dashed}`,
            fontSize: 16,
            fontWeight: 500,
            lineHeight: 1,
          }}
        >
          {!customColour && <span aria-hidden="true">+</span>}
          <span className="bt-sr-only">Custom colour</span>
          <input
            type="color"
            value={parseProjectHex(colour) ?? color.faint}
            aria-label="Custom colour"
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value.toUpperCase();
              onColour(next);
              onHexDraft(next);
            }}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: disabled ? 'default' : 'pointer', border: 0, padding: 0, width: '100%', height: '100%' }}
          />
        </label>
        <Input
          value={hexDraft}
          aria-label="Colour hex"
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            onHexDraft(raw);
            const digits = raw.trim().replace(/^#/, '');
            const parsed = parseProjectHex(raw);
            if (parsed && digits.length === 6) onColour(parsed);
          }}
          onBlur={() => {
            const parsed = parseProjectHex(hexDraft);
            if (parsed) {
              onColour(parsed);
              onHexDraft(parsed);
            } else {
              onHexDraft(colour);
            }
          }}
          maxLength={7}
          style={{ width: 88, height: 28, fontFamily: font.mono, fontSize: 12, letterSpacing: '0.02em' }}
        />
      </div>
    </fieldset>
  );
}
