import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = resolve(root, 'apps/web/public/borntask-mark.svg');
const out = resolve(root, 'apps/web/public/borntask-logo-120.png');

mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 120, height: 120 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(svg).href);
await page.setViewportSize({ width: 120, height: 120 });
await page.screenshot({ path: out, type: 'png', clip: { x: 0, y: 0, width: 120, height: 120 } });
await browser.close();
console.log(out);
