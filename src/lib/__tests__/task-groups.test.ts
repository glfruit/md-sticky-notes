import { describe, expect, it } from 'vitest'
import { groupTasks, TASK_GROUP_META } from '../taskGroups'
import type { TaskStatus } from '../taskLines'

const NOW = new Date('2026-10-23T09:00:00')
const row = (status: TaskStatus, due: string | null, updatedAt = 1) => ({
  task: { status, due },
  note: { updatedAt },
})

describe('groupTasks 侧栏任务分组', () => {
  it('分组顺序固定为 进行中 → 快过期 → 等待 → 待办，空组不出现', () => {
    const groups = groupTasks(
      [row('todo', null), row('waiting', null), row('progress', '2026-11-01'), row('todo', '2026-10-24')],
      NOW,
    )
    expect(groups.map((g) => g.group)).toEqual(['progress', 'due-soon', 'waiting', 'todo'])
  })

  it('待办里逾期 / 今天 / 3 天内的进「快过期」，更远的留在「待办」', () => {
    const groups = groupTasks(
      [
        row('todo', '2026-11-30'), // later
        row('todo', '2026-10-24'), // 明天 → soon
        row('todo', '2026-10-20'), // 逾期
        row('todo', '2026-10-23'), // 今天
        row('todo', '2026-10-26'), // 3 天后 → soon
        row('todo', '2026-10-27'), // 4 天后 → later
      ],
      NOW,
    )
    const byGroup = Object.fromEntries(groups.map((g) => [g.group, g.rows.map((r) => r.task.due)]))
    expect(byGroup['due-soon']).toEqual(['2026-10-20', '2026-10-23', '2026-10-24', '2026-10-26'])
    expect(byGroup['todo']).toEqual(['2026-10-27', '2026-11-30'])
  })

  it('进行中的任务即使临期也留在「进行中」组（状态优先）', () => {
    const groups = groupTasks([row('progress', '2026-10-20')], NOW)
    expect(groups.map((g) => g.group)).toEqual(['progress'])
  })

  it('组内按截止日期升序，无日期靠后并按 updatedAt 降序', () => {
    const groups = groupTasks(
      [row('progress', null, 5), row('progress', '2026-10-25', 2), row('progress', null, 9), row('progress', '2026-10-24', 1)],
      NOW,
    )
    expect(groups[0].rows.map((r) => r.task.due)).toEqual(['2026-10-24', '2026-10-25', null, null])
    expect(groups[0].rows.slice(2).map((r) => r.note.updatedAt)).toEqual([9, 5])
  })

  it('完成 / 废弃不进入任何分组', () => {
    expect(groupTasks([row('done', '2026-10-20'), row('cancelled', null)], NOW)).toEqual([])
  })

  it('每个分组都有展示标签', () => {
    expect(TASK_GROUP_META.progress.label).toBe('进行中')
    expect(TASK_GROUP_META['due-soon'].label).toBe('快过期 / 逾期')
    expect(TASK_GROUP_META.waiting.label).toBe('等待')
    expect(TASK_GROUP_META.todo.label).toBe('待办')
  })
})

describe('组内优先级排序（#47：同截止或都无日期时 🔥 前）', () => {
  const now = new Date(2026, 10, 9)
  const row = (i: number, task: { status: 'todo'; due?: string; priority?: string }) => ({
    task,
    note: { updatedAt: 1000 - i },
  })

  it('同截止日期：优先级高的在前', () => {
    const groups = groupTasks(
      [
        row(0, { status: 'todo', due: '2026-11-10', priority: undefined }),
        row(1, { status: 'todo', due: '2026-11-10', priority: '🔥' }),
        row(2, { status: 'todo', due: '2026-11-10', priority: '⚡' }),
      ],
      now,
    )
    expect(groups[0]?.rows.map((r) => r.task.priority)).toEqual(['🔥', '⚡', undefined])
  })

  it('都无截止：优先级先于 updatedAt', () => {
    const groups = groupTasks(
      [
        row(0, { status: 'todo', priority: undefined }), // updatedAt 最新（1000）
        row(1, { status: 'todo', priority: '🐢' }), // updatedAt 999
      ],
      now,
    )
    expect(groups[0]?.rows.map((r) => r.task.priority)).toEqual(['🐢', undefined])
  })

  it('截止不同：日期仍最优先（🐢 带日期仍在 🔥 无日期前）', () => {
    const groups = groupTasks(
      [
        row(0, { status: 'todo', priority: '🔥' }),
        row(1, { status: 'todo', due: '2026-11-20', priority: '🐢' }), // 远期 due：不落快过期组
      ],
      now,
    )
    expect(groups[0]?.rows.map((r) => r.task.priority)).toEqual(['🐢', '🔥'])
  })
})
