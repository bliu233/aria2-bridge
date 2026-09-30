# 发布流程

> 前提：`browser_specific_settings.gecko.id`（`{91ad8691-3c13-4a45-ad44-4a5badc293d6}`）**永不改动**；
> `browser_specific_settings.gecko.update_url` 指向本仓库的 `updates.json`。

## 每次发版（照做即可）

1. 改代码
2. `manifest.json` 的 `version` **+0.1**（必须递增：AMO 靠它区分版本，自动更新也靠它比较新旧）
3. `./build.sh` → 生成 `dist/aria2-bridge-<版本>.xpi`
4. 提交 + 打 tag + 推送

   ```bash
   git commit -am "feat: ..."
   git tag v<版本>
   git push && git push --tags
   ```

5. AMO → 该附加组件 → **上传新版本** → 传上一步的 xpi → 等签名 → **下载签名后的 xpi**
6. 安装（已在用旧版的话，直接装即为升级；`storage.local` 会保留，**不用重填 secret**）
7. **建/更新 GitHub Release**：tag 选 `v<版本>`，附件 = 第 5 步那个**签名 xpi**，
   文件名保持 **`aria2-bridge-<版本>.xpi`**（`updates.json` 里的 URL 依赖这个文件名）
8. **更新 `updates.json`**：把新版本条目加进 `updates` 数组（旧条目留不留都行）

   ```json
   {
     "version": "1.10",
     "update_link": "https://github.com/bliu233/aria2-bridge/releases/download/v1.10/aria2-bridge-1.10.xpi",
     "applications": { "gecko": { "strict_min_version": "142.0" } }
   }
   ```

   可选但推荐：加上 `"update_hash": "sha256:<签名 xpi 的 sha256>"`（算：`sha256sum aria2-bridge-<版本>.xpi`）

9. 提交 `updates.json`

   ```bash
   git commit -am "chore: updates.json → v<版本>" && git push
   ```

## 自动更新怎么生效（几个容易踩的点）

- Firefox 只读**已安装版本 manifest 里**的 `update_url` → 所以 **1.9 及以后**才有自动更新能力；
  **1.8 及更早必须手动装一次**（这也是一次性的迁移成本）
- 检查地址：`https://raw.githubusercontent.com/bliu233/aria2-bridge/main/updates.json`
  （Firefox 通常最长约一天查一次；`about:addons` → 齿轮 ⚙ → **检查更新** 可手动触发）
- `update_link` 指向的必须是**已签名**的 xpi，且 `version` 必须**高于**当前安装版本，否则更新会被拒绝
- 如果哪天 raw 链接不好使，可换成 jsDelivr：
  `https://cdn.jsdelivr.net/gh/bliu233/aria2-bridge@main/updates.json`
  （换 `update_url` 属于改 manifest，需要发一个新版本才生效）

## 不要做的事

- **不要改 add-on ID**：改了就成了另一个扩展，用户数据与更新链全部断开
- **不要把 xpi 提交进 git**：`dist/` 已忽略，分发走 Release 附件
- **不要把 `rpc-secret` 写进代码**：令牌只存在扩展的设置页（`storage.local`）里
