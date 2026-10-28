#!/usr/bin/env node
// 客户端 bundle 的离线冒烟：不启动浏览器，只验证
//   1. 文件能在 __ModuleLoader__ 协议下解析
//   2. apply(ctx) 会往 settings.section 注册页面
//   3. read() 能从 configForms.describe()（mirror store）里挑出本套件命名空间
//   4. save(ns, key, value) 会调到 form.set
// 用法：node scripts/client-smoke-test.mjs [client.js 路径]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] || path.join(__dirname, '..', 'lib', 'client.js');
const code = fs.readFileSync(target, 'utf8');

let captured = null;
const sandbox = {
  window: { __ModuleLoader__: { load(def) { captured = def; } } },
  console, Symbol, Object, Array, String, Number, JSON, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: target });

function assert(cond, msg) {
  if (!cond) { console.error(`❌ ${msg}`); process.exit(1); }
  console.log(`✅ ${msg}`);
}

assert(captured, 'window.__ModuleLoader__.load 被调用');
assert(captured.id === 'dsh-qq-kit', `模块 id = ${captured.id}`);

const requireStub = (id) => {
  if (id === 'react') {
    return {
      createElement: (...args) => ({ type: args[0], props: args[1] ?? {} }),
      useState: (v) => [v, () => {}],
      useEffect: () => {}
    };
  }
  throw new Error(`未预期的依赖：${id}`);
};

const mod = captured.factory(requireStub);
assert(typeof mod.apply === 'function', '导出 apply');
assert(Array.isArray(mod.inject), `inject = ${JSON.stringify(mod.inject)}`);

// 真实结构：schema 是 {uid, refs} 引用树，根节点在 refs[uid]
const namespaces = [
  {
    ns: 'qq-extras',
    schema: { uid: '10', refs: { 10: { type: 'object', dict: { disabledPlugins: '11' }, meta: {} }, 11: { type: 'string', meta: { description: '停用的插件' } } } },
    value: { disabledPlugins: '[]' }
  },
  {
    ns: 'qqplug-qq-image',
    schema: { uid: '20', refs: { 20: { type: 'object', dict: { maxBytes: '21' }, meta: {} }, 21: { type: 'number', meta: { description: '单张图片上限' } } } },
    value: { maxBytes: 8388608 }
  },
  { ns: 'unrelated-ns', schema: { uid: '30', refs: { 30: { type: 'object', dict: {}, meta: {} } } }, value: {} }
];

const registered = [];
const setCalls = [];
const ctx = {
  effect: (fn) => fn(),
  locale: { register: () => {}, bind: () => (k) => k },
  slots: {
    inject: (name, fn) => fn(),
    register: (meta, component) => { registered.push({ meta, component }); return () => {}; }
  },
  configForms: {
    // describe() 返回的是 mirror store（不是纯数据）
    describe: () => ({ getSnapshot: () => ({ view: { namespaces } }) }),
    get: (ns) => ({
      set: async (key, value) => { setCalls.push({ ns, key, value }); return true; }
    })
  }
};

mod.apply(ctx);

assert(registered.length === 1, `注册了 ${registered.length} 个设置节`);
const { meta, component } = registered[0];
assert(meta.name === 'settings.section', `插槽 = ${meta.name}`);
assert(meta.id === 'qq-kit', `id = ${meta.id}`);
assert(typeof meta.label === 'function', '有 label 函数');
assert(typeof meta.inject === 'function', '有 inject 函数');

const face = meta.inject();
assert(typeof face.read === 'function', 'inject 提供 read');
assert(typeof face.save === 'function', 'inject 提供 save');
assert(typeof component === 'function', '注册了组件');

const rows = face.read();
console.log('   读到命名空间:', rows.map((r) => r.ns).join(', '));
assert(rows.length === 2, `只挑出 2 个本套件命名空间（实际 ${rows.length}）`);
assert(rows[0].ns === 'qq-extras', '全局命名空间排在最前');
assert(rows.every((r) => r.ns !== 'unrelated-ns'), '没有混入无关命名空间');
assert(rows[1].title.includes('发图片'), `卡片标题取 schema 描述：${rows[1].title}`);

await face.save('qqplug-qq-image', 'maxBytes', 1048576);
assert(setCalls.length === 1 && setCalls[0].key === 'maxBytes', 'save 调到了 form.set');

// 字段解析（之前空白的根因）：uid/refs 树要能取到字段
const fields = mod.__test.fieldsOf(namespaces[1].schema);
console.log('   解析到字段:', JSON.stringify(fields));
assert(fields.length === 1 && fields[0].key === 'maxBytes', '字段解析正确');
assert(fields[0].label === '单张图片上限', `字段标签取 meta.description：${fields[0].label}`);

console.log('\n✅ 客户端 bundle 冒烟通过');
