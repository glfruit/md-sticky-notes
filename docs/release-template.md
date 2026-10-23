# Release 说明模板

> 使用：Releases 页 draft 的编辑框里，把下方整体复制后替换 `<…>` 占位。
> 破坏性变更 / 新平台首发时，在「更新内容」最前面加一行加粗提示。

```markdown
## 更新内容

- <功能 / 修复 1>
- <功能 / 修复 2>
- <功能 / 修复 3>

## 下载

| 平台 | 文件 |
| --- | --- |
| macOS (Apple Silicon) | `MD-Sticky-Notes_<版本>_aarch64.dmg` |
| macOS (Intel) | `MD-Sticky-Notes_<版本>_x64.dmg` |
| Windows 10 / 11 | `<版本> 起提供 -setup.exe` |

## macOS 首次打开

当前版本为 ad-hoc 签名，首次打开系统会提示「无法验证开发者」：

- 方法一：Finder 里**右键点应用 → 打开 → 打开**
- 方法二：双击后到 **系统设置 → 隐私与安全性**，点「仍要打开」

只需一次，之后正常启动。

## Windows 首次运行

SmartScreen 提示时：点「更多信息」→「仍要运行」。只需一次。

## 数据与同步

便签是你网盘文件夹里的纯 `.md` 文件，卸载应用不会删除数据。
升级前无需任何操作。

## 反馈

- Bug → https://github.com/glfruit/md-sticky-notes/issues
- 建议 → https://github.com/glfruit/md-sticky-notes/discussions
```
