import { TASK_STATUS_META, type TaskStatus } from './editor'

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

/**
 * 装饰渲染后的 HTML：把任务列表项统一标记为 li.task-item + data-status。
 * - [ ] / [x] 由 marked 生成原生 checkbox，直接标记状态
 * - [/] / [?] / [-] marked 不认识，把行首文本标记替换成状态徽章
 * 兼容紧凑列表（li 直下）和松散列表（li > p 包裹）。
 */
export function decorateTasks(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('li').forEach((li) => {
    const checkbox = ownCheckbox(li)
    if (checkbox) {
      li.classList.add('task-item')
      li.dataset.status = checkbox.hasAttribute('checked') ? 'done' : 'todo'
      return
    }
    const textNode = firstOwnTextNode(li)
    if (!textNode) return
    const text = textNode.textContent ?? ''
    const m = text.match(/^\[([/?\-])\]\s*/)
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
  })
  return doc.body.innerHTML
}
