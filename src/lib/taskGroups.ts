/** 侧栏任务分组的展示排序（纯展示：分组与组内排序规则，不含任务行解析） */
import { dueUrgency, type DueLevel, type TaskStatus } from './taskLines'

/** 侧栏任务分组的展示顺序：进行中 → 快过期/逾期（待办）→ 等待 → 待办 */
export type TaskGroupKey = 'progress' | 'due-soon' | 'waiting' | 'todo'

export const TASK_GROUP_META: Record<TaskGroupKey, { label: string }> = {
  progress: { label: '进行中' },
  'due-soon': { label: '快过期 / 逾期' },
  waiting: { label: '等待' },
  todo: { label: '待办' },
}

const DUE_SOON_LEVELS: ReadonlySet<DueLevel> = new Set(['overdue', 'today', 'soon'])

/**
 * 把侧栏任务行按状态分组并排序：
 * 进行中最上，其次待办里临期/逾期的（快过期），再次等待，最后其余待办；
 * 组内按截止日期升序，无日期的靠后、按 updatedAt 降序。完成 / 废弃不进入任何分组。
 */
export function groupTasks<
  R extends { task: { status: TaskStatus; due?: string | null }; note: { updatedAt: number } },
>(rows: R[], now = new Date()): Array<{ group: TaskGroupKey; rows: R[] }> {
  const byDue = (a: R, b: R) => {
    if (a.task.due && b.task.due) return a.task.due.localeCompare(b.task.due)
    if (a.task.due) return -1
    if (b.task.due) return 1
    return b.note.updatedAt - a.note.updatedAt
  }
  const buckets: Record<TaskGroupKey, R[]> = { progress: [], 'due-soon': [], waiting: [], todo: [] }
  for (const row of rows) {
    if (row.task.status === 'progress') buckets.progress.push(row)
    else if (row.task.status === 'waiting') buckets.waiting.push(row)
    else if (
      row.task.status === 'todo' &&
      row.task.due &&
      DUE_SOON_LEVELS.has(dueUrgency(row.task.due, now).level)
    )
      buckets['due-soon'].push(row)
    else if (row.task.status === 'todo') buckets.todo.push(row)
  }
  return (Object.keys(buckets) as TaskGroupKey[])
    .map((group) => ({ group, rows: buckets[group].sort(byDue) }))
    .filter((g) => g.rows.length > 0)
}
