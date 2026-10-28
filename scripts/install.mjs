#!/usr/bin/env node
// 一键把这个插件装进 DSH 的 profile：
//   1) npm pack 出 tarball（这样装进去的是**真实拷贝**，不是软链，
//      后续替换 __SERVER_ENTRY__ 不会改到仓库本体）
//   2) 在 <profile>/package.json 里加依赖 + bundle 项
//   3) pnpm install
//   4) 把安装副本的 cordis.patch.yml 里的 __SERVER_ENTRY__ 换成真实 server.js 路径
//
// 用法：
//   node scripts/install.mjs                 # 装进默认 web profile
//   node scripts/install.mjs --profile tui
//   node scripts/install.mjs --uninstall
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const PKG_NAME = 'dsh-qq-kit';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const uninstall = args.includes('--uninstall');
const profileName = getArg('--profile', 'web');
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', profileName);
const pkgFile = path.join(profileDir, 'package.json');

function log(msg) { console.log(`[qq-kit] ${msg}`); }
function die(msg) { console.error(`[qq-kit] ${msg}`); process.exit(1); }

if (!fs.existsSync(pkgFile)) die(`找不到 profile：${pkgFile}（先用 dsh 启动过一次该 profile）`);

const profilePkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
profilePkg.dependencies ??= {};
profilePkg.dsh ??= {};
profilePkg.dsh.profile ??= {};
profilePkg.dsh.profile.bundles ??= [];

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
function runPnpm() {
  log('pnpm install …');
  // Windows 上 .cmd 不能直接 execFileSync（EINVAL），必须走 shell
  const r = spawnSync(pnpm, ['install'], {
    cwd: profileDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) die(`pnpm install 失败（exit ${r.status}）`);
}

if (uninstall) {
  delete profilePkg.dependencies[PKG_NAME];
  profilePkg.dsh.profile.bundles = profilePkg.dsh.profile.bundles.filter((b) => b !== PKG_NAME);
  fs.writeFileSync(pkgFile, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8');
  log('已从 profile 移除依赖与 bundle');
  runPnpm();
  log('卸载完成，重启 DSH 生效。');
  process.exit(0);
}

// ── 1) npm pack ────────────────────────────────────────────────────────────
log('npm pack …');
const pack = spawnSync('npm', ['pack', '--pack-destination', profileDir], {
  cwd: PKG_ROOT,
  encoding: 'utf8',
  shell: process.platform === 'win32'
});
if (pack.status !== 0) die(`npm pack 失败：${pack.stderr || pack.stdout}`);
const tgz = String(pack.stdout).trim().split(/\r?\n/).filter((l) => l.endsWith('.tgz')).pop();
if (!tgz) die(`npm pack 没有返回文件名：${pack.stdout}`);
log(`已打包：${tgz}`);

// ── 2) 写依赖与 bundle ─────────────────────────────────────────────────────
profilePkg.dependencies[PKG_NAME] = `file:./${tgz}`;
if (!profilePkg.dsh.profile.bundles.includes(PKG_NAME)) profilePkg.dsh.profile.bundles.push(PKG_NAME);
fs.writeFileSync(pkgFile, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8');
log(`已写入依赖：${PKG_NAME} = file:./${tgz}`);

// ── 3) 安装主包 ────────────────────────────────────────────────────────────
runPnpm();

const installed = path.join(profileDir, 'node_modules', PKG_NAME);
if (!fs.existsSync(installed)) die(`安装后找不到 ${installed}`);
const serverEntry = path.join(installed, 'src', 'host.js');
if (!fs.existsSync(serverEntry)) die(`找不到入口：${serverEntry}`);

// ── 4) 每个插件一个独立小包（DSH 设置页是「一个 bundle 一张卡」）─────────────
const shims = spawnSync(process.execPath, [path.join(PKG_ROOT, 'scripts', 'sync-shims.mjs'), '--profile', profileName], {
  stdio: 'inherit'
});
if (shims.status !== 0) die(`生成插件设置包失败（exit ${shims.status}）`);
log('链接插件设置包 …');
runPnpm();

// ── 5) 写 MCP entry ────────────────────────────────────────────────────────
const sync = spawnSync(process.execPath, [path.join(PKG_ROOT, 'scripts', 'sync-entries.mjs'), '--installed', installed], {
  stdio: 'inherit'
});
if (sync.status !== 0) die(`写入 MCP entry 失败（exit ${sync.status}）`);
log(`已写入 MCP 入口：${serverEntry}`);

// ── 5) 自动探测 qq-bridge 并写进设置（小白不用手填）────────────────────────
function findBridgeDir() {
  const explicit = getArg('--bridge', '');
  const cands = [
    explicit,
    process.env.QQ_BRIDGE_DIR,
    path.resolve(PKG_ROOT, '..', 'qq-bridge'),
    path.resolve(process.cwd(), 'qq-bridge'),
    path.resolve(process.cwd(), '..', 'qq-bridge'),
    path.join(os.homedir(), 'qq-bridge')
  ].filter(Boolean);
  for (const dir of cands) {
    try {
      if (fs.existsSync(path.join(dir, 'config.json'))) return path.resolve(dir);
    } catch { /* 忽略 */ }
  }
  return null;
}

function writeBridgeDirSetting(bridgeDir) {
  const settingsFile = path.join(profileDir, 'settings.yaml');
  let text = '';
  try { text = fs.readFileSync(settingsFile, 'utf8'); } catch { /* 还没有就新建 */ }
  if (/^qq-extras\s*:/m.test(text)) {
    log('settings.yaml 里已有 qq-extras 段，保留你原来的设置');
    return;
  }
  const escaped = bridgeDir.replace(/\\/g, '/');
  text += `${text.endsWith('\n') || !text ? '' : '\n'}qq-extras:\n  bridgeDir: ${JSON.stringify(escaped)}\n`;
  fs.writeFileSync(settingsFile, text, 'utf8');
  log(`已写入设置 bridgeDir = ${escaped}`);
}

const bridgeDir = findBridgeDir();
if (bridgeDir) writeBridgeDirSetting(bridgeDir);
else log('没自动找到 qq-bridge：请安装后在 DSH 设置页填 bridgeDir，或设置环境变量 QQ_BRIDGE_DIR');

// 清理 tarball（保留也无害，但别堆在 profile 里）
try { fs.unlinkSync(path.join(profileDir, tgz)); } catch { /* 忽略 */ }

// ── 6) 把工具前缀加进 qq-bridge 的执行期白名单（不改就调不动）────────────
spawnSync(process.execPath, [path.join(PKG_ROOT, 'scripts', 'patch-bridge-allowlist.mjs')], { stdio: 'inherit' });
log('安装完成。重启 DSH 后：设置页会出现「QQ 增强套件」，QQ 侧 agent 会多出 qq_send_image / qq_qzone_post / qq_diary_write 等工具。');
