import { describe, it, expect } from 'vitest'
import { deriveTitle, extractTags, collectCategories, filterByCategory, categoryFilterOptions } from '../note'

describe('deriveTitle 标题推导', () => {
  it('取第一行非空文本并去 Markdown 标记', () => {
    expect(deriveTitle('# 大标题')).toBe('大标题')
    expect(deriveTitle('###### 六级')).toBe('六级')
    expect(deriveTitle('## **加粗标题**')).toBe('加粗标题')
    expect(deriveTitle('- [ ] 待办标题')).toBe('待办标题')
    expect(deriveTitle('- 列表标题')).toBe('列表标题')
    expect(deriveTitle('> 引用标题')).toBe('引用标题')
    expect(deriveTitle('`代码`')).toBe('代码')
  })

  it('跳过空行', () => {
    expect(deriveTitle('\n\n# 第一个非空')).toBe('第一个非空')
  })

  it('保留正文里的连字符与括号（日期不变形）', () => {
    expect(deriveTitle('# 2026-10-20 周报')).toBe('2026-10-20 周报')
    expect(deriveTitle('会议纪要（周五）')).toBe('会议纪要（周五）')
  })

  it('超长截断到 24 字符；空内容回退', () => {
    expect(deriveTitle('a'.repeat(40))).toHaveLength(24)
    expect(deriveTitle('')).toBe('新建便签')
    expect(deriveTitle('   \n  ')).toBe('新建便签')
  })
})

describe('extractTags 标签提取', () => {
  it('提取中英文标签并去重', () => {
    expect(extractTags('#工作 周报 #work #工作')).toEqual(['工作', 'work'])
  })

  it('跳过代码块内的标签', () => {
    expect(extractTags('#真标签\n```\n#假标签\n```\n正文')).toEqual(['真标签'])
  })

  it('标题与链接锚点不误判', () => {
    expect(extractTags('# 一级标题（# 后有空格）')).toEqual([])
    expect(extractTags('见[附录](#anchor)')).toEqual([])
  })

  it('行中标签要求前面是空白', () => {
    expect(extractTags('价值#不是标签 #是标签')).toEqual(['是标签'])
  })

  it('无标签返回空数组', () => {
    expect(extractTags('普通内容')).toEqual([])
  })
})

describe('collectCategories 分类清单（#41）', () => {
  it('去空去重 + 本地化排序', () => {
    expect(collectCategories([
      { category: '工作' }, { category: '生活' }, { category: '工作' },
      { category: '  ' }, {},
    ])).toEqual(['工作', '生活']) // zh 拼音序：工(g) < 生(s)
  })

  it('空集合 / 全无分类：空数组', () => {
    expect(collectCategories([])).toEqual([])
    expect(collectCategories([{}, {}])).toEqual([])
  })
})

describe('filterByCategory 分类筛选（#41）', () => {
  const notes = [
    { id: 'a', category: '工作' },
    { id: 'b', category: '生活' },
    { id: 'c' },
    { id: 'd', category: '工作' },
  ]
  it('null = 全部（原数组引用返回）', () => {
    expect(filterByCategory(notes, null)).toBe(notes)
  })
  it('空串 = 无分类哨兵', () => {
    expect(filterByCategory(notes, '').map((n) => n.id)).toEqual(['c'])
  })
  it('分类名精确匹配', () => {
    expect(filterByCategory(notes, '工作').map((n) => n.id)).toEqual(['a', 'd'])
    expect(filterByCategory(notes, '不存在')).toEqual([])
  })
})

describe('categoryFilterOptions 分类下拉清单（#49）', () => {
  const notes = [
    { category: '工作' }, { category: '工作' }, { category: '生活' }, {},
  ]
  it('全部 + 无分类（分布非 0）+ 各分类（分布非 0），计数随传入集合联动', () => {
    expect(categoryFilterOptions(notes, ['工作', '生活'], null)).toEqual([
      { key: null, label: '全部', count: 4 },
      { key: '', label: '无分类', count: 1 },
      { key: '工作', label: '工作', count: 2 },
      { key: '生活', label: '生活', count: 1 },
    ])
    // 另一维筛走后：无分类/空分类项隐藏，计数收窄
    expect(categoryFilterOptions(notes.slice(0, 2), ['工作', '生活'], null)).toEqual([
      { key: null, label: '全部', count: 2 },
      { key: '工作', label: '工作', count: 2 },
    ])
  })

  it('选中项被筛走全部便签：保留 count=0 项（#41 卡死态守卫——按钮须能显示当前值）', () => {
    expect(categoryFilterOptions([], ['生活'], '生活')).toEqual([
      { key: null, label: '全部', count: 0 },
      { key: '生活', label: '生活', count: 0 },
    ])
  })
})
