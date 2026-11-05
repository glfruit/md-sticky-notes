// @vitest-environment jsdom
/** 契约测试：预览渲染全链（marked → 消毒 → decorateTasks 盖章）与源文行集扫描对齐。
 *  锁死「预览第 N 个任务项 = 源文第 N 条任务行」的 DOM 半边——377fe13 修过的 bug 类的回归网。 */
import { describe, expect, it, vi } from 'vitest'
import { renderPreviewHtml } from '../markdownRender'

/** 渲染并解析出：任务项的章与状态 + 全部 li 的章 */
function render(source: string) {
  const doc = new DOMParser().parseFromString(renderPreviewHtml(source), 'text/html')
  const tasks = Array.from(doc.querySelectorAll('li.task-item')).map((li) => ({
    taskIdx: Number((li as HTMLElement).dataset.taskIdx),
    status: (li as HTMLElement).dataset.status,
  }))
  const listIdx = Array.from(doc.querySelectorAll('li')).map(
    (li) => (li as HTMLElement).dataset.listIdx ?? null,
  )
  return { tasks, listIdx }
}

describe('渲染管线契约：五态任务行盖章', () => {
  it('data-task-idx 顺序 = 源文任务行序，状态一一对应', () => {
    const source = ['- [ ] 待办', '- [/] 进行中', '- [?] 等待', '- [x] 完成', '- [-] 废弃'].join('\n')
    const { tasks, listIdx } = render(source)
    expect(tasks).toEqual([
      { taskIdx: 0, status: 'todo' },
      { taskIdx: 1, status: 'progress' },
      { taskIdx: 2, status: 'waiting' },
      { taskIdx: 3, status: 'done' },
      { taskIdx: 4, status: 'cancelled' },
    ])
    expect(listIdx).toEqual(['0', '1', '2', '3', '4'])
  })

  it('围栏代码块内的伪任务不渲染为 li、不占序', () => {
    const source = '- [ ] 真任务\n```js\n- [ ] 伪任务\n```\n- [x] 真完成'
    const { tasks, listIdx } = render(source)
    expect(tasks).toEqual([
      { taskIdx: 0, status: 'todo' },
      { taskIdx: 1, status: 'done' },
    ])
    expect(listIdx).toEqual(['0', '1'])
  })

  it('嵌套列表的 data-list-idx 按源文行序（父项在前）', () => {
    const { listIdx } = render('- 外层\n  - 内层')
    expect(listIdx).toEqual(['0', '1'])
  })

  it('嵌套任务行的 data-task-idx 跨层级按源文行序', () => {
    const { tasks, listIdx } = render('- [ ] 外层\n  - [x] 内层')
    expect(tasks).toEqual([
      { taskIdx: 0, status: 'todo' },
      { taskIdx: 1, status: 'done' },
    ])
    expect(listIdx).toEqual(['0', '1'])
  })

  it('松散列表（li > p 包裹）任务盖章同样生效', () => {
    const { tasks } = render('- [ ] A\n\n- [x] B')
    expect(tasks).toEqual([
      { taskIdx: 0, status: 'todo' },
      { taskIdx: 1, status: 'done' },
    ])
  })

  it('无列表内容渲染正常，无章可盖', () => {
    const { tasks, listIdx } = render('普通文本\n\n# 标题')
    expect(tasks).toEqual([])
    expect(listIdx).toEqual([])
  })
})

describe('渲染管线契约：计数不齐的安全降级', () => {
  it('有序任务行（marked 渲染 checkbox 但不属任务行定义）→ 不盖 data-task-idx 并 warn；列表项章仍对齐', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { tasks, listIdx } = render('1. [ ] 有序任务')
    // DOM 里有 1 个任务项（checkbox），源文任务行数 0 → 不盖章，交互端读到 NaN 不响应
    expect(tasks).toEqual([{ taskIdx: NaN, status: 'todo' }])
    // 列表项序空间对齐（源文 LIST_ITEM_RE 认 1. 开头），转换菜单仍可用
    expect(listIdx).toEqual(['0'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('引用内任务行同样安全降级（不盖章不弹状态菜单）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { tasks, listIdx } = render('> - [ ] 引用任务')
    expect(tasks).toEqual([{ taskIdx: NaN, status: 'todo' }])
    expect(listIdx).toEqual([null]) // 源文 > 开头不属列表项 → 两边都不盖
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
