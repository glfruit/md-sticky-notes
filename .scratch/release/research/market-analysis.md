# 「MD 便签」市场调研报告

- **查证日期：2026-10-22**（下列所有来源均于当日访问/核实；星数等动态数据为当日快照）
- 产品事实以开发者提供的一手信息为准：Tauri 2 + React、拟 MIT 开源、macOS 功能完整、Windows 在计划中；每张便签 = 桌面上一个可拖拽小窗口 = 一个 .md 文件（YAML frontmatter 存元数据），落在用户自选的云盘同步文件夹（Dropbox / iCloud Drive / 坚果云）；五态任务管理、重复任务、日期解析与逾期标红、系统通知、截图粘贴、表格粘贴转 Markdown、#标签、全局热键、回收站；中文界面为主。
- 查证不到的数据一律如实标注，未做推算伪装。

---

## 一、结论（先读这一节）

### 1. 值不值得推广：**值得推广，但定位应是「开源免费收反馈 + 攒影响力」，不是「靠它赚钱」。**

三条硬证据：

1. **需求真实，且中文社区信号尤其强。** 同类「桌面便签 + Markdown」开源项目在近 6 个月内出现了两个高增长样本：花笺（Tauri 2 + React 19，与本项目技术栈完全相同）2026-04-26 建仓，6 个月约 **5,490 星**；PaperTodo（Windows/WPF）2026-05-27 建仓，5 个月约 **2,589 星**。这是品类需求的直接量化证据。
   - 花笺：https://github.com/Achilng/floral-notepaper （星数为 2026-10-22 GitHub API 快照）
   - PaperTodo：https://github.com/snownico0722/PaperTodo （同上）
2. **「数据归用户所有」不是小众怪癖，而是正在被大厂行为反复验证的主流诉求。** Simplenote 于 2026-03 宣布停止积极开发、仅维护基础功能（在线服务模式的直接风险案例：https://forums.simplenote.com/forums/topic/future-of-simplenote ）；微软正在把 Windows 便签重建到 OneNote 平台、绑定微软账号云同步（https://windowsforum.com/news/new-vs-old-sticky-notes-on-windows-cloud-sync-onenote-integration-search.408278 ）。r/macapps 上「纯 .md 文件存在你自己的 iCloud/文件夹」已成为反复出现的卖点句式（如 Smolpad：https://www.reddit.com/r/macapps/comments/1vhqak4/smolpad_for_mac_a_menu_bar_markdown_notes_app ）。
3. **本项目的精确交集（每张便签 = 一个 .md 文件 + 落在用户自选网盘目录 + 结构化任务系统）目前没有完全占位者**，但三个近似竞品已就位（花笺、Stik、Pinslip，见第二节），窗口是打开的但不是无限的。

同时要说清另一面：**这个品类没有公开的成功收入先例**。macOS 便签/速记类工具定价天花板极低（免费或 $3–$25 买断），唯一有公开收入数据的独立笔记应用 Inkdrop（>$10k MRR）是一款做了多年、靠 YouTube 引流的完整 Markdown 笔记产品，不是便签（https://www.devas.life/my-indie-dev-journey-to-build-a-10k-mrr-saas-an-interview-with-indie-hackers ）。连 The Iconfactory 的 Tot 都在 2025-08 的 Tot 2 中转成了免费（https://blog.iconfactory.com/2025/08/tot-version-2-says-hello ）。**若目标是一开始就商业化，证据不支持；若目标是验证需求、积累用户与个人品牌，证据充分支持。**

### 2. 推广路径选择：**「开源免费收反馈」明显更合理，「一开始就商业化」不合理。**

理由见第五节第 4 点。一句话版本：品类定价已被竞争者锚死在免费/低价买断，而 Windows 移植、五态任务、表格粘贴这些功能是否有人真的要，全部未经市场验证——先免费换反馈是唯一能用最低成本回答这些问题的路径；商业化（若有）应放在需求验证之后，参考 Obsidian 的「文件完全开放 + 核心免费 + 可选付费附加」模式（https://obsidian.md/pricing ）。

### 3. 最小成本验证实验（建议）

| 步骤 | 动作 | 渠道 | 先例依据 |
|---|---|---|---|
| 第 0 周 | GitHub 仓库整洁化：双语 README + GIF 演示 + 与 Stickies/花笺/Stik 的对比表 + 签名公证的 DMG Release | GitHub | Stik 官网用对比表定位（https://www.stik.ink ）；花笺 README 是好范本（https://github.com/Achilng/floral-notepaper ） |
| 第 1 周 | 提交 HelloGitHub 收录 + V2EX「分享创造」发帖 | HelloGitHub / V2EX | PaperTodo、花笺均经 HelloGitHub 收录后星数起飞，V2EX 有转载帖（https://www.v2ex.com/t/1223529 、https://www.v2ex.com/t/1237760 ）；HelloGitHub 提交入口 hellogithub.com |
| 第 1–2 周 | 英文帖发 r/macapps（开源 Markdown 便签在该 subreddit 有接受度） | Reddit | Stik 在 r/software 与 r/macapps 的发布帖（https://www.reddit.com/r/software/comments/1qylws9/stik_is_a_free_open_source_macos_app_for ）；「Markdown & keyboard friendly sticky notes app (open source)」帖：https://www.reddit.com/r/macapps/comments/1n9nkoa/markdown_keyboard_friendly_sticky_notes_app_open |
| 第 2–4 周 | Show HN | Hacker News | 同组合先例 Zonote 获 74 points / 15 评论（https://news.ycombinator.com/item?id=25036391 ） |
| 暂缓 | Product Hunt、小红书、B站 | — | 未找到该品类在 PH 有公开量级的先例（如实标注：本次查证未发现）；小红书/B站待有 Windows 版后更合适 |

**观察指标与判断阈值（发布后 4–6 周复盘）：**

- GitHub 星数（参照系：花笺 6 个月 5,490★、PaperTodo 5 个月 2,589★、Stik 8 个月 268★、jaesuny/markdown-sticky-notes 3 天 69★ 后弃更）。
- Release 附件下载量（GitHub Releases 可直接看）与「星/下载」比。
- 真实反馈数：issue + 帖子评论中「我真的在用」级别发言，尤其是否有人主动问 Windows 版（问 Windows 版 = 付费意愿与需求强度的最廉价代理指标）。
- **继续信号**：4 周内 ≥150–300★ 且 ≥20 条实质性反馈/多人问 Windows 版 → 投入 Windows 移植值得。
- **停止信号**：4–6 周 <50★ 且无实质反馈 → 该精确交集需求不足，保留为个人工具，不再投入。

### 4. 差异化话术要点（按攻击性排序）

1. **「每张便签是一个 .md 文件，躺在你自己选的网盘里」**——直接对比：系统 Stickies 无导出无同步（https://www.noticky.app/en/blog/best-sticky-note-apps-mac ）；Windows 便签被绑进 OneNote 账号（https://windowsforum.com/news/new-vs-old-sticky-notes-on-windows-cloud-sync-onenote-integration-search.408278 ）；Simplenote 停更是在线便签服务的风险教材（https://forums.simplenote.com/forums/topic/future-of-simplenote ）。应用消失，你的文件还在，还能被任何编辑器打开、被 grep、被 Obsidian 索引。
2. **「不只是便签：五态任务（待办/进行中/等待/完成/废弃）+ 重复任务 + 逾期标红 + 系统提醒」**——已查证的近似竞品均无结构化任务系统：Stik 明确没有任务功能（https://www.stik.ink ），花笺功能列表中无任务管理（https://github.com/Achilng/floral-notepaper ）。（诚实标注：「五态任务 × 便签」这个组合的需求本身没有被市场直接验证过，这正是实验要回答的问题。）
3. **「无账号、无自有云、无遥测」**——中文场景点名坚果云/iCloud 同步文件夹即可，同步交给用户已有的网盘客户端，零服务器成本。
4. **「中文原生界面 + 表格粘贴（Excel/网页 → Markdown 表格）」**——对国内办公人群是低频但高频被提及的痛点型功能，适合作为演示 GIF 的素材。

---

## 二、竞品地图

### 2.1 macOS 侧

| 产品 | 定位 | 价格 | 开源 | 活跃度/备注 | 来源 |
|---|---|---|---|---|---|
| Apple Stickies（系统自带） | 传统便签窗口 | 免费 | 否 | 无导出、无搜索、不同步 | https://www.noticky.app/en/blog/best-sticky-note-apps-mac （第三方横评，注意其作者立场） |
| Tot（Iconfactory） | 7 个固定彩色小签，纯文本/富文本 | 2025-08 起随 Tot 2 转免费（此前 iOS 买断 $20） | 否 | 品类定价崩塌的风向标 | https://blog.iconfactory.com/2025/08/tot-version-2-says-hello 、https://tot.rocks |
| Antinote | 全局热键速记 scratchpad，带内联计算 | $5 买断 | 否 | 2025 年发布，口碑好；**无公开销量数据** | https://antinote.io |
| Noticky | 便签窗口，Markdown 实时渲染 | $9.99 买断 | 否 | 独立小产品，SEO 型博客获客 | https://www.noticky.app/en/blog/best-sticky-note-apps-mac |
| SideNotes（Apptorium） | 屏幕侧边抽屉式笔记 | $19.99/大版本买断，另有 Setapp | 否 | 商业化较成功的同类 | https://www.apptorium.com/sidenotes |
| NotePlan | Markdown 日历+笔记+任务三合一 | $99/年 或 $12/月订阅 | 否 | 独立开发者（Eduard Metzger）单人作品，2016 年至今 | https://noteplan.co/pricing 、https://fastspring.com/blog/noteplan-and-fastspring-a-case-study-overview |
| Obsidian | 本地 .md 文件知识库（非便签形态） | 个人免费；Sync $4/月起、Catalyst $25、商业授权 $50/年 | 否（文件格式开放） | 「文件在本地 + 核心免费」模式的锚 | https://obsidian.md/pricing |
| FSNotes | 老牌开源 Markdown 笔记，纯本地文件 | 开源免费 | 是（GPL） | **7,541★**，证明「本地 .md」需求的长线存在 | https://github.com/glushchenko/fsnotes |
| Simplenote | 在线同步的极简笔记 | 免费 | 部分开源 | **2026-03 宣布停止积极开发** | https://forums.simplenote.com/forums/topic/future-of-simplenote |
| **Stik（最接近的竞品）** | 快捷键呼出便签，笔记为纯 .md 存 `~/Documents/Stik/`，支持 iCloud/Dropbox/Git 同步，本地 AI 搜索 | 免费，MIT | 是（Tauri+Rust） | **268★**（2026-02 建仓，8 个月），活跃；**明确无任务管理功能**；英文界面 | https://github.com/0xMassi/stik_app 、https://www.stik.ink |
| jaesuny/markdown-sticky-notes | macOS 原生 Markdown 便签 | 开源 | 是（Swift） | 69★，2026-02-06 建仓、02-09 后停止更新（弃更） | https://github.com/jaesuny/markdown-sticky-notes |
| andrewyur/md-sticky | Stickies 风格 GFM 便签 | 开源 | 是（Rust） | 31★，最后提交 2025-12 | https://github.com/andrewyur/md-sticky |

### 2.2 Windows 侧

| 产品 | 定位 | 价格 | 活跃度/备注 | 来源 |
|---|---|---|---|---|
| Microsoft Sticky Notes | 系统自带便签，正被重建到 OneNote 平台、账号云同步 | 免费 | 2025-11 起新版滚动推送，2026-08 预览版加入截图/OCR；「数据绑定微软账号」正是本项目差异化靶点 | https://windowsforum.com/news/new-vs-old-sticky-notes-on-windows-cloud-sync-onenote-integration-search.408278 、https://mspoweruser.com/the-new-sticky-notes-experience-is-rolling-out-to-all-windows-users |
| **PaperTodo（重点参照）** | 极简桌面便签：待办纸 + 轻量 Markdown 笔记纸，每张便签独立无边框窗口，本地存储，无账号 | 免费，开源（GitHub 下载 + Microsoft Store） | **2,589★**（2026-05-27 建仓，5 个月），WPF 原生，已上 Microsoft Store，被 HelloGitHub 收录并有腾讯云社区拆解文章 | https://github.com/snownico0722/PaperTodo 、https://apps.microsoft.com/detail/9pnfp27sjx13 、https://www.v2ex.com/t/1223529 |
| 花笺（Windows 版） | 见 2.4 | 免费 | 跨平台（Win + macOS），Microsoft Store 有上架 | https://github.com/Achilng/floral-notepaper 、https://apps.microsoft.com/detail/9NRCC0ZSG81R |
| RunMintOn/Sticky-Notes | 本地优先复刻经典 Windows 便签，Markdown 预览 | 开源 | 0★，2026-07 建仓（新） | https://github.com/RunMintOn/Sticky-Notes |

### 2.3 中文市场

| 产品 | 定位 | 价格/模式 | 备注 | 来源 |
|---|---|---|---|---|
| 滴答清单（桌面便签功能） | 任务管理应用附带的桌面便签，支持全局快捷键唤出 | 订阅制应用 | 便签是主应用附属功能，非独立形态 | https://help.dida365.com/articles/6986508444417130496 |
| 敬业签 | 云便签，多端同步+提醒 | 会员制：约 118 元/年、588 元终身（黄金会员） | 中文便签品类少见的订阅收费成功者，靠的是同步+提醒服务 | https://www.jingyeqian.com/bz-140.html （官网会员价格说明） |
| uTools「TODO便签」插件 | 桌面悬浮待办便签，待办与 Markdown 双模式 | 插件（uTools 生态） | 与本项目形态较近，依赖 uTools 平台 | https://www.u-tools.cn/plugins/detail/TODO便签 |
| uTools「拾光便签」插件 | 高颜值便签+笔记，独立小窗、Markdown、彩色标签 | 插件 | 同上 | https://www.u-tools.cn/plugins/detail/拾光便签 |
| 小黄条 | 透明桌面待办/便签 | 免费+增值 | 多端同步 | https://www.u-tools.cn/plugins/detail/TODO便签 页面提及；官网 yynote.cn |
| **花笺 floral-notepaper（重点参照）** | 轻量跨平台桌面便签：GFM 编辑/预览、全局快捷键唤出、磁贴钉桌面、.md 导入导出 | 免费，MIT；通过 Mirror酱 提供付费下载通道（打赏性质） | **5,490★**（2026-04-26 建仓，6 个月）；Tauri 2 + React 19（与本项目同栈）；Win + macOS 双平台；Microsoft Store 上架 | https://github.com/Achilng/floral-notepaper 、https://apps.microsoft.com/detail/9NRCC0ZSG81R 、HelloGitHub 第 125 期 V2EX 转载：https://www.v2ex.com/t/1237760 |

### 2.4 交集分析：「Markdown 原生 + 便签窗口形态 + 数据存用户自己网盘文件夹」

逐个对照三个最接近者（均于 2026-10-22 核实）：

- **Stik**：占住了「.md 纯文件 + 便签弹出/钉选 + iCloud/Dropbox 文件夹同步」——与本项目的数据模型几乎相同。但它定位「闪念捕捉」，**没有任务系统、没有提醒/重复任务/逾期，界面英文**（https://www.stik.ink 功能页确认）。它证明了这套数据模型在英文社区可被接受（268★），也留下了「任务型便签」的空位。
- **花笺**：占住了中文市场「轻量 + Markdown + 桌面磁贴」的心智，星数最高。但按其 README，数据存于应用自有存储、通过**导入/导出**交换 .md 文件——不是「每张便签天生就是网盘文件夹里的一个 .md 文件」；功能列表中也**没有任务管理、重复任务、逾期提醒**（https://github.com/Achilng/floral-notepaper ）。
- **Pinslip**：宣传语「钉在桌面的 Markdown 便签，你写下的每个字，都在你手里」，local-first + Obsidian 话题标签 + 中文简介——**定位与本项目几乎逐字重合**，但极早期（21★，2026-07 建仓），Electron + Go，主推 AI 功能（https://github.com/homerious/pinslip 、https://pinslip.app ）。

**交集结论：完全占位者不存在；三个 2/3 占位者从三个方向逼近。** 本项目可防守的差异化剩余空间 = ①「每张便签 = 网盘目录里的一个 .md 文件」（对花笺的存储模型优势）②结构化五态任务+提醒（对全部竞品的功能优势）③中文原生（对 Stik）。注意这三点里没有一点构成技术壁垒，护城河只能来自先发的口碑与迭代速度。

---

## 三、需求证据（谁需要这个组合）

**数据自主/反锁定人群（核心盘）：**
- Simplenote 停止积极开发（2026-03）：托管服务模式风险的现成教材——应用还能下载，但不再有新功能（https://forums.simplenote.com/forums/topic/future-of-simplenote ）。
- r/PKMS 上关于「完全数据所有权」的持续讨论（https://www.reddit.com/r/PKMS/comments/1kwtq0d/plug_your_own_database_will_it_work_for_data ）；Zettelkasten 论坛「摆脱云锁定」长帖（https://forum.zettelkasten.de/discussion/2958/seeking-freedom-from-cloud-lock-in-a-pkm-community-discussion ）。
- r/Markdown 上有人专门写了 icloud-md CLI 把 Apple Notes 导出成纯 .md 文件夹——「逃离封闭格式」是真实存在的用户行为（https://www.reddit.com/r/Markdown/comments/1vtmlnw/your_apple_notes_now_editable_as_plain_markdown ）。

**V2EX（中文开发者/极客盘）：**
- 「寻一个可以本地存放、多设备同步的笔记 app」：楼主明确嫌语雀「全是在线的太不方便」，回帖集中在 Obsidian/Joplin/思源 + 网盘/自建同步的组合（https://www.v2ex.com/t/888919 ）。
- 长期帖子反复出现的模式：本地 Markdown 文件（Obsidian/Typora/VSCode）+ 坚果云/Syncthing/Seafile 同步，即「数据归自己、同步用现成网盘」正是本项目的架构选择（例：https://cn.v2ex.com/t/1124472 、https://jp.v2ex.com/t/1126574 ）。

**r/macapps（英文 Mac 工具盘）：**
- 便签求荐帖下被推荐的是 Stik——推荐语即「纯 .md 文件 + iCloud/Dropbox 开箱同步」（https://www.reddit.com/r/macapps/comments/1r5abwq/sticky_notes ）。
- 2026 年内多个新发布帖都把「纯 .md 存你自己的云盘」写进标题卖点：Smolpad（每条笔记是你自己 iCloud 里的 .md 文件，Free+Pro，https://www.reddit.com/r/macapps/comments/1vhqak4/smolpad_for_mac_a_menu_bar_markdown_notes_app ）、Glyph（纯 Markdown 文件，可指向 iCloud Drive，https://www.reddit.com/r/macapps/comments/1rkg01e/os_glyph_a_tiny_notes_app_for_mac_for_everyone_15 ）。卖点上出现的句式趋同 = 该价值主张已被市场校验。

**Hacker News：**
- Show HN: Zonote（便签+Markdown+单 .txt 文件存储）74 points / 15 评论（2020-11）；评论整体欣赏「简单、可 grep 的纯文本存储」思路，主要槽点是 Electron 体积（https://news.ycombinator.com/item?id=25036391 ）。对本项目的启示：Tauri 的轻量正是当年 Electron 方案的痛点解药，可作英文帖话术。

**诚实标注（证据缺口）：**
- 「五态任务 × 便签」这一具体组合未找到直接的需求帖——现有讨论要么要便签（简单记录），要么要任务（滴答清单类）。五态（尤其「等待」「废弃」两态）是否是真实大众需求还是开发者个人工作流，是本次调研**最大的未验证假设**，只能靠发布实验回答。
- 坚果云用户对「便签数据进坚果云文件夹」的具体需求帖未检索到（坚果云作为 Obsidian/纯文本用户常用同步后端在 V2EX 帖中广泛出现，属间接证据）。

---

## 四、渠道与先例（规模相近的独立工具如何起量）

**中文开源渠道（已被两个同类验证）：**
- HelloGitHub 收录是决定性节点：PaperTodo 与花笺均经收录后进入增长期，且 HelloGitHub 每期会被转载到 V2EX（第 123 期：https://www.v2ex.com/t/1223529 ；第 125 期：https://www.v2ex.com/t/1237760 ），形成二次分发。
- 花笺的增长组合拳可拆解为：GitHub 开源 + Microsoft Store 上架 + Mirror酱付费下载通道（打赏型变现，https://mirrorchyan.com/zh/projects?rid=floral ）+ AUR 包（https://aur.archlinux.org/packages/floral-notepaper ）。PaperTodo 另获腾讯云开发者社区拆解文章（developer.cloud.tencent.com/article/2739959）。
- 少数派「派评」栏目接受新应用投稿/收录（https://sspai.com/post/76526 、https://sspai.com/post/113544 ）；同类的「零碎想法捕捉」应用 Re:card 有专文评测（https://sspai.com/post/103082 ）；国内开发者子弹笔记 Jotbook 亦经派评曝光（https://sspai.com/post/114041 ）。

**英文渠道：**
- Reddit r/macapps / r/software 是该品类首选首发地：Stik（268★）与 Antinote（$5 买断）都以 Reddit 首发起家（https://www.reddit.com/r/software/comments/1qylws9/stik_is_a_free_open_source_macos_app_for ；Antinote beta 首发于 r/macapps，见 https://antinote.io ）。
- HN Show HN 有直接先例（Zonote 74 points，https://news.ycombinator.com/item?id=25036391 ）。
- GitHub Trending 是花笺级星数的伴随结果而非独立渠道（未单独查证其 Trending 记录，如实标注）。
- **Product Hunt：本次查证未找到便签/scratchpad 品类在该站有可引用量级的公开先例**（Antinote 无 PH 发布页数据）。不建议作为首发渠道。

**规模参照系汇总（2026-10-22 GitHub API 快照）：**

| 项目 | 星数 | 时间跨度 | 状态 |
|---|---|---|---|
| 花笺（Tauri2+React，Win+macOS，中文） | 5,490 | 6 个月 | 活跃 |
| PaperTodo（WPF，Windows，中文社区） | 2,589 | 5 个月 | 活跃 |
| Stik（Tauri，macOS，英文） | 268 | 8 个月 | 活跃 |
| zonote（Electron，跨平台） | 315 | 2020–2021 后弃更 | 弃更 |
| jaesuny/markdown-sticky-notes（Swift，macOS） | 69 | 3 天后弃更 | 弃更 |
| Pinslip（Electron+Go，定位同本项目） | 21 | 3 个月 | 活跃 |

解读：**中文社区对这类工具的接纳度显著高于英文社区（5.4k/2.6k vs 268）**；macOS-only 且英文叙事的 Stik 是本项目「不投 Windows、不打中文」情形下的现实上限参照。

**收入先例（该品类附近，公开数据）：**
- Inkdrop（Takuya Matsuyama，完整 Markdown 笔记应用）：>$10k MRR，策略是忽略竞争、专注品牌 + YouTube 内容引流；注意这是做了 9 年的完整产品而非便签（https://www.devas.life/my-indie-dev-journey-to-build-a-10k-mrr-saas-an-interview-with-indie-hackers ）。
- NotePlan（单人开发者）：订阅制 $99/年，2016 年至今存活，支付商 FastSpring 有其转化率 +66% 的案例文（无公开 MRR，如实标注）（https://fastspring.com/blog/noteplan-and-fastspring-a-case-study-overview 、https://noteplan.co/pricing ）。
- Tot（Iconfactory，小型工作室）：2025-08 起 Tot 2 转免费——**付费模式在该品类被主动放弃的直接信号**（https://blog.iconfactory.com/2025/08/tot-version-2-says-hello ）。
- Antinote（$5 买断）、Noticky（$9.99 买断）、Stik（免费）：均**无公开收入数据**（已检索，如实标注）。

---

## 五、变现基线

**1. macOS 便签/速记品类的定价分布（2026 年实测）：**

| 模式 | 案例 |
|---|---|
| 免费 | Apple Stickies、Tot 2（转免费）、Stik（开源）、Quick Note 类 |
| 低价买断 | Simple Antnotes $2.99、Antinote $5、Noticky $9.99、Quick Sticky Notes $9.99 |
| 高价买断 | SideNotes $19.99/大版本、Unclutter $24 |

- 品类横评结论一致：**「要么免费、要么一次性买断，无订阅」**（出自 Noticky 官方博客，立场偏向自家，但列举的竞品定价可独立核实）（https://www.noticky.app/en/blog/best-sticky-note-apps-mac ）。

**2. 该品类之外的收入结构参考：**
- Obsidian：个人免费、文件格式完全开放，钱从可选服务来（Sync $4/月起、Publish $8/月起、Catalyst $25 捐赠型、商业授权 $50/年）——「不锁数据也能赚钱」的最佳证明（https://obsidian.md/pricing ）。
- FSNotes：开源免费 + App Store 付费分发（7,541★ 长线存活）（https://github.com/glushchenko/fsnotes ）。
- 中文市场例外是敬业签：约 118 元/年 / 588 元终身的会员制，卖的是**同步+提醒服务**而非软件本身（https://www.jingyeqian.com/bz-140.html ）；花笺则走 Mirror酱 打赏通道（https://mirrorchyan.com/zh/projects?rid=floral ）。

**3. 个人开发者的现实收入预期：** 纯便签工具没有任何公开的收入数据点（Antinote、Noticky、Stik 均未披露）；可得的间接信号全部指向低天花板——买断价 $3–$25、Tot 放弃收费、该品类头部开源项目全部免费。**合理预期是把此项目当作影响力资产（简历/GitHub 主页/博客流量入口）而非收入来源；若需求验证通过后再商业化，买断 $10–20 或 Obsidian 式可选付费是与品类先例兼容的上限。** 声明：这是基于上述公开定价与先例的定性判断，无收入数据可直接支撑更精确的量化预测。

**4. 路径裁决——「开源免费收反馈」 vs 「一开始就商业化」：前者。**
- 决定性理由：本项目所有差异化点（五态任务、表格粘贴、存储模型）都**没有经过任何外部用户验证**，而 Windows 移植是一笔真实工程投入——先免费拿到「是否有人问 Windows 版」的答案，再决定投不投入，是最便宜的决策信息。
- 品类定价已被竞争者锚死在免费/低价买断，首发收费只会把早期用户全部让给花笺/Stik；Tot 转免费说明连有品牌的工作室都收不动这个品类的钱。
- 开源免费与「以后商业化」不冲突：Obsidian（免费核心）、FSNotes（开源+MAS 付费分发）、花笺（免费+打赏）都保留了后续变现选项；真正不可逆的是「首发收费劝退所有早期用户」。
- 建议动作序列：① 开源仓库发布（双语 README）→ ② HelloGitHub + V2EX + r/macapps → ③ 4–6 周按第一节的阈值复盘 → ④ 若信号强：投 Windows 移植，商业化留到那时再议（买断或打赏，不推荐订阅）。

---

## 附：主要引用来源清单

- 花笺 https://github.com/Achilng/floral-notepaper ｜ PaperTodo https://github.com/snownico0722/PaperTodo ｜ Stik https://github.com/0xMassi/stik_app 与 https://www.stik.ink ｜ Pinslip https://github.com/homerious/pinslip ｜ zonote https://github.com/zonetti/zonote ｜ markdown-sticky-notes https://github.com/jaesuny/markdown-sticky-notes ｜ md-sticky https://github.com/andrewyur/md-sticky ｜ FSNotes https://github.com/glushchenko/fsnotes
- Tot 2 免费公告 https://blog.iconfactory.com/2025/08/tot-version-2-says-hello ｜ Tot 官网 https://tot.rocks ｜ Antinote https://antinote.io ｜ SideNotes https://www.apptorium.com/sidenotes ｜ NotePlan 定价 https://noteplan.co/pricing ｜ NotePlan×FastSpring https://fastspring.com/blog/noteplan-and-fastspring-a-case-study-overview ｜ Obsidian 定价 https://obsidian.md/pricing ｜ Noticky 品类横评 https://www.noticky.app/en/blog/best-sticky-note-apps-mac
- Simplenote 停更公告 https://forums.simplenote.com/forums/topic/future-of-simplenote ｜ Windows 便签 OneNote 化 https://windowsforum.com/news/new-vs-old-sticky-notes-on-windows-cloud-sync-onenote-integration-search.408278 与 https://mspoweruser.com/the-new-sticky-notes-experience-is-rolling-out-to-all-windows-users
- 滴答清单桌面便签 https://help.dida365.com/articles/6986508444417130496 ｜ 敬业签会员价格 https://www.jingyeqian.com/bz-140.html ｜ uTools TODO便签 https://www.u-tools.cn/plugins/detail/TODO便签 ｜ uTools 拾光便签 https://www.u-tools.cn/plugins/detail/拾光便签
- 需求证据帖：V2EX https://www.v2ex.com/t/888919 ｜ HN https://news.ycombinator.com/item?id=25036391 ｜ r/macapps https://www.reddit.com/r/macapps/comments/1r5abwq/sticky_notes 、https://www.reddit.com/r/macapps/comments/1vhqak4/smolpad_for_mac_a_menu_bar_markdown_notes_app 、https://www.reddit.com/r/macapps/comments/1rkg01e/os_glyph_a_tiny_notes_app_for_mac_for_everyone_15 、https://www.reddit.com/r/macapps/comments/1n9nkoa/markdown_keyboard_friendly_sticky_notes_app_open ｜ r/software https://www.reddit.com/r/software/comments/1qylws9/stik_is_a_free_open_source_macos_app_for ｜ r/PKMS https://www.reddit.com/r/PKMS/comments/1kwtq0d/plug_your_own_database_will_it_work_for_data ｜ Zettelkasten 论坛 https://forum.zettelkasten.de/discussion/2958/seeking-freedom-from-cloud-lock-in-a-pkm-community-discussion ｜ r/Markdown https://www.reddit.com/r/Markdown/comments/1vtmlnw/your_apple_notes_now_editable_as_plain_markdown
- 收入先例：Inkdrop 访谈 https://www.devas.life/my-indie-dev-journey-to-build-a-10k-mrr-saas-an-interview-with-indie-hackers
- 渠道先例：HelloGitHub 第 123 期 V2EX 转载 https://www.v2ex.com/t/1223529 ｜ 第 125 期 https://www.v2ex.com/t/1237760 ｜ 少数派派评 https://sspai.com/post/76526 、https://sspai.com/post/113544 、https://sspai.com/post/103082 、https://sspai.com/post/114041 ｜ Mirror酱 https://mirrorchyan.com/zh/projects?rid=floral

**未查证/数据缺口（如实声明）：** Antinote、Noticky、Stik、Pinslip 的收入与下载量均无公开数据；NotePlan 无公开 MRR；Product Hunt 无该品类可引用的量级先例；「五态任务 × 便签」组合无直接需求帖；花笺数据模型依据其 README 描述（自有存储 + .md 导入导出），未安装求证。Reddit 帖子正文因反爬未能逐条读取原文，内容以搜索结果摘要为准。
