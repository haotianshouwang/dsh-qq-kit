#!/usr/bin/env node
// 卸载入口：等价于 node scripts/install.mjs --uninstall
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(__dirname, 'install.mjs'), '--uninstall', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 0);
