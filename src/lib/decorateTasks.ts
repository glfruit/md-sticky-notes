import { listLineCounts, TASK_STATUS_META, type TaskStatus } from './taskLines'

/** 文本形式的状态标记 → 状态（[/] 进行中、[?] 等待、[-] 废弃） */
const TEXT_MARKERS: Record<string, TaskStatus> = {
  '/': 'progress',
  '?': 'waiting',
  '-': 'cancelled',
}

/** 找到属于该 li 自身的 checkbox（嵌套子列表的不算）；紧凑列表在 li 直下，松散列表在 li > p 里 */
function ownCheckbox(li: HTMLLIElement): HTMLInputElement | null {
  for (const input of Array.from(li.querySelectorAll('input[type="checkbox"]'))) {
    if (input.closest('li') === li) return input as HTMLInputElement
  }
  return null
}

/** 找到该 li 自身内容的第一个非空文本节点（紧凑列表在 li 直下，松散列表在 li > p 里） */
function firstOwnTextNode(li: HTMLLIElement): ChildNode | null {
  const hosts: ParentNode[] = [li]
  const p = li.querySelector(':scope > p')
  if (p) hosts.unshift(p)
  for (const host of hosts) {
    for (const child of Array.from(host.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent ?? '').trim()) {
        return child
      }
    }
  }
  return null
}

/** 悬浮状态下拉箭头（▾）的内联 SVG */
const TRIGGER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

/**
 * 悬浮显示的状态切换箭头（▾）：
 * 紧凑列表放在 li 直下、松散列表放在 li > p 末尾（保证和文字同行），嵌套子列表之前。
 */
function appendStatusTrigger(li: HTMLLIElement) {
  const trigger = li.ownerDocument.createElement('span')
  trigger.className = 'task-status-trigger'
  trigger.title = '切换状态'
  trigger.innerHTML = TRIGGER_SVG
  const p = li.querySelector(':scope > p') as HTMLParagraphElement | null
  const host: HTMLElement = p ?? li
  const nested = p ? null : host.querySelector(':scope > ul, :scope > ol')
  if (nested) host.insertBefore(trigger, nested)
  else host.appendChild(trigger)
}

/**
 * 装饰渲染后的 HTML（需传入便签源文 content 做对齐校验）：
 * - [ ] / [x] 由 marked 生成原生 checkbox，直接标记状态
 * - [/] / [?] / [-] marked 不认识，把行首文本标记替换成状态徽章
 * 同时给每个任务项追加悬浮显示的 ▾ 箭头（点击展开状态菜单）。
 * 兼容紧凑列表（li 直下）和松散列表（li > p 包裹）。
 *
 * 盖章契约（与 taskLines.scanListLines 对齐）：
 * - DOM 任务 li 数 === 源文任务行数 → 每个 li 盖 data-task-idx（= 源文任务序）
 * - DOM li 总数 === 源文列表项数 → 每个 li 盖 data-list-idx（= 源文列表项序）
 * 计数不齐说明渲染与扫描脱节（如有序任务行、引用内任务行）：不盖章并 warn，
 * 交互端读到无章即不响应——宁点不动，不改错行。
 */
export function decorateTasks(html: string, content: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const taskLis: HTMLLIElement[] = []
  const allLis: HTMLLIElement[] = []
  doc.querySelectorAll('li').forEach((li) => {
    allLis.push(li)
    const checkbox = ownCheckbox(li)
    if (checkbox) {
      li.classList.add('task-item')
      li.dataset.status = checkbox.hasAttribute('checked') ? 'done' : 'todo'
      appendStatusTrigger(li)
      taskLis.push(li)
      return
    }
    const textNode = firstOwnTextNode(li)
    if (!textNode) return
    const text = textNode.textContent ?? ''
    const m = text.match(/^\[([/?-])\]\s*/)
    if (!m) return
    const status = TEXT_MARKERS[m[1]]
    if (!status) return
    const badge = doc.createElement('span')
    badge.className = `task-badge task-${status}`
    badge.textContent = TASK_STATUS_META[status].label
    // 插到文本节点之前（松散列表里是 li > p 内部，保证徽章和文字同行）
    textNode.parentNode?.insertBefore(badge, textNode)
    textNode.textContent = text.slice(m[0].length)
    li.classList.add('task-item')
    li.dataset.status = status
    appendStatusTrigger(li)
    taskLis.push(li)
  })

  const counts = listLineCounts(content)
  if (taskLis.length === counts.tasks) {
    taskLis.forEach((li, i) => (li.dataset.taskIdx = String(i)))
  } else {
    console.warn(`[decorateTasks] 任务行未盖章：DOM ${taskLis.length} 项 ≠ 源文 ${counts.tasks} 条`)
  }
  if (allLis.length === counts.listItems) {
    allLis.forEach((li, i) => (li.dataset.listIdx = String(i)))
  } else {
    console.warn(`[decorateTasks] 列表项未盖章：DOM ${allLis.length} 项 ≠ 源文 ${counts.listItems} 条`)
  }
  return doc.body.innerHTML
}
