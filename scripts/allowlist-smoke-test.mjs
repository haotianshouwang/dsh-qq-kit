#!/usr/bin/env node
// 白名单同步模块的离线冒烟：造一个假的 qq-bridge 目录，验证
//   added → present（幂等）→ reverted → 无锚点时不动
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureAllowlist, revertAllowlist, guardFileOf, PREFIX } from '../src/allowlist.js';

function assert(cond, msg) {
  if (!cond) { console.error(`❌ ${msg}`); process.exit(1); }
  console.log(`✅ ${msg}`);
}

const sample = `const SAFE_PREFIXES = [
  'mcp__snowluma__',
  'mcp__snowluma-host__',
  'mcp__web-search-safe__',
]
`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qqkit-allowlist-'));
const dir = path.join(root, 'plugins', 'qq-agent-presets');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'qq-tool-restrict.mjs'), sample, 'utf8');
fs.writeFileSync(path.join(root, 'config.json'), '{}', 'utf8');

const guard = guardFileOf(root);
let r = ensureAllowlist(root);
assert(r.status === 'added', `首次同步 added（实际 ${r.status}）`);
assert(fs.readFileSync(guard, 'utf8').includes(`'${PREFIX}'`), '文件里出现了前缀');
assert(fs.existsSync(`${guard}.dsh-qq-kit.orig`), '生成了备份');

r = ensureAllowlist(root);
assert(r.status === 'present', `二次同步幂等（实际 ${r.status}）`);

r = revertAllowlist(root);
assert(r.status === 'reverted', `回滚成功（实际 ${r.status}）`);
assert(!fs.readFileSync(guard, 'utf8').includes(`'${PREFIX}'`), '回滚后前缀消失');

// 没有锚点时不乱改
fs.writeFileSync(guard, 'const OTHER = []\n', 'utf8');
r = ensureAllowlist(root);
assert(r.status === 'missing-anchor', `无锚点时不修改（实际 ${r.status}）`);

// 守卫文件不存在时也不报错
fs.rmSync(path.join(dir, 'qq-tool-restrict.mjs'));
r = ensureAllowlist(root);
assert(r.status === 'missing-guard', `守卫缺失时安全跳过（实际 ${r.status}）`);

fs.rmSync(root, { recursive: true, force: true });
console.log('\n✅ 白名单模块冒烟通过');
