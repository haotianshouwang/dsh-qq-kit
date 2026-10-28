// 插件：换机器人头像（全局动作）。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_set_avatar',
    '把机器人自己 QQ 账号的头像换成这张网络图片（http/https）。这是全局动作，所有群和私聊都会看到，只在对方明确要求时调用。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      url: z.string().describe('新头像的 http(s) 地址')
    },
    async ({ key, url }) => {
      try {
        ctx.assertAllowed(key);
        const image = await ctx.fetchImage(url);
        await ctx.client.call('set_qq_avatar', { file: ctx.toBase64Url(image.buffer) });
        return ctx.text({ ok: true, bytes: image.buffer.length, mimeType: image.mimeType });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
