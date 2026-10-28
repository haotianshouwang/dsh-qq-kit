#!/usr/bin/env node
// 生成 dsh-qq-kit 自己在 profile 里的 patch：
//   ① qq-extras：全局设置（bridgeDir / TTS 引擎音色 / 代理）
//   ② mcp-qq-extras：给 QQ 侧 agent 用的 MCP server
//
// 每个插件的设置卡片**不在这里** —— 它们由 scripts/sync-shims.mjs 生成独立小包，
// 因为 DSH 设置页是「一个 bundle 一张卡」，多个 entry 塞一个包只会显示第一张。
//
// 用法：node scripts/sync-entries.mjs [--installed <安装副本目录>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const PKG_NAME = 'dsh-qq-kit';

function log(m) { console.log(`[qq-kit] ${m}`); }

function findInstalled() {
  const explicit = getArg('--installed', '');
  if (explicit) return explicit;
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const profilesDir = path.join(dshHome, 'profiles');
  try {
    for (const name of fs.readdirSync(profilesDir)) {
      const p = path.join(profilesDir, name, 'node_modules', PKG_NAME);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* 没有 */ }
  return null;
}

const installed = findInstalled();
if (!installed) {
  log('没找到已安装副本（先运行 install.mjs）。跳过。');
  process.exit(0);
}

const hostEntry = path.join(installed, 'src', 'host.js').replace(/\\/g, '/');

const patch = [
  '# 由 dsh-qq-kit 的 scripts/sync-entries.mjs 自动生成，请勿手改。',
  '#',
  '# ① qq-extras：全局设置',
  '# ② mcp-qq-extras：QQ 侧 agent 的工具面（独立 MCP server）',
  '# 每个插件自己的设置卡片是独立的小包，见 scripts/sync-shims.mjs。',
  '',
  '- insert:',
  '    - id: qq-extras',
  '      name: dsh-qq-kit',
  '      config: {}',
  '- insert:',
  '    - id: mcp-qq-extras',
  "      name: '@deepseek-ai/dsh-mcp-client'",
  '      config:',
  '        serverName: qq-extras',
  '        transport: stdio',
  "        command: 'node'",
  '        args:',
  `          - ${JSON.stringify(hostEntry)}`,
  '        toolCallTimeoutMs: 180000',
  ''
].join('\n');

fs.writeFileSync(path.join(installed, 'cordis.patch.yml'), patch, 'utf8');

// 旧版本生成的 plugin-config 目录清掉，避免残留
const legacy = path.join(installed, 'plugin-config');
if (fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });

log(`已写入 MCP 入口：${hostEntry}`);
