# dsh-qq-kit

给 DeepSeek Harness 的 QQ 机器人做一个**插件宿主**——像 AstrBot 那样，插件可以随意装、卸、停用、自己写，不用改任何上游源码。

> 内置 8 个插件（发图 / 换头像 / 语音 / 空间 / 日记 / 表情 / 群管理 / 搜图），
> 第三方插件放一个文件夹就能用。

---

## 写在前面

**这是一个临时起意写出来的项目，没有经过充分测试。**

起因：我给自己搭了 DSH + qq-bridge + SnowLuma 的 QQ 机器人，发现她缺几件事——
发不了图、只有电子音、不会写日记、不会发空间、不会自己找表情包。

第一版直接改 qq-bridge 源码，能跑，但上游一升级就全没。第二版抽成独立插件，
又发现「功能全写死在一个文件里」同样不好用：想关掉某个功能得改代码，
想加新功能得改宿主。

所以第三版变成现在这样：**宿主 + 插件**。

- 代码是一次成型、边用边改的，没做长期打磨
- 只在 Windows + SnowLuma 2.2.1 + qq-bridge 0.2.1-r1 + DSH 0.2.x 上实测过
- 边界情况（并发、超长内容、断线重连）考虑得不够
- **可以放心玩，但别拿它跑关键业务**

发现 bug 欢迎提 issue / PR——这项目就是为「让下一个人不用重造轮子」而开源的。

---

## 它长什么样

```
QQ ──► SnowLuma(OneBot) ──► qq-bridge ──► DSH ──► 模型
                              │
                        dsh-qq-kit（插件宿主，MCP server）
                          ├─ 内置插件 ×8
                          └─ ~/.dsh/qq-kit/plugins/  ← 你装的插件
```

宿主只做三件事：发现插件、给插件发上下文、把插件注册的工具交给 MCP。

---

## 内置插件

| ID | 名称 | 能力 |
|---|---|---|
| `qq-image` | 发图片 | 发网络图片（拒内网、体积上限） |
| `qq-avatar` | 换头像 | 换机器人头像 |
| `qq-voice` | 语音条 | 文字→语音（Edge 少女音，失败退 SAPI） |
| `qq-qzone` | QQ 空间 | 发说说，可配图、可设可见范围 |
| `qq-diary` | 日记 | 写日记 / 翻日记，存 Markdown |
| `qq-sticker` | 表情收藏 | 网络图片收藏成 QQ 表情 |
| `qq-group` | 群管理 | 改群名 / 群名片 |
| `qq-imagesearch` | 图片搜索 | 必应图片搜索 |

---

## 快速开始

**前置**：能跑的 DSH + qq-bridge + SnowLuma。

```bash
git clone https://github.com/haotianshouwang/dsh-qq-kit.git
cd dsh-qq-kit
node scripts/install.mjs          # 装进 DSH profile
# 重启 DSH
npm run selftest                  # 环境自检
node scripts/qqkit.mjs list       # 看插件
```

---

## 管理插件

```bash
node scripts/qqkit.mjs list                  # 列表
node scripts/qqkit.mjs disable qq-qzone      # 停用（不用删）
node scripts/qqkit.mjs enable  qq-qzone      # 启用
node scripts/qqkit.mjs add  ./my-plugin      # 装第三方插件
node scripts/qqkit.mjs remove my-plugin      # 删
node scripts/qqkit.mjs config qq-image k=v   # 改插件设置
node scripts/qqkit.mjs new  my-plugin        # 生成插件骨架
node scripts/qqkit.mjs doctor                # 体检
```

改完重启 DSH 生效（MCP 工具列表在启动时拉取）。

---

## 设置

DSH → **设置 → QQ 增强套件**（v0.4 起是一个独立设置项，由客户端插件注册）：

- 第一张卡是全局配置：桥接目录、TTS 引擎/音色、代理
- 后面每个内置插件各一张卡：发图片（单张上限）、语音条（字数）、QQ 空间（配图数/可见范围）、日记（目录/字数）、表情收藏（备注字数）、群管理（字数）、图片搜索（默认张数）

改动即时保存到 `<profile>/settings.yaml` 的 `qq-extras:` / `qqplug-<插件id>:` 段。
**工具列表在 DSH 启动时注册，所以改完要重启 DSH 才生效。**

每张插件卡右上角有「启用」开关：关掉后宿主不再加载这个插件（写进 `qq-extras.disabledPlugins`），
重启 DSH 生效。

安装第三方插件目前走命令行（网页内一键安装还没做）：

```bash
node scripts/qqkit.mjs add ./my-plugin
```

命令行等价物：`node scripts/qqkit.mjs config <id>`。

---

## 写插件

```bash
node scripts/qqkit.mjs new my-plugin
```

一个插件 = 一个文件夹：

```
my-plugin/
├── plugin.json   # id / 名称 / 版本 / 设置项默认值
└── index.js      # export function register(ctx) { ctx.tool(...) }
```

完整 API、示例、调试方法见 **[PLUGIN-DEV.md](PLUGIN-DEV.md)**。

---

## 文档

| 文件 | 内容 |
|---|---|
| [USAGE.md](USAGE.md) | 安装、自检、插件管理、常见问题 |
| [PLUGIN-DEV.md](PLUGIN-DEV.md) | **写插件**：目录约定、ctx API、调试、发布 |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 改宿主：加载流程、设置机制、打包、踩坑、路线图 |

---

## 隐私

- 本项目**不收集任何数据**，没有遥测、没有上报
- 所有配置、日记、语音都在你本机
- 图片下载会拒绝内网/本机地址，避免被当成读取本地文件的通道

---

## 兼容性

| 组件 | 实测版本 |
|---|---|
| DSH | 0.2.0-rc.2 / 0.2.1 |
| qq-bridge | 0.2.1-r1（上游原版，无补丁） |
| SnowLuma | 2.2.1 |
| Node.js | 22.19+ / 24.x |
| 系统 | Windows 10（未在 Linux/macOS 实测） |

OneBot v11 HTTP 的其他实现（NapCat 等）理论上可用，未验证。

---

## 许可与合规

- 本项目 **MIT**
- **不包含** SnowLuma 的任何代码或二进制（它是第三方项目、有自己的 EULA），请自行下载
- 对 qq-bridge（MIT）**只改一处**：在它的执行期工具白名单里加一行 `mcp__qq-extras__`
  （幂等、自动备份、`--revert` 可回滚；原因见下面「关于工具白名单」）
- 使用任何 QQ 协议端，请自行遵守腾讯用户协议与当地法律

---

## 相关项目

- [Derpyu520/qq-bridge](https://github.com/Derpyu520/qq-bridge) —— QQ ↔ DSH 桥接（本套件的依赖）
- [SnowLuma](https://github.com/SnowLuma/SnowLuma) —— OneBot v11 网关
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) —— 本体

---

## 关于工具白名单（想请大佬给点思路 / PR）

这是目前唯一一处需要动 qq-bridge 的地方，也是我最不满意的地方。

### 它的判定逻辑

qq-bridge 的 preset（`qq-chat` / `qq-chat-v2`）里挂了一个守卫插件
`plugins/qq-agent-presets/qq-tool-restrict.mjs`，它做了两件事：

1. **注册期隐藏**：`ctx.tools.restrict({ deny: [...] })` 把 bash / 读写文件 / 子代理
   等本地工具从模型的工具清单里抹掉；
2. **执行期白名单**：

```js
ctx.tools.guard((exec) => {
  const name = exec?.name
  if (typeof name !== 'string' || name.length === 0) return '工具名无效，已拒绝'
  if (SAFE_EXACT.has(name)) return                       // ask_user_question / todo_write
  if (SAFE_PREFIXES.some((p) => name.startsWith(p))) return
  return `工具 "${name}" 不在 QQ 桥接白名单内，已拒绝`
})

const SAFE_PREFIXES = [
  'mcp__snowluma__',
  'mcp__snowluma-host__',
  'mcp__web-search-safe__',
]
```

也就是说：**只看工具名的前缀**。我们的 MCP server 叫 `qq-extras`，工具名是
`mcp__qq-extras__*`，所以一律被拒。换成注册成 DSH 原生工具也没用——名字不在
`SAFE_EXACT` 里，一样会被拒。

这条限制同时写在 qq-bridge 的 `RULES.md` 里（“只允许三个命名空间下的工具”），
是它对外承诺的安全边界，不是随手写的 if。

### 现在的做法（妥协）

- `src/allowlist.js` 在**宿主每次启动时**检查并把 `'mcp__qq-extras__'` 补进去
- 幂等、改前备份 `.dsh-qq-kit.orig`、`--revert` 可回滚
- qq-bridge 升级覆盖了这个文件？重启 DSH 就自愈
- 手动检查/修复：`node scripts/patch-bridge-allowlist.mjs [--check|--revert]`

我不觉得这是漂亮方案：它在用户本地制造了「上游文件与官方不一致」，排障时容易误解。

### 如果你有更好的办法，非常欢迎 PR / issue

下面几个方向我评估过，但要么改动面大、要么会削弱原有安全边界，所以没做：

1. **上游加一行常量**：把 `'mcp__qq-extras__'` 放进 `SAFE_PREFIXES`（最小改动，不改变承诺语义）
2. **上游改成可配置**：例如 `config.json` 加 `security.allowedMcpPrefixes`（默认空、fail-closed），
   由用户显式授权第三方 MCP。更通用，但等于把“只允许三个命名空间”变成“允许你授权的命名空间”，
   需要维护者同意
3. **preset 层覆盖**：我们自带一份不含守卫的 preset —— 不推荐，等于拆掉群聊的安全边界
4. **冒充前缀**：把 MCP server 叫成 `snowluma` 去蹭白名单 —— 不推荐，日志和排障会乱，也是作弊

如果你想到第 5 种，或者愿意帮我推第 1 / 2 条，直接开 issue 或 PR 就行。
另外这个插件是临时起意写的，测试还不算充分，发现问题也欢迎拍我。
