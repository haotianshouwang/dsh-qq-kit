#!/usr/bin/env node
// qqkit —— 插件管理 CLI。
//
//   node scripts/qqkit.mjs list                 列出已装插件
//   node scripts/qqkit.mjs add <目录或zip>       安装第三方插件
//   node scripts/qqkit.mjs remove <id>          卸载
//   node scripts/qqkit.mjs enable|disable <id>  启用/停用
//   node scripts/qqkit.mjs config <id>          查看插件设置
//   node scripts/qqkit.mjs config <id> k=v      修改插件设置
//   node scripts/qqkit.mjs new <id>             生成插件骨架（开发用）
//   node scripts/qqkit.mjs doctor               体检
//
// 所有改动都在 ~/.dsh/qq-kit/ 下，不碰 DSH 本体；改完重启 DSH 生效。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const BUILTIN_DIR = path.join(PKG_ROOT, 'plugins');
const KIT_HOME = process.env.QQ_KIT_HOME || path.join(os.homedir(), '.dsh', 'qq-kit');
const USER_DIR = path.join(KIT_HOME, 'plugins');
const STATE_FILE = path.join(KIT_HOME, 'state.json');

function log(m) { console.log(m); }
function readJson(file, fb = null) {
  try { let t = fs.readFileSync(file, 'utf8'); if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); return JSON.parse(t); } catch { return fb; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function state() { return readJson(STATE_FILE, { plugins: {} }) ?? { plugins: {} }; }
function saveState(s) { writeJson(STATE_FILE, s); }
function ensureDirs() { fs.mkdirSync(USER_DIR, { recursive: true }); }

/** 装/删/启停之后同步「插件设置包」与 MCP entry（只在已安装副本存在时做）。 */
function syncEntries() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const profilesDir = path.join(dshHome, 'profiles');
  let installed = null;
  let profileName = 'web';
  try {
    for (const n of fs.readdirSync(profilesDir)) {
      const p = path.join(profilesDir, n, 'node_modules', 'dsh-qq-kit');
      if (fs.existsSync(p)) { installed = p; profileName = n; break; }
    }
  } catch { /* 没装就跳过 */ }
  if (!installed) return;
  const profileDir = path.join(profilesDir, profileName);
  const run = (cmd, params, opts = {}) => execFileSync(cmd, params, { stdio: 'inherit', ...opts });
  try {
    // 1) 每个插件一个独立小包（DSH 设置页是「一个 bundle 一张卡」）
    run(process.execPath, [path.join(PKG_ROOT, 'scripts', 'sync-shims.mjs'), '--profile', profileName]);
    // 2) 让 pnpm 把新包链接进 node_modules
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install'], {
      cwd: profileDir,
      shell: process.platform === 'win32'
    });
    // 3) 更新 MCP entry
    run(process.execPath, [path.join(PKG_ROOT, 'scripts', 'sync-entries.mjs'), '--installed', installed]);
  } catch (error) {
    console.log(`[qq-kit] 设置同步失败：${error.message}（可手动跑 scripts/sync-shims.mjs 再 pnpm install）`);
  }
}

function scan() {
  const s = state();
  const list = [];
  for (const [base, builtin] of [[BUILTIN_DIR, true], [USER_DIR, false]]) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const manifest = readJson(path.join(dir, 'plugin.json'));
      if (!manifest?.id) continue;
      const st = s.plugins?.[manifest.id] ?? {};
      list.push({ ...manifest, dir, builtin, enabled: st.enabled ?? manifest.enabled ?? true, tools: manifest.tools ?? [] });
    }
  }
  return list.sort((a, b) => a.id.localeCompare(b.id));
}

const [cmd, ...rest] = process.argv.slice(2);

function listCmd() {
  const all = scan();
  if (!all.length) return log('还没有插件。');
  const pad = (s, n) => String(s).padEnd(n, ' ');
  log(pad('ID', 20) + pad('状态', 8) + pad('类型', 8) + '名称');
  for (const p of all) log(pad(p.id, 20) + pad(p.enabled ? '启用' : '停用', 8) + pad(p.builtin ? '内置' : '第三方', 8) + (p.name ?? ''));
  log(`\n共 ${all.length} 个；目录：${USER_DIR}`);
}

function addCmd(src) {
  if (!src) return log('用法：qqkit add <目录>');
  const from = path.resolve(src);
  if (!fs.existsSync(path.join(from, 'plugin.json'))) return log(`不是插件目录（缺 plugin.json）：${from}`);
  const manifest = readJson(path.join(from, 'plugin.json'));
  if (!manifest?.id) return log('plugin.json 里没有 id');
  ensureDirs();
  const target = path.join(USER_DIR, manifest.id);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(from, target, { recursive: true });
  log(`已安装 ${manifest.id} → ${target}`);
  syncEntries();
  log('重启 DSH 后生效。');
}

function removeCmd(id) {
  if (!id) return log('用法：qqkit remove <id>');
  const target = path.join(USER_DIR, id);
  const builtin = path.join(BUILTIN_DIR, id);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    log(`已删除第三方插件 ${id}`);
    syncEntries();
    return;
  }
  if (fs.existsSync(builtin)) { log(`${id} 是内置插件，不能删除；可以 qqkit disable ${id}`); return; }
  log(`找不到插件 ${id}`);
}

function toggleCmd(id, enabled) {
  if (!id) return log(`用法：qqkit ${enabled ? 'enable' : 'disable'} <id>`);
  if (!scan().some((p) => p.id === id)) return log(`找不到插件 ${id}`);
  const s = state();
  s.plugins[id] = { ...(s.plugins[id] ?? {}), enabled };
  saveState(s);
  syncEntries();
  log(`已${enabled ? '启用' : '停用'} ${id}，重启 DSH 生效。`);
}

function configCmd(id, pairs) {
  if (!id) return log('用法：qqkit config <id> [k=v ...]');
  const p = scan().find((x) => x.id === id);
  if (!p) return log(`找不到插件 ${id}`);
  const cfgFile = path.join(p.dir, 'config.json');
  const manifest = readJson(path.join(p.dir, 'plugin.json'), {}) ?? {};
  const defaults = {};
  for (const f of manifest.settings ?? []) defaults[f.key] = f.default;
  const current = { ...defaults, ...(readJson(cfgFile, {}) ?? {}) };
  if (!pairs.length) {
    log(JSON.stringify(current, null, 2));
    log(`\n设置文件：${cfgFile}`);
    return;
  }
  for (const pair of pairs) {
    const i = pair.indexOf('=');
    if (i < 0) { log(`跳过（不是 k=v）：${pair}`); continue; }
    const k = pair.slice(0, i).trim();
    const raw = pair.slice(i + 1);
    let v = raw;
    if (raw === 'true') v = true; else if (raw === 'false') v = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) v = Number(raw);
    current[k] = v;
  }
  writeJson(cfgFile, current);
  log(`已写入 ${id} 的设置，重启 DSH 生效。`);
}

function newCmd(id) {
  if (!id) return log('用法：qqkit new <id>');
  ensureDirs();
  const dir = path.join(USER_DIR, id);
  if (fs.existsSync(dir)) return log(`已存在：${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'plugin.json'), {
    id,
    name: id,
    version: '0.1.0',
    description: '我的第一个插件',
    author: '',
    enabled: true,
    settings: [{ key: 'greeting', label: '问候语', type: 'string', default: '你好' }]
  });
  fs.writeFileSync(path.join(dir, 'index.js'), `// 插件入口：导出一个 register(ctx)，在里面注册 MCP 工具。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    '${id.replace(/[^a-z0-9_]/gi, '_')}_ping',
    '示例工具：回一句问候',
    { key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号') },
    async ({ key }) => {
      try {
        ctx.assertAllowed(key);
        return ctx.text({ ok: true, message: ctx.pluginSettings.greeting });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
`, 'utf8');
  log(`已生成骨架：${dir}`);
  syncEntries();
  log('改完 index.js 后：qqkit disable/enable 或直接重启 DSH。');
}

function doctorCmd() {
  log(`插件目录：${USER_DIR}`);
  const all = scan();
  log(`发现插件 ${all.length} 个：`);
  for (const p of all) {
    const ok = fs.existsSync(path.join(p.dir, 'index.js'));
    log(`  ${ok ? '✅' : '❌'} ${p.id} ${p.enabled ? '(启用)' : '(停用)'}`);
  }
  const bridge = process.env.QQ_BRIDGE_DIR || '';
  log(`QQ_BRIDGE_DIR：${bridge || '未设置（宿主会自动探测）'}`);
  try {
    execFileSync(process.execPath, [path.join(PKG_ROOT, 'src', 'selftest.mjs')], { stdio: 'inherit' });
  } catch { log('自检未通过'); }
}

switch (cmd) {
  case 'list': listCmd(); break;
  case 'add': addCmd(rest[0]); break;
  case 'remove': removeCmd(rest[0]); break;
  case 'enable': toggleCmd(rest[0], true); break;
  case 'disable': toggleCmd(rest[0], false); break;
  case 'config': configCmd(rest[0], rest.slice(1)); break;
  case 'new': newCmd(rest[0]); break;
  case 'doctor': doctorCmd(); break;
  default:
    log('qqkit —— dsh-qq-kit 插件管理');
    log('  list | add <dir> | remove <id> | enable|disable <id> | config <id> [k=v] | new <id> | doctor');
}
