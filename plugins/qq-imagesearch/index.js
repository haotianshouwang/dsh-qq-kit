// 插件：必应图片搜索（只读）。
export function register(ctx) {
  const { z } = ctx;
  ctx.tool(
    'qq_search_images',
    '图片搜索（只读）：用必应图片搜索找图，返回若干张图片直链 + 标题。拿到直链后再用 qq_send_image 发出去，或用 qq_collect_sticker_from_url 收藏成表情。',
    {
      query: z.string().describe('要找的图片关键词'),
      count: z.number().optional().describe('返回张数，最多 12')
    },
    async ({ query, count }) => {
      const clean = String(query ?? '').replace(/\[CQ:[^\]]*\]/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!clean) return ctx.fail(new Error('查询词为空'));
      const want = Math.max(1, Math.min(12, Number(count) || Number(ctx.pluginSettings.defaultCount) || 6));
      try {
        const res = await fetch(`https://cn.bing.com/images/search?q=${encodeURIComponent(clean)}&first=1`, {
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
            'accept-language': 'zh-CN,zh;q=0.9'
          },
          signal: AbortSignal.timeout(20000)
        });
        if (!res.ok) throw new Error(`必应返回 HTTP ${res.status}`);
        const html = await res.text();
        const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
        const items = [];
        for (const m of html.matchAll(/\bm="(\{[^"]*?\})"/g)) {
          let meta;
          try { meta = JSON.parse(decode(m[1])); } catch { continue; }
          const murl = meta?.murl;
          if (!murl || !/^https?:\/\//i.test(murl)) continue;
          items.push({ title: String(meta.t ?? '').slice(0, 100), imageUrl: murl, pageUrl: meta.purl ?? '' });
          if (items.length >= want) break;
        }
        if (!items.length) throw new Error('没有解析到图片结果');
        return ctx.text({ query: clean, count: items.length, items });
      } catch (error) { return ctx.fail(error); }
    }
  );
}
