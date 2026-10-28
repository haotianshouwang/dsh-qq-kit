// 插件：TTS 语音条。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_say',
    '用语音说一句话：把 text 合成为语音条发到指定会话。默认用微软 Edge 神经音色（中文少女音），失败时自动退回本机离线音色。一次建议 60 字以内，别连续刷语音。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      text: z.string().describe('要读出来的话'),
      voice: z.string().optional().describe('可选音色，默认 zh-CN-XiaoyiNeural'),
      rate: z.number().optional().describe('语速 -10~10（仅离线兜底生效）')
    },
    async ({ key, text: sayText, voice, rate }) => {
      try {
        const { kind, id } = ctx.assertAllowed(key);
        const said = String(sayText ?? '').trim();
        if (!said) throw new Error('text 不能为空');
        if (said.length > ctx.pluginSettings.maxChars) throw new Error(`一次最多 ${ctx.pluginSettings.maxChars} 字`);
        const result = await ctx.synthesize(said, { voice, rate });
        const asUrl = 'file:///' + result.file.replace(/\\/g, '/');
        const params = kind === 'group'
          ? { group_id: Number(id), message: [{ type: 'record', data: { file: asUrl } }] }
          : { user_id: Number(id), message: [{ type: 'record', data: { file: asUrl } }] };
        const data = await ctx.client.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params, 120000);
        return ctx.text({ ok: true, engine: result.engine, voice: result.voice ?? 'sapi', messageId: data?.message_id ?? null });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
