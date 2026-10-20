import { describe, expect, test } from 'vitest';
import {
  ATTACHMENT_TOO_LARGE,
  ATTACHMENT_TYPE_BLOCKED,
  attachmentRejectReason,
  isBlockedAttachment,
  MAX_ATTACHMENT_BYTES,
  partitionAttachmentFiles,
} from '../packages/shared/src/attachments.ts';

describe('blocked attachment types', () => {
  test('blocks executables even with a double extension', () => {
    expect(isBlockedAttachment('setup.exe')).toBe(true);
    expect(isBlockedAttachment('notes.pdf.exe')).toBe(true);
    expect(isBlockedAttachment('library.DLL')).toBe(true);
    expect(isBlockedAttachment('run.bat')).toBe(true);
    expect(isBlockedAttachment('payload', 'application/x-msdownload')).toBe(true);
  });

  test('allows ordinary documents and images', () => {
    expect(isBlockedAttachment('spec.pdf')).toBe(false);
    expect(isBlockedAttachment('shot.png', 'image/png')).toBe(false);
    expect(isBlockedAttachment('notes.docx')).toBe(false);
    expect(isBlockedAttachment('archive.zip')).toBe(false);
  });

  test('partitions mixed picks and reports a type error', () => {
    const { accepted, reason } = partitionAttachmentFiles([
      { name: 'ok.pdf', size: 12, type: 'application/pdf' },
      { name: 'bad.exe', size: 12, type: 'application/x-msdownload' },
    ]);
    expect(accepted.map((file) => file.name)).toEqual(['ok.pdf']);
    expect(reason).toBe(ATTACHMENT_TYPE_BLOCKED);
  });

  test('rejects oversized files', () => {
    expect(attachmentRejectReason('big.pdf', MAX_ATTACHMENT_BYTES + 1)).toBe(ATTACHMENT_TOO_LARGE);
  });
});
