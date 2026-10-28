# 使用说明

面向第一次用的人。照着做，不用看代码。

---

## 0. 先说这套东西由什么组成

```
QQ 客户端 ──► SnowLuma（OneBot 网关） ──► qq-bridge（桥接） ──► DSH ──► 模型
                                          ▲
                                   dsh-qq-kit（本插件宿主）
                                     ├── 内置插件 ×8
                                     └── 你自己装的插件
```

| 层 | 你需要的状态 | 怎么确认 |
|---|---|---|
| SnowLuma | 已登录 QQ，OneBot HTTP 在 3000、WS 在 3001 | 浏览器开 `http://127.0.0.1:5099` 能进 WebUI |
| qq-bridge | 进程在跑，日志有 `SnowLuma 已连接` | 浏览器开 `http://127.0.0.1:3100` |
| DSH | `dsh web` 在跑 | 浏览器开 `http://127.0.0.1:3080` |

本套件只加「能力」，**不负责启动 SnowLuma 或 qq-bridge**。

---

## 1. 安装

```bash
git clone https://github.com/haotianshouwang/dsh-qq-kit.git
cd dsh-qq-kit
node scripts/install.mjs
```

看到这句就算装完：

```
[qq-kit] 安装完成。重启 DSH 后：设置页会出现「QQ 增强套件」...
```

然后**关掉 DSH 再启动**（MCP 工具只在启动时加载）。

---

## 2. 自检

```bash
npm run selftest
```

全绿样例（账号信息是占位符，实际会显示你自己的）：

```
✅ 找到 qq-bridge  ...\qq-bridge
✅ OneBot 地址  http://127.0.0.1:3000
✅ OneBot token  已获取（abc123…）
✅ 登录账号  你的机器人昵称 (1xxxxxxxxx)
✅ 白名单  群 2 个，私聊 1 个
✅ 群列表  3 个群可见
全部通过。
```

---

## 3. 装了什么插件

```bash
node scripts/qqkit.mjs list
```

```
ID                  状态      类型      名称
qq-avatar           启用      内置      换头像
qq-diary            启用      内置      日记
qq-group            启用      内置      群管理
qq-image            启用      内置      发图片
qq-imagesearch      启用      内置      图片搜索
qq-qzone            启用      内置      QQ 空间
qq-sticker          启用      内置      表情收藏
qq-voice            启用      内置      语音条
```

---

## 4. 管理插件（这是这套东西的重点）

```bash
# 启用 / 停用（不用删文件）
node scripts/qqkit.mjs disable qq-qzone
node scripts/qqkit.mjs enable  qq-qzone

# 装别人写好的插件（一个文件夹，里面有 plugin.json 和 index.js）
node scripts/qqkit.mjs add ./some-plugin

# 删掉第三方插件
node scripts/qqkit.mjs remove some-plugin

# 看/改插件自己的设置
node scripts/qqkit.mjs config qq-image
node scripts/qqkit.mjs config qq-image maxBytes=4194304

# 体检（顺带跑一次环境自检）
node scripts/qqkit.mjs doctor
```

**改完都要重启 DSH** —— 工具列表是启动时拉取的。

> 内置插件不能 `remove`，只能 `disable`。第三方插件放在 `~/.dsh/qq-kit/plugins/`。

---

## 5. 设置页

DSH → **设置 → QQ 增强套件**（v0.4 起是独立设置项，不再藏在「插件」里）：

- 第一张卡是全局配置：

| 设置项 | 作用 |
|---|---|
| `bridgeDir` | qq-bridge 目录（安装时自动探测并写入） |
| `ttsEngine` | `edge`（自然）/ `sapi`（纯离线） |
| `ttsVoice` | Edge 音色，默认少女音 |
| `proxy` | Edge TTS 代理，留空直连 |

- 后面每个内置插件各一张卡：「发图片」「语音条」「QQ 空间」「日记」「表情收藏」
  「群管理」「图片搜索」，卡片标题就是插件名，字段下方有说明。
- 每张卡右上角有「启用」开关：关掉 = 宿主不再加载它（写进 `qq-extras.disabledPlugins`）。

改完**重启 DSH** 生效（工具在启动时注册）。

安装第三方插件用命令行（网页内一键安装还没做）：

```bash
node scripts/qqkit.mjs add ./my-plugin     # 装
node scripts/qqkit.mjs remove my-plugin    # 卸
node scripts/qqkit.mjs list                # 看列表
```

> 首次安装时安装脚本会把 `mcp__qq-extras__` 加进 qq-bridge 的执行期工具白名单
> （`plugins/qq-agent-presets/qq-tool-restrict.mjs`，只加一行、有备份、可 `--revert`）。
> 不加的话 QQ 侧 agent 调不动这些工具。

命令行等价物：`qqkit config <id>`。设置优先级：
`plugin.json` 默认值 < `state.json` < 插件目录 `config.json` < DSH 设置页。

---

## 6. 她能做什么

| 你说 | 她调用 | 效果 |
|---|---|---|
| 「发张 xx 的图」 | `qq_imagesearch` → `qq_send_image` | 搜图并发出去 |
| 「换个头像」 | `qq_set_avatar` | 换机器人头像 |
| 「说句话给我听」 | `qq_say` | 语音条 |
| 「今天的事记一下」 | `qq_diary_write` | 写进 Markdown |
| 「你前几天的日记」 | `qq_diary_read` | 翻日记 |
| 「发条空间说说」 | `qq_qzone_post` | 发到 QQ 空间 |
| 「把这张图收进表情」 | `qq_collect_sticker_from_url` | 收藏成表情 |
| 「把群名改成 xx」 | `qq_set_group_name` | 需要机器人是管理员 |

---

## 7. 写自己的插件

```bash
node scripts/qqkit.mjs new my-plugin
```

会生成骨架，改 `~/.dsh/qq-kit/plugins/my-plugin/index.js` 就行。
完整说明看 **[PLUGIN-DEV.md](PLUGIN-DEV.md)**。

---

## 8. 日记在哪

```
qq-bridge/state/diary/YYYY-MM-DD.md
```

纯 Markdown，按天一个文件。复制走就是备份。

---

## 9. 工具白名单（调不动时先看这里）

qq-bridge 对「QQ 会话里的 agent 能调哪些工具」有一道执行期白名单，逻辑很简单：

```js
ctx.tools.guard((exec) => {
  if (SAFE_EXACT.has(exec.name)) return          // ask_user_question / todo_write
  if (SAFE_PREFIXES.some(p => exec.name.startsWith(p))) return
  return `工具 "${exec.name}" 不在白名单内，已拒绝`
})
```

`SAFE_PREFIXES` 原本只有 `mcp__snowluma__` / `mcp__snowluma-host__` / `mcp__web-search-safe__`。
我们的工具叫 `mcp__qq-extras__*`，所以会被拒——表现就是“她好像不会用这些工具”。

**本插件会自动处理**：

- 宿主每次启动都会检查一遍，缺了就补一行（`src/allowlist.js`）
- 改之前备份为 `qq-tool-restrict.mjs.dsh-qq-kit.orig`
- qq-bridge 升级覆盖了这个文件？重启 DSH 就自愈

手动检查 / 修复 / 回滚：

```bash
node scripts/patch-bridge-allowlist.mjs --check    # 只看状态
node scripts/patch-bridge-allowlist.mjs            # 修复
node scripts/patch-bridge-allowlist.mjs --revert   # 回滚（删掉那一行）
```

> 注意：这道白名单只管 QQ 侧会话。你在 DSH 网页里聊天时不受影响，
> 那些工具本来就能用。另外它和 `allow.groups` / `allow.private` 是两回事：
> 后者决定“哪些群/私聊的消息能进来”。

关于这个设计的问题与替代方案，见 README 的「关于工具白名单」一节。

---

## 10. 常见问题

**设置页没有「QQ 增强套件」**
- 确认重启过 DSH
- 确认 `<profile>/package.json` 的 `dsh.profile.bundles` 里有 `dsh-qq-kit`

**agent 说没有这些工具**
- 工具名是 `mcp__qq-extras__qq_send_image` 这种格式
- 先跑 `qqkit doctor`，再看 DSH 启动日志里 `[qq-kit] plugins loaded:` 那一行

**某个插件加载失败**
- 不影响其他插件；日志里会写 `failed: <id>(原因)`
- 通常是 `index.js` 语法错或没导出 `register(ctx)`

**语音没声音**
- `sapi` 需要系统中文语音包；`edge` 需要能连微软语音服务（常需代理）

**改群名失败**
- 机器人在那个群不是管理员/群主，这条权限在 QQ 侧

---

## 11. 卸载

```bash
node scripts/uninstall.mjs
```

然后重启 DSH。插件目录 `~/.dsh/qq-kit/` 会保留，想彻底清掉自己删。
