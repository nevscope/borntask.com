import { config } from '../env.js';
import { loginLinkUrl, renderLoginCodeMail } from './emailLogin.js';

const FROM = { email: 'notify@borntask.com', name: 'BornTask' };

export async function sendLoginCodeEmail(to: string, code: string, linkToken: string): Promise<void> {
  const linkUrl = loginLinkUrl(linkToken);
  const rendered = renderLoginCodeMail(code, linkUrl);
  const key = process.env.SENDGRID_API_KEY?.trim();
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('mail_not_configured');
    }
    console.log(`[BornTask] DEV email sign-in for ${to}: code ${code}, link ${linkUrl}`);
    return;
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: FROM,
      subject: rendered.subject,
      content: [
        { type: 'text/plain', value: rendered.text },
        { type: 'text/html', value: rendered.html },
      ],
      tracking_settings: {
        click_tracking: { enable: false },
        open_tracking: { enable: false },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status} ${detail.slice(0, 240)}`);
  }
}
