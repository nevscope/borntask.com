#!/usr/bin/env node
/**
 * BornTask design lint: static brand checks for TS/TSX/CSS. Zero dependencies.
 * Ported from kerd; saffron / Archivo / money rules removed.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'design-system/design-lint.config.json'), 'utf8'));
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const fileArgs = args.filter((a) => !a.startsWith('--'));

const norm = (p) => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/');
const isExempt = (f) => cfg.exempt.some((e) => f === e || f.startsWith(e));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (cfg.extensions.includes(path.extname(e.name))) out.push(norm(p));
  }
  return out;
}

const files = (fileArgs.length ? fileArgs.map(norm) : cfg.include.flatMap((d) => walk(path.join(ROOT, d))))
  .filter((f) => fs.existsSync(f) && cfg.extensions.includes(path.extname(f)) && !isExempt(f));

const LINE_RULES = [
  ['no-raw-color', 'warn', /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?![\w-])/, 'Raw hex colour. Use a token from src/theme/tokens.ts.'],
  ['no-raw-color', 'warn', /\b(?:rgba?|hsla?|oklch)\(\s*\d/, 'Raw colour function. Use a token.'],
  ['no-gradient', 'warn', /(?:linear|radial|conic)-gradient\(/, 'Prefer flat token fills.'],
  ['no-emoji', 'error', /\p{Extended_Pictographic}/u, 'Emoji are not used in BornTask UI.'],
  ['kerd-saffron', 'error', /#ffc629|#FFC629|--kd-accent/, 'Kerd saffron / --kd-* tokens. Use BornTask brand green #178A5C via tokens.'],
  ['banned-icon-lib', 'error', /from\s+['"](?:@ant-design\/icons|lucide-react|react-icons[^'"]*|@heroicons[^'"]*|@mui\/icons-material|@tabler\/icons-react|@phosphor-icons[^'"]*)['"]/, 'Third-party icon set. Use the SVG icons in components/Chips.tsx.'],
  ['font-family', 'warn', /font-?family\s*[:=]\s*['"`](?![^'"`]*(?:DM Sans|Sora|var\(--bt-))/i, 'Literal font family. Use font.ui (DM Sans) or font.display (Sora) from tokens.'],
  ['copy-banned', 'warn', /\b(?:Oops|Whoops|Something went wrong)\b/i, 'Error copy must say what happened and what to do next.'],
];

const findings = [];
const add = (file, line, rule, severity, message) => findings.push({ file, line, rule, severity, message });

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const fileDisabled = new Set([...src.matchAll(/design-lint-disable-file\s+([\w,-]+)/g)].flatMap((m) => m[1].split(',')));
  const isCss = file.endsWith('.css');

  lines.forEach((text, i) => {
    const prev = lines[i - 1] ?? '';
    const disabled = new Set([...prev.matchAll(/design-lint-disable-next-line\s+([\w,-]+)/g)].flatMap((m) => m[1].split(',')));
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    for (const [id, sev, re, msg] of LINE_RULES) {
      if (fileDisabled.has(id) || disabled.has(id)) continue;
      if (isCss && id.startsWith('copy')) continue;
      if (re.test(text)) add(file, i + 1, id, sev, msg);
    }
  });
}

const errors = findings.filter((f) => f.severity === 'error').length;
const warnings = findings.length - errors;
if (asJson) {
  process.stdout.write(JSON.stringify({ files: files.length, errors, warnings, findings }, null, 2));
} else {
  const byFile = findings.reduce((a, f) => ((a[f.file] ??= []).push(f), a), {});
  for (const [file, fs_] of Object.entries(byFile)) {
    console.log(`\n${file}`);
    for (const f of fs_) console.log(`  ${String(f.line).padStart(4)}  ${f.severity === 'error' ? 'error' : 'warn '}  ${f.rule.padEnd(20)} ${f.message}`);
  }
  console.log(`\nBornTask design lint: ${files.length} files · ${errors} error(s) · ${warnings} warning(s)`);
}
process.exit(errors ? 1 : 0);
