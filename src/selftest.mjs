// 自检：不依赖 DSH，直接验证「能不能找到 qq-bridge / 能不能连上 SnowLuma」。
// 用法：npm run selftest
import { makeClient, readBridgeConfig, assertAllowed } from './onebot.js';

function ok(label, extra = '') { console.log(`✅ ${label}${extra ? '  ' + extra : ''}`); }
function bad(label, error) { console.log(`❌ ${label}: ${error?.message ?? error}`); process.exitCode = 1; }

try {
  const { dir, cfg } = readBridgeConfig();
  ok('找到 qq-bridge', dir);
  const client = makeClient();
  ok('OneBot 地址', client.httpUrl);
  ok('OneBot token', client.token ? `已获取（${client.token.slice(0, 6)}…）` : '为空（未配置鉴权）');
  const me = await client.call('get_login_info');
  ok('登录账号', `${me?.nickname ?? '?'} (${me?.user_id ?? '?'})`);
  const groups = (cfg?.allow?.groups ?? []).map(String);
  const privates = (cfg?.allow?.private ?? []).map(String);
  ok('白名单', `群 ${groups.length} 个，私聊 ${privates.length} 个`);
  for (const g of groups.slice(0, 3)) {
    try { assertAllowed(cfg, `group:${g}`); ok(`白名单校验 group:${g}`); } catch (e) { bad(`白名单校验 group:${g}`, e); }
  }
  const st = await client.call('get_group_list');
  ok('群列表', `${Array.isArray(st) ? st.length : 0} 个群可见`);
  if (process.exitCode) {
    console.log('\n有检查项失败，请按提示修正。');
  } else {
    console.log('\n全部通过。重启 DSH 后即可让 QQ 侧 agent 使用这些工具。');
  }
} catch (error) {
  bad('自检失败', error);
}
