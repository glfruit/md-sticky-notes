# MD 便签 · 设计系统（Master）

> 由 [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 设计系统生成器产出（2026-10-30），
> 并按桌面便签应用的产品形态做了适配裁剪。改动视觉前先读本文件；页面级特殊处理放 `pages/` 覆盖。

## 生成参数

- 查询：`desktop sticky notes productivity markdown tasks calm`
- Dials：variance 3/10（居中/极简）、motion 3/10（克制动效）

## 风格

**Minimalism & Swiss Style** — 干净、留白、功能性、高对比、几何、无衬线、栅格。

- 适合：专业工具、效率应用
- 反模式（禁止）：过度装饰、复杂阴影、3D 效果、emoji 当图标（一律用 Lucide SVG）

## 配色：暖墨 + 琥珀点缀 + 奶油纸面

| 角色 | 色值 | 应用 |
| --- | --- | --- |
| 强调/主行动 | `#D97706`（amber-600） | 新建按钮、选中态、焦点环、复选框 accent、恢复按钮 |
| 主文字 | `#1C1917`（stone-900）系 | `text-stone-*` 灰阶承担全部层级 |
| 画布底色 | 奶油纸面渐变 `#FFFBEB → #FAF7EE → #F3F0E7` | 桌面画布（.desktop） |
| 便签纸色 | 六色粉彩（黄/蓝/绿/粉/紫/灰） | 便签本体，色值见 `src/types/note.ts` |
| 破坏性 | `#DC2626` | 删除确认、逾期 |
| 链接 | `#2B6CB0` | Markdown 链接（惯例蓝，保持可辨识） |

任务五态（语义色，展示用非存储）：

| 状态 | 色值 | 说明 |
| --- | --- | --- |
| 待办 | `#78716C` stone-500 | 暖墨灰 |
| 进行中 | `#2563EB` blue-600 | 惯例蓝 |
| 等待 | `#D97706` amber-600 | 与强调色同源（需要关注的语义） |
| 完成 | `#059669` emerald-600 | |
| 废弃 | `#A8A29E` stone-400 | |

截止日期：逾期/今天 `#DC2626`、临近 `#D97706`、较远 `#78716C`。

## 字体

- **UI + 预览正文**：Plus Jakarta Sans（自托管 @fontsource，离线可用；中文回退 PingFang SC → 系统黑体）
- **编辑/代码**：ui-monospace 等宽栈（保持不变）
- 正文最小 13px（便签场景），行高 1.65

## 效果与动效

- 悬停过渡 150–250ms（统一 `transition-colors`）
- 便签阴影：紧凑双层（`0 1px 2px + 0 10px 28px`，暖黑 stone 色调），不用弥散大阴影
- 玻璃面板：`bg-white/60~70 + backdrop-blur` + `border-stone-900/10`
- 焦点可见（amber 环）；动效尊重 `prefers-reduced-motion`

## 本应用的产品适配决定（在生成结果之上的裁剪）

1. **保留「彩色便签贴在桌面」的核心隐喻**——Swiss 极简用在桌面画布、菜单栏、侧栏、弹层等「饰面」上，便签纸色是内容不是装饰，不参与极简化。
2. 画布从紫粉渐变壁纸改为**奶油纸面**（生成结果 Background #FFFBEB 的直接应用），浮层提示文字由白字改深字。
3. 菜单栏「新建」是唯一强调色实心按钮（Single CTA focus 的桌面化）；其余工具按钮全部中性。
4. 字体不走 Google Fonts 网络加载（Tauri 应用须离线可用），用 @fontsource 自托管。
5. 任务五态色与截止日期色对齐上表，形成跨便签/徽章/侧栏的一致语义。
