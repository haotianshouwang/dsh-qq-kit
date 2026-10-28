// DSH 设置页（host 插件，只有 Config，没有 client 半）。
//
// DSH 0.2.x 的设置命名空间不是"注册"出来的，而是从 profile 的 loader entry 推导：
//   ① 存在一个 entry，其 **id 恰好等于命名空间名**（这里是 `qq-extras`，见 cordis.patch.yml）
//   ② 该 entry 的插件模块导出 `Config`（schemastery schema）
//   ③ `Config` 里至少有一个字段带 `.extra('volatile', true)`
// 满足这三点，DSH 设置页就会自动渲染，无需写 React。
//
// v0.2 起这里只放**全局**设置：插件自身的设置（图片上限、语音字数……）
// 存在 ~/.dsh/qq-kit/plugins/<id>/config.json，用 `qqkit config` 修改。
// 工具级开关不再放这里——直接用 `qqkit disable <id>` 停用整个插件更清晰。
import z from '@deepseek-ai/schemastery';

export const name = 'dsh-qq-kit';
export const inject = ['settings'];

export const Config = z.object({
  bridgeDir: z.string()
    .default('')
    .description('qq-bridge 目录（含 config.json）；留空则自动在常见位置查找')
    .extra('volatile', true),

  ttsEngine: z.union([z.const('edge'), z.const('sapi')])
    .default('edge')
    .description('语音引擎：edge=微软神经音色（自然，需联网/代理）；sapi=本机离线音色')
    .extra('volatile', true),

  ttsVoice: z.string()
    .default('zh-CN-XiaoyiNeural')
    .description('Edge 音色：zh-CN-XiaoyiNeural(少女) / zh-CN-XiaoxiaoNeural(温柔) / zh-CN-XiaohanNeural(软萌)')
    .extra('volatile', true),

  disabledPlugins: z.string()
    .default('[]')
    .description('停用的插件 id 列表（JSON 数组）；设置页里的开关会写这里')
    .extra('volatile', true),
  proxy: z.string()
    .default('http://127.0.0.1:7890')
    .description('Edge TTS 走的本机代理；留空表示直连')
    .extra('volatile', true)
});

/** 0.2.x 下装配钩子是空操作：命名空间由 entry id + Config 推导。 */
export function apply() {
  // no-op
}
