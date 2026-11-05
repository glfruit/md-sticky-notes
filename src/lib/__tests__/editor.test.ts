import { describe, it, expect } from 'vitest'
import { handleEnter, handleTab, cleanupMarkdown } from '../editor'

describe('handleEnter 列表续接', () => {
  it('无序列表回车续接', () => {
    const r = handleEnter('- 项目一\n- 项目二', 11, 11) // 光标在第二行末尾
    expect(r).toEqual({ text: '- 项目一\n- 项目二\n- ', selStart: 14, selEnd: 14 })
  })

  it('任务列表回车续接为未勾选', () => {
    const r = handleEnter('- [x] 已完成', 10, 10)
    expect(r?.text).toBe('- [x] 已完成\n- [ ] ')
  })

  it('进行中任务行（- [/]）回车续接为待办（#9）', () => {
    const r = handleEnter('- [/] 写周报', 9, 9)
    expect(r).toEqual({ text: '- [/] 写周报\n- [ ] ', selStart: 16, selEnd: 16 })
  })

  it('等待（- [?]）与废弃（- [-]）任务行回车同样续接为待办', () => {
    expect(handleEnter('- [?] 等邮件', 9, 9)?.text).toBe('- [?] 等邮件\n- [ ] ')
    expect(handleEnter('- [-] 废弃项', 9, 9)?.text).toBe('- [-] 废弃项\n- [ ] ')
  })

  it('空进行中任务项回车退出列表', () => {
    const r = handleEnter('- [/]\n正文', 4, 4)
    expect(r).toEqual({ text: '\n正文', selStart: 0, selEnd: 0 })
  })

  it('缩进的进行中任务行回车保留缩进', () => {
    const r = handleEnter('  - [/] 子任务', 11, 11)
    expect(r).toEqual({ text: '  - [/] 子任务\n  - [ ] ', selStart: 20, selEnd: 20 })
  })

  it('有序列表回车序号递增', () => {
    const r = handleEnter('2. 第二', 6, 6)
    expect(r?.text).toBe('2. 第二\n3. ')
  })

  it('引用回车续接', () => {
    const r = handleEnter('> 引用', 5, 5)
    expect(r?.text).toBe('> 引用\n> ')
  })

  it('空列表项回车退出列表', () => {
    const r = handleEnter('- \n正文', 2, 2)
    expect(r).toEqual({ text: '\n正文', selStart: 0, selEnd: 0 })
  })

  it('普通文本回车走默认（null）', () => {
    expect(handleEnter('普通文本', 4, 4)).toBeNull()
  })

  it('有选区时不处理（null）', () => {
    expect(handleEnter('- 列表', 0, 3)).toBeNull()
  })
})

describe('handleTab 缩进', () => {
  it('单光标缩进当前行', () => {
    const r = handleTab('- 项\n', 3, 3, false)
    expect(r?.text).toBe('  - 项\n')
    expect(r?.selStart).toBe(5)
  })

  it('Shift+Tab 反缩进', () => {
    const r = handleTab('  - 项', 5, 5, true)
    expect(r?.text).toBe('- 项')
  })

  it('选区覆盖多行整体缩进', () => {
    const r = handleTab('- a\n- b', 0, 7, false)
    expect(r?.text).toBe('  - a\n  - b')
    expect(r).toEqual({ text: '  - a\n  - b', selStart: 0, selEnd: 11 })
  })
})

describe('cleanupMarkdown 语法清理', () => {
  it('无问题内容原样返回', () => {
    const content = '# 标题\n\n正文'
    expect(cleanupMarkdown(content)).toEqual({ text: content, fixes: [] })
  })

  it('标题补空格 + 行尾空白 + 任务标记规范', () => {
    const r = cleanupMarkdown('#标题  \n-[]任务')
    expect(r.text).toBe('# 标题\n- [ ] 任务')
    expect(r.fixes).toContain('标题空格')
    expect(r.fixes).toContain('任务标记')
    expect(r.fixes).toContain('行尾空白')
  })

  it('连续空行压缩、首尾空行移除', () => {
    expect(cleanupMarkdown('\n\nA\n\n\n\nB\n\n').text).toBe('A\n\nB')
  })

  it('未闭合代码块自动补闭合', () => {
    const r = cleanupMarkdown('```js\ncode')
    expect(r.text).toBe('```js\ncode\n```')
    expect(r.fixes).toContain('未闭合代码块')
  })

  it('代码块内部一律不动', () => {
    const inner = '```\n#无空格   \n-[]x\n\n\n\n```'
    expect(cleanupMarkdown(inner).text).toBe(inner)
  })

  it('不误伤分割线 ---', () => {
    expect(cleanupMarkdown('A\n\n---\n\nB').text).toBe('A\n\n---\n\nB')
  })
})
