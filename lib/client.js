// dsh-qq-kit 的浏览器端插件：在 DSH「设置」左侧新增「QQ 增强套件」设置项。
//
// 这个文件不经过打包：DSH 的客户端插件就是一个
// `window.__ModuleLoader__.load({ id, factory })` 脚本，factory 里用 require 取
// react，导出 apply(ctx) 即可。
//
// 关键事实（踩过坑）：
//   1. ctx.configForms.describe() 返回 **mirror store**，数据在 getSnapshot().view.namespaces
//   2. 每个命名空间的 schema 是 **{uid, refs} 引用树**：根节点 = refs[uid]，
//      字段 = refs[root.dict[key]]；顶层没有 type/dict/meta
//   3. 插槽的 inject 返回普通函数即可当 props；hooks 走 `use` + 首字母大写映射，
//      这里不用 hooks，改成 read/save 函数 + 组件内 state
window.__ModuleLoader__.load({
  id: "dsh-qq-kit",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const react = require("react");
    const h = react.createElement;

    const GLOBAL_NS = "qq-extras";
    const PLUGIN_PREFIX = "qqplug-";
    const isOurs = (ns) => ns === GLOBAL_NS || String(ns).startsWith(PLUGIN_PREFIX);

    // 内置插件的中文名（设置页没有别的来源，只能静态映射；未知的插件回落到 id）
    const PLUGIN_NAMES = {
      "qq-image": "发图片",
      "qq-avatar": "换头像",
      "qq-voice": "语音条",
      "qq-qzone": "QQ 空间",
      "qq-diary": "日记",
      "qq-sticker": "表情收藏",
      "qq-group": "群管理",
      "qq-imagesearch": "图片搜索"
    };
    const pluginIdOf = (ns) => String(ns).replace(PLUGIN_PREFIX, "");
    const titleOf = (ns) => {
      if (ns === GLOBAL_NS) return "全局设置";
      const id = pluginIdOf(ns);
      return PLUGIN_NAMES[id] ? `${PLUGIN_NAMES[id]}（${id}）` : id;
    };

    const CSS = `
.qqkit-section{max-width:760px;display:flex;flex-direction:column;gap:12px;color:var(--dsw-alias-label-primary)}
.qqkit-heading{margin:0;font-size:18px;font-weight:600}
.qqkit-intro{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:20px}
.qqkit-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.qqkit-card[data-off=true]{opacity:.55}
.qqkit-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.qqkit-card-title{margin:0;font-size:14px;font-weight:600}
.qqkit-ns{font-size:11px;color:var(--dsw-alias-label-tertiary);font-family:ui-monospace,monospace}
.qqkit-row{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:13px;line-height:20px}
.qqkit-row-label{color:var(--dsw-alias-label-secondary)}
.qqkit-input{background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 8px;font:inherit;font-size:13px;color:inherit;min-width:180px}
.qqkit-empty{font-size:13px;color:var(--dsw-alias-label-tertiary)}
.qqkit-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.qqkit-foot{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:10px;font-size:12px;color:var(--dsw-alias-label-tertiary);display:flex;flex-direction:column;gap:4px}
.qqkit-code{font-family:ui-monospace,monospace;background:var(--dsw-alias-bg-l2,rgba(127,127,127,.08));padding:2px 6px;border-radius:4px;user-select:all}
`;

    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="dsh-qq-kit"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-qq-kit";
      tag.dataset.pluginCss = "dsh-qq-kit";
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ── schema（uid/refs 引用树）───────────────────────────────────────────
    function rootOf(schema) {
      if (!schema) return null;
      if (schema.refs && schema.uid != null) return schema.refs[schema.uid] ?? null;
      return schema;
    }

    function fieldsOf(schema) {
      const root = rootOf(schema);
      if (!root || root.type !== "object" || !root.dict) return [];
      return Object.keys(root.dict).map((key) => {
        const node = schema.refs?.[root.dict[key]] ?? {};
        const meta = node.meta ?? {};
        let options = null;
        if (node.type === "union" && Array.isArray(node.list)) {
          options = node.list
            .map((uid) => schema.refs?.[uid])
            .filter((n) => n && n.type === "const")
            .map((n) => n.value);
        }
        return {
          key,
          type: node.type ?? "string",
          label: meta.description ?? meta.title ?? key,
          options
        };
      });
    }

    function readNamespaces(configForms) {
      try {
        const described = configForms.describe();
        const snapshot =
          (typeof described?.getSnapshot === "function" ? described.getSnapshot() : null) ?? described;
        return snapshot?.view?.namespaces ?? snapshot?.namespaces ?? (Array.isArray(snapshot) ? snapshot : []);
      } catch {
        return [];
      }
    }

    function buildRows(configForms) {
      return readNamespaces(configForms)
        .filter((n) => n && isOurs(n.ns))
        .map((n) => ({
          ns: n.ns,
          title: titleOf(n.ns),
          schema: n.schema ?? null,
          value: n.value ?? {}
        }))
        .sort((a, b) => (a.ns === GLOBAL_NS ? -1 : b.ns === GLOBAL_NS ? 1 : a.ns.localeCompare(b.ns)));
    }

    // disabledPlugins 存成 JSON 字符串（schemastery 只给了 string 字段）
    function parseDisabled(value) {
      try {
        const raw = value?.disabledPlugins;
        if (Array.isArray(raw)) return raw.map(String);
        if (typeof raw === "string" && raw.trim()) return JSON.parse(raw).map(String);
      } catch {
        /* 解析失败当空 */
      }
      return [];
    }

    function widgetFor({ field, value, onChange }) {
      if (field.options && field.options.length) {
        return h(
          "select",
          { className: "qqkit-input", value: String(value ?? ""), onChange: (e) => onChange(e.target.value) },
          field.options.map((opt) => h("option", { key: String(opt), value: String(opt) }, String(opt)))
        );
      }
      if (field.type === "boolean") {
        return h("input", { type: "checkbox", checked: value === true, onChange: (e) => onChange(e.target.checked) });
      }
      if (field.type === "number") {
        return h("input", {
          className: "qqkit-input",
          type: "number",
          value: value ?? "",
          onChange: (e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }
        });
      }
      return h("input", {
        className: "qqkit-input",
        type: "text",
        value: value ?? "",
        onChange: (e) => onChange(e.target.value)
      });
    }

    function PluginCard({ row, save, disabled, onToggle }) {
      const fields = fieldsOf(row.schema);
      return h(
        "section",
        { className: "qqkit-card", "data-off": String(disabled) },
        h(
          "div",
          { className: "qqkit-card-head" },
          h("h3", { className: "qqkit-card-title" }, row.title),
          onToggle
            ? h(
                "label",
                { className: "qqkit-toggle" },
                h("input", { type: "checkbox", checked: !disabled, onChange: (e) => onToggle(e.target.checked) }),
                "启用"
              )
            : h("span", { className: "qqkit-ns" }, row.ns)
        ),
        fields.length === 0
          ? h("p", { className: "qqkit-empty" }, "这个插件没有可调的设置项。")
          : fields.map((field) =>
              h(
                "label",
                { className: "qqkit-row", key: field.key },
                h("span", { className: "qqkit-row-label" }, field.label),
                widgetFor({ field, value: row.value?.[field.key], onChange: (v) => save(row.ns, field.key, v) })
              )
            )
      );
    }

    function QqKitSection({ read, save, reload, t }) {
      const [rows, setRows] = react.useState([]);
      const [notice, setNotice] = react.useState("");
      const refresh = () => setRows(read());

      react.useEffect(() => {
        refresh();
        let ticks = 0;
        const timer = setInterval(() => {
          ticks += 1;
          refresh();
          if (ticks >= 5) clearInterval(timer);
        }, 800);
        return () => clearInterval(timer);
      }, []);

      const globalRow = rows.find((r) => r.ns === GLOBAL_NS) ?? null;
      const pluginRows = rows.filter((r) => r.ns !== GLOBAL_NS);
      const disabled = parseDisabled(globalRow?.value);

      const onSave = async (ns, key, value) => {
        try {
          await save(ns, key, value);
          refresh();
          setNotice(t("saved"));
        } catch (error) {
          setNotice(`${t("failed")}：${String(error?.message ?? error)}`);
        }
      };

      const onToggle = async (ns, enabled) => {
        const id = pluginIdOf(ns);
        const next = disabled.filter((x) => x !== id);
        if (!enabled) next.push(id);
        await onSave(GLOBAL_NS, "disabledPlugins", JSON.stringify(next));
      };

      return h(
        "div",
        { className: "qqkit-section" },
        h("h2", { className: "qqkit-heading" }, t("title")),
        h("p", { className: "qqkit-intro" }, t("intro")),
        rows.length === 0
          ? h(
              "div",
              { className: "qqkit-actions" },
              h("span", { className: "qqkit-empty" }, t("empty")),
              h("button", { className: "qqkit-button", onClick: refresh }, t("reload"))
            )
          : [
              globalRow
                ? h(PluginCard, {
                    key: GLOBAL_NS,
                    row: globalRow,
                    save: onSave,
                    disabled: false,
                    onToggle: null
                  })
                : null,
              ...pluginRows.map((row) =>
                h(PluginCard, {
                  key: row.ns,
                  row,
                  save: onSave,
                  disabled: disabled.includes(pluginIdOf(row.ns)),
                  onToggle: (enabled) => onToggle(row.ns, enabled)
                })
              )
            ],
        h(
          "div",
          { className: "qqkit-foot" },
          h("span", null, t("footSave")),
          h("span", null, t("footInstall")),
          h("span", null, h("code", { className: "qqkit-code" }, "node scripts/qqkit.mjs add ./my-plugin")),
          h("span", null, h("code", { className: "qqkit-code" }, "node scripts/qqkit.mjs list"))
        ),
        notice ? h("p", { className: "qqkit-empty" }, notice) : null
      );
    }

    // ── 安装 ───────────────────────────────────────────────────────────────
    const inject = ["slots", "locale", "configForms"];

    function apply(ctx) {
      const LOCALE = "settings.qqKit";
      ctx.effect(() =>
        ctx.locale.register(LOCALE, {
          en: {
            nav: "QQ Enhancements",
            title: "QQ Enhancements",
            intro: "Settings for QQ bot plugins. Saved immediately; restart DSH to apply tool registration.",
            empty: "No QQ plugin settings found. Make sure dsh-qq-kit is installed, then restart DSH.",
            reload: "Reload",
            saved: "Saved",
            failed: "Save failed",
            footSave: "Toggling a plugin off takes effect after restarting DSH.",
            footInstall: "To install a third-party plugin, run (in the dsh-qq-kit directory):"
          },
          zh: {
            nav: "QQ 增强套件",
            title: "QQ 增强套件",
            intro: "QQ 机器人插件的设置。改动即时保存；工具列表在 DSH 启动时注册，所以要重启 DSH 才生效。",
            empty: "没有找到本套件的设置项。确认已安装 dsh-qq-kit，然后重启 DSH。",
            reload: "重新读取",
            saved: "已保存",
            failed: "保存失败",
            footSave: "停用插件后需要重启 DSH 生效。",
            footInstall: "安装第三方插件：在 dsh-qq-kit 目录执行"
          }
        })
      );

      const read = () => buildRows(ctx.configForms);

      const save = async (ns, key, value) => {
        const form = ctx.configForms.get(ns);
        if (!form) throw new Error(`找不到设置命名空间 ${ns}`);
        await form.set(key, value);
      };

      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "qq-kit",
            order: 15,
            label: () => ctx.locale.bind(LOCALE)("nav"),
            locale: LOCALE,
            inject: () => ({ read, save, reload: read })
          },
          QqKitSection
        )
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    // 给离线测试用（浏览器里无副作用）
    exports.__test = { fieldsOf, buildRows, titleOf };
    return module.exports;
  }
});
