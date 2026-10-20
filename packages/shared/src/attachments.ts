export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_TOO_LARGE = 'Files must be 25 MB or smaller.';
export const ATTACHMENT_TYPE_BLOCKED = 'Executable files such as .exe and .dll cannot be attached.';

/** Last path segment after the final dot. `report.pdf.exe` is exe. */
export function attachmentExtension(name: string): string | null {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'dll',
  'com',
  'bat',
  'cmd',
  'msi',
  'msp',
  'mst',
  'scr',
  'pif',
  'cpl',
  'sys',
  'drv',
  'ocx',
  'msc',
  'vbs',
  'vbe',
  'js',
  'jse',
  'ws',
  'wsf',
  'wsh',
  'ps1',
  'psc1',
  'psd1',
  'psm1',
  'ps1xml',
  'hta',
  'inf',
  'reg',
  'lnk',
  'jar',
  'jnlp',
  'app',
  'dmg',
  'pkg',
  'command',
  'apk',
  'ipa',
  'so',
  'dylib',
  'appx',
  'appxbundle',
  'msix',
  'msixbundle',
  'gadget',
  'deb',
  'rpm',
]);

const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/vnd.microsoft.portable-executable',
  'application/x-executable',
  'application/x-ms-dos-executable',
  'application/x-msi',
  'application/java-archive',
  'application/x-java-archive',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage',
  'application/vnd.debian.binary-package',
  'application/x-debian-package',
  'application/x-rpm',
]);

export function isBlockedAttachment(name: string, mime = ''): boolean {
  const ext = attachmentExtension(name);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return true;
  const type = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  return type !== '' && BLOCKED_MIMES.has(type);
}

export function attachmentRejectReason(name: string, size: number, mime = ''): string | null {
  if (size > MAX_ATTACHMENT_BYTES) return ATTACHMENT_TOO_LARGE;
  if (isBlockedAttachment(name, mime)) return ATTACHMENT_TYPE_BLOCKED;
  return null;
}

export function partitionAttachmentFiles<T extends { name: string; size: number; type?: string }>(
  files: T[],
): { accepted: T[]; reason: string | null } {
  const accepted: T[] = [];
  let reason: string | null = null;
  for (const file of files) {
    const reject = attachmentRejectReason(file.name, file.size, file.type ?? '');
    if (reject) {
      reason = reject;
      continue;
    }
    accepted.push(file);
  }
  return { accepted, reason };
}
