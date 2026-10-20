import { digestSubject, mailJobSchema, type MailJob } from '@borntask/shared';

const FROM = { email: 'notify@borntask.com', name: 'BornTask' };
const LOGO_URL = process.env.MAIL_LOGO_URL ?? 'https://app.borntask.com/borntask-logo-120.png';

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

function logoMark(): string {
  return `<img src="${esc(LOGO_URL)}" width="26" height="26" alt="BornTask" style="display:block;border:0;width:26px;height:26px;border-radius:7px;" />`;
}

function headerRow(right = ''): string {
  return `<tr>
    <td style="padding:28px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" width="26" style="width:26px;">
            ${logoMark()}
          </td>
          <td valign="middle" style="padding-left:10px;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:18px;font-weight:600;letter-spacing:-0.035em;color:#121417;line-height:26px;">borntask</td>
          ${right ? `<td valign="middle" align="right" width="99%" style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#5B6157;white-space:nowrap;">${right}</td>` : ''}
        </tr>
      </table>
    </td>
  </tr>`;
}

function shell(body: string, footer: string, headerRight = ''): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BornTask</title>
</head>
<body style="margin:0;padding:0;background:#EEF0EC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF0EC;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#FFFFFF;border:1px solid #DDE1DA;border-radius:12px;overflow:hidden;">
          ${headerRow(headerRight)}
          <tr>
            <td style="padding:28px 36px;font-family:'DM Sans',Arial,sans-serif;color:#121417;">${body}</td>
          </tr>
          <tr>
            <td style="padding:16px 36px;background:#F7F8F6;font-family:'DM Sans',Arial,sans-serif;font-size:12px;line-height:1.5;color:#5B6157;">${footer}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string, ink = false): string {
  const bg = ink ? '#121417' : '#178A5C';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="border-radius:10px;background:${bg};">
        <a href="${esc(href)}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:${bg};color:#FFFFFF;text-decoration:none;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:600;line-height:20px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function digestLine(item: { key: string; title: string; statusName?: string; extra?: string }): string {
  const extra = item.statusName || item.extra;
  return extra ? `${item.key}  ${item.title}  (${extra})` : `${item.key}  ${item.title}`;
}

function htmlSection(
  title: string,
  colour: string,
  rows: { key: string; title: string; url: string; statusName?: string; extra?: string }[],
): string {
  if (!rows.length) return '';
  const items = rows
    .map(
      (row) => `<tr>
        <td valign="top" width="72" style="padding:10px 10px 10px 0;border-bottom:1px solid #EEF0EC;font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#5B6157;white-space:nowrap;">${esc(row.key)}</td>
        <td valign="top" style="padding:10px 10px 10px 0;border-bottom:1px solid #EEF0EC;font-family:'DM Sans',Arial,sans-serif;font-size:14.5px;color:#121417;">
          <a href="${esc(row.url)}" style="color:#121417;text-decoration:none;">${esc(row.title)}${row.extra ? ` - ${esc(row.extra)}` : ''}</a>
        </td>
        <td valign="top" align="right" style="padding:10px 0;border-bottom:1px solid #EEF0EC;font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#A04A0C;white-space:nowrap;">${row.statusName ? esc(row.statusName) : ''}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
    <tr>
      <td colspan="3" style="padding:0 0 4px;font-family:'DM Sans',Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${colour};">${esc(title)}</td>
    </tr>
    ${items}
  </table>`;
}

export function renderMail(job: MailJob): { subject: string; text: string; html: string } {
  if (job.kind === 'digest') {
    const dueCount = job.due.length + job.overdue.length;
    const subject = digestSubject(dueCount, job.mentions.length);
    const sections: string[] = [];
    if (job.due.length) {
      sections.push(['Due today', ...job.due.map(digestLine)].join('\n'));
    }
    if (job.overdue.length) {
      sections.push(['Overdue', ...job.overdue.map(digestLine)].join('\n'));
    }
    if (job.mentions.length) {
      sections.push(['Mentions', ...job.mentions.map((item) => `${item.key}: ${item.extra ?? item.title}`)].join('\n'));
    }
    if (job.staleIdeas.length) {
      sections.push(['Ideas waiting more than 5 working days', ...job.staleIdeas.map(digestLine)].join('\n'));
    }
    const text = [
      `Good morning, ${job.greetingName}`,
      '',
      ...sections.flatMap((block) => [block, '']),
      `Open My tasks: ${job.myTasksUrl}`,
      '',
      job.footerNote,
      job.profileUrl,
    ].join('\n');
    const html = shell(
      `<p style="margin:0 0 18px;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:20px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;color:#121417;">Good morning, ${esc(job.greetingName)}</p>
       ${htmlSection('Due today', '#B42323', job.due)}
       ${htmlSection('Overdue', '#B42323', job.overdue)}
       ${htmlSection('Mentions', '#5B6157', job.mentions.map((m) => ({ ...m, title: m.extra ?? m.title })))}
       ${htmlSection('Ideas waiting more than 5 working days', '#5B6157', job.staleIdeas)}
       ${button(job.myTasksUrl, 'Open My tasks', true)}`,
      `${esc(job.footerNote)} <a href="${esc(job.profileUrl)}" style="color:#0F6B46;">Change email settings</a>`,
      esc(job.dateLabel),
    );
    return { subject, text, html };
  }

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
      `<p style="margin:0 0 16px;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;">${esc(subject)}</p>
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
    `<p style="margin:0 0 16px;font-family:'Sora','DM Sans',Arial,sans-serif;font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;">${esc(subject)}</p>
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
  if (job.kind === 'digest') {
    console.log(`[BornTask] Digest for ${job.to}: ${renderMail(job).subject}`);
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
