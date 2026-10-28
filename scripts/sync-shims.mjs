#!/usr/bin/env node
// 为每个「有设置项的插件」生成一个独立的小包（shim），让 DSH 设置页把它当成一个插件。
//
// 为什么必须这样：DSH 设置页的插件卡片是「一个 bundle 一张卡」，而 bundle 里可以有
// 多条 loader entry。把 7 个插件设置塞进 dsh-qq-kit 一个 bundle 里，界面只会显示
// 第一条（qq-extras）。拆成 7 个包，才是 7 张卡片。
//
// 生成物（都在 profile 里，不进仓库）：
//   <profile>/qq-kit-shims/<pluginId>/
//     ├── package.json        name = qqkit-plugin-<pluginId>，声明 dsh.bundle.patch
//     ├── index.js            导出 Config（由 plugin.json 的 settings[] 转出来）
//     └── cordis.patch.yml    insert 一条 entry：id = qqplug-<pluginId>
//   同时把 name 写进 <profile>/package.json 的 dependencies + dsh.profile.bundles
//
// 用法：node scripts/sync-shims.mjs [--profile web]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const profileName = getArg('--profile', 'web');
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', profileName);
const shimRoot = path.join(profileDir, 'qq-kit-shims');
const pkgFile = path.join(profileDir, 'package.json');
const stateFile = path.join(process.env.QQ_KIT_HOME || path.join(os.homedir(), '.dsh', 'qq-kit'), 'state.json');

if (!fs.existsSync(pkgFile)) {
  console.error(`[qq-kit] 找不到 profile：${pkgFile}`);
  process.exit(1);
}

function log(m) { console.log(`[qq-kit] ${m}`); }
function readJson(file, fb = null) {
  try { let t = fs.readFileSync(file, 'utf8'); if (t.charCodeAt(0) === 0xfeff) t = t.slice(1); return JSON.parse(t); } catch { return fb; }
}

const state = readJson(stateFile, { plugins: {} }) ?? { plugins: {} };
const plugins = new Map();
const scan = (dir) => {
  if (!dir || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const pdir = path.join(dir, name);
    if (!fs.statSync(pdir).isDirectory()) continue;
    const manifest = readJson(path.join(pdir, 'plugin.json'));
    if (!manifest?.id) continue;
    plugins.set(manifest.id, { manifest, dir: pdir });
  }
};
scan(path.join(PKG_ROOT, 'plugins'));
scan(path.join(process.env.QQ_KIT_HOME || path.join(os.homedir(), '.dsh', 'qq-kit'), 'plugins'));

const wanted = [...plugins.values()]
  .filter((p) => {
    const st = state.plugins?.[p.manifest.id] ?? {};
    const enabled = st.enabled ?? p.manifest.enabled ?? true;
    return enabled && (p.manifest.settings ?? []).length > 0;
  })
  .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));

const TYPE_MAP = {
  string: (v) => `z.string().default(${JSON.stringify(v ?? '')})`,
  number: (v) => `z.number().default(${Number(v) || 0})`,
  boolean: (v) => `z.boolean().default(${v === true})`
};

function genIndex(plugin) {
  const fields = (plugin.manifest.settings ?? [])
    .filter((f) => f?.key)
    .map((f) => {
      const maker = TYPE_MAP[f.type ?? 'string'] ?? TYPE_MAP.string;
      const label = String(f.label ?? f.key).replace(/'/g, "\\'");
      return `  ${JSON.stringify(f.key)}: ${maker(f.default)}.description('${label}').extra('volatile', true)`;
    });
  return `// 由 dsh-qq-kit 自动生成，请勿手改（重装或增删插件会覆盖）。
import z from '@deepseek-ai/schemastery';

export const name = 'qqplug-${plugin.manifest.id}';

export const Config = z.object({
${fields.join(',\n')}
}).description(${JSON.stringify(plugin.manifest.name ?? plugin.manifest.id)});

export function apply() {
  // no-op：命名空间由 entry id + Config 推导
}
`;
}

const profilePkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
profilePkg.dependencies ??= {};
profilePkg.dsh ??= {};
profilePkg.dsh.profile ??= {};
profilePkg.dsh.profile.bundles ??= [];

fs.mkdirSync(shimRoot, { recursive: true });

// 清掉不再需要的 shim（插件被删/停用/没有设置项）
const wantedIds = new Set(wanted.map((p) => p.manifest.id));
for (const entry of fs.readdirSync(shimRoot)) {
  const dir = path.join(shimRoot, entry);
  if (!fs.statSync(dir).isDirectory()) continue;
  if (wantedIds.has(entry)) continue;
  fs.rmSync(dir, { recursive: true, force: true });
  const pkgName = `qqkit-plugin-${entry}`;
  delete profilePkg.dependencies[pkgName];
  profilePkg.dsh.profile.bundles = profilePkg.dsh.profile.bundles.filter((b) => b !== pkgName);
  log(`移除旧包：${pkgName}`);
}

const written = [];
for (const p of wanted) {
  const id = p.manifest.id;
  const pkgName = `qqkit-plugin-${id}`;
  const dir = path.join(shimRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), genIndex(p), 'utf8');
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), `# 由 dsh-qq-kit 自动生成\n- insert:\n    - id: qqplug-${id}\n      name: ${pkgName}\n      config: {}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: pkgName,
    version: p.manifest.version ?? '0.1.0',
    private: true,
    type: 'module',
    main: './index.js',
    description: `${p.manifest.name ?? id}（dsh-qq-kit 插件设置卡）`,
    dsh: { bundle: { patch: './cordis.patch.yml' } }
  }, null, 2) + '\n', 'utf8');
  profilePkg.dependencies[pkgName] = `file:./qq-kit-shims/${id}`;
  if (!profilePkg.dsh.profile.bundles.includes(pkgName)) profilePkg.dsh.profile.bundles.push(pkgName);
  written.push(pkgName);
}

fs.writeFileSync(pkgFile, JSON.stringify(profilePkg, null, 2) + '\n', 'utf8');
log(`生成 ${written.length} 个插件设置包：${written.join(', ') || '（无）'}`);
log('下一步需要 pnpm install 把它们链接进 node_modules。');
