import { describe, it, expect } from 'vitest'
import {
  setTaskAtIndex,
  setTaskPriority,
  extractPriority,
  priorityWeight,
  cycleTaskAtIndex,
  parseRecurrence,
  nextOccurrence,
  resetRecurringTaskLine,
  extractDueDate,
  extractTaskTime,
  extractTasks,
  taskProgress,
  archiveCompletedTasks,
  convertListItemToTask,
  convertTaskToListItem,
  listLineCounts,
} from '../taskLines'

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
    // #12：废弃标记 m[2]='-' 时，字符串 replace 会误伤列表符（首个 -），须按捕获组重组行首
    expect(resetRecurringTaskLine('- [-] 🔁每天 记账', now)).toBe('- [ ] 2026-10-24 🔁每天 记账')
    expect(resetRecurringTaskLine('  - [-] 🔁每3天 复盘', now)).toBe('  - [ ] 2026-10-26 🔁每3天 复盘')
  })

  it('setTaskAtIndex 完成重复任务时自动重置', () => {
    const now = new Date(2026, 9, 23, 12, 0)
    expect(setTaskAtIndex('- [ ] 2026-10-23 🔁每天 喝水', 0, 'done', now)).toBe(
      '- [ ] 2026-10-24 🔁每天 喝水',
    )
    // #12 触发面：右键对废弃重复任务设「完成」
    expect(setTaskAtIndex('- [-] 🔁每天 记账', 0, 'done', now)).toBe('- [ ] 2026-10-24 🔁每天 记账')
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

describe('taskProgress 任务进度', () => {
  it('无任务返回 null（空文 / 纯文本 / 普通列表项）', () => {
    expect(taskProgress('')).toBeNull()
    expect(taskProgress('只是一段文字\n没有任务')).toBeNull()
    expect(taskProgress('- 普通条目\n- 另一条')).toBeNull()
  })

  it('五态混合计数：done + cancelled 计入已完成，全部计入总数', () => {
    const content = [
      '- [ ] 待办',
      '- [/] 进行中',
      '- [?] 等待',
      '- [x] 完成',
      '- [-] 废弃',
    ].join('\n')
    expect(taskProgress(content)).toEqual({ done: 2, total: 5 })
  })

  it('围栏代码块内的任务样例不计入', () => {
    const content = '- [x] 真任务\n```md\n- [ ] 伪任务\n- [x] 伪完成\n```\n- [ ] 另一个真任务'
    expect(taskProgress(content)).toEqual({ done: 1, total: 2 })
  })

  it('「## 归档」区任务计入统计', () => {
    const content = '- [ ] 待办\n\n## 归档\n\n- [x] 已完成\n- [-] 已废弃'
    expect(taskProgress(content)).toEqual({ done: 2, total: 3 })
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

describe('围栏代码块不参与任务计数（与预览渲染/侧栏一致）', () => {
  const content = [
    '- [ ] 真任务一',
    '```js',
    '- [ ] 代码块里的假任务',
    '```',
    '- [ ] 真任务二',
  ].join('\n')

  it('setTaskAtIndex 的 index 与 extractTasks 对齐', () => {
    const next = setTaskAtIndex(content, 1, 'done')!
    const lines = next.split('\n')
    expect(lines[4]).toBe('- [x] 真任务二')
    expect(lines[2]).toBe('- [ ] 代码块里的假任务')
  })

  it('cycleTaskAtIndex 同样跳过代码块', () => {
    const next = cycleTaskAtIndex(content, 1)!
    expect(next.split('\n')[4]).toBe('- [/] 真任务二')
    expect(next.split('\n')[2]).toBe('- [ ] 代码块里的假任务')
  })

  it('index 落在纯代码块便签上返回 null', () => {
    const fenced = '```js\n- [ ] 假任务\n```'
    expect(setTaskAtIndex(fenced, 0, 'done')).toBeNull()
    expect(extractTasks(fenced)).toEqual([])
  })
})

describe('listLineCounts 行集计数（decorateTasks 盖章校验的依据）', () => {
  it('任务行计入列表项，围栏内一律不计，缩进项计入', () => {
    const content = '- [ ] 任务\n- 普通项\n```js\n- [ ] 伪任务\n- 伪列表项\n```\n  - 缩进项'
    expect(listLineCounts(content)).toEqual({ tasks: 1, listItems: 3 })
  })

  it('无列表内容为零', () => {
    expect(listLineCounts('普通文本\n# 标题')).toEqual({ tasks: 0, listItems: 0 })
  })
})

describe('任务优先级 emoji（#47）', () => {
  it('extractPriority：前缀识别（含可选空白），非前缀 / 无则 null', () => {
    expect(extractPriority(' 🔥 写周报')).toBe('🔥')
    expect(extractPriority('⚡冲刺')).toBe('⚡')
    expect(extractPriority('写 🐢 周报')).toBeNull() // 不在前缀不算
    expect(extractPriority('普通任务')).toBeNull()
  })

  it('priorityWeight：🔥2 ⚡1 🐢0 无 −1', () => {
    expect(priorityWeight('🔥')).toBeGreaterThan(priorityWeight('⚡'))
    expect(priorityWeight('⚡')).toBeGreaterThan(priorityWeight('🐢'))
    expect(priorityWeight('🐢')).toBeGreaterThan(priorityWeight(undefined))
    expect(priorityWeight('未知')).toBe(-1)
  })

  it('setTaskPriority：置 / 原位换 / 清除', () => {
    // 置：插在行首标记后，单空格分隔
    expect(setTaskPriority('- [ ] 写周报', 0, '🔥')).toBe('- [ ] 🔥 写周报')
    // 换：原位替换旧档，文本不动
    expect(setTaskPriority('- [ ] 🔥 写周报', 0, '🐢')).toBe('- [ ] 🐢 写周报')
    // 清除：剥除 emoji 与多余空白
    expect(setTaskPriority('- [ ] 🔥 写周报', 0, null)).toBe('- [ ] 写周报')
    // 置于空文本任务
    expect(setTaskPriority('- [ ] ', 0, '⚡')).toBe('- [ ] ⚡')
    // 越界 null
    expect(setTaskPriority('- [ ] 任务', 3, '🔥')).toBeNull()
  })

  it('extractTasks 附带 priority；与状态/日期解析共存', () => {
    const tasks = extractTasks('- [ ] 🔥 2026-11-09 交稿\n- [ ] 普通')
    expect(tasks[0]?.priority).toBe('🔥')
    expect(tasks[0]?.due).toBe('2026-11-09')
    expect(tasks[1]?.priority).toBeUndefined()
  })

  it('重复任务标记完成：优先级 emoji 随文本保留', () => {
    const now = new Date(2026, 10, 9, 12, 0)
    const next = setTaskAtIndex('- [x] 🔥 🔁每天 喝水', 0, 'done', now)
    expect(next).toBe('- [ ] 🔥 2026-11-10 🔁每天 喝水')
  })
})
