// 插件运行上下文：插件通过它拿到 OneBot 客户端、设置和注册工具的能力。
//
// 设计原则：插件**不直接 import 宿主内部模块**，只用 ctx 暴露的东西。
// 这样以后宿主内部怎么重构，插件都不用改。
import { z } from 'zod';
import { makeClient, assertAllowed } from './onebot.js';
import { fetchImage, toBase64Url } from './media.js';
import { writeDiary, readDiary, listDiaryDates } from './diary.js';
import { synthesize, pruneTts } from './tts.js';

export function text(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

export function fail(error) {
  return { content: [{ type: 'text', text: `失败：${error?.message ?? error}` }], isError: true };
}

export function createPluginContext({ server, plugin, settings, pluginSettings }) {
  let cachedClient = null;
  const getClient = () => {
    if (!cachedClient) cachedClient = makeClient();
    return cachedClient;
  };

  return {
    // 元信息
    pluginId: plugin.id,
    pluginDir: plugin.dir,
    settings,             // 全局设置（DSH 设置页里的那些）
    pluginSettings,       // 本插件自己的设置（plugins/<id>/config.json）
    z,
    text,
    fail,

    // 宿主能力
    get client() { return getClient(); },
    get cfg() { return getClient().cfg; },
    get bridgeDir() { return getClient().dir; },
    assertAllowed(key) { return assertAllowed(getClient().cfg, key); },

    fetchImage,
    toBase64Url,
    diary: { write: writeDiary, read: readDiary, list: listDiaryDates },
    synthesize(ttsText, opts) { const c = getClient(); return synthesize(c.dir, c.cfg, ttsText, opts); },
    pruneTts,

    /** 注册一个 MCP 工具。schema 用 ctx.z 构造。 */
    tool(name, description, schema, handler) {
      server.tool(name, description, schema, handler);
    }
  };
}
