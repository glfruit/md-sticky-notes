/** 右键菜单路由单源：预览区内的右键落点 → 该弹哪个菜单。
 *  全部依赖 decorateTasks 盖的章（data-task-idx / data-list-idx，#11 契约）——
 *  未盖章一律返回 null 不响应（宁不弹，不弹错行）。
 *  预览区之外（标题栏 / 便签空白）不走这里：便签根 onContextMenu 直接请求 App 便签菜单。 */

/** 读 decorateTasks 的章（data-task-idx / data-list-idx）；无章 / 非整数返回 -1 */
export const stampIdx = (el: Element | null, key: 'taskIdx' | 'listIdx'): number => {
  const v = (el as HTMLElement | null)?.dataset[key]
  if (v === undefined) return -1
  const idx = Number(v)
  return Number.isInteger(idx) ? idx : -1
}

export type PreviewContextMenu =
  | { kind: 'task'; index: number } // 盖章任务项 → 状态菜单（StickyNote ctxMenu）
  | { kind: 'listItem'; listIndex: number } // 盖章普通列表项 → 转换为任务
  | { kind: 'noteMenu' } // 预览空白（不在任何 li 内）→ App 便签菜单
  | null // 落在 li 上但章缺失 → 不响应

/** 预览区内右键路由：target 必须在 previewRoot 内（调用方保证，预览监听只挂 previewRoot） */
export function resolvePreviewContextMenu(target: Element, previewRoot: Element): PreviewContextMenu {
  const li = target.closest('li')
  if (!li || !previewRoot.contains(li)) return { kind: 'noteMenu' }
  if (li.classList.contains('task-item')) {
    const index = stampIdx(li, 'taskIdx')
    return index >= 0 ? { kind: 'task', index } : null
  }
  const listIndex = stampIdx(li, 'listIdx')
  return listIndex >= 0 ? { kind: 'listItem', listIndex } : null
}
