# 分发与自动更新绑定 GitHub Releases

仓库以 GitHub public + MIT 开源，GitHub Releases 是唯一分发渠道（无官网直链）；Tauri updater 自首发版（0.1.0）启用，更新端点用 Releases 的 `latest.json` 动态地址（`github.com/<user>/<repo>/releases/latest/download/latest.json`，零服务器、天然 HTTPS）。更新载体：macOS 为 `.app.tar.gz`，Windows 为 NSIS 安装包；更新签名用独立的 minisign 密钥对，与 Apple / 代码签名无关，私钥须备份（丢失则无法向存量用户推送更新）。

## Consequences

- 更新端点写进二进制：日后换更新源需要发一个「桥接版本」引导存量用户迁移。
- 国内访问 GitHub 下载偶发慢：接受；未来加官网 / 镜像与本决策不冲突（Ref ADR-0002 的 DMG 直链即指 Releases 资产）。
- 不做官网：反馈渠道为 GitHub Issues（bug）+ Discussions（一般反馈）。
