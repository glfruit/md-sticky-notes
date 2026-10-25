# 发布 Runbook

发布 = 打 tag → CI 自动构建 → draft release 人工放行。本 runbook 适用于所有平台版本
（0.1.0 macOS 首发、0.2.0 Windows……），签名模式按 secrets 状态自动切换，无需改流程。

> 签名模式现状（2026-10-23）：**ad-hoc 模式**（未配置 Apple 付费证书，产物 ad-hoc 签名，
> macOS 用户首次打开需手动放行）；updater 的 minisign 密钥已配置。
> 配置 `APPLE_CERTIFICATE` 等 secrets 后自动升级为 Developer ID + 公证（见 ADR-0002），
> 届时第 3 步校验会自动加严，流程不变。

## 0. 前置检查

- [ ] `main` 分支干净、已推送、[test workflow](https://github.com/glfruit/md-sticky-notes/actions) 绿
- [ ] `src-tauri/tauri.conf.json` 的 `version` 已改为目标版本（发布唯一真源）
- [ ] 本次版本的更新内容已记录（写 Release 说明时用）

## 1. 打 tag 触发构建

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## 2. 等待 CI（约 5–8 分钟，macOS runner 高峰期可能排队）

- [ ] [release workflow](https://github.com/glfruit/md-sticky-notes/actions) 绿（两条矩阵腿：arm64、x64）
- [ ] Releases 页出现 **draft release**，资产齐全：
  - `latest.json`
  - `MD-Sticky-Notes_<版本>_aarch64.dmg` / `_x64.dmg`
  - `…_aarch64.app.tar.gz` + `.sig` / `…_x64.app.tar.gz` + `.sig`
  - （0.2.0 起另有 Windows `-setup.exe`，票 08 接入）

## 3. 发布前校验清单

- [ ] 下载 aarch64 DMG → 挂载 → 拖进「应用程序」→ 打开（首次按 README 指引放行）→ 新建/编辑便签正常
- [ ] x64 DMG 同样过一遍（无 Intel 机器时请一位 Intel 用户代验）
- [ ] `latest.json` 内容：`version` 与 tag 一致、两个平台条目都带 `signature`、`url` 指向对应 `.app.tar.gz`
- [ ] Release 说明按 [模板](./release-template.md) 填好（更新内容 / 下载表 / 放行指引 / 反馈入口）
- [ ] 签名校验（本机）：

```bash
DMG=~/Downloads/MD-Sticky-Notes_<版本>_aarch64.dmg
hdiutil attach -readonly -nobrowse -quiet "$DMG" -mountpoint /tmp/dmg-verify
codesign -dv "/tmp/dmg-verify/MD Sticky Notes.app" 2>&1 | grep -E "Signature|TeamIdentifier"
# ad-hoc 模式应显示 Signature=adhoc；Developer ID 模式应显示 Authority=Developer ID Application
hdiutil detach -quiet /tmp/dmg-verify
```

## 4. Publish（人工）

- [ ] Releases 页打开 draft → 确认说明与资产 → 点 **Publish release**

## 5. 公告（按序，间隔观察）

| 顺序 | 渠道 | 提交要点 |
| --- | --- | --- |
| 1 | [HelloGitHub](https://hellogithub.com)（提交收录） | 中文一句话 + 截图；同类先例（PaperTodo、花笺）均经收录后星数起飞，每期还会被转载到 V2EX 形成二次分发 |
| 2 | V2EX「分享创造」节点 | 标题说人话别像广告：主打开源免费 + 「便签是你网盘里的 .md 文件」+ 截图；回复区认真答每个问题 |
| 3 | Reddit r/macapps | 英文帖；标题学已被市场校验的句式（"every note is a plain .md file in your own iCloud/Dropbox"）；提 open source + MIT |
| 4 | Hacker News（Show HN） | 标题 `Show HN: MD Sticky Notes – Markdown sticky notes stored as .md files in your cloud folder`；正文突出 Tauri 轻量（Zonote 先例的最大槽点是 Electron 体积，正中我们强项） |

## 6. updater 演练（首发后立即做）

- [ ] `version` 改 0.1.1 → commit → 打 `v0.1.1` → CI draft → 按上面第 3、4 步发布
- [ ] 已安装的 0.1.0 启动约 15 秒后应弹出更新横幅 → 「立即更新」→ 下载进度 → 「重启应用」
- [ ] 重启后设置面板版本显示 0.1.1
- [ ] （这一步同时实测了存量用户自动更新通道，是 0.2.0 之前唯一一次真实演练）

## 应急

- draft 阶段发现问题：直接删 draft + 删 tag（`gh release delete vX.Y.Z --cleanup-tag`），修复后重打
- 已 publish 后发现严重问题：Releases 页把该版本标 pre-release / 置顶公告，修复版尽快发
- updater 签名私钥丢失：无法再向存量用户推更新；新用户不受影响。立刻换密钥对 + 更新 conf 公钥 + 发公告引导存量用户手动重装

## 已知问题排查：用户侧「检查更新失败：error sending request」

应用内 HTTP（reqwest）会读取 **macOS 系统代理的静态条目**（HTTP/HTTPS/SOCKS），但**不执行 PAC 自动代理脚本**——与浏览器行为不同（浏览器优先 PAC）。典型场景：系统设置里残留一个已失效的局域网代理地址（如换过环境的 `172.16.x.x:7890`），浏览器因 PAC 判定直连而正常，应用却一直走死代理超时。

排查步骤（反馈给用户的话术）：

1. 确认网络能直连 GitHub：终端 `curl -sL -o /dev/null -w '%{http_code}' https://github.com` 应为 200
2. 终端 `scutil --proxy` 看 `HTTPEnable`：为 1 且 `HTTPProxy` 指向连不上的地址即是病灶
3. 系统设置 → 网络 → 当前网络 → 详细信息 → 代理：关掉指向已失效地址的静态代理开关（保留正常工作的 PAC / 现代理）；**注意 TUN 类工具（如 Clashmi）会把自己的虚拟网络服务设为主服务并持续重写系统代理，手动关掉会被写回——必须在该工具内关闭「系统代理」或打开它声称的监听端口**
4. **完全退出应用再启动**（代理在应用启动时读取一次；关窗口不等于退出，应用驻留托盘）后点「重试」

首例（2026-10-23，开发者本机）：Clashmi TUN 模式把系统代理写成本机 LAN 地址 `172.16.27.46:7890` 却未在该端口监听；浏览器因 PAC 判定直连而正常、curl/Node 不读系统代理而正常，仅 reqwest 读静态系统代理撞墙，排查耗时约 1 小时。

工程侧备选（未实施，若用户反馈集中再启动）：updater 端点加国内可达的镜像回退；或跟进 tauri-plugin-updater 上游对 PAC/多端点网络错误回退的支持。
