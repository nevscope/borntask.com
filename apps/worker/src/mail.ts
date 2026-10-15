import { mailJobSchema, type MailJob } from '@borntask/shared';

const FROM = { email: 'notify@borntask.com', name: 'BornTask' };

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function expiryLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'the expiry date';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shell(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#EEF0EC;font-family:'DM Sans',Arial,sans-serif;color:#121417;">
  <div style="max-width:600px;margin:24px auto;background:#FFFFFF;border:1px solid #DDE1DA;border-radius:12px;overflow:hidden;">
    <div style="padding:28px 36px 0;font-family:Georgia,serif;font-size:18px;font-weight:600;letter-spacing:-0.03em;">borntask</div>
    <div style="padding:28px 36px;">${body}</div>
    <div style="padding:16px 36px;background:#F7F8F6;font-size:12px;line-height:1.5;color:#5B6157;">${footer}</div>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;height:46px;line-height:46px;padding:0 22px;border-radius:10px;background:#178A5C;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;">${esc(label)}</a>`;
}

export function renderMail(job: MailJob): { subject: string; text: string; html: string } {
  if (job.kind === 'wrong-account') {
    const subject = `${job.requesterName} asked for an invitation to ${job.workspaceName}`;
    const text = [
      subject,
      '',
      `${job.requesterName} (${job.requesterEmail}) opened an invitation for ${job.invitedEmail}.`,
      'Nothing has been joined.',
      `If they should be in ${job.workspaceName}, send a new invitation to ${job.requesterEmail}.`,
      '',
      job.peopleUrl,
      '',
      `You received this because you invited someone to ${job.workspaceName}.`,
    ].join('\n');
    const html = shell(
      `<p style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3;">${esc(subject)}</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#262A24;">${esc(job.requesterName)} (${esc(job.requesterEmail)}) opened an invitation for ${esc(job.invitedEmail)}. Nothing has been joined.</p>
       <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#262A24;">If they should be in ${esc(job.workspaceName)}, send a new invitation to ${esc(job.requesterEmail)}.</p>
       ${button(job.peopleUrl, 'Open people')}`,
      `You received this because you invited someone to ${esc(job.workspaceName)}.`,
    );
    return { subject, text, html };
  }

  const subject = `${job.inviterName} invited you to ${job.workspaceName}`;
  const when = expiryLabel(job.expiresAt);
  const quote = job.message?.trim();
  const text = [
    subject,
    '',
    `You've been invited as ${job.roleLabel} to ${job.workspaceName}.`,
    quote ? `"${quote}"` : '',
    '',
    `Accept invitation: ${job.inviteUrl}`,
    '',
    `Sign in with Google or Microsoft as ${job.to}. This link works once and expires on ${when}.`,
    '',
    `You received this because ${job.inviterName} invited this address. If you weren't expecting it, you can ignore this email.`,
  ].filter((line) => line !== '').join('\n');
  const html = shell(
    `<p style="margin:0 0 16px;font-size:22px;font-weight:600;line-height:1.3;">${esc(subject)}</p>
     <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#262A24;">You've been invited as <strong>${esc(job.roleLabel)}</strong> to ${esc(job.workspaceName)}.</p>
     ${quote ? `<div style="margin:0 0 16px;padding:12px 16px;border-left:3px solid #CFE7DA;background:#F7F8F6;font-size:14.5px;line-height:1.5;color:#3A3F38;">${esc(quote)}</div>` : ''}
     <p style="margin:0 0 16px;">${button(job.inviteUrl, 'Accept invitation')}</p>
     <p style="margin:0;font-size:13px;line-height:1.5;color:#5B6157;">Sign in with Google or Microsoft as <strong style="color:#3A3F38;">${esc(job.to)}</strong>. This link works once and expires on ${esc(when)}.</p>`,
    `You received this because ${esc(job.inviterName)} invited this address. If you weren't expecting it, you can ignore this email.`,
  );
  return { subject, text, html };
}

function devLog(job: MailJob) {
  if (process.env.NODE_ENV === 'production') {
    console.log(`[BornTask] Email skipped (SENDGRID_API_KEY is not set) for ${job.to}`);
    return;
  }
  if (job.kind === 'invite') {
    console.log(`[BornTask] Invite for ${job.to}: ${job.inviteUrl}`);
    return;
  }
  console.log(`[BornTask] Wrong-account request: ${job.requesterEmail} asked for an invite meant for ${job.invitedEmail}`);
}

export async function deliverMail(input: unknown): Promise<{ ok: true; skipped?: boolean }> {
  const job = mailJobSchema.parse(input);
  const key = process.env.SENDGRID_API_KEY?.trim();
  if (!key) {
    devLog(job);
    return { ok: true, skipped: true };
  }
  const rendered = renderMail(job);
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: job.to }] }],
      from: FROM,
      subject: rendered.subject,
      content: [
        { type: 'text/plain', value: rendered.text },
        { type: 'text/html', value: rendered.html },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status} ${detail.slice(0, 240)}`);
  }
  return { ok: true };
}
