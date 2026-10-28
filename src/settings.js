// 读取 DSH 设置页保存的值。
//
// 两个来源：
//   `qq-extras:` 段        → 全局设置（bridgeDir / ttsEngine / ttsVoice / proxy）
//   `qqplug-<id>:` 段      → 每个插件自己的设置卡片（v0.3 起）
//
// 为什么要自己写一个极小的 YAML 子集解析：MCP server 想保持"零额外依赖"，
// 而这里只需要读我们自己的几个标量字段（字符串/布尔/数字），不需要完整 YAML。
// 解析失败的策略是**全部回退默认值**——设置文件写坏了不该让工具直接消失。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULTS = Object.freeze({
  bridgeDir: '',
  ttsEngine: 'edge',
  ttsVoice: 'zh-CN-XiaoyiNeural',
  proxy: 'http://127.0.0.1:7890'
});

const NAMESPACE = 'qq-extras';

function parseScalar(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

/** 从一个 YAML 文本里抽出指定顶层段的键值对；没有该段返回 null。 */
export function parseNamespaceSection(text, ns = NAMESPACE) {
  const lines = String(text ?? '').split(/\r?\n/);
  let inside = false;
  const out = {};
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = /^([A-Za-z0-9_.-]+)\s*:\s*$/.exec(line);
    if (top) {
      inside = top[1] === ns;
      continue;
    }
    if (!inside) continue;
    const kv = /^\s+([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = parseScalar(kv[2]);
  }
  return Object.keys(out).length ? out : null;
}

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

/** 在 ~/.dsh/profiles/<name>/settings.yaml 里找最新的一份含指定段的设置。 */
function scanProfilesForSection(ns) {
  const found = [];
  const profilesDir = path.join(dshHome(), 'profiles');
  try {
    for (const name of fs.readdirSync(profilesDir)) {
      const file = path.join(profilesDir, name, 'settings.yaml');
      try {
        const stat = fs.statSync(file);
        const section = parseNamespaceSection(fs.readFileSync(file, 'utf8'), ns);
        if (section) found.push({ file, mtime: stat.mtimeMs, section });
      } catch { /* 没有就跳过 */ }
    }
  } catch { /* 没有 profiles 目录 */ }
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0] ?? null;
}

/** 全局设置（`qq-extras:` 段）。 */
export function readSettings() {
  const hit = scanProfilesForSection(NAMESPACE);
  return { ...DEFAULTS, ...(hit?.section ?? {}), _source: hit?.file ?? null };
}

/** 单个插件的设置（`qqplug-<id>:` 段），没有就返回空对象。 */
export function readPluginSettings(pluginId) {
  const hit = scanProfilesForSection(`qqplug-${pluginId}`);
  return hit?.section ?? {};
}

/** 环境变量优先级最高，方便临时覆盖（也方便别人在别的宿主里跑）。 */
export function effectiveSettings() {
  const s = readSettings();
  if (process.env.QQ_BRIDGE_DIR) s.bridgeDir = process.env.QQ_BRIDGE_DIR;
  if (process.env.QQ_EXTRAS_TTS_ENGINE) s.ttsEngine = process.env.QQ_EXTRAS_TTS_ENGINE;
  if (process.env.QQ_EXTRAS_TTS_VOICE) s.ttsVoice = process.env.QQ_EXTRAS_TTS_VOICE;
  if (process.env.QQ_EXTRAS_PROXY != null) s.proxy = process.env.QQ_EXTRAS_PROXY;
  return s;
}
