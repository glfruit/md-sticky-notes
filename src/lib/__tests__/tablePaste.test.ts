import { describe, it, expect } from 'vitest'
import { tsvToMarkdown } from '../tablePaste'

describe('tsvToMarkdown', () => {
  it('Excel 复制的 TSV 转表格', () => {
    const tsv = '姓名\t年龄\n张三\t30\n李四\t25'
    expect(tsvToMarkdown(tsv)).toBe('| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 30 |\n| 李四 | 25 |')
  })

  it('单元格里的竖线被转义', () => {
    expect(tsvToMarkdown('a|b\tc\nd\te')).toContain('\\|')
  })

  it('行内空白压缩', () => {
    expect(tsvToMarkdown('a  b\tc\nd\te')).toContain('a b')
  })

  it('单列 / 单行返回 null（不算表格）', () => {
    expect(tsvToMarkdown('只有一列')).toBeNull()
    expect(tsvToMarkdown('a\tb')).toBeNull()
  })

  it('只有表头一行也返回 null（无数据行）', () => {
    expect(tsvToMarkdown('a\tb\n')).toBeNull()
  })
})
