/* Aria2 Bridge 设置页（经典脚本，无构建步骤）
 * 注意：这里的 DEFAULT_CONFIG 要和 background.js 里保持一致（改一处记得改两处）。
 */

const DEFAULT_CONFIG = {
  rpcUrl: "http://127.0.0.1:6800/jsonrpc",
  // 令牌不进仓库：首次安装后在设置页填一次（与 aria2.conf 的 rpc-secret 一致）
  secret: "",
  dir: "",
  captureEnabled: true,
  minSizeMiB: 0,
  excludeSites: [],
  excludeExts: [],
  notify: true,
  addReferer: true,
  addCookies: true,
};

function el(id) {
  return document.getElementById(id);
}

function setStatus(text) {
  el("status").textContent = text;
}

function linesToArray(text) {
  return text
    .split("\n")
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

async function load() {
  const stored = await browser.storage.local.get("config");
  const c = Object.assign({}, DEFAULT_CONFIG, stored.config || {});

  el("rpcUrl").value = c.rpcUrl;
  el("secret").value = c.secret;
  el("dir").value = c.dir;
  el("captureEnabled").checked = !!c.captureEnabled;
  el("notify").checked = !!c.notify;
  el("addReferer").checked = !!c.addReferer;
  el("addCookies").checked = !!c.addCookies;
  el("minSizeMiB").value = c.minSizeMiB;
  el("excludeSites").value = (c.excludeSites || []).join("\n");
  el("excludeExts").value = (c.excludeExts || []).join("\n");
}

function collect() {
  return {
    rpcUrl: el("rpcUrl").value.trim() || DEFAULT_CONFIG.rpcUrl,
    secret: el("secret").value.trim(),
    dir: el("dir").value.trim(),
    captureEnabled: el("captureEnabled").checked,
    notify: el("notify").checked,
    addReferer: el("addReferer").checked,
    addCookies: el("addCookies").checked,
    minSizeMiB: Number(el("minSizeMiB").value) || 0,
    excludeSites: linesToArray(el("excludeSites").value),
    excludeExts: linesToArray(el("excludeExts").value),
  };
}

async function testConnection() {
  const c = collect();
  setStatus("测试中…");
  try {
    const res = await fetch(c.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "test",
        method: "aria2.getVersion",
        params: c.secret ? ["token:" + c.secret] : [],
      }),
    });
    const json = await res.json();
    if (json.error) {
      setStatus("失败：" + (json.error.message || "未知错误") + "（检查 secret 是否一致）");
    } else {
      setStatus("OK，aria2 版本 " + json.result.version);
    }
  } catch (e) {
    setStatus("失败：" + (e && e.message) + "（aria2 在跑吗？地址/端口对吗？）");
  }
}

el("save").addEventListener("click", async function () {
  await browser.storage.local.set({ config: collect() });
  setStatus("已保存 ✓");
  setTimeout(function () { setStatus(""); }, 2500);
});

el("test").addEventListener("click", testConnection);

load();
