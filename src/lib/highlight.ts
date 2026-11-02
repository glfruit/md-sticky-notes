/** 在预览 DOM 的文本节点里高亮全部匹配（大小写不敏感），返回命中数。
 *  直接改写 DOM：搜索跳转的临时高亮，便签重渲染时随 innerHTML 重建自然消失。 */
export function highlightMatches(root: HTMLElement, query: string): number {
  const q = query.trim()
  if (!q) return 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text)
  const lower = q.toLowerCase()
  let count = 0
  for (const node of nodes) {
    const text = node.nodeValue ?? ''
    if (!text.toLowerCase().includes(lower)) continue
    const frag = document.createDocumentFragment()
    let i = 0
    for (;;) {
      const hit = text.toLowerCase().indexOf(lower, i)
      if (hit === -1) {
        frag.appendChild(document.createTextNode(text.slice(i)))
        break
      }
      if (hit > i) frag.appendChild(document.createTextNode(text.slice(i, hit)))
      const mark = document.createElement('mark')
      mark.className = 'search-hit'
      mark.textContent = text.slice(hit, hit + q.length)
      frag.appendChild(mark)
      count++
      i = hit + q.length
    }
    node.parentNode?.replaceChild(frag, node)
  }
  return count
}
