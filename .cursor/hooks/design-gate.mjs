#!/usr/bin/env node
/**
 * Cursor stop hook: lint UI files the agent changed against BornTask brand rules.
 */
import { execSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => {
  try {
    const changed = execSync('git status --porcelain --untracked-files=all -- apps/web/src', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 })
      .split('\n')
      .map((l) => l.slice(3).trim())
      .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1] : p))
      .filter((p) => /\.(tsx?|css|mdx?)$/.test(p) && /^apps\/web\/src\//.test(p));
    if (changed.length === 0) return done({});
    let out = '';
    try {
      out = execSync(`node scripts/design/design-lint.mjs --json ${changed.map((f) => JSON.stringify(f)).join(' ')}`, { encoding: 'utf8' });
    } catch (e) {
      out = e.stdout?.toString() ?? '';
    }
    const report = JSON.parse(out || '{"errors":0,"findings":[]}');
    if (!report.errors) return done({});
    const lines = report.findings
      .filter((f) => f.severity === 'error')
      .slice(0, 25)
      .map((f) => `- ${f.file}:${f.line} [${f.rule}] ${f.message}`);
    done({
      followup_message:
        `BornTask design gate: ${report.errors} brand error(s) in the files you changed. Use tokens in apps/web/src/theme/tokens.ts, then run \`npm run design:lint\` again.\n` +
        lines.join('\n'),
    });
  } catch {
    done({});
  }
});
function done(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}
