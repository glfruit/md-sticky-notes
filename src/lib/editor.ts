/** 编辑器文本操作的纯函数助手（textarea 列表续接 / 缩进 / 任务切换） */

export interface EditResult {
  text: string
  selStart: number
  selEnd: number
}

interface LineMatch {
  /** 续接时插入的标记，如 "- "、"- [ ] "、"2. "、"> " */
  marker: string
  /** 当前行去掉标记后是否为空（空项回车 = 退出列表） */
  empty: boolean
}

function matchLine(line: string): LineMatch | null {
  let m = line.match(/^(\s*)([-*+])\s+\[( |x|X)\]\s*(.*)$/)
  if (m) return { marker: `${m[1]}${m[2]} [ ] `, empty: !m[4].trim() }
  m = line.match(/^(\s*)([-*+])\s+(.*)$/)
  if (m) return { marker: `${m[1]}${m[2]} `, empty: !m[3].trim() }
  m = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/)
  if (m) return { marker: `${m[1]}${Number(m[2]) + 1}${m[3]} `, empty: !m[4].trim() }
  m = line.match(/^(\s*)>\s?(.*)$/)
  if (m) return { marker: `${m[1]}> `, empty: !m[2].trim() }
  return null
}

/**
 * 回车自动续接列表 / 任务 / 有序列表 / 引用。
 * 返回 null 表示走默认换行。
 */
export function handleEnter(content: string, selStart: number, selEnd: number): EditResult | null {
  if (selStart !== selEnd) return null
  const lineStart = content.lastIndexOf('\n', selStart - 1) + 1
  const nlIdx = content.indexOf('\n', selStart)
  const lineEnd = nlIdx === -1 ? content.length : nlIdx
  const line = content.slice(lineStart, lineEnd)

  const match = matchLine(line)
  if (!match) return null

  if (match.empty) {
    // 空项回车：清掉当前行的标记，退出列表
    const text = content.slice(0, lineStart) + content.slice(lineEnd)
    return { text, selStart: lineStart, selEnd: lineStart }
  }

  const insert = '\n' + match.marker
  const text = content.slice(0, selStart) + insert + content.slice(selEnd)
  const cursor = selStart + insert.length
  return { text, selStart: cursor, selEnd: cursor }
}

/**
 * Tab 缩进 / Shift+Tab 反缩进。
 * 单光标：缩进当前行；有选区：缩进选区覆盖的所有行。
 */
export function handleTab(
  content: string,
  selStart: number,
  selEnd: number,
  outdent: boolean,
): EditResult {
  const lineStart = content.lastIndexOf('\n', selStart - 1) + 1
  const nlIdx = content.indexOf('\n', selEnd)
  const lineEnd = nlIdx === -1 ? content.length : nlIdx
  const block = content.slice(lineStart, lineEnd)
  const single = selStart === selEnd

  let cursorDelta = 0
  const newBlock = block
    .split('\n')
    .map((l, i) => {
      if (outdent) {
        const removed = l.startsWith('  ') ? 2 : l.startsWith('\t') || l.startsWith(' ') ? 1 : 0
        if (i === 0) cursorDelta = -removed
        return l.slice(removed)
      }
      if (i === 0) cursorDelta = 2
      return '  ' + l
    })
    .join('\n')

  const text = content.slice(0, lineStart) + newBlock + content.slice(lineEnd)
  if (single) {
    const cursor = Math.max(lineStart, selStart + cursorDelta)
    return { text, selStart: cursor, selEnd: cursor }
  }
  return { text, selStart: lineStart, selEnd: lineStart + newBlock.length }
}

/**
 * 切换源码中第 index 个任务复选框（- [ ] ↔ - [x]）。
 * index 与预览渲染出的复选框顺序一致；找不到返回 null。
 * 与 extractTasks 一致跳过围栏代码块（代码块里的任务样例行不参与计数）。
 */
export function toggleTaskAtIndex(content: string, index: number): string | null {
  const lines = content.split('\n')
  let count = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = lines[i].match(/^(\s*[-*+]\s+\[)( |x|X)(\])/)
    if (!m) continue
    count++
    if (count === index) {
      lines[i] = lines[i].replace(m[0], m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3])
      return lines.join('\n')
    }
  }
  return null
}

/**
 * 清理每行行尾的空白字符（空格 / Tab / 不换行空格）。
 * 本应用渲染时 breaks=true，换行不依赖行尾两空格，因此清理是安全的；
 * 只动行尾，保留行首缩进（嵌套列表 / 代码块需要）。
 */
export function cleanLineEndings(content: string): string {
  return content
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+$/g, ''))
    .join('\n')
}

export interface CleanupResult {
  text: string
  /** 应用了的修复项，如 ['行尾空白×3', '未闭合代码块'] */
  fixes: string[]
}

const FENCE_RE = /^\s*```/
const HR_RE = /^\s*([-*_])\1{2,}\s*$/
/** 行尾空白（空格 / Tab / 不换行空格等，不含换行本身） */
const TRAILING_WS_RE = /[^\S\n]+$/g

/**
 * Markdown 语法检查与清理（退出编辑时自动运行）。
 * 原则：保守修复、不改变内容语义；围栏代码块内部一律不动。
 *
 * - 行尾空白（空格 / Tab / 不换行空格）
 * - 标题缺空格：`#标题` → `# 标题`
 * - 列表标记缺空格：`-文字` → `- 文字`、`1.x` → `1. x`（不误伤 `---` 分割线）
 * - 任务标记规范：`-[]` / `-[x]` → `- [ ]` / `- [x]`
 * - 连续空行压缩为最多 1 行；首尾空行移除
 * - 删除空代码块；未闭合的 ``` 自动补闭合
 */
export function cleanupMarkdown(content: string): CleanupResult {
  const counts = new Map<string, number>()
  const add = (label: string, n = 1) => counts.set(label, (counts.get(label) ?? 0) + n)

  const lines = content.split('\n')
  const out: string[] = []
  let inFence = false
  let blankRun = 0

  for (const raw of lines) {
    const isFence = FENCE_RE.test(raw)
    let line = raw

    if (!inFence && !isFence) {
      // 行尾空白
      const trimmed = line.replace(TRAILING_WS_RE, '')
      if (trimmed !== line) {
        add('行尾空白')
        line = trimmed
      }
      // 标题缺空格
      const h = line.match(/^(#{1,6})(\S)/)
      if (h && h[2] !== '#') {
        line = `${h[1]} ${line.slice(h[1].length)}`
        add('标题空格')
      }
      // 任务标记规范化
      const t = line.match(/^(\s*[-*+])\[([ xX]?)\]\s*/)
      if (t) {
        const mark = t[2] === 'x' || t[2] === 'X' ? 'x' : ' '
        line = `${t[1]} [${mark}] ${line.slice(t[0].length)}`
        add('任务标记')
      } else if (!HR_RE.test(line)) {
        // 列表标记缺空格（排除分割线 --- / ***）
        const b = line.match(/^(\s*)([-*+])(\S)/)
        const o = b ? null : line.match(/^(\s*)(\d+[.)])(\S)/)
        const m = b ?? o
        if (m) {
          line = `${m[1]}${m[2]} ${m[3]}${line.slice(m[0].length)}`
          add('列表标记')
        }
      }
      // 连续空行压缩
      if (!line.trim()) {
        blankRun++
        if (blankRun >= 2) {
          add('多余空行')
          continue
        }
      } else {
        blankRun = 0
      }
    } else {
      blankRun = 0
    }
    if (isFence) inFence = !inFence
    out.push(line)
  }

  // 删除空代码块（替换为一个空行，保持段落间距）
  const noEmpty: string[] = []
  let i = 0
  while (i < out.length) {
    if (FENCE_RE.test(out[i])) {
      let j = i + 1
      while (j < out.length && !FENCE_RE.test(out[j])) j++
      if (j < out.length && out.slice(i + 1, j).every((l) => !l.trim())) {
        add('空代码块')
        noEmpty.push('')
        i = j + 1
        continue
      }
    }
    noEmpty.push(out[i])
    i++
  }

  // 最终空行规整：围栏外连续空行压缩为 1 行，首尾空行移除
  const final: string[] = []
  let run = 0
  let inFence2 = false
  for (const l of noEmpty) {
    const isFence = FENCE_RE.test(l)
    if (!inFence2 && !isFence && !l.trim()) {
      run++
      if (run >= 2) continue
    } else if (l.trim()) {
      run = 0
    }
    if (isFence) inFence2 = !inFence2
    final.push(l)
  }
  while (final.length && !final[0].trim()) final.shift()
  while (final.length && !final[final.length - 1].trim()) final.pop()

  // 未闭合代码块
  if (final.filter((l) => FENCE_RE.test(l)).length % 2 === 1) {
    final.push('```')
    add('未闭合代码块')
  }

  const text = final.join('\n')
  const fixes =
    text === content ? [] : [...counts.entries()].map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
  return { text, fixes }
}

// ---------- 任务状态机 ----------

export type TaskStatus = 'todo' | 'progress' | 'waiting' | 'done' | 'cancelled'

const TASK_LINE_RE = /^(\s*[-*+]\s+\[)([ xX/?-])(\])/

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

/** 把源码中第 index 个任务设置为指定状态；找不到返回 null。
 *  目标状态为「完成」且任务带 🔁 重复标记时，自动重置回待办并把日期推到下一次。
 *  与 extractTasks 一致跳过围栏代码块，保证 index 与预览渲染顺序对齐。 */
export function setTaskAtIndex(content: string, index: number, status: TaskStatus, now = new Date()): string | null {
  const lines = content.split('\n')
  let count = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = lines[i].match(TASK_LINE_RE)
    if (!m) continue
    count++
    if (count === index) {
      if (status === 'done') {
        const reset = resetRecurringTaskLine(lines[i], now)
        if (reset !== null) {
          lines[i] = reset
          return lines.join('\n')
        }
      }
      lines[i] = lines[i].replace(m[0], m[1] + STATUS_TO_MARK[status] + m[3])
      return lines.join('\n')
    }
  }
  return null
}

/** 把源码中第 index 个任务切换到循环中的下一个状态；找不到返回 null。
 *  重复任务循环到「完成」时同样自动重置。围栏代码块内不参与计数。 */
export function cycleTaskAtIndex(content: string, index: number, now = new Date()): string | null {
  const lines = content.split('\n')
  let count = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = lines[i].match(TASK_LINE_RE)
    if (!m) continue
    count++
    if (count === index) {
      const cur = MARK_TO_STATUS[m[2]] ?? 'todo'
      const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]
      if (next === 'done') {
        const reset = resetRecurringTaskLine(lines[i], now)
        if (reset !== null) {
          lines[i] = reset
          return lines.join('\n')
        }
      }
      lines[i] = lines[i].replace(m[0], m[1] + STATUS_TO_MARK[next] + m[3])
      return lines.join('\n')
    }
  }
  return null
}

// ---------- 任务提取与归档 ----------

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
  const out: TaskEntry[] = []
  let index = -1
  let inFence = false
  for (const line of content.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = line.match(TASK_LINE_RE)
    if (!m) continue
    index++
    const text = line.slice(m[0].length).trim()
    out.push({
      status: MARK_TO_STATUS[m[2]] ?? 'todo',
      text,
      index,
      due: extractDueDate(text) ?? undefined,
    })
  }
  return out
}

/**
 * 把已完成 / 废弃的任务移到便签底部的「## 归档」区。
 * 已有归档区则追加到文末（归档区约定在最后）；没有可归档任务时返回 null。
 */
export function archiveCompletedTasks(content: string): string | null {
  const lines = content.split('\n')
  const kept: string[] = []
  const archived: string[] = []
  let inFence = false
  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence
    const m = !inFence ? line.match(TASK_LINE_RE) : null
    if (m && (m[2] === 'x' || m[2] === 'X' || m[2] === '-')) archived.push(line)
    else kept.push(line)
  }
  if (archived.length === 0) return null
  const hasArchiveSection = kept.some((l) => /^##\s+归档\s*$/.test(l))
  const head = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
  const prefix = head ? head + '\n\n' : ''
  const body = hasArchiveSection ? head + '\n' + archived.join('\n') + '\n' : `${prefix}## 归档\n\n${archived.join('\n')}\n`
  return body
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

// ---------- 侧栏任务分组 ----------

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

// ---------- 列表项转任务 ----------

/** 任意列表项行（无序 / 有序 / 任务） */
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/

/**
 * 把第 listIndex 个列表项（DOM 中所有 li 的顺序，含任务项）转换为待办任务。
 * 保留缩进，统一为 - [ ]；已是任务或找不到返回 null。
 */
export function convertListItemToTask(content: string, listIndex: number): string | null {
  const lines = content.split('\n')
  let count = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const lm = lines[i].match(LIST_ITEM_RE)
    if (!lm) continue
    count++
    if (count === listIndex) {
      if (TASK_LINE_RE.test(lines[i])) return null
      lines[i] = `${lm[1]}- [ ] ${lm[3]}`
      return lines.join('\n')
    }
  }
  return null
}

/** 把第 taskIndex 个任务转换回普通无序列表项（- [ ] 文本 → - 文本），找不到返回 null */
export function convertTaskToListItem(content: string, taskIndex: number): string | null {
  const lines = content.split('\n')
  let count = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = lines[i].match(TASK_LINE_RE)
    if (!m) continue
    count++
    if (count === taskIndex) {
      // m[1] 形如「缩进 + 标记 + 空格 + [」，去掉 [x] 部分，保缩进与无序标记
      const rest = lines[i].slice(m[0].length).replace(/^\s+/, '')
      lines[i] = `${m[1].slice(0, -1)}${rest}`
      return lines.join('\n')
    }
  }
  return null
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
