import { digestSubject, mailJobSchema, type MailJob } from '@borntask/shared';

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

function button(href: string, label: string, ink = false): string {
  const bg = ink ? '#121417' : '#178A5C';
  return `<a href="${esc(href)}" style="display:inline-block;height:46px;line-height:46px;padding:0 22px;border-radius:10px;background:${bg};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;">${esc(label)}</a>`;
}

function digestLine(item: { key: string; title: string; statusName?: string; extra?: string }): string {
  const extra = item.statusName || item.extra;
  return extra ? `${item.key}  ${item.title}  (${extra})` : `${item.key}  ${item.title}`;
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
    const htmlSection = (
      title: string,
      colour: string,
      rows: { key: string; title: string; url: string; statusName?: string; extra?: string }[],
    ) => {
      if (!rows.length) return '';
      const items = rows
        .map(
          (row) =>
            `<a href="${esc(row.url)}" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #EEF0EC;color:#121417;text-decoration:none;font-size:14.5px;"><span style="color:#5B6157;width:64px;">${esc(row.key)}</span><span style="flex:1;">${esc(row.title)}${row.extra ? ` - ${esc(row.extra)}` : ''}</span>${row.statusName ? `<span style="color:#A04A0C;font-size:13px;">${esc(row.statusName)}</span>` : ''}</a>`,
        )
        .join('');
      return `<div style="display:flex;flex-direction:column;gap:4px;"><span style="font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${colour};">${esc(title)}</span>${items}</div>`;
    };
    const html = shell(
      `<div style="display:flex;align-items:baseline;gap:12px;margin:0 0 16px;"><p style="margin:0;font-size:20px;font-weight:600;line-height:1.3;">Good morning, ${esc(job.greetingName)}</p><span style="margin-left:auto;font-size:13px;color:#5B6157;">${esc(job.dateLabel)}</span></div>
       ${htmlSection('Due today', '#B42323', job.due)}
       ${htmlSection('Overdue', '#B42323', job.overdue)}
       ${htmlSection('Mentions', '#5B6157', job.mentions.map((m) => ({ ...m, title: m.extra ?? m.title })))}
       ${htmlSection('Ideas waiting more than 5 working days', '#5B6157', job.staleIdeas)}
       <p style="margin:18px 0 0;">${button(job.myTasksUrl, 'Open My tasks', true)}</p>`,
      `${esc(job.footerNote)} <a href="${esc(job.profileUrl)}" style="color:#0F6B46;">Change email settings</a>`,
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
