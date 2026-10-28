// 让 qq-bridge 的执行期工具白名单放行本插件的 MCP 命名空间。
//
// 背景：qq-bridge 的 preset 里挂了一个守卫插件（qq-tool-restrict），它的
// ctx.tools.guard() 只放行 SAFE_EXACT 里的两个工具名 + SAFE_PREFIXES 里的前缀。
// 我们的工具是 mcp__qq-extras__*，不在名单里 → QQ 侧 agent 调用一律被拒。
//
// 这个模块负责那「一行」：幂等、有备份、可回滚。宿主每次启动都会调一次，
// 所以 qq-bridge 升级（覆盖该文件）后只要重启 DSH 就能自愈。
import fs from 'node:fs';
import path from 'node:path';

export const PREFIX = 'mcp__qq-extras__';

export function guardFileOf(bridgeDir) {
  return path.join(bridgeDir, 'plugins', 'qq-agent-presets', 'qq-tool-restrict.mjs');
}

export function backupFileOf(guardFile) {
  return `${guardFile}.dsh-qq-kit.orig`;
}

/**
 * 确保白名单里有本插件前缀。
 * @returns {{status:'added'|'present'|'missing-guard'|'missing-anchor'|'error', file?:string, error?:string}}
 */
export function ensureAllowlist(bridgeDir) {
  try {
    if (!bridgeDir) return { status: 'missing-guard' };
    const guardFile = guardFileOf(bridgeDir);
    if (!fs.existsSync(guardFile)) return { status: 'missing-guard', file: guardFile };

    let text = fs.readFileSync(guardFile, 'utf8');
    if (text.includes(`'${PREFIX}'`)) return { status: 'present', file: guardFile };

    const anchor = /('mcp__web-search-safe__',)/;
    if (!anchor.test(text)) return { status: 'missing-anchor', file: guardFile };

    const backup = backupFileOf(guardFile);
    if (!fs.existsSync(backup)) fs.copyFileSync(guardFile, backup);

    text = text.replace(anchor, `$1\n  '${PREFIX}',`);
    fs.writeFileSync(guardFile, text, 'utf8');
    return { status: 'added', file: guardFile };
  } catch (error) {
    return { status: 'error', error: String(error?.message ?? error) };
  }
}

/** 回滚：把白名单里那一行删掉（备份文件保留）。 */
export function revertAllowlist(bridgeDir) {
  try {
    const guardFile = guardFileOf(bridgeDir);
    if (!fs.existsSync(guardFile)) return { status: 'missing-guard', file: guardFile };
    let text = fs.readFileSync(guardFile, 'utf8');
    if (!text.includes(`'${PREFIX}'`)) return { status: 'present', file: guardFile };
    text = text.replace(new RegExp(`\\s*'${PREFIX}',`), '');
    fs.writeFileSync(guardFile, text, 'utf8');
    return { status: 'reverted', file: guardFile };
  } catch (error) {
    return { status: 'error', error: String(error?.message ?? error) };
  }
}
