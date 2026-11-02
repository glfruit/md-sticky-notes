import { describe, it, expect } from 'vitest'
import { tidyLayout } from '../layout'

const mk = (id: string, width: number, height: number, z = 0, collapsed = false) => ({
  id,
  width,
  height,
  collapsed,
  z,
})

describe('tidyLayout 一屏收纳布局', () => {
  it('全部放得下：原尺寸流式排位，不改尺寸', () => {
    const patches = tidyLayout(
      [mk('a', 300, 240), mk('b', 300, 240, 1)],
      { width: 1180, height: 700 },
    )
    expect(patches).toHaveLength(2)
    expect(patches[0]).toEqual({ id: 'a', x: 16, y: 16 })
    expect(patches[1]).toEqual({ id: 'b', x: 328, y: 16 })
  })

  it('放不下：全部展开便签等比缩小收进一屏（12 张 300×240 → 0.8 倍 240×192）', () => {
    const notes = Array.from({ length: 12 }, (_, i) => mk(`n${i}`, 300, 240, i))
    const patches = tidyLayout(notes, { width: 1180, height: 700 })
    // 手算对照：可用高 700-40-16-16=628；原尺寸 3 行 744>628 需缩小；
    // 0.8 倍后 3 行 3*192+2*12=600≤628 恰好放下
    expect(patches).toHaveLength(12)
    for (const p of patches) {
      expect(p.width).toBe(240)
      expect(p.height).toBe(192)
    }
    expect(patches[0]).toMatchObject({ x: 16, y: 16 })
    expect(patches[3]).toMatchObject({ x: 772, y: 16 })
    expect(patches[4]).toMatchObject({ x: 16, y: 220 })
    expect(patches[11]).toMatchObject({ x: 772, y: 424 })
  })

  it('触下限仍放不下：回退原尺寸往下续排（现状行为）', () => {
    const notes = Array.from({ length: 30 }, (_, i) => mk(`n${i}`, 300, 240, i))
    const patches = tidyLayout(notes, { width: 400, height: 700 })
    // 手算对照：一列一张，0.6 倍(180 宽下限)时 30 行 4668 仍 > 628 → 回退原尺寸续排
    for (const p of patches) {
      expect(p.width).toBeUndefined()
      expect(p.height).toBeUndefined()
    }
    expect(patches[0]).toMatchObject({ x: 16, y: 16 })
    expect(patches[29]).toMatchObject({ x: 16, y: 16 + 29 * (240 + 12) })
  })

  it('折叠便签不参与缩放、不写回尺寸（行高恒 28）', () => {
    const notes = [mk('c', 300, 240, 0, true), ...Array.from({ length: 11 }, (_, i) => mk(`n${i}`, 300, 240, i + 1))]
    const patches = tidyLayout(notes, { width: 1180, height: 700 })
    const c = patches.find((p) => p.id === 'c')!
    expect(c.width).toBeUndefined()
    expect(c.height).toBeUndefined()
    expect(c).toMatchObject({ x: 16, y: 16 })
    // 其余展开便签仍等比缩小
    const expanded = patches.filter((p) => p.id !== 'c')
    for (const p of expanded) {
      expect(p.width).toBe(240)
      expect(p.height).toBe(192)
    }
  })

  it('超宽便签收缩到视口内（高度不动）', () => {
    const patches = tidyLayout([mk('w', 2000, 240)], { width: 1180, height: 700 })
    expect(patches[0]).toEqual({ id: 'w', x: 16, y: 16, width: 1148 })
  })
})
