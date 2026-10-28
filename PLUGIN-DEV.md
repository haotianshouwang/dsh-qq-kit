# 插件开发指南

想给这个套件加功能？一个插件就是一个文件夹，不用改宿主、不用重新打包。

---

## 1. 三十秒上手

```bash
node scripts/qqkit.mjs new my-plugin
```

会在 `~/.dsh/qq-kit/plugins/my-plugin/` 生成：

```
my-plugin/
├── plugin.json   # 元信息 + 设置项
└── index.js      # 入口：导出 register(ctx)
```

改 `index.js`，重启 DSH，你的工具就出现在 agent 的工具列表里（命名空间 `mcp__qq-extras__<工具名>`）。

---

## 2. 目录约定

```
~/.dsh/qq-kit/
├── plugins/                # 第三方插件，每个一个文件夹
│   └── my-plugin/
│       ├── plugin.json
│       ├── index.js
│       └── config.json     # 可选：插件设置（qqkit config 写入）
└── state.json              # 启停状态（qqkit enable/disable 写入）
```

内置插件在包目录的 `plugins/` 下，用户插件在 `~/.dsh/qq-kit/plugins/`。
**同名以用户插件为准**（可以覆盖内置的默认值，方便魔改）。

---

## 3. plugin.json

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "description": "一句话说明",
  "author": "你的名字",
  "enabled": true,
  "settings": [
    { "key": "greeting", "label": "问候语", "type": "string", "default": "你好" },
    { "key": "limit", "label": "次数上限", "type": "number", "default": 3 }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 唯一标识，建议小写中划线 |
| `name` | ✅ | 显示名 |
| `version` | | 语义化版本 |
| `description` | | 列表页展示 |
| `author` | | 作者 |
| `enabled` | | 默认是否启用（用户可用 CLI 覆盖） |
| `settings` | | 设置项默认值，见下 |

`settings` 里的每个字段会变成 `ctx.pluginSettings.<key>`，默认值来自这里；
用户用 `qqkit config <id> key=value` 改写的值存在 `config.json`，优先于默认值。

---

## 4. index.js

只要求导出一个 `register(ctx)`，可以 async：

```js
export function register(ctx) {
  const { z } = ctx;

  ctx.tool(
    'my_hello',                        // MCP 工具名（全局唯一，建议加前缀）
    '跟某人打个招呼',                    // 给模型看的描述
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      to: z.string().optional().describe('要 @ 的 QQ 号')
    },
    async ({ key, to }) => {
      try {
        const { kind, id } = ctx.assertAllowed(key);   // 白名单校验，必须做
        const gw = ctx.pluginSettings.greeting;
        const res = await ctx.client.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', {
          ...(kind === 'group' ? { group_id: id } : { user_id: id }),
          message: [{ type: 'text', data: { text: gw } }]
        });
        return ctx.text({ ok: true, messageId: res?.message_id ?? null });
      } catch (error) {
        return ctx.fail(error);
      }
    }
  );
}
```

### ctx 提供什么

| 成员 | 说明 |
|---|---|
| `ctx.tool(name, desc, schema, handler)` | 注册一个 MCP 工具 |
| `ctx.z` | zod（构造参数 schema，版本由宿主统一） |
| `ctx.text(value)` / `ctx.fail(error)` | 标准返回/失败包装 |
| `ctx.client.call(action, params, timeoutMs?)` | 调 OneBot v11 动作（`send_group_msg`、`set_qq_avatar`…） |
| `ctx.client.cfg` | qq-bridge 的 config（端点、白名单） |
| `ctx.assertAllowed(key)` | 校验 key 在白名单里，返回 `{kind, id}`；**发送类工具必须调用** |
| `ctx.bridgeDir` | qq-bridge 目录（存文件用） |
| `ctx.fetchImage(url)` | 安全下载图片（拒绝内网、8MB 上限） |
| `ctx.toBase64Url(buffer)` | 转成 OneBot 的 `base64://` 图片段 |
| `ctx.diary.write/read/list` | 日记读写 |
| `ctx.synthesize(text, {voice})` | TTS 合成，返回 `{file, engine}` |
| `ctx.settings` | 全局设置（DSH 设置页里那些） |
| `ctx.pluginSettings` | 本插件的设置 |
| `ctx.pluginDir` / `ctx.pluginId` | 插件自身信息 |

---

## 5. 能做什么 / 不能做什么

**能**：调 OneBot 动作、读写 `~/.dsh/qq-kit/` 和 `qq-bridge/state/`、下载公网图片、合成语音。

**不能**（宿主没给，也别自己绕）：
- 执行 shell 命令、读任意本地文件
- 访问内网地址（`fetchImage` 会拒）
- 伪造白名单校验

如果确实需要更底层的能力，先想清楚是不是该提 issue 让宿主开放，
而不是在插件里 `import 'node:child_process'` 硬来——那会绕过所有安全边界。

---

## 6. 调试

```bash
node scripts/qqkit.mjs list          # 看装了什么、是否启用
node scripts/qqkit.mjs doctor        # 体检（会顺带跑一遍环境自检）
node --check ~/.dsh/qq-kit/plugins/my-plugin/index.js
npm run smoke -- <安装后的 host.js 路径>
```

宿主启动时会把加载结果打到 **stderr**：

```
[qq-kit] plugins loaded: qq-image, qq-diary, my-plugin
[qq-kit] plugins loaded: qq-image; failed: my-plugin(缺少 register(ctx) 导出)
```

DSH 启动日志里能看到这一行，插件写错了不会静默失败。

一个插件加载失败**不会影响其他插件**，宿主会继续加载剩下的。

---

## 7. 发布

```bash
cd ~/.dsh/qq-kit/plugins/my-plugin
# 确保只有 plugin.json / index.js / README
```

别人安装：

```bash
git clone <你的仓库>
node scripts/qqkit.mjs add ./my-plugin
# 重启 DSH
```

想进内置插件（随包分发）：把文件夹放进本仓库的 `plugins/` 下即可，
打包时 `files` 已经包含 `plugins`。

---

## 8. 约定与建议

- 工具名加前缀（`my_`），避免和内置的 `qq_*` 撞
- 描述写给模型看：说清什么时候用、参数是什么，模型才会用对
- 发送类工具先 `assertAllowed`，否则等于绕过白名单
- 频率类限制（每天几次、每分钟几条）自己记在 `pluginDir` 下，别指望宿主
- 设置项尽量少而明确，用户看不懂的配置等于没有

---

## 9. 插件设置会出现在「QQ 增强套件」设置项里（v0.4）

只要 `plugin.json` 里写了 `settings[]`，安装/启停后会自动出现在
**DSH → 设置 → QQ 增强套件** 页面，一个插件一张卡片：

```
QQ 增强套件
├── 全局（qq-extras）        bridgeDir / ttsEngine / ttsVoice / proxy
├── 发图片（qqplug-qq-image） 单张图片上限
└── 语音条（qqplug-qq-voice） 单条最多字数
```

- 卡片读写的是 `<profile>/settings.yaml` 里的 `qqplug-<id>:` 段
- 宿主启动时把它合并进 `ctx.pluginSettings`，优先级最高
- 没有 `settings[]` 的插件不会出现卡片
- 改完设置要**重启 DSH**（工具在启动时注册，设置值那时读一次）

想立刻看到卡片（改完 `plugin.json` 的 settings 后）：

```bash
node scripts/sync-shims.mjs     # 生成/更新插件设置包
pnpm install                    # 在 <profile> 目录里执行，链接新包
node scripts/sync-entries.mjs   # 更新 MCP entry
node scripts/client-smoke-test.mjs
# 重启 DSH
```

> 原理：设置页由 `lib/client.js` 注册到 `settings.section` 插槽；
> 每个插件的配置项是 `sync-shims.mjs` 生成的独立命名空间。
> 详见 [DEVELOPMENT.md](DEVELOPMENT.md) 第 8 节。

命令行仍然可用（值写进插件目录的 `config.json`，优先级低于设置页）：

```bash
node scripts/qqkit.mjs config qq-image
node scripts/qqkit.mjs config qq-image maxBytes=4194304
```
