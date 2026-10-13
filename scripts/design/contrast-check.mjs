#!/usr/bin/env node
import fs from 'node:fs';
const tokens = JSON.parse(fs.readFileSync('design-system/tokens.json', 'utf8'));
const cfg = JSON.parse(fs.readFileSync('design-system/design-lint.config.json', 'utf8'));
const theme = tokens.color.themes[0].id;
const map = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, typeof t.value === 'string' ? t.value : t.value[theme]]));
const resolve = (n, d = 0) => { const v = map[n]; if (!v) throw new Error(`Unknown token ${n}`); const m = /^\{(.+)\}$/.exec(v); return m && d < 16 ? resolve(m[1], d + 1) : v; };
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
let fail = 0;
for (const [fg, bg, min] of cfg.contrastPairs) {
  const r = ratio(resolve(fg), resolve(bg));
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${fg.padEnd(14)} on ${bg.padEnd(14)} ${r.toFixed(2).padStart(5)}:1  (needs ${min}:1)`);
}
console.log(fail ? `\n${fail} pair(s) below WCAG AA.` : '\nAll token pairs meet WCAG AA.');
process.exit(fail ? 1 : 0);
