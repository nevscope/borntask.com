import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '../db.js';
import { config } from '../env.js';

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;
export const CODE_DIGITS = 6;

export type EmailChallenge = {
  challengeId: string;
  email: string;
  nextPath: string | null;
  inviteToken: string | null;
};

export function digestSecret(kind: 'code' | 'link', secret: string, sessionSecret = config.sessionSecret): string {
  return createHmac('sha256', sessionSecret).update(`${kind}:${secret}`).digest('hex');
}

export function hashesMatch(stored: string, computed: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(computed);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function normalizeEmail(raw: string): string | null {
  const email = (raw ?? '').trim().toLowerCase();
  if (email.length > 320 || email.split('@').length !== 2) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain || !domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return null;
  if (/\s/.test(email)) return null;
  return email;
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._-]+/g, ' ').trim() || email;
}

export async function startChallenge(
  email: string,
  opts: { nextPath?: string | null; inviteToken?: string | null } = {},
): Promise<{ code: string; linkToken: string }> {
  const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
  const linkToken = randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.emailLoginCode.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.emailLoginCode.create({
      data: {
        challengeId: randomBytes(16).toString('hex'),
        email,
        codeHash: digestSecret('code', code),
        linkHash: digestSecret('link', linkToken),
        nextPath: opts.nextPath ?? null,
        inviteToken: opts.inviteToken ?? null,
        attempts: 0,
        createdAt: now,
        expiresAt,
      },
    }),
  ]);
  return { code, linkToken };
}

export async function verifyCode(email: string, code: string): Promise<EmailChallenge | null> {
  const clean = (code ?? '').replace(/\D/g, '');
  if (clean.length !== CODE_DIGITS) return null;
  const row = await prisma.emailLoginCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;
  if (hashesMatch(row.codeHash, digestSecret('code', clean))) {
    return consume(row);
  }
  await prisma.emailLoginCode.update({
    where: { challengeId: row.challengeId },
    data: { attempts: { increment: 1 } },
  });
  return null;
}

export async function verifyLink(linkToken: string): Promise<EmailChallenge | null> {
  if (!linkToken || linkToken.length > 128) return null;
  const row = await prisma.emailLoginCode.findFirst({
    where: { linkHash: digestSecret('link', linkToken), consumedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;
  return consume(row);
}

async function consume(row: { challengeId: string; email: string; nextPath: string | null; inviteToken: string | null }): Promise<EmailChallenge> {
  await prisma.emailLoginCode.update({
    where: { challengeId: row.challengeId },
    data: { consumedAt: new Date() },
  });
  return {
    challengeId: row.challengeId,
    email: row.email,
    nextPath: row.nextPath,
    inviteToken: row.inviteToken,
  };
}

export function loginLinkUrl(linkToken: string, origin?: string): string {
  const base = (origin || config.publicUrl).replace(/\/$/, '');
  return `${base}/sign-in/email?token=${encodeURIComponent(linkToken)}`;
}

export function renderLoginCodeMail(code: string, linkUrl: string): { subject: string; text: string; html: string } {
  const subject = `${code} is your BornTask sign-in code`;
  const spaced = code.split('').join(' ');
  const text = [
    `Your BornTask sign-in code is ${code}`,
    '',
    `It works once and expires in ${CODE_TTL_MINUTES} minutes.`,
    '',
    `Or sign in with this link: ${linkUrl}`,
    '',
    "Didn't ask for this? You can ignore this email - nobody can sign in without the code.",
  ].join('\n');
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>BornTask</title></head>
<body style="margin:0;padding:0;background:#EEF0EC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF0EC;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #DDE1DA;border-radius:12px;">
        <tr><td style="padding:28px 36px 0;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:18px;font-weight:600;color:#121417;">borntask</td></tr>
        <tr><td style="padding:24px 36px 8px;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:22px;font-weight:600;color:#121417;">Your sign-in code</td></tr>
        <tr><td style="padding:0 36px 16px;font-family:'DM Sans',Arial,sans-serif;font-size:15px;line-height:1.55;color:#262A24;">
          Enter this code on BornTask, or tap the button below. It works once and expires in ${CODE_TTL_MINUTES} minutes.
        </td></tr>
        <tr><td align="center" style="padding:8px 36px 20px;font-family:'DM Sans',Arial,sans-serif;font-size:32px;font-weight:800;letter-spacing:8px;color:#121417;">${escapeHtml(spaced)}</td></tr>
        <tr><td style="padding:0 36px 28px;">
          <a href="${escapeHtml(linkUrl)}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#178A5C;color:#FFFFFF;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;">Sign in to BornTask</a>
        </td></tr>
        <tr><td style="padding:16px 36px;background:#F7F8F6;font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.5;color:#5B6157;">
          Didn't ask for this? You can ignore this email - nobody can sign in without the code.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
