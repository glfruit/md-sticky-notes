/** textarea 编辑机制：列表续接 / 缩进 / 退出编辑时的语法清理。
 *  任务行的解析与读写见 taskLines.ts。 */
import { TASK_MARK_CHARS } from './taskLines'

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

// 任务续接识别与 taskLines.TASK_LINE_RE 共用 TASK_MARK_CHARS（单一事实，#9 教训：两处字符集曾漂移）
const TASK_CONT_RE = new RegExp(`^(\\s*)([-*+])\\s+\\[([${TASK_MARK_CHARS}])\\]\\s*(.*)$`)

function matchLine(line: string): LineMatch | null {
  let m = line.match(TASK_CONT_RE)
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

// ---------- 选区与块插入（useNoteEditor 消费，#38 同形提取） ----------

/** 把 content 按选区 [start, end) 切成三段（DOM selection 合法输入下不做钳制之外的事）。
 *  越界钳到 [0, length]、end < start 时归一为空选区——防御性契约，正常路径逐字等价于
 *  原五处手写 slice。 */
export function splitAt(
  content: string,
  start: number,
  end: number,
): { before: string; selected: string; after: string } {
  const s = Math.max(0, Math.min(start, content.length))
  const e = Math.max(s, Math.min(end, content.length))
  return { before: content.slice(0, s), selected: content.slice(s, e), after: content.slice(e) }
}

/** 块级内容（图片引用 / 表格）插入前后的空行补齐：前保双换行、后保单换行。
 *  insertTable / insertBlock 原两处逐字同形，提取单源。 */
export function blockPadding(before: string, after: string): { lead: string; tail: string } {
  return {
    lead: before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '',
    tail: after && !after.startsWith('\n') ? '\n' : '',
  }
}
