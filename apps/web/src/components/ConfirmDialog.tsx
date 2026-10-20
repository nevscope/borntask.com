// SheetModals alertdialog. Used when a click cannot be undone.
import { Modal } from 'antd';
import type { ReactNode } from 'react';
import { color, font, radius } from '../theme/tokens';

export function ConfirmDialog({
  open,
  title,
  children,
  cancelLabel = 'Cancel',
  confirmLabel,
  busy = false,
  confirmDisabled = false,
  tone = 'danger',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  busy?: boolean;
  confirmDisabled?: boolean;
  tone?: 'danger' | 'primary';
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable={false}
      width={420}
      onCancel={onCancel}
      destroyOnHidden
      styles={{ container: { borderRadius: radius.xl, padding: 0 }, body: { padding: 0 } }}
    >
      <div role="alertdialog" aria-label={title} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontFamily: font.display, fontSize: 15, fontWeight: 600 }}>{title}</span>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: color.ink3 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={ghostBtn}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} style={{ ...(tone === 'primary' ? primaryBtn : dangerBtn), opacity: busy || confirmDisabled ? 0.45 : 1 }}>{confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}

const ghostBtn = {
  height: 34,
  padding: '0 12px',
  border: `1px solid ${color.border}`,
  borderRadius: radius.md,
  background: color.surface,
  font: 'inherit',
  fontSize: 13,
  color: color.ink,
  cursor: 'pointer',
} as const;

const primaryBtn = {
  height: 34,
  padding: '0 12px',
  border: 0,
  borderRadius: radius.md,
  background: color.brand,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: color.surface,
  cursor: 'pointer',
} as const;

const dangerBtn = {
  height: 34,
  padding: '0 12px',
  border: 0,
  borderRadius: radius.md,
  background: color.danger,
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  color: color.surface,
  cursor: 'pointer',
} as const;
