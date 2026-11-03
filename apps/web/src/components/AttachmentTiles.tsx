import { MAX_ATTACHMENT_BYTES, partitionAttachmentFiles } from '@borntask/shared';
import { Modal } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useBackLayer } from '../lib/backLayer';
import { color, radius } from '../theme/tokens';

export { MAX_ATTACHMENT_BYTES };

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  previewUrl?: string;
  progress?: number;
  file?: File;
}

export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  if (data.files.length) {
    out.push(...Array.from(data.files));
    return out;
  }
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  return out;
}

export function itemsFromFiles(list: FileList | File[]): AttachmentItem[] {
  return Array.from(list).map((file, i) => {
    const mime = file.type || 'application/octet-stream';
    const unnamed = !file.name || /^image\.(png|jpe?g|gif|webp)$/i.test(file.name);
    return {
      id: `${Date.now()}-${i}-${file.size}`,
      name: unnamed && mime.startsWith('image/') ? 'Pasted screenshot' : file.name || 'Attachment',
      size: file.size,
      mime,
      previewUrl: mime.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      file,
    };
  });
}

function extOf(name: string) {
  const part = name.split('.').pop();
  return part && part !== name ? part.slice(0, 4).toUpperCase() : 'FILE';
}

function sizeLabel(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6L15.5 7.5" />
    </svg>
  );
}

export function AttachmentTiles({
  items,
  onAdd,
  onRemove,
  onOpen,
  onRejected,
  hint = true,
  thumbHeight = 84,
}: {
  items: AttachmentItem[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onOpen?: (item: AttachmentItem) => void;
  onRejected?: (reason: string) => void;
  hint?: boolean;
  thumbHeight?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function take(list: FileList | File[]) {
    const { accepted, reason } = partitionAttachmentFiles(Array.from(list));
    if (reason) onRejected?.(reason);
    if (accepted.length) onAdd(accepted);
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
      {items.map((item) => (
        <div key={item.id} style={{ position: 'relative', width: 132, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            role={onOpen ? 'button' : item.previewUrl ? 'img' : undefined}
            aria-label={onOpen ? `View ${item.name}` : item.previewUrl ? `${item.name} preview` : undefined}
            onClick={() => onOpen?.(item)}
            style={{
              cursor: onOpen ? 'pointer' : undefined,
              height: thumbHeight,
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              background: item.previewUrl ? color.ink : color.surface,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: item.previewUrl ? 0 : '0 12px',
              boxSizing: 'border-box',
            }}
          >
            {item.previewUrl ? (
              <img src={item.previewUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <>
                <span style={{ fontSize: 11, fontWeight: 600, color: color.muted }}>{extOf(item.name)}</span>
                {item.progress != null && item.progress < 100 && (
                  <span
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${item.name}`}
                    style={{ width: '100%', height: 4, borderRadius: 2, background: color.divider, overflow: 'hidden' }}
                  >
                    <span style={{ display: 'block', width: `${item.progress}%`, height: 4, background: color.brand }} />
                  </span>
                )}
              </>
            )}
          </div>
          <span style={{ fontSize: 12, color: color.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
            {item.progress != null && item.progress < 100 ? ' · uploading' : ` · ${sizeLabel(item.size)}`}
          </span>
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onClick={() => {
              if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
              onRemove(item.id);
            }}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: `1px solid ${color.border}`,
              background: color.surface,
              color: color.ink3,
              font: 'inherit',
              fontSize: 13,
              lineHeight: 1,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{
          width: 132,
          height: 84,
          marginBottom: hint ? 21 : 22,
          border: `1.5px dashed ${color.dashed}`,
          borderRadius: radius.md,
          background: 'transparent',
          font: 'inherit',
          fontSize: 12.5,
          color: color.ink3,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <PaperclipIcon />
        Attach file
        <input ref={inputRef} type="file" multiple className="bt-sr-only" onChange={(e) => e.target.files && take(e.target.files)} />
      </button>
      {hint && (
        <span style={{ flex: '1 1 180px', marginBottom: 21, fontSize: 12.5, lineHeight: 1.45, color: color.muted }}>
          Paste a screenshot with <kbd className="bt-kbd">Ctrl V</kbd> or drop files anywhere on this box. Up to 25 MB each. Executable files cannot be attached.
        </span>
      )}
    </div>
  );
}

export function AttachmentPreview({
  item,
  src,
  onClose,
  onDownload,
  onPrev,
  onNext,
  position,
}: {
  item: { name: string; mime: string } | null;
  src?: string;
  onClose: () => void;
  onDownload?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; count: number };
}) {
  if (!item) return null;
  return (
    <AttachmentPreviewBody
      item={item}
      src={src}
      onClose={onClose}
      onDownload={onDownload}
      onPrev={onPrev}
      onNext={onNext}
      position={position}
    />
  );
}

function AttachmentPreviewBody({
  item,
  src,
  onClose,
  onDownload,
  onPrev,
  onNext,
  position,
}: {
  item: { name: string; mime: string };
  src?: string;
  onClose: () => void;
  onDownload?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; count: number };
}) {
  const [turn, setTurn] = useState(0);
  useBackLayer(true, onClose);
  useEffect(() => {
    setTurn(0);
  }, [item.name, src]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowLeft' && onPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);
  const image = item.mime.startsWith('image/');
  const pdf = item.mime === 'application/pdf';
  const rotatable = image || pdf;
  const title = position && position.count > 1 ? `${item.name} (${position.index + 1} of ${position.count})` : item.name;
  const arrow = (side: 'left' | 'right', label: string, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      onClick={run}
      style={{
        position: 'absolute',
        top: '50%',
        [side]: 8,
        transform: 'translateY(-50%)',
        zIndex: 2,
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${color.border}`,
        borderRadius: radius.md,
        background: color.surface,
        color: color.ink,
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <Chevron dir={side} />
    </button>
  );
  return (
    <Modal
      open
      centered
      title={title}
      onCancel={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {rotatable && (
            <button
              type="button"
              onClick={() => setTurn((deg) => deg + 90)}
              style={{ height: 32, padding: '0 12px', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface, font: 'inherit', fontSize: 13, cursor: 'pointer' }}
            >
              Rotate
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              style={{ height: 32, padding: '0 12px', border: `1px solid ${color.border}`, borderRadius: radius.md, background: color.surface, font: 'inherit', fontSize: 13, cursor: 'pointer' }}
            >
              Download
            </button>
          )}
        </div>
      )}
      width={image || pdf ? 880 : 560}
    >
      <div style={{ position: 'relative', overflow: 'auto', maxHeight: '70vh', minHeight: image ? 160 : undefined }}>
        {onPrev && arrow('left', 'Previous image', onPrev)}
        {onNext && arrow('right', 'Next image', onNext)}
        <div style={{ transform: rotatable ? `rotate(${turn}deg)` : undefined, transformOrigin: 'center center', display: 'flex', justifyContent: 'center' }}>
          {image && src ? (
            <img src={src} alt={item.name} style={{ display: 'block', maxWidth: turn % 180 === 0 ? '100%' : '70vh', maxHeight: turn % 180 === 0 ? '70vh' : '100%', margin: '0 auto' }} />
          ) : pdf && src ? (
            <iframe title={item.name} src={src} style={{ width: turn % 180 === 0 ? '100%' : '70vh', height: turn % 180 === 0 ? '70vh' : '100%', minHeight: 480, border: 0 }} />
          ) : src && item.mime.startsWith('text/') ? (
            <iframe title={item.name} src={src} style={{ width: '100%', height: '50vh', border: `1px solid ${color.border}`, borderRadius: radius.md }} />
          ) : (
            <p style={{ margin: 0, color: color.muted }}>This file cannot be previewed in the browser.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M10 3 L5 8 L10 13' : 'M6 3 L11 8 L6 13'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
