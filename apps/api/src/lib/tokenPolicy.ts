const READ_PATHS = [
  /^\/projects$/,
  /^\/projects\/[^/]+$/,
  /^\/projects\/[^/]+\/tasks$/,
  /^\/me$/,
  /^\/me\/tasks$/,
  /^\/search$/,
  /^\/people$/,
  /^\/tasks\/[^/]+$/,
];

const WRITE_PATHS: { method: string; pattern: RegExp }[] = [
  { method: 'POST', pattern: /^\/projects\/[^/]+\/tasks$/ },
  { method: 'PATCH', pattern: /^\/tasks\/[^/]+$/ },
  { method: 'POST', pattern: /^\/tasks\/[^/]+\/move$/ },
  { method: 'POST', pattern: /^\/tasks\/[^/]+\/comments$/ },
  { method: 'POST', pattern: /^\/tasks\/[^/]+\/reorder$/ },
  { method: 'POST', pattern: /^\/tasks\/[^/]+\/subtasks$/ },
  { method: 'PATCH', pattern: /^\/tasks\/[^/]+\/subtasks\/[^/]+$/ },
];

export function tokenAllows(
  method: string,
  url: string,
  scope: 'read' | 'read_write',
): { ok: true } | { ok: false; message: string } {
  const path = (url.split('?')[0] ?? url).replace(/\/$/, '') || '/';
  if (method === 'GET' || method === 'HEAD') {
    return READ_PATHS.some((pattern) => pattern.test(path))
      ? { ok: true }
      : { ok: false, message: 'This token cannot read that.' };
  }
  if (method === 'DELETE') {
    return { ok: false, message: 'Personal tokens and MCP cannot delete tasks.' };
  }
  if (scope === 'read') return { ok: false, message: 'This token is read only.' };
  const allowed = WRITE_PATHS.some((rule) => rule.method === method && rule.pattern.test(path));
  if (allowed) return { ok: true };
  if (method === 'DELETE') return { ok: false, message: 'Personal tokens and MCP cannot delete tasks.' };
  return { ok: false, message: 'Personal tokens and MCP cannot change settings or invite people.' };
}
