// 插件：QQ 空间说说。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_qzone_post',
    '发一条 QQ 空间说说。适合偶尔记录心情、发日记摘要或配图。别频繁发，也别把群聊内容原样搬上去。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      content: z.string().describe('说说正文，最多 2000 字'),
      images: z.array(z.string()).optional().describe('配图 http(s) 地址数组'),
      ugcRight: z.number().optional().describe('可见范围：1=所有人 4=好友 16=部分好友 64=仅自己 128=部分不可见')
    },
    async ({ key, content, images, ugcRight }) => {
      try {
        ctx.assertAllowed(key);
        const body = String(content ?? '').trim();
        if (!body) throw new Error('说说正文不能为空');
        if (body.length > 2000) throw new Error('说说正文最多 2000 字');
        const list = (images ?? []).map(String).filter(Boolean).slice(0, ctx.pluginSettings.maxImages);
        for (const u of list) if (!/^https?:\/\//i.test(u)) throw new Error('配图只支持 http(s) 地址');
        const right = Number(ugcRight ?? ctx.pluginSettings.defaultRight);
        if (![1, 4, 16, 64, 128].includes(right)) throw new Error('ugcRight 只能是 1/4/16/64/128');
        const params = { content: body, ugc_right: right };
        if (list.length) params.images = list;
        const data = await ctx.client.call('send_qzone_msg', params, 120000);
        return ctx.text({ ok: true, tid: data?.tid ?? null, time: data?.time ?? null });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
