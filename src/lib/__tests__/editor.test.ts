import { describe, it, expect } from 'vitest'
import {
  handleEnter,
  handleTab,
  cleanupMarkdown,
  setTaskAtIndex,
  cycleTaskAtIndex,
  parseRecurrence,
  nextOccurrence,
  resetRecurringTaskLine,
  extractDueDate,
  extractTaskTime,
  extractTasks,
  archiveCompletedTasks,
  convertListItemToTask,
  convertTaskToListItem,
} from '../editor'

describe('handleEnter 列表续接', () => {
  it('无序列表回车续接', () => {
    const r = handleEnter('- 项目一\n- 项目二', 11, 11) // 光标在第二行末尾
    expect(r).toEqual({ text: '- 项目一\n- 项目二\n- ', selStart: 14, selEnd: 14 })
  })

  it('任务列表回车续接为未勾选', () => {
    const r = handleEnter('- [x] 已完成', 10, 10)
    expect(r?.text).toBe('- [x] 已完成\n- [ ] ')
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

describe('任务状态机', () => {
  it('setTaskAtIndex 设置各状态', () => {
    expect(setTaskAtIndex('- [ ] A\n- [ ] B', 1, 'progress')).toBe('- [ ] A\n- [/] B')
    expect(setTaskAtIndex('- [ ] A', 0, 'done')).toBe('- [x] A')
    expect(setTaskAtIndex('- [ ] A', 5, 'done')).toBeNull()
  })

  it('cycleTaskAtIndex 按顺序循环', () => {
    let c = '- [ ] A'
    c = cycleTaskAtIndex(c, 0)!
    expect(c).toBe('- [/] A')
    c = cycleTaskAtIndex(c, 0)!
    expect(c).toBe('- [?] A')
    c = cycleTaskAtIndex(c, 0)!
    expect(c).toBe('- [x] A')
    c = cycleTaskAtIndex(c, 0)!
    expect(c).toBe('- [-] A')
    c = cycleTaskAtIndex(c, 0)!
    expect(c).toBe('- [ ] A')
  })
})

describe('重复任务', () => {
  it('parseRecurrence 识别各模式', () => {
    expect(parseRecurrence('体检 🔁每年')).toBeNull()
    expect(parseRecurrence('喝水 🔁每天')).toEqual({ kind: 'everyNDays', n: 1 })
    expect(parseRecurrence('复盘 🔁每3天')).toEqual({ kind: 'everyNDays', n: 3 })
    expect(parseRecurrence('周报 🔁每周五')).toEqual({ kind: 'weekday', n: 5 })
    expect(parseRecurrence('记账 🔁每月1号')).toEqual({ kind: 'monthDay', n: 1 })
  })

  it('nextOccurrence 每天 / 每周 / 每月', () => {
    const fri = new Date(2026, 9, 23) // 2026-10-23 周五
    expect(nextOccurrence({ kind: 'everyNDays', n: 1 }, fri).getDate()).toBe(24)
    // 周五完成 → 下周五（不是当天）
    expect(nextOccurrence({ kind: 'weekday', n: 5 }, fri).getDay()).toBe(5)
    expect(nextOccurrence({ kind: 'weekday', n: 5 }, fri).getDate()).toBe(30)
    // 每月1号：10-23 → 11-01
    const nov = nextOccurrence({ kind: 'monthDay', n: 1 }, fri)
    expect(nov.getMonth()).toBe(10)
    expect(nov.getDate()).toBe(1)
  })

  it('resetRecurringTaskLine 完成时重置待办并推日期', () => {
    const now = new Date(2026, 9, 23, 12, 0) // 周五
    // 已有日期 → 替换为下一周期
    expect(resetRecurringTaskLine('- [x] 2026-10-23 🔁每天 喝水', now)).toBe(
      '- [ ] 2026-10-24 🔁每天 喝水',
    )
    // 无日期 → 在 🔁 前补日期
    expect(resetRecurringTaskLine('- [x] 🔁每周五 周报', now)).toBe('- [ ] 2026-10-30 🔁每周五 周报')
    // 非重复任务返回 null
    expect(resetRecurringTaskLine('- [x] 普通任务', now)).toBeNull()
  })

  it('setTaskAtIndex 完成重复任务时自动重置', () => {
    const now = new Date(2026, 9, 23, 12, 0)
    expect(setTaskAtIndex('- [ ] 2026-10-23 🔁每天 喝水', 0, 'done', now)).toBe(
      '- [ ] 2026-10-24 🔁每天 喝水',
    )
  })
})

describe('日期时间提取', () => {
  it('extractDueDate', () => {
    expect(extractDueDate('任务 2026-10-25 截止')).toBe('2026-10-25')
    expect(extractDueDate('补年份 10-25')).toBe(`${new Date().getFullYear()}-10-25`)
    expect(extractDueDate('没有日期')).toBeNull()
  })

  it('extractTaskTime', () => {
    expect(extractTaskTime('会议 2026-10-21 15:30')).toBe(
      new Date(2026, 9, 21, 15, 30).getTime(),
    )
    expect(extractTaskTime('全天 2026-10-21')).toBe(new Date(2026, 9, 21, 9, 0).getTime())
    const now = new Date()
    expect(extractTaskTime('今天 15:30')).toBe(
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 30).getTime(),
    )
    expect(extractTaskTime('非法 25:00')).toBeNull()
  })
})

describe('extractTasks / 归档', () => {
  it('提取任务（跳过代码块，带状态与日期）', () => {
    const content = '- [ ] A\n```\n- [x] 伪任务\n```\n- [/] B 2026-10-25'
    const tasks = extractTasks(content)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({ status: 'todo', text: 'A', index: 0 })
    expect(tasks[1]).toMatchObject({ status: 'progress', text: 'B 2026-10-25', index: 1, due: '2026-10-25' })
  })

  it('archiveCompletedTasks 移动已完成/废弃到归档区', () => {
    const content = '- [ ] 进行中\n- [x] 完成\n- [-] 废弃'
    const r = archiveCompletedTasks(content)!
    expect(r.startsWith('- [ ] 进行中')).toBe(true)
    expect(r).toContain('## 归档')
    expect(r).toContain('- [x] 完成')
    expect(r).toContain('- [-] 废弃')
  })

  it('没有可归档任务返回 null', () => {
    expect(archiveCompletedTasks('- [ ] 只有待办')).toBeNull()
  })
})

describe('列表项与任务互转', () => {
  it('列表项 → 任务 → 列表项 往返', () => {
    let content = '- 普通项'
    content = convertListItemToTask(content, 0)!
    expect(content).toBe('- [ ] 普通项')
    content = convertTaskToListItem(content, 0)!
    expect(content).toBe('- 普通项')
  })

  it('缩进保留', () => {
    expect(convertListItemToTask('  - 缩进项', 0)).toBe('  - [ ] 缩进项')
    expect(convertTaskToListItem('  - [/] 缩进任务', 0)).toBe('  - 缩进任务')
  })

  it('越界与已是任务返回 null', () => {
    expect(convertListItemToTask('- A', 3)).toBeNull()
    expect(convertListItemToTask('- [ ] A', 0)).toBeNull()
  })
})
