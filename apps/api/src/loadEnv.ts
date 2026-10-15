import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = resolve(fileURLToPath(new URL('../../../.env', import.meta.url)));
if (existsSync(envFile)) process.loadEnvFile(envFile);
