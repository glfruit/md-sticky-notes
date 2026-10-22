/** 便签内容派生信息（标题、标签）的纯函数 */

/**
 * 从内容推导标题：第一行非空文本，去掉行首 Markdown 标记（标题 / 列表 / 任务 / 引用）
 * 和强调符号。注意保留正文里的连字符、括号等标点（日期「2026-10-20」不能变成「20261020」）。
 */
export function deriveTitle(content: string): string {
  const line = content.split('\n').find((l) => l.trim()) ?? ''
  const clean = line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(\s*[-*+]\s+\[[ xX/?-]\]\s*)/, '')
    .replace(/^(\s*[-*+]\s+)/, '')
    .replace(/^>\s*/, '')
    .replace(/[*_`~]+/g, '')
    .trim()
  return clean.slice(0, 24) || '新建便签'
}

const TAG_RE = /(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu

/**
 * 提取内容里的 #标签（如「#工作 #学习」，支持中文），跳过代码块。
 * 标题「# 标题」因 # 后有空格不会误判；链接锚点「(#x)」因 # 前非空白不会命中。
 */
export function extractTags(content: string): string[] {
  const out = new Set<string>()
  let inFence = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(TAG_RE)) out.add(m[2])
  }
  return [...out]
}

