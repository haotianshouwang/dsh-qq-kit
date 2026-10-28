// 极简 OneBot v11 客户端：只做 HTTP 动作调用 + 读取 qq-bridge 的配置。
//
// 设计目标：**不依赖也**不修改 qq-bridge 的任何源码，
// 只把它当作「配置和状态的事实来源」：
//   - config.json        → snowluma.httpUrl / accessToken / allow.groups / allow.private
//   - state/mode.json    → 当前仿真模式（只用于提示，不做强制）
// 这样用户即使把 qq-bridge 升到新版本，本插件也不受影响。
import fs from 'node:fs';
import path from 'node:path';
import { effectiveSettings } from './settings.js';

export function resolveBridgeDir() {
  const candidates = [];
  // 优先级：DSH 设置页填的 > 环境变量 > 相对位置猜测
  try {
    const fromSettings = String(effectiveSettings().bridgeDir || '').trim();
    if (fromSettings) candidates.push(fromSettings);
  } catch { /* 设置读不到就用后面的候选 */ }
  if (process.env.QQ_BRIDGE_DIR) candidates.push(process.env.QQ_BRIDGE_DIR);
  // 常见布局：<workspace>/qq-bridge 与本插件同级
  candidates.push(path.resolve(process.cwd(), 'qq-bridge'));
  candidates.push(path.resolve(process.cwd(), '..', 'qq-bridge'));
  candidates.push(path.resolve(process.cwd(), '..', '..', 'qq-bridge'));
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(path.join(dir, 'config.json'))) return dir;
    } catch { /* 忽略 */ }
  }
  return null;
}

export function readBridgeConfig() {
  const dir = resolveBridgeDir();
  if (!dir) throw new Error('找不到 qq-bridge 目录：请设置环境变量 QQ_BRIDGE_DIR 指向它（含 config.json）');
  const file = path.join(dir, 'config.json');
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { dir, file, cfg: JSON.parse(text) };
}

// SnowLuma 的 OneBot 配置按账号分文件：<homeDir>/config/onebot_<uin>.json
export function discoverOneBot(cfg) {
  const httpUrl = String(cfg?.snowluma?.httpUrl || 'http://127.0.0.1:3000').replace(/\/+$/, '');
  let token = String(cfg?.snowluma?.accessToken || '');
  const home = String(cfg?.snowluma?.homeDir || '');
  if (home) {
    const dir = path.join(home, 'config');
    try {
      for (const name of fs.readdirSync(dir)) {
        const m = /^onebot_(\d+)\.json$/i.exec(name);
        if (!m) continue;
        const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        const http = Array.isArray(j?.networks?.httpServers) ? j.networks.httpServers[0] : null;
        if (http?.accessToken) { token = String(http.accessToken); break; }
      }
    } catch { /* 读不到就用 config 里的 */ }
  }
  return { httpUrl, token };
}

export function makeClient() {
  const { dir, cfg } = readBridgeConfig();
  const { httpUrl, token } = discoverOneBot(cfg);
  return {
    dir,
    cfg,
    httpUrl,
    token,
    async call(action, params = {}, timeoutMs = 60000) {
      const res = await fetch(`${httpUrl}/${action}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(timeoutMs)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.status !== 'ok' || body.retcode !== 0) {
        const hint = res.status === 401
          ? '（401：OneBot accessToken 不正确，检查 SnowLuma 的账号配置）'
          : res.status === 426
            ? '（426：httpUrl 填成了 WebSocket 端口）'
            : '';
        throw new Error(`${action} 失败: ${body.wording || body.retcode || res.status}${hint}`);
      }
      return body.data;
    }
  };
}

/** 白名单检查：只允许对 allow 列表里的群/私聊发消息。 */
export function assertAllowed(cfg, key) {
  const m = /^(group|private):(\d+)$/.exec(String(key ?? '').trim());
  if (!m) throw new Error('key 格式应为 group:群号 或 private:QQ号');
  const kind = m[1];
  const id = String(m[2]);
  const allow = cfg?.allow ?? {};
  const list = (kind === 'group' ? allow.groups : allow.private) ?? [];
  const deny = (kind === 'group' ? cfg?.deny?.groups : cfg?.deny?.private) ?? [];
  if (deny.map(String).includes(id)) throw new Error(`${key} 在黑名单里`);
  if (!list.map(String).includes(id)) {
    throw new Error(`${key} 不在白名单内（config.json 的 allow.${kind === 'group' ? 'groups' : 'private'}）`);
  }
  return { kind, id: Number(id) };
}
