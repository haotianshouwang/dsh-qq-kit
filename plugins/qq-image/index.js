// 插件：发网络图片。逻辑都在宿主提供的 ctx 里，插件只负责“接线”。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_send_image',
    '在指定会话发送一张网络图片（http/https 链接）。宿主会自己下载并做安全检查（拒绝内网地址、限制体积），不支持本地文件路径。想配文字请先用文字消息单独发一句，再单独发图。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号（必须在 qq-bridge 白名单里）'),
      url: z.string().describe('图片的 http(s) 地址'),
      replyToMessageId: z.union([z.number(), z.string()]).optional().describe('要引用的消息 id（可选）'),
      atUserId: z.union([z.number(), z.string()]).optional().describe('要 @ 的群成员 QQ 号（群聊可选）')
    },
    async ({ key, url, replyToMessageId, atUserId }) => {
      try {
        const { kind, id } = ctx.assertAllowed(key);
        const image = await ctx.fetchImage(url);
        if (image.buffer.length > ctx.pluginSettings.maxBytes) {
          throw new Error(`图片超过插件设置的上限（${ctx.pluginSettings.maxBytes} 字节）`);
        }
        const segments = [];
        if (replyToMessageId !== undefined && replyToMessageId !== null && String(replyToMessageId).trim() !== '') {
          segments.push({ type: 'reply', data: { id: String(replyToMessageId).trim() } });
        }
        if (atUserId !== undefined && atUserId !== null && String(atUserId).trim() !== '') {
          if (!/^\d+$/.test(String(atUserId).trim())) throw new Error('atUserId 必须是 QQ 号');
          segments.push({ type: 'at', data: { qq: String(atUserId).trim() } });
        }
        segments.push({ type: 'image', data: { file: ctx.toBase64Url(image.buffer) } });
        const params = kind === 'group'
          ? { group_id: Number(id), message: segments }
          : { user_id: Number(id), message: segments };
        const data = await ctx.client.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params);
        return ctx.text({ ok: true, messageId: data?.message_id ?? null, bytes: image.buffer.length, mimeType: image.mimeType });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
