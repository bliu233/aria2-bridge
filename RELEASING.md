# 发布流程

> 前提：`browser_specific_settings.gecko.id`（`{91ad8691-3c13-4a45-ad44-4a5badc293d6}`）**永不改动**。
> manifest 里**不要**写 `update_url`：版本经 AMO 签名后，更新由 AMO 负责，
> AMO 校验器会以 *"not allowed for Mozilla-hosted add-ons"* 直接拒绝。

## 每次发版（照做即可）

1. 改代码
2. `manifest.json` 的 `version` **+0.1**（必须递增：AMO 靠它区分版本，Firefox 也靠它判断新旧）
3. `./build.sh` → 生成 `dist/aria2-bridge-<版本>.xpi`
4. 提交 + 打 tag + 推送

   ```bash
   git commit -am "feat: ..."
   git tag v<版本>
   git push && git push --tags
   ```

5. AMO → 该附加组件 → **上传新版本** → 传上一步的 xpi → 等签名 → **下载签名后的 xpi**
6. 安装（已在用旧版的话，直接装即为升级；`storage.local` 会保留，**不用重填 secret**）
7. （可选，但推荐）建 GitHub Release：tag 选 `v<版本>`，附件 = 第 5 步那个**签名 xpi**。
   这样别的机器/别人要装时有个直接下载入口（AMO 的签名文件只有你自己在后台能下）

## 更新是怎么来的

- **AMO 负责更新通道**：装的是 AMO 签名的版本，Firefox 会按自己的节奏去 AMO 检查新版本
  （最长约一天一次；`about:addons` → 齿轮 ⚙ → **检查更新** 可手动触发）
- 也可以随时从 GitHub Release 下载签名 xpi 手动安装，效果一样
- 不建议、也**不允许**用 `update_url` 自建更新源（校验器会拒绝），所以仓库里不再有 `updates.json`

## 不要做的事

- **不要改 add-on ID**：改了就成了另一个扩展，用户数据与更新链全部断开
- **不要写 `update_url`**：AMO 会拒绝（见上）
- **不要把 xpi 提交进 git**：`dist/` 已忽略，分发走 Release 附件
- **不要把 `rpc-secret` 写进代码**：令牌只存在扩展的设置页（`storage.local`）里
