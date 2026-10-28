#!/usr/bin/env node
// 命令行入口：把 mcp__qq-extras__ 加进 qq-bridge 的执行期白名单，或回滚、或只看状态。
//
// 为什么需要：qq-bridge 的 preset 里挂着守卫插件 qq-tool-restrict，它的
// ctx.tools.guard() 只放行 SAFE_EXACT + SAFE_PREFIXES 里的工具名。
// 我们的工具是 mcp__qq-extras__*，不在名单里 → QQ 侧 agent 调用一律被拒。
//
// 宿主每次启动也会自动跑同一逻辑（src/allowlist.js），本脚本用于手动检查/修复。
//
// 用法：
//   node scripts/patch-bridge-allowlist.mjs [--bridge <目录>] [--check] [--revert]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAllowlist, revertAllowlist, guardFileOf, PREFIX } from '../src/allowlist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const revert = args.includes('--revert');
const checkOnly = args.includes('--check');

function log(m) { console.log(`[qq-kit] ${m}`); }

function readSettingsBridge() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const profiles = path.join(dshHome, 'profiles');
  try {
    for (const name of fs.readdirSync(profiles)) {
      const file = path.join(profiles, name, 'settings.yaml');
      const text = fs.readFileSync(file, 'utf8');
      const m = /^\s+bridgeDir:\s*"?([^"\r\n]+)"?/m.exec(text);
      if (m && fs.existsSync(path.join(m[1].trim(), 'config.json'))) return m[1].trim();
    }
  } catch { /* 忽略 */ }
  return '';
}

function findBridgeDir() {
  const cands = [
    getArg('--bridge', ''),
    process.env.QQ_BRIDGE_DIR,
    readSettingsBridge(),
    path.resolve(PKG_ROOT, '..', 'qq-bridge'),
    path.join(os.homedir(), 'qq-bridge')
  ].filter(Boolean);
  for (const dir of cands) {
    try {
      if (fs.existsSync(path.join(dir, 'config.json'))) return path.resolve(dir);
    } catch { /* 忽略 */ }
  }
  return null;
}

const bridgeDir = findBridgeDir();
if (!bridgeDir) {
  log('没找到 qq-bridge（可加 --bridge <目录> 指定）');
  process.exit(0);
}

if (checkOnly) {
  const guard = guardFileOf(bridgeDir);
  const text = fs.existsSync(guard) ? fs.readFileSync(guard, 'utf8') : '';
  log(`守卫文件：${guard}`);
  log(text.includes(`'${PREFIX}'`) ? '白名单：已包含 ✅' : '白名单：未包含 ❌（直接运行本脚本即可修复）');
  process.exit(0);
}

if (revert) {
  const r = revertAllowlist(bridgeDir);
  log(r.status === 'reverted' ? '已移除白名单（回滚完成）' : `无需回滚（${r.status}）`);
  process.exit(0);
}

const r = ensureAllowlist(bridgeDir);
if (r.status === 'added') {
  log(`已把 ${PREFIX} 加进白名单：${r.file}`);
  log(`备份：${r.file}.dsh-qq-kit.orig`);
  log('需要重启 DSH 让 QQ 会话重新加载 preset。');
} else if (r.status === 'present') {
  log('白名单已包含，跳过');
} else {
  log(`未修改：${r.status}${r.error ? `（${r.error}）` : ''}`);
}
