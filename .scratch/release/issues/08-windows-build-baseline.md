# 08: Windows 构建跑通 + 跨平台基线

**What to build:** CI 增加 windows-latest job：产出 NSIS 安装包（未签名，ADR-0006）进 draft release；test workflow 增加 Windows job。Windows 机器安装后基础功能可用：便签新建 / 编辑 / 保存落盘、同步文件夹可选、托盘在。Rust 侧按 macOS 写的用户目录获取改为跨平台实现（dirs crate 或 Tauri path resolver），macOS 行为无回归。加 tauri-plugin-single-instance 防双开——两个进程会争写同一批便签文件，Windows 用户误双击很常见。

**人类准备：** 需要一台 Windows 10（2018+，自带 WebView2）或 Windows 11 真机 / VM 用于验收。

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] CI windows job 产出 NSIS 并附加到 draft release
- [ ] Windows 真机安装启动：便签 CRUD、文件夹选择、托盘可用
- [ ] 双击两次仅一个实例
- [ ] 用户目录获取跨平台正确，macOS 无回归，测试全绿
- [ ] test workflow 的 Windows job 绿

**参考：** docs/adr/0006、.scratch/release/research/windows-packaging-ci.md、.scratch/release/spec.md
