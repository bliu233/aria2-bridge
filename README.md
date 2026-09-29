# Aria2 Bridge

把 Firefox 的下载交给本机（或局域网内）的 **aria2**，通过 aria2 的 JSON-RPC 接口添加任务。
纯手写明文代码，**没有构建步骤**（`build.sh` 只是把文件打包成 xpi，不做任何代码生成/压缩）。

## 为什么会有这个

官方扩展 [Aria2 Integration](https://github.com/baptistecdr/aria2-integration)（MIT）功能更全，但在本机
（Firefox 153.3.0 / Linux）**后台脚本从不生效**：下载不被接管、右键菜单点了没反应、快捷键无通知，
而同一环境下把后台换成**经典脚本**（`"background": {"scripts": [...]}`，不带 `"type": "module"`）就一切正常。
本扩展是这个对照实验的产物，顺便只保留了自用需要的功能。

## 安装

### A. 临时载入（测试用，Firefox 重启后消失）

1. `about:debugging#/runtime/this-firefox` → **临时载入附加组件**
2. 选择本目录的 `manifest.json`（或 `dist/*.xpi`）
3. 可在该页点 **检查 → 控制台** 看日志，启动成功会打印：
   `[bridge] 后台脚本已启动（经典脚本）| RPC = … | 接管下载 = true`

### B. 签名后常驻（推荐）

1. 打包：`./build.sh` → 生成 `dist/aria2-bridge-<版本>.xpi`
2. 打开 <https://addons.mozilla.org/developers/> → **提交新附加组件** → 选 **自己分发 / On your own**
3. 上传 xpi，等自动签名（通常几分钟），下载签名后的 xpi 正常安装即可（可长期保留、可更新）
4. 以后改动：**版本号 +1** 后重新打包上传；同一个 `browser_specific_settings.gecko.id` + 更高版本号 = 一次升级

## 首次配置（重要）

令牌不写在代码里（避免进仓库/进包），所以**装完必须填一次**：

`about:addons` → Aria2 Bridge → **首选项** → 填 `RPC secret`（= `aria2.conf` 里的 `rpc-secret`）
→ 点 **测试连接**（应显示 aria2 版本号）→ 保存。

## 设置项

| 项 | 说明 |
|---|---|
| JSON-RPC 地址 | 默认 `http://127.0.0.1:6800/jsonrpc`。换主机/端口时，`manifest.json` 的 `host_permissions` 也要加一条 |
| RPC secret | 与 `aria2.conf` 的 `rpc-secret` 一致；aria2 没设就留空 |
| 下载目录 | 留空 = 用 `aria2.conf` 的 `dir`；填了会随每个任务下发，覆盖它 |
| 接管浏览器下载 | 关掉后下载交回 Firefox（右键菜单不受影响） |
| 显示系统通知 | 成功/失败都会通知 |
| 转发 Referer / Cookie | 防盗链、需登录的站点需要 |
| 最小文件大小 | 小于该值（MiB）的交回 Firefox；下载刚开始体积常常未知，小文件可能仍被接管 |
| 排除站点 / 排除后缀 | 命中就不接管，交给 Firefox |
| 快捷键 | 在 `about:addons` → ⚙ → **管理扩展快捷键** 里自行指派（manifest 不写 `suggested_key`，避免被浏览器内置键占用） |

连接数、缓存、代理、UA 这些**都在 `aria2.conf` 里调**（本扩展只管"把任务交给谁"和"哪些不接"）。

## 行为说明

- 只处理 `http:` / `https:`；`blob:` / `data:` / `file:` 一律放行给 Firefox（aria2 下不了这些）
- 接管成功时会 `cancel` → `removeFile` → `erase`，即**Firefox 下载列表里那条会消失**，文件由 aria2 下到 `dir`
- 右键菜单「用 Aria2 下载」对链接和选中文本都可用（选中多行 URL 会逐条添加）

## 已知限制

- **不支持 Firefox for Android**：`downloads` API 自 Firefox for Android 79 起已被移除，本扩展的核心功能在安卓上不存在
- 体积过滤只在 `totalBytes` 已知时生效（`onCreated` 阶段常常是 -1）

## 文件

```
manifest.json   background.js   options.html   options.js   LICENSE
build.sh    # 仅打包成 xpi（不含任何代码生成/压缩）
```

## 许可

MIT，见 [LICENSE](LICENSE)。
