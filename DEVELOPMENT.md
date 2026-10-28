# 开发文档（宿主）

给要改宿主、或者照着做一个插件框架的人看。写插件请看 **[PLUGIN-DEV.md](PLUGIN-DEV.md)**。

---

## 1. v0.1 → v0.2：从「一堆工具」到「插件宿主」

v0.1 把 10 个工具写死在一个 `server.js` 里。能用，但每加一个功能都要改宿主、
重新打包、重新装，用户也没法只要其中几个。

v0.2 拆成 **宿主 + 插件**：

```
src/host.js        # 扫描插件 → 加载 → 把工具注册进 MCP
src/plugin-api.js  # ctx：插件能用的全部能力
src/onebot.js      # OneBot 客户端 + 白名单
src/settings.js    # 读 DSH 设置页的值
src/media.js       # 安全下载图片
src/diary.js       # 日记读写
src/tts.js         # Edge/SAPI 语音
plugins/<id>/      # 内置插件（8 个）
scripts/qqkit.mjs  # 插件管理 CLI
```

宿主只做三件事：**发现插件、给插件发 ctx、把插件注册的工具暴露给 MCP**。

---

## 2. 插件是怎么被加载的

```
discoverPlugins()
  ├─ 扫 <包>/plugins/*/
  └─ 扫 ~/.dsh/qq-kit/plugins/*/
        ↓ 读 plugin.json（id / 默认设置 / 默认启用）
loadState()  ← ~/.dsh/qq-kit/state.json（用户用 qqkit 改过启停）
        ↓ 合并默认设置 + state.settings + plugins/<id>/config.json
for each enabled plugin:
        import(plugins/<id>/index.js) → register(ctx)
        ↓ 失败只记 stderr，不影响其他插件
MCP tools/list
```

关键点：

| 决定 | 原因 |
|---|---|
| 每个插件 `import()` 一次且带 `?t=` 时间戳 | 避免 Node 模块缓存导致改了代码不生效 |
| 单个插件失败只记 `failed: id(原因)` | 一个坏插件不该拖垮整套 |
| 设置三层合并（manifest 默认 → state → config.json） | 出厂默认 / CLI 覆盖 / 手改文件，优先级明确 |
| `ctx.client` 是惰性 getter | 启动时不连 SnowLuma，桥接没开也能列出工具 |

加载结果打在 **stderr**，DSH 启动日志里能看到：

```
[qq-kit] plugins loaded: qq-image, qq-diary
[qq-kit] plugins loaded: qq-image; failed: my-plugin(缺少 register(ctx) 导出)
```

---

## 3. 设置为什么分两层

| 层 | 存哪 | 谁改 | 渲染 |
|---|---|---|---|
| 全局 | `<profile>/settings.yaml` 的 `qq-extras:` 段 | DSH 设置页 | DSH 自动渲染（schemastery） |
| 插件 | `~/.dsh/qq-kit/plugins/<id>/config.json` | `qqkit config` 或手改 | 目前不渲染，见路线图 |

DSH 的命名空间机制（0.2.x）要求：

1. profile 里有一条 loader entry，**id 等于命名空间名**（`qq-extras`）
2. 该 entry 的模块导出 `Config`
3. `Config` 至少一个字段带 `.extra('volatile', true)`

所以 `lib/settings.js` 只有 `Config` 和一个空 `apply()`。
**不要**画蛇添足去调 `ctx.settings.register()`——0.2 没这个方法。

---

## 4. 加一个内置插件

1. `plugins/my-thing/plugin.json`
2. `plugins/my-thing/index.js` 导出 `register(ctx)`
3. `node scripts/qqkit.mjs list` 应能看到
4. `npm run smoke -- <host.js>` 应多出你的工具

不要改 `host.js`。宿主对内置和第三方一视同仁，这就是插件的意义。

---

## 5. 测试矩阵

| 层级 | 命令 | 查什么 |
|---|---|---|
| 语法 | `node --check src/*.js plugins/*/index.js scripts/*.mjs` | 低级错误 |
| 协议 | `npm run smoke -- <host.js>` | stdio 握手 + `tools/list` |
| 环境 | `npm run selftest` | 桥接/网关/白名单 |
| 插件 | `node scripts/qqkit.mjs doctor` | 插件齐全 + 自检 |
| 配置 | `dsh --profile web --dump-config` | entry 能装配、不报错 |

改完宿主至少跑前四个。

---

## 6. 安装脚本细节（排错看这里）

```
npm pack --pack-destination <profile>   → dsh-qq-kit-0.2.0.tgz
改 profile/package.json                  → dependencies + bundles
pnpm install                            → 装进 profile/node_modules
替换安装副本 cordis.patch.yml 里的占位符   → __SERVER_ENTRY__ → 绝对路径
自动探测 qq-bridge → 写 settings.yaml      → bridgeDir
删 tarball
```

为什么用 `npm pack` 而不是 `file:` 依赖：`file:` 在 pnpm 里常是软链，
替换占位符会**改到仓库本体**（v0.1 踩过）。tarball 装出来是真实拷贝。

占位符替换只匹配「参数行」，不动注释——否则注释会被写成一段绝对路径。

---

## 7. 已知坑

| 现象 | 原因 / 解法 |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 10+ 默认拦 build script；`pnpm-workspace.yaml` 里设 `strictDepBuilds: false` |
| `spawnSync pnpm.cmd EINVAL` | Windows 上 `.cmd` 必须 `shell: true` |
| 注释里的 `*/` | `/** ... profiles/*/settings.yaml ... */` 会提前闭合块注释 |
| 设置页不出现 | entry id ≠ 命名空间，或 `Config` 没有 volatile 字段 |
| 工具不出现 | 没重启 DSH；或 host.js 路径写错 |

---

## 8. 设置界面怎么接（v0.4）

DSH 的设置界面有两条路，我们两条都用上了：

### 8.1 独立设置项（`lib/client.js`）

DSH 的客户端插件是一个 `window.__ModuleLoader__.load({ id, factory })` 脚本，
默认导出 `apply(ctx)`。我们在里面往 `settings.section` 插槽注册一个页面：

```js
ctx.slots.inject("settings.section", () => ctx.slots.register({
  name: "settings.section",
  id: "qq-kit",
  order: 15,
  label: () => ctx.locale.bind("settings.qqKit")("nav"),
  locale: "settings.qqKit",
  inject: () => ({ hooks: { qqkit: store }, save, reload })
}, QqKitSection));
```

页面数据来自 `ctx.configForms.describe()`：过滤出命名空间为 `qq-extras`
或 `qqplug-<插件id>` 的项，按 schema 渲染表单；改动通过
`ctx.configForms.get(ns).set(key, value)` 写回。

`package.json` 必须声明：

```json
"exports": { "./client": "./lib/client.js" },
"dsh": { "client": { "inject": ["slots", "configForms"], "platform": "web" } }
```

离线冒烟（不开浏览器）：`node scripts/client-smoke-test.mjs` —— 用 vm 假造
`__ModuleLoader__` 和 react，验证 apply 会注册页面、且只挑本套件的命名空间。

### 8.2 每个插件的设置命名空间（`scripts/sync-shims.mjs`）

设置项里的表单读的是 DSH 的设置命名空间，而**一个命名空间必须是某个 loader entry 的 id**。
所以我们给每个有设置项的插件生成一个小包：

```
<profile>/qq-kit-shims/<pluginId>/
├── package.json      name = qqkit-plugin-<pluginId>，声明 dsh.bundle.patch
├── index.js          导出 schemastery Config（由 plugin.json 的 settings[] 生成）
└── cordis.patch.yml  insert 一条 entry：id = qqplug-<pluginId>
```

包名同时写进 `<profile>/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，
`pnpm install` 链接后命名空间才存在。**注意**：不要再指望 DSH 的插件管理器里出现
7 张卡——它是「一个 bundle 一张卡」，多 entry 只会显示第一条，这也是我们自己做
设置页的原因。

### 8.3 什么时候会重跑

`install.mjs`、`qqkit add/remove/enable/disable/new` 都会自动跑：
`sync-shims → pnpm install → sync-entries`。手改插件目录后手动跑一遍：

```bash
node scripts/sync-shims.mjs     # 生成/清理插件设置包
pnpm install                    # 在 profile 目录里链接
node scripts/sync-entries.mjs   # 写 MCP entry
node scripts/client-smoke-test.mjs
# 重启 DSH
```

---

### 8.4 工具白名单（唯一一处动 qq-bridge）

qq-bridge 的 `plugins/qq-agent-presets/qq-tool-restrict.mjs` 里有一份**执行期白名单**
（`SAFE_PREFIXES`），只放行 `mcp__snowluma__` / `mcp__snowluma-host__` / `mcp__web-search-safe__`。
我们的工具是 `mcp__qq-extras__*`，不加进去，QQ 侧 agent 调用会被直接拒绝。

实现拆成三层：

| 位置 | 职责 |
|---|---|
| `src/allowlist.js` | `ensureAllowlist` / `revertAllowlist`，幂等、备份 `.dsh-qq-kit.orig` |
| `src/host.js` | **每次启动**调一次（qq-bridge 升级覆盖文件后重启即自愈） |
| `scripts/patch-bridge-allowlist.mjs` | 命令行：`--check` / 默认修复 / `--revert` |

`install.mjs` 也会调用一次。离线回归：`node scripts/allowlist-smoke-test.mjs`
（added → present 幂等 → reverted → 无锚点不动 → 守卫缺失安全跳过）。

这是本套件**唯一**会修改 qq-bridge 文件的地方，而且只加一行字符串。
更好的做法（上游加常量 / 改成可配置）写在 README 的「关于工具白名单」里，欢迎 PR。

---

## 9. 路线图

- [x] **每个插件独立设置卡片**（v0.3 已实现，见上一节）
- [ ] 插件市场：`qqkit add <git-url>` 直接从仓库拉
- [ ] 插件权限声明（`permissions: ["send", "qzone", "fs:diary"]`），宿主据此裁剪 ctx
- [ ] 插件热重载（不重启 DSH）：需要 MCP 工具列表可动态刷新，受 SDK 限制
