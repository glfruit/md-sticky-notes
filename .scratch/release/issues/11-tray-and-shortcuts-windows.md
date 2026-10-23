# 11: Windows 托盘驻留与快捷键适配

**What to build:** Windows 上主窗口点 X → 隐藏并驻留托盘（任务提醒、全局热键、同步监听继续工作），托盘菜单「退出」才真正退出且无残留进程 / 文件锁；快捷键直译：应用内新建 Alt+N、全局新建 Ctrl+Alt+N（Intel 显卡驱动占用的是 Ctrl+Alt+方向键，与 N 无冲突）；托盘图标与菜单在 Windows 下显示正常。macOS 的关闭行为与快捷键不变。

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Windows：点 X 窗口隐藏、进程驻留；托盘退出干净（任务管理器无残留进程）
- [ ] Alt+N / Ctrl+Alt+N 生效，与其他软件的热键冲突情况有记录
- [ ] 从托盘恢复窗口正常
- [ ] macOS 的关闭行为与快捷键无回归

**参考：** .scratch/release/spec.md（Implementation Decisions / Windows 移植范围）
