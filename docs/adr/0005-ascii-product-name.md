# productName 用 ASCII「MD Sticky Notes」

productName 定为 ASCII 的 `MD Sticky Notes`，identifier 定为 `com.mdstickynotes.desktop`（2026-10-23 修订：初值 `com.mdstickynotes.app` 以 `.app` 结尾，Tauri 明确警告与 macOS 应用包扩展名冲突，首发前改定；改动的代价仅是开发者本人机器的本地存储重置一次，发布后该值不可再变）：非 ASCII productName 在 Windows 侧（安装包命名、安装路径、签名工具链、杀软启发式）有已知毛刺，且查证未能排除。代价是 macOS 的 Dock / 菜单栏 / Finder 显示英文名；中文品牌「MD 便签」保留在窗口标题与全部 UI 内。发布后改名成本高（已装用户、更新校验、安装器升级路径），故发布前定死。图标沿用现有 icns/ico，本轮不重绘。
