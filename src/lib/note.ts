/** 便签内容派生信息（标题、标签）的纯函数 */

/**
 * 从内容推导标题：第一行非空文本，去掉行首 Markdown 标记（标题 / 列表 / 任务 / 引用）
 * 和强调符号。注意保留正文里的连字符、括号等标点（日期「2026-10-20」不能变成「20261020」）。
 */
export function deriveTitle(content: string): string {
  const line = content.split('\n').find((l) => l.trim()) ?? ''
  const clean = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(\s*[-*+]\s+\[[ xX/?-]\]\s*)/, '')
    .replace(/^(\s*[-*+]\s+)/, '')
    .replace(/^>\s*/, '')
    .replace(/[*_`~]+/g, '')
    .trim()
  return clean.slice(0, 24) || '新建便签'
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu

/**
 * 提取内容里的 #标签（如「#工作 #学习」，支持中文），跳过代码块。
 * 标题「# 标题」因 # 后有空格不会误判；链接锚点「(#x)」因 # 前非空白不会命中。
 */
export function extractTags(content: string): string[] {
  const out = new Set<string>()
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(TAG_RE)) out.add(m[2])
  }
  return [...out]
}


/**
 * 便签集合的全部分类清单（侧栏筛选 chip 行数据源）：去空、去重、按名排序（本地化比较）。
 * category 是便签元数据（frontmatter），与内容里的 ＃标签（extractTags）语义不同、互不打通。
 */
export function collectCategories(notes: { category?: string }[]): string[] {
  const set = new Set<string>()
  for (const n of notes) {
    const c = n.category?.trim()
    if (c) set.add(c)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/**
 * 按分类筛选便签（#41，画布与侧栏列表共用的单源）：selected 为 null → 全部；
 * 空串 → 无分类便签（「无分类」项的哨兵值）；非空 → 该分类。
 */
export function filterByCategory<T extends { category?: string }>(notes: T[], selected: string | null): T[] {
  if (selected === null) return notes
  if (selected === '') return notes.filter((n) => !n.category)
  return notes.filter((n) => n.category === selected)
}

/** 筛选下拉的一个选项（FilterMenuButton 消费；key 为 null = 全部，'' = 无分类哨兵） */
export interface FilterOptionData {
  key: string | null
  label: string
  count: number
}

/** 分类筛选下拉的选项清单（#49，Sidebar 消费，可直测）：
 *  全部（带计数）/ 无分类（仅当分布非 0）/ 各分类（分布非 0）；末位守卫——
 *  选中分类被另一维筛走全部便签时保留 count=0 项（#41 卡死态教训：按钮须能显示当前值，
 *  否则过滤仍生效而按钮回基态 = 隐身筛选）。 */
export function categoryFilterOptions(
  notes: { category?: string }[],
  categories: string[],
  selected: string | null,
): FilterOptionData[] {
  const items: FilterOptionData[] = [{ key: null, label: '全部', count: notes.length }]
  const noneCount = notes.filter((n) => !n.category).length
  if (noneCount > 0) items.push({ key: '', label: '无分类', count: noneCount })
  for (const c of categories) {
    const count = notes.filter((n) => n.category === c).length
    if (count > 0) items.push({ key: c, label: c, count })
  }
  if (selected !== null && !items.some((o) => o.key === selected)) {
    items.push({ key: selected, label: selected || '无分类', count: 0 })
  }
  return items
}
