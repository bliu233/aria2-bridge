/* Aria2 Bridge —— 把 Firefox 的下载交给本机 aria2
 *
 * 关键点：这里刻意使用「经典后台脚本」（manifest 里没有 "type": "module"）。
 * 模块化的后台页在某些 Firefox 版本/配置下不会真正执行，而经典脚本稳定。
 *
 * 设置页：about:addons → Aria2 Bridge → 首选项（改完立即生效，不需要重启）
 */

const DEFAULT_CONFIG = {
  // aria2 JSON-RPC 地址。改了端口/主机的话，manifest.json 的 host_permissions 也要同步加一行
  rpcUrl: "http://127.0.0.1:6800/jsonrpc",
  // 与 aria2.conf 里的 rpc-secret 保持一致。
  // 故意留空：令牌属于个人凭据，不进代码仓库；首次安装后到设置页填一次即可。
  // （如果 aria2 没设 rpc-secret，这里保持空）
  secret: "",
  // 传空字符串 = 使用 aria2.conf 里配置的 dir（推荐）
  dir: "",
  // 是否接管浏览器下载（右键菜单不受这个开关影响）
  captureEnabled: true,
  // 小于该体积（MiB）的下载交回 Firefox；0 = 不过滤。注意 onCreated 阶段体积常常未知(-1)
  minSizeMiB: 0,
  // 不接管的站点（按主机名包含匹配，一行一个）
  excludeSites: [],
  // 不接管的后缀（按文件名结尾匹配，一行一个，例如 zip / pdf）
  excludeExts: [],
  // 是否发系统通知
  notify: true,
  // 是否把 Referer 转发给 aria2（部分站点防盗链需要）
  addReferer: true,
  // 是否把 Cookie 转发给 aria2（需要登录才能下载的站点需要）
  addCookies: true,
};

let cfg = Object.assign({}, DEFAULT_CONFIG);

/* ------------------------------------------------------------------ 基础工具 */

async function loadConfig() {
  const stored = await browser.storage.local.get("config");
  cfg = Object.assign({}, DEFAULT_CONFIG, stored.config || {});
  return cfg;
}

async function rpc(method, params) {
  const args = params || [];
  // 没设 secret 时不能带 token 参数，否则会被 aria2 当成真的请求参数而报错
  const withToken = cfg.secret ? ["token:" + cfg.secret].concat(args) : args;
  const res = await fetch(cfg.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: String(Date.now()),
      method: method,
      params: withToken,
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

function notify(message) {
  if (!cfg.notify) return;
  try {
    // 注意：不传 iconUrl，用扩展默认图标。
    // （官方扩展写的相对路径 "../icons/..." 在后台页里会解析失败，导致通知静默消失）
    browser.notifications.create({
      type: "basic",
      title: "Aria2 Bridge",
      message: message,
    }).catch(function (e) {
      console.error("[bridge] 通知失败:", e && e.message);
    });
  } catch (e) {
    console.error("[bridge] 通知失败:", e && e.message);
  }
}

function basename(path) {
  if (!path) return "";
  const parts = path.split("/");
  return parts[parts.length - 1];
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

/* -------------------------------------------------------------- 排除规则判断 */

function shouldCapture(item) {
  if (!/^https?:/i.test(item.url)) return false;

  const host = hostnameOf(item.url).toLowerCase();
  for (const site of cfg.excludeSites) {
    const s = String(site).trim().toLowerCase();
    if (s && host.indexOf(s) !== -1) return false;
  }

  const name = basename(item.filename).toLowerCase();
  for (const ext of cfg.excludeExts) {
    const e = String(ext).trim().toLowerCase().replace(/^\./, "");
    if (e && name.endsWith("." + e)) return false;
  }

  const minBytes = Number(cfg.minSizeMiB) * 1024 * 1024;
  if (minBytes > 0 && item.totalBytes > 0 && item.totalBytes < minBytes) return false;

  return true;
}

/* ------------------------------------------------------------------ 交给 aria2 */

/*
 * 取某个 URL 的 cookie。原则：尽量拿到；拿不到就返回空串，绝不让它影响抓取本身。
 *
 * 三种取法合并去重：
 *  1) 常规（不传 firstPartyDomain）—— FPI 关闭时最省事；
 *  2) 显式传 firstPartyDomain: null —— FPI（privacy.firstparty.isolate=true）打开时，
 *     cookies.getAll 不带这个键会直接抛 "First-Party Isolation is enabled, but the required
 *     'firstPartyDomain' attribute was not set."；按 Firefox schema 的说明，显式传 null/undefined
 *     表示"不按第一方域过滤"，而且只要这个键存在就会跳过该校验；
 *  3) 带 partitionKey.topLevelSite = referrer 的 origin —— dFPI（默认的总 Cookie 保护）会把第三方
 *     cookie 按 top-level site 分区，这样能一并取到。
 */
async function getAllCookies(url, storeId, referer) {
  const base = storeId ? { url: url, storeId: storeId } : { url: url };
  const queries = [base, Object.assign({}, base, { firstPartyDomain: null })];

  try {
    if (referer && /^https?:/i.test(referer)) {
      queries.push(Object.assign({}, base, { partitionKey: { topLevelSite: new URL(referer).origin } }));
    }
  } catch (e) {
    // referer 不是合法 URL，跳过这一种取法
  }

  const seen = {};
  const out = [];
  for (const query of queries) {
    try {
      const list = await browser.cookies.getAll(query);
      for (const c of list) {
        const key = c.name + "|" + c.value + "|" + c.domain + "|" + c.path;
        if (!seen[key]) {
          seen[key] = true;
          out.push(c);
        }
      }
    } catch (e) {
      console.debug("[bridge] cookies.getAll 的一种取法失败（继续试其它）:", e && e.message);
    }
  }
  return out;
}

async function cookieHeader(url, storeId, referer) {
  const cookies = await getAllCookies(url, storeId, referer);
  return cookies.map(function (c) { return c.name + "=" + c.value; }).join("; ");
}

async function buildOptions(item, referer, storeId) {
  const options = {};
  const name = basename(item.filename);
  if (name) options.out = name;
  if (cfg.dir) options.dir = cfg.dir;

  const headers = [];
  if (cfg.addReferer && referer) headers.push("Referer: " + referer);
  if (cfg.addCookies) {
    const cookies = await cookieHeader(item.url, storeId, referer);
    if (cookies) headers.push("Cookie: " + cookies);
  }
  if (headers.length > 0) options.header = headers;

  return options;
}

async function sendToAria2(url, item, referer, storeId) {
  const options = await buildOptions(item, referer, storeId);
  const gid = await rpc("aria2.addUri", [[url], options]);
  return gid;
}

async function dropFirefoxDownload(id) {
  try { await browser.downloads.cancel(id); } catch (e) { /* 可能已下完 */ }
  try { await browser.downloads.removeFile(id); } catch (e) { /* 文件可能已不在 */ }
  try { await browser.downloads.erase({ id: id }); } catch (e) { /* 忽略 */ }
}

/* --------------------------------------------------------- 接管浏览器下载 */

browser.downloads.onCreated.addListener(async function (item) {
  if (!cfg.captureEnabled) return;
  if (!shouldCapture(item)) {
    console.log("[bridge] 放行给 Firefox:", item.url.slice(0, 80));
    return;
  }

  const name = basename(item.filename);
  try {
    const gid = await sendToAria2(item.url, item, item.referrer || "", undefined);
    console.log("[bridge] 已提交 aria2, gid =", gid, "|", name || item.url);
    notify(name ? "已交给 aria2：" + name : "已交给 aria2");
    await dropFirefoxDownload(item.id);
  } catch (err) {
    console.error("[bridge] 提交失败:", err && err.message);
    notify("提交 aria2 失败：" + (err && err.message));
  }
});

/* ------------------------------------------------------------ 右键菜单 */

function setupMenus() {
  browser.contextMenus.removeAll().then(function () {
    browser.contextMenus.create({
      id: "aria2-send",
      title: "用 Aria2 下载",
      contexts: ["link", "selection"],
    });
  }).catch(function (e) {
    console.error("[bridge] 创建右键菜单失败:", e && e.message);
  });
}

browser.contextMenus.onClicked.addListener(async function (info, tab) {
  const urls = [];
  if (info.linkUrl) {
    urls.push(info.linkUrl);
  } else if (info.selectionText) {
    info.selectionText.split(/\s+/).forEach(function (u) {
      if (/^https?:\/\//i.test(u)) urls.push(u);
    });
  }
  if (urls.length === 0) return;

  const referer = (tab && tab.url) || info.pageUrl || "";
  const storeId = tab && tab.cookieStoreId;

  for (const url of urls) {
    try {
      const fakeItem = { url: url, filename: "", totalBytes: -1 };
      const gid = await sendToAria2(url, fakeItem, referer, storeId);
      console.log("[bridge] 右键发送成功, gid =", gid, "|", url);
      notify("已交给 aria2：" + url);
    } catch (err) {
      console.error("[bridge] 右键发送失败:", err && err.message);
      notify("提交 aria2 失败：" + (err && err.message));
    }
  }
});

/* ------------------------------------------------------- 快捷键：切换接管 */

// 这里刻意不写 suggested_key —— 免得像官方那样被 Firefox 内置快捷键（Ctrl+Shift+D = 书签）
// 抢走。请到 about:addons → 齿轮 ⚙ → 管理扩展快捷键 里自己指派一个键。
if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async function (command) {
    if (command !== "toggle-capture") return;
    cfg.captureEnabled = !cfg.captureEnabled;
    await browser.storage.local.set({ config: cfg });
    console.log("[bridge] 接管下载 =", cfg.captureEnabled);
    notify(cfg.captureEnabled ? "已开启：接管浏览器下载" : "已关闭：下载交回 Firefox");
  });
}

/* ------------------------------------------------------- 配置变更/启动 */

browser.storage.onChanged.addListener(async function (changes) {
  if (changes.config) {
    await loadConfig();
    setupMenus();
    console.log("[bridge] 配置已更新:", cfg);
  }
});

browser.runtime.onInstalled.addListener(async function () {
  await loadConfig();
  setupMenus();
  console.log("[bridge] 已安装/更新，配置 =", cfg);
});

browser.runtime.onStartup.addListener(async function () {
  await loadConfig();
  setupMenus();
});

(async function main() {
  await loadConfig();
  setupMenus();
  console.log("[bridge] 后台脚本已启动（经典脚本）| RPC =", cfg.rpcUrl, "| 接管下载 =", cfg.captureEnabled);
})();
