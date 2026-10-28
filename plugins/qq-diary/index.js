// 插件：日记读写。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_diary_write',
    '写一条日记（按时间追加到当天的 Markdown）。记录今天的事、心情、对某人的印象。写短一点、带情绪，别写成汇报。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      content: z.string().describe('日记正文')
    },
    async ({ key, content }) => {
      try {
        ctx.assertAllowed(key);
        return ctx.text({ ok: true, ...ctx.diary.write(ctx.bridgeDir, content, ctx.pluginSettings.maxChars) });
      } catch (error) { return ctx.fail(error); }
    }
  );

  ctx.tool(
    'qq_diary_read',
    '翻自己的日记（最近几天），用来回忆之前聊过什么、当时什么心情。偶尔翻，别每条消息都翻。',
    {
      key: z.string().describe('会话 key，格式 group:群号 或 private:QQ号'),
      days: z.number().optional().describe('看最近几天，默认 3，最多 30')
    },
    async ({ key, days }) => {
      try {
        ctx.assertAllowed(key);
        return ctx.text({
          ok: true,
          entries: ctx.diary.read(ctx.bridgeDir, days),
          dates: ctx.diary.list(ctx.bridgeDir).slice(0, 10)
        });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
