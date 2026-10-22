/** 便签内容派生信息（标题等）的纯函数 */

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
