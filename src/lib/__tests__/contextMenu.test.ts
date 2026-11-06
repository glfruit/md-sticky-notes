// @vitest-environment jsdom
/** 契约测试：右键路由单源（lib/contextMenu）与预览盖章 DOM（renderPreviewHtml 全链）对齐。
 *  锁死「右键第 N 个列表/任务项 → 弹对应序号的菜单」的路由半边——
 *  未盖章不响应（宁不弹，不弹错行）与 #11 盖章契约同源。 */
import { describe, expect, it } from 'vitest'
import { renderPreviewHtml } from '../markdownRender'
import { resolvePreviewContextMenu, stampIdx } from '../contextMenu'

/** 渲染源文并解析出预览根（模拟 StickyNote 的 previewRef 内容） */
function render(source: string) {
  const doc = new DOMParser().parseFromString(renderPreviewHtml(source), 'text/html')
  return doc.body
}

describe('右键路由契约：预览盖章 DOM → 菜单类型', () => {
  it('盖章任务项 → 状态菜单（带源文任务序）', () => {
    const root = render('- [ ] 任务A\n- 普通项\n- [x] 任务B')
    const taskLis = root.querySelectorAll('li.task-item')
    expect(resolvePreviewContextMenu(taskLis[0]!, root)).toEqual({ kind: 'task', index: 0 })
    expect(resolvePreviewContextMenu(taskLis[1]!, root)).toEqual({ kind: 'task', index: 1 })
  })

  it('盖章普通列表项 → 转换菜单（listIdx 盖全部 li，含任务项占位序）', () => {
    const root = render('- [ ] 任务A\n- 普通项')
    const plainLi = root.querySelector('li:not(.task-item)')!
    expect(resolvePreviewContextMenu(plainLi, root)).toEqual({ kind: 'listItem', listIndex: 1 })
  })

  it('目标落在 li 内层元素 → 按 closest(li) 归属路由', () => {
    const root = render('- [ ] 任务A')
    const inner = root.querySelector('li.task-item .task-status-trigger')!
    expect(resolvePreviewContextMenu(inner, root)).toEqual({ kind: 'task', index: 0 })
  })

  it('预览空白（不在任何 li 内）→ 便签菜单', () => {
    const root = render('- [ ] 任务A\n\n正文段落')
    const p = root.querySelector('p')!
    expect(resolvePreviewContextMenu(p, root)).toEqual({ kind: 'noteMenu' })
    expect(resolvePreviewContextMenu(root, root)).toEqual({ kind: 'noteMenu' })
  })

  it('未盖章 li → null 不响应（宁不弹，不弹错行）', () => {
    const root = render('- [ ] 任务A')
    const li = root.querySelector('li')!
    delete (li as HTMLElement).dataset.taskIdx
    delete (li as HTMLElement).dataset.listIdx
    expect(resolvePreviewContextMenu(li, root)).toBeNull()
  })

  it('closest li 在预览外（防御：target 不在 previewRoot 子树）→ 便签菜单', () => {
    const root = render('- [ ] 任务A')
    const outside = document.createElement('li')
    document.body.appendChild(outside)
    try {
      expect(resolvePreviewContextMenu(outside, root)).toEqual({ kind: 'noteMenu' })
    } finally {
      outside.remove()
    }
  })
})

describe('stampIdx：读章', () => {
  it('有章返回序号，无章 / 非整数返回 -1', () => {
    const li = document.createElement('li')
    expect(stampIdx(li, 'taskIdx')).toBe(-1)
    li.dataset.taskIdx = '3'
    expect(stampIdx(li, 'taskIdx')).toBe(3)
    li.dataset.listIdx = 'x'
    expect(stampIdx(li, 'listIdx')).toBe(-1)
    expect(stampIdx(null, 'taskIdx')).toBe(-1)
  })
})
