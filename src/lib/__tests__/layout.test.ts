import { describe, it, expect } from 'vitest'
import { tidyLayout, findSpawnSpot } from '../layout'

const mk = (id: string, width: number, height: number, z = 0, collapsed = false) => ({
  id,
  width,
  height,
  collapsed,
  z,
})

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

const spawn = (occupied: ReturnType<typeof rect>[], start = 0, viewport = { width: 1180, height: 700 }) =>
  findSpawnSpot({ occupied, size: { width: 300, height: 320 }, viewport, start })

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

  it('放不下：全部展开便签等比缩小收进一屏（12 张 300×240 → 0.85 倍 255×204）', () => {
    const notes = Array.from({ length: 12 }, (_, i) => mk(`n${i}`, 300, 240, i))
    const patches = tidyLayout(notes, { width: 1180, height: 700 })
    // 手算对照：可用高 700-28-16-16=640；原尺寸 3 行 744>640 需缩小；
    // 0.85 倍后 4 列 3 行 3*204+2*12=636≤640 放下（0.9 倍 672>640 不行）
    expect(patches).toHaveLength(12)
    for (const p of patches) {
      expect(p.width).toBe(255)
      expect(p.height).toBe(204)
    }
    expect(patches[0]).toMatchObject({ x: 16, y: 16 })
    expect(patches[3]).toMatchObject({ x: 817, y: 16 })
    expect(patches[4]).toMatchObject({ x: 16, y: 232 })
    expect(patches[11]).toMatchObject({ x: 817, y: 448 })
    // 直接断言：网格总高 ≤ 可用高（框体全部在一屏内）
    const bottom = Math.max(...patches.map((p) => p.y + (p.height ?? 0)))
    expect(bottom).toBeLessThanOrEqual(16 + 640)
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
      expect(p.width).toBe(255)
      expect(p.height).toBe(204)
    }
  })

  it('纯折叠便签：行高 28 叠行（COLLAPSED_H 参与布局）', () => {
    const patches = tidyLayout(
      [mk('c1', 300, 240, 0, true), mk('c2', 300, 240, 1, true)],
      { width: 400, height: 700 },
    )
    expect(patches[0]).toMatchObject({ x: 16, y: 16 })
    expect(patches[1]).toMatchObject({ x: 16, y: 16 + 28 + 12 })
    expect(patches[0].width).toBeUndefined()
    expect(patches[1].width).toBeUndefined()
  })

  it('超宽便签收缩到视口内（高度不动）', () => {
    const patches = tidyLayout([mk('w', 2000, 240)], { width: 1180, height: 700 })
    expect(patches[0]).toEqual({ id: 'w', x: 16, y: 16, width: 1148 })
  })
})

describe('findSpawnSpot 新便签出生定位（#8）', () => {
  it('无置顶便签：与现状级联公式逐值一致（含小视口也不改变行为）', () => {
    // 手算对照：start=3 → 3*36=108；x=60+108%320=168，y=16+108%240=124
    expect(spawn([], 3)).toEqual({ x: 168, y: 124 })
    expect(spawn([], 0)).toEqual({ x: 60, y: 16 })
    // 小视口放不下完整框体仍回现状位置（回退行为与现状一致）
    expect(spawn([], 0, { width: 300, height: 300 })).toEqual({ x: 60, y: 16 })
  })

  it('首选位置与置顶便签相交：顺延到级联序列首个空位，且完整在视口内', () => {
    // 手算对照：占位 {60,16,200,100} 挡住 x<260 且 y<116 的候选
    // k=0(60,16) k=1(96,52) k=2(132,88) 均相交；k=3(168,124) y≥116 首个空位
    const spot = spawn([rect(60, 16, 200, 100)], 0)
    expect(spot).toEqual({ x: 168, y: 124 })
    expect(spot.y + 320).toBeLessThanOrEqual(700 - 28) // 完整落在视口内（扣除菜单栏高）
    // 确定性：同参数结果稳定
    expect(spawn([rect(60, 16, 200, 100)], 0)).toEqual(spot)
  })

  it('折叠置顶便签按标题栏条带（28 高）避让，而非展开矩形', () => {
    // 手算对照：条带 {60,16,300,28} 只挡 y<44 的候选（x 全域重叠）
    // k=0(60,16) 相交；k=1(96,52) y≥44 首个空位
    expect(spawn([rect(60, 16, 300, 28)], 0)).toEqual({ x: 96, y: 52 })
    // 对照：同一位置按展开矩形（320 高）避让时，y 全域重叠只能横向逃生，
    // 顺延到 x≥360（占位右缘）的首个候选 k=35（36*35%320=300 → x=360，y=76）
    expect(spawn([rect(60, 16, 300, 320)], 0)).toEqual({ x: 360, y: 76 })
  })

  it('序列扫满无空位：回退级联首项（现状行为，允许交叠）', () => {
    // 手算对照：视口 400×400（可用高 372）→ 仅 x≤100 且 y≤52 的候选放得下：
    // k=0(60,16)、k=1(96,52) 都与占位 {60,16,300,320} 相交，其余候选超视口 → 回退 k=0
    const spot = spawn([rect(60, 16, 300, 320)], 0, { width: 400, height: 400 })
    expect(spot).toEqual({ x: 60, y: 16 })
  })

  it('有占位但视口极小、候选全部越界：同样回退级联首项', () => {
    // 占位远离候选带（不相交），视口 250 宽连首选都放不下 → 纯越界触发回退
    const spot = spawn([rect(900, 600, 200, 100)], 0, { width: 250, height: 400 })
    expect(spot).toEqual({ x: 60, y: 16 })
  })

  it('贴边候选算视口内（≤ 语义）', () => {
    // 占位 {0,0,80,30} 挡住 k=0(60,16)（y<30 相交）不挡 k=1(96,52)（x≥80 不相交）；
    // k=1：96+300=396 ≤ 400、52+320=372 = 400-28 恰好贴边 → 视为放得下
    const spot = spawn([rect(0, 0, 80, 30)], 0, { width: 400, height: 400 })
    expect(spot).toEqual({ x: 96, y: 52 })
  })
})
