// 插件：把网络图片收藏成 QQ 自定义表情。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_collect_sticker_from_url',
    '把一张网络图片收藏成自己的 QQ 收藏表情（之后可用 qq_send_sticker 发）。适合先搜图再收藏；remark 写一句短备注。别频繁收藏。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      url: z.string().describe('图片的 http(s) 地址'),
      remark: z.string().optional().describe('备注')
    },
    async ({ key, url, remark }) => {
      try {
        ctx.assertAllowed(key);
        const image = await ctx.fetchImage(url);
        const data = await ctx.client.call('add_custom_face', { file: ctx.toBase64Url(image.buffer) }, 120000);
        const emojiId = String(data?.emoji_id ?? '');
        const cleanRemark = String(remark ?? '').trim().slice(0, ctx.pluginSettings.maxRemarkChars);
        if (emojiId && cleanRemark) {
          try { await ctx.client.call('modify_custom_face', { emoji_id: emojiId, desc: cleanRemark }); } catch { /* 备注失败不影响收藏 */ }
        }
        return ctx.text({ ok: true, emojiId: emojiId || null, remark: cleanRemark || null });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
