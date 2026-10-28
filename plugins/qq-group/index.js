// 插件：群名 / 群名片。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_set_group_name',
    '修改群名称（需要机器人是该群管理员/群主，否则网关会报权限错误）。改名前先确认对方真的要改。',
    {
      key: z.string().describe('群会话 key，格式 group:群号'),
      name: z.string().describe('新的群名')
    },
    async ({ key, name }) => {
      try {
        const { kind, id } = ctx.assertAllowed(key);
        if (kind !== 'group') throw new Error('只有群会话能改群名');
        const value = String(name ?? '').trim();
        if (!value) throw new Error('name 不能为空');
        if (value.length > ctx.pluginSettings.maxNameChars) throw new Error('群名太长');
        await ctx.client.call('set_group_name', { group_id: id, group_name: value });
        return ctx.text({ ok: true, groupId: id, name: value });
      } catch (error) { return ctx.fail(error); }
    }
  );

  ctx.tool(
    'qq_set_group_card',
    '修改机器人自己在这个群里的群名片。传空字符串可清除。注意：这是「我在这个群叫什么」，不是群名。',
    {
      key: z.string().describe('群会话 key，格式 group:群号'),
      card: z.string().describe('新群名片；空字符串清除')
    },
    async ({ key, card }) => {
      try {
        const { kind, id } = ctx.assertAllowed(key);
        if (kind !== 'group') throw new Error('只有群会话能改群名片');
        const value = String(card ?? '').trim();
        if (value.length > ctx.pluginSettings.maxNameChars) throw new Error('群名片太长');
        const me = await ctx.client.call('get_login_info');
        const selfId = Number(me?.user_id);
        if (!Number.isFinite(selfId)) throw new Error('拿不到机器人 QQ 号');
        await ctx.client.call('set_group_card', { group_id: id, user_id: selfId, card: value });
        return ctx.text({ ok: true, groupId: id, card: value });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
