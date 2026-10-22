import { describe, it, expect } from 'vitest'
import { deriveTitle, extractTags } from '../note'

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
