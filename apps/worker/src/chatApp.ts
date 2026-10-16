const apiUrl = (process.env.API_INTERNAL_URL ?? process.env.API_PUBLIC_URL ?? 'http://127.0.0.1:3010').replace(/\/$/, '');
const secret = process.env.SESSION_SECRET ?? 'borntask-local-dev-session-secret-change-me';

export async function runChatAppJob(data: { event: Record<string, unknown> }) {
  const url = `${apiUrl.replace(/\/api$/, '')}/internal/chat-app-job`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-borntask-job': secret,
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat app job failed (${res.status}): ${text.slice(0, 240)}`);
  }
  return res.json();
}
