import { validation } from '../errors.js';

const DESKTOP_SCHEMES = new Set(['cursor:', 'vscode:', 'vscode-insiders:']);

export function safeRedirect(uri: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw validation('The return address is not a valid URL.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (parsed.protocol === 'https:') return parsed;
  if (parsed.protocol === 'http:' && loopback) return parsed;
  if (DESKTOP_SCHEMES.has(parsed.protocol)) return parsed;
  throw validation('The return address must be https, localhost, or a desktop assistant callback.');
}
