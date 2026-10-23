# 09: Windows 默认同步文件夹探测

**What to build:** Windows 首启零配置：三级探测——Dropbox（读 `%APPDATA%\Dropbox\info.json`，覆盖用户自选安装路径的情形）→ OneDrive 标准路径（`%USERPROFILE%\OneDrive`）→ 回退 Documents；子文件夹固定「MD 便签」（与 Mac 端一致，双机必须指向同一文件夹）；已有用户选择（本地缓存）时不重新探测；iCloud Windows 客户端不做（spec Out of Scope）。把探测逻辑从存储初始化的内联代码提为纯函数（spec Seam 1，唯一新增 JS seam）并用 vitest 覆盖；macOS 的 CloudStorage 探测逻辑等价迁移、无回归。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] 纯函数单测全过：Dropbox info.json（含自选路径）/ 仅 OneDrive / 全无回退 Documents / 缓存优先
- [ ] Windows 真机首启落到预期目录，便签可存
- [ ] Mac + Windows 指向同一云盘文件夹时改动互通
- [ ] macOS 默认路径行为无回归

**参考：** .scratch/release/spec.md（Testing Decisions / Seam 1）
