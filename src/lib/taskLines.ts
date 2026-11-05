/** 任务行（Task Line）：便签正文里 `- [状态] 文本` 形式的列表项，任务的唯一载体。
 *
 * 核心不变量：预览里第 N 个任务项 = 源文围栏代码块外第 N 条任务行（五态标记都算）。
 * 本模块是该不变量的唯一属主——所有任务读写都经过同一份行集扫描 scanListLines，
 * DOM 侧（decorateTasks）按行集计数盖章（data-task-idx / data-list-idx）对齐。 */

// ---------- 五态状态机 ----------

export type TaskStatus = 'todo' | 'progress' | 'waiting' | 'done' | 'cancelled'

/** 任务行状态字符集（单一事实）：TASK_LINE_RE 与 editor.ts matchLine 的续接识别共用 */
export const TASK_MARK_CHARS = ' xX/?-'
const TASK_LINE_RE = new RegExp(`^(\\s*[-*+]\\s+\\[)([${TASK_MARK_CHARS}])(\\])`)
const FENCE_RE = /^\s*```/

const MARK_TO_STATUS: Record<string, TaskStatus> = {
  ' ': 'todo',
  x: 'done',
  X: 'done',
  '/': 'progress',
  '?': 'waiting',
  '-': 'cancelled',
}

const STATUS_TO_MARK: Record<TaskStatus, string> = {
  todo: ' ',
  progress: '/',
  waiting: '?',
  done: 'x',
  cancelled: '-',
}

/** 点击循环顺序：待办 → 进行中 → 等待 → 完成 → 废弃 → 待办 */
const CYCLE: TaskStatus[] = ['todo', 'progress', 'waiting', 'done', 'cancelled']

export const TASK_STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: '待办', color: '#78716C' },
  progress: { label: '进行中', color: '#2563EB' },
  waiting: { label: '等待', color: '#D97706' },
  done: { label: '完成', color: '#059669' },
  cancelled: { label: '废弃', color: '#A8A29E' },
}

// ---------- 行集扫描（唯一扫描入口） ----------

/** 任意列表项行（无序 / 有序 / 任务） */
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

/** 扫描出的一条任务行：head 是「缩进 + 标记 + 空格 + [」，after 是 ] 之后的原文（通常以空格开头） */
interface TaskRow {
  lineNo: number
  status: TaskStatus
  head: string
  mark: string
  after: string
}

/** 扫描出的一条列表项行（任务行也计入，保住「转为任务」的列表项序空间；
 *  互转对任务行返回 null，indent/bullet/rest 仅普通项消费） */
interface ListRow {
  lineNo: number
  indent: string
  bullet: string
  rest: string
  isTask: boolean
}

/** 一次扫描同时产出任务行集与列表项行集（均跳过围栏代码块） */
function scanListLines(content: string): { tasks: TaskRow[]; listItems: ListRow[] } {
  const tasks: TaskRow[] = []
  const listItems: ListRow[] = []
  let inFence = false
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const lm = line.match(LIST_ITEM_RE)
    if (!lm) continue
    const tm = line.match(TASK_LINE_RE)
    listItems.push({ lineNo: i, indent: lm[1], bullet: lm[2], rest: lm[3], isTask: tm !== null })
    if (tm) {
      tasks.push({
        lineNo: i,
        status: MARK_TO_STATUS[tm[2]] ?? 'todo',
        head: tm[1],
        mark: tm[2],
        after: line.slice(tm[0].length),
      })
    }
  }
  return { tasks, listItems }
}

function rewriteLine(content: string, lineNo: number, line: string): string {
  const lines = content.split('\n')
  lines[lineNo] = line
  return lines.join('\n')
}

/** 源文围栏外的任务行数与列表项数（任务行计入列表项）；decorateTasks 据此校验 DOM 对齐 */
export function listLineCounts(content: string): { tasks: number; listItems: number } {
  const { tasks, listItems } = scanListLines(content)
  return { tasks: tasks.length, listItems: listItems.length }
}

// ---------- 索引读写（index 与预览渲染顺序一致） ----------

/** 状态写入公共实现：改写行首标记；目标为「完成」且带 🔁 重复标记时自动重置回待办并推日期 */
function applyStatus(content: string, row: TaskRow, status: TaskStatus, now: Date): string | null {
  const line = content.split('\n')[row.lineNo]
  if (status === 'done') {
    const reset = resetRecurringTaskLine(line, now)
    if (reset !== null) return rewriteLine(content, row.lineNo, reset)
  }
  return rewriteLine(content, row.lineNo, `${row.head}${STATUS_TO_MARK[status]}]${row.after}`)
}

/** 把源码中第 index 个任务设置为指定状态；找不到返回 null。 */
export function setTaskAtIndex(
  content: string,
  index: number,
  status: TaskStatus,
  now = new Date(),
): string | null {
  const row = scanListLines(content).tasks[index]
  return row ? applyStatus(content, row, status, now) : null
}

/** 把源码中第 index 个任务切换到循环中的下一个状态；找不到返回 null。 */
export function cycleTaskAtIndex(content: string, index: number, now = new Date()): string | null {
  const row = scanListLines(content).tasks[index]
  if (!row) return null
  const next = CYCLE[(CYCLE.indexOf(row.status) + 1) % CYCLE.length]
  return applyStatus(content, row, next, now)
}

/** 把第 listIndex 个列表项（含任务行在内的所有列表项顺序）转换为待办任务；
 *  保留缩进、统一为 `- [ ]`；已是任务或找不到返回 null。 */
export function convertListItemToTask(content: string, listIndex: number): string | null {
  const row = scanListLines(content).listItems[listIndex]
  if (!row || row.isTask) return null
  return rewriteLine(content, row.lineNo, `${row.indent}- [ ] ${row.rest}`)
}

/** 把第 taskIndex 个任务转换回普通无序列表项（- [ ] 文本 → - 文本），找不到返回 null */
export function convertTaskToListItem(content: string, taskIndex: number): string | null {
  const row = scanListLines(content).tasks[taskIndex]
  if (!row) return null
  // head 形如「缩进 + 标记 + 空格 + [」，去掉 [ 即列表标记；after 去掉行首空白
  return rewriteLine(content, row.lineNo, `${row.head.slice(0, -1)}${row.after.replace(/^\s+/, '')}`)
}

/** 把已完成 / 废弃的任务移到便签底部的「## 归档」区。
 *  已有归档区则追加到文末（归档区约定在最后）；没有可归档任务时返回 null。 */
export function archiveCompletedTasks(content: string): string | null {
  const archivedLineNos = new Set(
    scanListLines(content)
      .tasks.filter((r) => r.status === 'done' || r.status === 'cancelled')
      .map((r) => r.lineNo),
  )
  if (archivedLineNos.size === 0) return null
  const kept: string[] = []
  const archived: string[] = []
  content.split('\n').forEach((line, i) => {
    ;(archivedLineNos.has(i) ? archived : kept).push(line)
  })
  const hasArchiveSection = kept.some((l) => /^##\s+归档\s*$/.test(l))
  const head = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
  const prefix = head ? head + '\n\n' : ''
  const body = hasArchiveSection
    ? head + '\n' + archived.join('\n') + '\n'
    : `${prefix}## 归档\n\n${archived.join('\n')}\n`
  return body
}

// ---------- 任务提取与进度 ----------

export interface TaskEntry {
  status: TaskStatus
  text: string
  /** 在全文任务序列中的序号（与预览渲染顺序一致） */
  index: number
  /** 截止日期 YYYY-MM-DD（从任务文本提取，无则 undefined） */
  due?: string
}

/** 提取便签中的所有任务（含状态与文本，跳过代码块内部） */
export function extractTasks(content: string): TaskEntry[] {
  return scanListLines(content).tasks.map((row, index) => {
    const text = row.after.trim()
    return { status: row.status, text, index, due: extractDueDate(text) ?? undefined }
  })
}

/** 预览标题栏的任务进度：已完成 / 全部。已完成 = done + cancelled（与侧栏
 *  「未完成 = todo/progress/waiting」互补）；无任务返回 null。「## 归档」区任务计入。 */
export function taskProgress(content: string): { done: number; total: number } | null {
  const tasks = extractTasks(content)
  if (tasks.length === 0) return null
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled').length
  return { done, total: tasks.length }
}

// ---------- 任务截止日期 ----------

/**
 * 从任务文本里提取截止日期：
 * - 优先 YYYY-MM-DD（⌥D 插入的标准格式）
 * - 其次 MM-DD / M-D（补当前年份）
 */
export function extractDueDate(text: string): string | null {
  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  const short = text.match(/(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)/)
  if (short) {
    const y = new Date().getFullYear()
    return `${y}-${short[1].padStart(2, '0')}-${short[2].padStart(2, '0')}`
  }
  return null
}

export type DueLevel = 'overdue' | 'today' | 'soon' | 'later'

/** 截止日期的紧迫程度与展示文案 */
export function dueUrgency(due: string, now = new Date()): { label: string; level: DueLevel } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = new Date(`${due}T00:00:00`)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days < 0) return { label: `逾期${-days}天`, level: 'overdue' }
  if (days === 0) return { label: '今天', level: 'today' }
  if (days === 1) return { label: '明天', level: 'soon' }
  if (days <= 3) return { label: `${days}天后`, level: 'soon' }
  return { label: due.slice(5).replace('-', '月') + '日', level: 'later' }
}

export const DUE_LEVEL_COLORS: Record<DueLevel, string> = {
  overdue: '#DC2626',
  today: '#DC2626',
  soon: '#D97706',
  later: '#78716C',
}

// ---------- 任务提醒时间 ----------

/**
 * 提取任务的提醒时间（毫秒时间戳），无时间信息返回 null：
 * - `2026-10-21 15:30` 完整日期时间
 * - `2026-10-21` 仅日期 → 当天上午 9:00
 * - `15:30` 仅时间 → 当天该时刻（小时需为 0-23）
 */
export function extractTaskTime(text: string): number | null {
  const dt = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (dt && +dt[4] < 24 && +dt[5] < 60) {
    return new Date(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5]).getTime()
  }
  const d = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (d) return new Date(+d[1], +d[2] - 1, +d[3], 9, 0).getTime()
  const t = text.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/)
  if (t && +t[1] < 24 && +t[2] < 60) {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), +t[1], +t[2]).getTime()
  }
  return null
}

// ---------- 重复任务 ----------

export interface Recurrence {
  /** 天数间隔模式：everyNDays = n；weekday = 0-6（周日=0）；monthDay = 几号 */
  kind: 'everyNDays' | 'weekday' | 'monthDay'
  n: number
}

const WEEKDAY_CHARS: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
}

/**
 * 解析任务文本里的重复标记：🔁每天 / 🔁每3天 / 🔁每周五 / 🔁每月1号
 */
export function parseRecurrence(text: string): Recurrence | null {
  const m = text.match(/🔁每(天|日|(\d+)天|周([一二三四五六日天])|月(\d{1,2})[号日])/)
  if (!m) return null
  if (m[1] === '天' || m[1] === '日') return { kind: 'everyNDays', n: 1 }
  if (m[2]) return { kind: 'everyNDays', n: Number(m[2]) }
  if (m[3]) return { kind: 'weekday', n: WEEKDAY_CHARS[m[3]] }
  if (m[4]) return { kind: 'monthDay', n: Math.min(31, Math.max(1, Number(m[4]))) }
  return null
}

const DAY_MS = 86400000
const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** 计算下一次发生日期（从 from 之后，不含 from 当天若刚好命中） */
export function nextOccurrence(rec: Recurrence, from = new Date()): Date {
  const base = atMidnight(from)
  if (rec.kind === 'everyNDays') {
    return new Date(base.getTime() + rec.n * DAY_MS)
  }
  if (rec.kind === 'weekday') {
    const diff = (rec.n - base.getDay() + 7) % 7 || 7
    return new Date(base.getTime() + diff * DAY_MS)
  }
  // monthDay：本月未到则本月，否则下月
  const thisMonth = new Date(base.getFullYear(), base.getMonth(), rec.n)
  if (thisMonth.getTime() > base.getTime()) return thisMonth
  return new Date(base.getFullYear(), base.getMonth() + 1, rec.n)
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

/**
 * 重复任务被标记完成时调用：返回重置后的任务行文本（回到待办 + 日期推到下一次）。
 * 不是重复任务返回 null。
 */
export function resetRecurringTaskLine(line: string, now = new Date()): string | null {
  const m = line.match(TASK_LINE_RE)
  if (!m) return null
  const text = line.slice(m[0].length)
  const rec = parseRecurrence(text)
  if (!rec) return null
  const next = fmtDate(nextOccurrence(rec, now))
  // 已有日期则替换，没有则追加在 🔁 标记前
  let newText: string
  if (extractDueDate(text)) {
    newText = text.replace(/\d{4}-\d{1,2}-\d{1,2}/, next)
  } else {
    newText = text.replace(/🔁/, `${next} 🔁`)
  }
  const head = m[0].replace(m[2], ' ') // 「[x]」→「[ ]」
  return `${head}${newText}`
}
