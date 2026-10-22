/** 单元格清洗：转义竖线、压缩空白 */
function cleanCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function rowsToMarkdown(rows: string[][]): string | null {
  if (rows.length === 0) return null
  const cols = Math.max(...rows.map((r) => r.length))
  if (cols === 0) return null
  const norm = rows.map((r) => [...r, ...Array<string>(cols - r.length).fill('')])
  const header = `| ${norm[0].join(' | ')} |`
  const sep = `|${' --- |'.repeat(cols)}`
  const body = norm
    .slice(1)
    .map((r) => `| ${r.join(' | ')} |`)
    .join('\n')
  return body ? `${header}\n${sep}\n${body}` : `${header}\n${sep}`
}

/** 从剪贴板 HTML 中提取 <table> 并转成 Markdown 表格 */
export function htmlTableToMarkdown(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null
  const rows: string[][] = []
  table.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = []
    tr.querySelectorAll('th, td').forEach((c) => cells.push(cleanCell(c.textContent ?? '')))
    if (cells.length > 0) rows.push(cells)
  })
  return rowsToMarkdown(rows)
}

/** 把 Excel / Numbers 复制的 TSV 文本转成 Markdown 表格 */
export function tsvToMarkdown(text: string): string | null {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim())
  if (lines.length < 2) return null
  const rows = lines.map((l) => l.split('\t').map(cleanCell))
  if (rows.some((r) => r.length < 2)) return null
  return rowsToMarkdown(rows)
}
