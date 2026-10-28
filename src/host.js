// dsh-qq-kit 插件宿主（MCP server）。
//
// 和 v0.1 的区别：v0.1 把 10 个工具写死在一个文件里；现在改成**插件宿主**：
//   - 内置插件在 <包>/plugins/<id>/
//   - 用户插件放 ~/.dsh/qq-kit/plugins/<id>/
//   - 每个插件是一个文件夹：plugin.json（元信息 + 默认设置）+ index.js（register(ctx)）
//   - 启停和设置存在 ~/.dsh/qq-kit/state.json，也可以被 CLI（scripts/qqkit.mjs）管理
//
// 加/删插件后需要重启 DSH —— MCP 的工具列表只在启动时拉取一次，这点和 AstrBot 重载同理。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import { createPluginContext } from './plugin-api.js';
import { effectiveSettings, readPluginSettings } from './settings.js';
import { ensureAllowlist, PREFIX } from './allowlist.js';
import { resolveBridgeDir } from './onebot.js';

// 启动自愈：qq-bridge 升级会覆盖守卫文件里的白名单，这里每次启动补一次。
// 失败不阻塞启动（桥接没装、文件不同版本都只是跳过）。
try {
  const result = ensureAllowlist(resolveBridgeDir());
  if (result.status === 'added') {
    process.stderr.write(`[qq-kit] 已把 ${PREFIX} 加入 qq-bridge 工具白名单（${result.file}）\n`);
  } else if (result.status === 'missing-anchor' || result.status === 'error') {
    process.stderr.write(`[qq-kit] 工具白名单同步跳过：${result.status}${result.error ? `（${result.error}）` : ''}\n`);
  }
} catch { /* 桥接没装就算了 */ }

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILTIN_DIR = path.join(PKG_ROOT, 'plugins');
const DSH_KIT_HOME = process.env.QQ_KIT_HOME || path.join(os.homedir(), '.dsh', 'qq-kit');
const USER_DIR = path.join(DSH_KIT_HOME, 'plugins');
const STATE_FILE = path.join(DSH_KIT_HOME, 'state.json');

function readJson(file, fallback = null) {
  try {
    let t = fs.readFileSync(file, 'utf8');
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    return JSON.parse(t);
  } catch { return fallback; }
}

function loadState() {
  return readJson(STATE_FILE, { plugins: {} }) ?? { plugins: {} };
}

/** 扫描内置 + 用户插件目录，返回 [{id, dir, manifest, indexPath, builtin, enabled, settings}] */
export function discoverPlugins() {
  const state = loadState();
  // 设置页里的「启用」开关写进 qq-extras.disabledPlugins，这里合并进来
  let disabledFromSettings = [];
  try {
    const raw = effectiveSettings().disabledPlugins;
    disabledFromSettings = Array.isArray(raw) ? raw.map(String) : JSON.parse(String(raw || '[]')).map(String);
  } catch { disabledFromSettings = []; }
  const disabledSet = new Set(disabledFromSettings);
  const out = [];
  const scan = (dir, builtin) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const pdir = path.join(dir, e.name);
      const manifest = readJson(path.join(pdir, 'plugin.json'));
      if (!manifest || !manifest.id) continue;
      const indexPath = path.join(pdir, 'index.js');
      if (!fs.existsSync(indexPath)) continue;
      const st = state.plugins?.[manifest.id] ?? {};
      const defaults = {};
      for (const f of manifest.settings ?? []) if (f && f.key) defaults[f.key] = f.default;
      const localConfig = readJson(path.join(pdir, 'config.json'), {}) ?? {};
      out.push({
        id: manifest.id,
        dir: pdir,
        manifest,
        indexPath,
        builtin,
        enabled: (st.enabled ?? manifest.enabled ?? true) && !disabledSet.has(manifest.id),
        // 优先级：manifest 默认 < state.json < 插件目录 config.json < DSH 设置页（qqplug-<id> 段）
        settings: { ...defaults, ...(st.settings ?? {}), ...localConfig, ...readPluginSettings(manifest.id) }
      });
    }
  };
  scan(BUILTIN_DIR, true);
  scan(USER_DIR, false);
  return out;
}

const server = new McpServer({ name: 'qq-extras', version: '0.4.2' });
const globalSettings = effectiveSettings();
const plugins = discoverPlugins();
const loaded = [];
const failed = [];

for (const p of plugins) {
  if (!p.enabled) continue;
  try {
    const mod = await import(pathToFileURL(p.indexPath).href + `?t=${Date.now()}`);
    if (typeof mod.register !== 'function') throw new Error('缺少 register(ctx) 导出');
    const ctx = createPluginContext({ server, plugin: p, settings: globalSettings, pluginSettings: p.settings });
    await mod.register(ctx);
    loaded.push(p.id);
  } catch (error) {
    failed.push({ id: p.id, error: String(error?.message ?? error) });
  }
}

// 让「装了什么、哪些失败了」可观测：往 stderr 打一行，DSH 启动日志里能看到。
process.stderr.write(`[qq-kit] plugins loaded: ${loaded.join(', ') || 'none'}` +
  (failed.length ? `; failed: ${failed.map((f) => `${f.id}(${f.error})`).join(', ')}` : '') + `\n`);

await server.connect(new StdioServerTransport());
