import { describe, it, expect } from 'vitest'
import {
  tidyLayout,
  findSpawnSpot,
  noteRect,
  pinnedRects,
  canvasExtent,
  revealScroll,
  centerScroll,
  snapValue,
  edgeCandidates,
  clampIntoScrollArea,
} from '../layout'

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

  it('候选带被置顶盖满：升级为全视口网格找空位（#10）', () => {
    // 手算对照：占位 [16,16,760,600] 盖满整条候选带；视口 800×1200（可用高 1172）
    // 网格自上而下、行内自左向右：y<616 的行全被占位挡死，首行 y=16+36*17=628，
    // 行内 x=16 即空（y 与占位不相交）→ {16,628}
    const spot = spawn([rect(16, 16, 760, 600)], 0, { width: 800, height: 1200 })
    expect(spot).toEqual({ x: 16, y: 628 })
    // 确定性：同参数结果唯一
    expect(spawn([rect(16, 16, 760, 600)], 0, { width: 800, height: 1200 })).toEqual(spot)
  })

  it('整屏都被置顶盖满：升级搜索无空位，仍回退级联首项', () => {
    // 手算对照：视口 800×600（可用高 572），占位 [0,0,800,572] 全屏覆盖；
    // 网格无任何不交位置 → 回退 {60,16}
    const spot = spawn([rect(0, 0, 800, 572)], 0, { width: 800, height: 600 })
    expect(spot).toEqual({ x: 60, y: 16 })
  })

  it('升级搜索同行横向逃生：首行右侧空位（行内自左向右）', () => {
    // 手算对照：占位 [0,0,400,572] 纵贯可用高（网格所有行 y∈[16,252] 都与其
    // y∈[0,572) 相交），只能横向逃生；首行内 x 自左向右，首个 x≥400 的
    // 网格位 16+36×11=412 → {412,16}
    const spot = spawn([rect(0, 0, 400, 572)], 0, { width: 900, height: 600 })
    expect(spot).toEqual({ x: 412, y: 16 })
  })

  it('贴边候选算视口内（≤ 语义）', () => {
    // 占位 {0,0,80,30} 挡住 k=0(60,16)（y<30 相交）不挡 k=1(96,52)（x≥80 不相交）；
    // k=1：96+300=396 ≤ 400、52+320=372 = 400-28 恰好贴边 → 视为放得下
    const spot = spawn([rect(0, 0, 80, 30)], 0, { width: 400, height: 400 })
    expect(spot).toEqual({ x: 96, y: 52 })
  })
})

describe('noteRect 折叠矩形映射', () => {
  it('展开 = 完整矩形', () => {
    expect(noteRect({ ...rect(10, 20, 300, 400), collapsed: false }))
      .toEqual({ x: 10, y: 20, width: 300, height: 400 })
  })

  it('折叠 = 标题栏条带（COLLAPSED_H 高）', () => {
    expect(noteRect({ ...rect(10, 20, 300, 400), collapsed: true }))
      .toEqual({ x: 10, y: 20, width: 300, height: 28 })
  })
})

describe('pinnedRects 置顶占位', () => {
  it('只取置顶便签，映射与 noteRect 同源', () => {
    const notes = [
      { ...rect(0, 0, 100, 200), collapsed: false, pinned: true },
      { ...rect(50, 50, 100, 200), collapsed: true, pinned: false },
      { ...rect(90, 90, 100, 200), collapsed: true, pinned: true },
    ]
    expect(pinnedRects(notes)).toEqual([
      { x: 0, y: 0, width: 100, height: 200 },
      { x: 90, y: 90, width: 100, height: 28 },
    ])
  })
})

describe('canvasExtent 画布尺寸', () => {
  it('无便签：铺满视口（高扣菜单栏 28）', () => {
    expect(canvasExtent([], { width: 1180, height: 700 })).toEqual({ width: 1180, height: 672 })
  })

  it('便签超出视口：随最远边缘 + CANVAS_PAD(24) 扩展，多便签取最远', () => {
    // 手算对照：右缘 1000+300+24=1324 > 1180；下缘 500+400+24=924 > 672
    const size = canvasExtent([rect(100, 100, 300, 200), rect(1000, 500, 300, 400)], { width: 1180, height: 700 })
    expect(size).toEqual({ width: 1324, height: 924 })
  })

  it('便签在视口内：不扩展（视口兜底）', () => {
    expect(canvasExtent([rect(0, 0, 300, 200)], { width: 1180, height: 700 }))
      .toEqual({ width: 1180, height: 672 })
  })
})

describe('revealScroll 滚进可视区', () => {
  const view = { width: 1180, height: 700 }

  it('已可见：两轴都不打扰（返回原滚动位置）', () => {
    // 100-8≥0 且 100+300+8≤1180；100-8≥0 且 100+40≤700
    expect(revealScroll(rect(100, 100, 300, 200), { left: 0, top: 0 }, view))
      .toEqual({ left: 0, top: 0 })
  })

  it('横向右溢出：该轴滚到居中，另一轴不动', () => {
    // 手算对照：900+300+8=1208 > 1180 触发；left = 900-(1180-300)/2 = 900-440 = 460
    expect(revealScroll(rect(900, 100, 300, 200), { left: 0, top: 0 }, view))
      .toEqual({ left: 460, top: 0 })
  })

  it('纵向底部露出不足 40（标题栏不可见）：该轴滚到居中', () => {
    // 手算对照：y+40=720 > 700 触发；top = 680-(700-200)/2 = 680-250 = 430
    expect(revealScroll(rect(100, 680, 300, 200), { left: 0, top: 0 }, view))
      .toEqual({ left: 0, top: 430 })
  })

  it('纵向恰好露出 40：不触发（严格大于语义）', () => {
    // y+40=700 = view.height，不 > → 不打扰
    expect(revealScroll(rect(100, 660, 300, 200), { left: 0, top: 0 }, view))
      .toEqual({ left: 0, top: 0 })
  })

  it('便签比视口宽：贴 0 边（不产生负滚动）；已可见轴仍不打扰', () => {
    // 手算对照：offX 触发（50+1300+8 > 10+1180），(1180-1300)/2 为负 → left = 50-0 = 50；
    // y=60 在已滚视口 [10,710] 内可见（60+40=100 ≤ 710）→ top 保持原值 10
    expect(revealScroll(rect(50, 60, 1300, 800), { left: 10, top: 10 }, view))
      .toEqual({ left: 50, top: 10 })
  })

  it('便签比视口高且纵向越界：top 贴便签原点', () => {
    // 手算对照：y-8=692 < 700 触发；(700-min(800,700)=700)/2=0 → top = 700-0 = 700
    expect(revealScroll(rect(50, 700, 300, 800), { left: 0, top: 0 }, view))
      .toEqual({ left: 0, top: 700 })
  })
})

describe('centerScroll 滚到正中', () => {
  it('目标在画布中部：两轴居中', () => {
    // 手算对照：left = 600+150-500=250（≤ 1000 不钳）；top = 600+100-300=400（≤ 900 不钳）
    expect(centerScroll(rect(600, 600, 300, 200), { width: 1000, height: 600 }, { width: 2000, height: 1500 }))
      .toEqual({ left: 250, top: 400 })
  })

  it('目标偏出画布末端：钳到 scrollMax（画布-视口）', () => {
    // 手算对照：left = 1700+150-500=1350 → min(1350,1000)=1000；top = 1300+100-300=1100 → min(1100,900)=900
    expect(centerScroll(rect(1700, 1300, 300, 200), { width: 1000, height: 600 }, { width: 2000, height: 1500 }))
      .toEqual({ left: 1000, top: 900 })
  })

  it('目标在画布头部：钳到 0（不产生负滚动）', () => {
    // left = 100+150-500=-250 → max(0,·)=0
    expect(centerScroll(rect(100, 100, 300, 200), { width: 1000, height: 600 }, { width: 2000, height: 1500 }))
      .toEqual({ left: 0, top: 0 })
  })

  it('画布比视口还小：钳到 0', () => {
    // content-view = -200/-100 → min 为负 → max(0,·)=0
    expect(centerScroll(rect(600, 600, 300, 200), { width: 1000, height: 600 }, { width: 800, height: 500 }))
      .toEqual({ left: 0, top: 0 })
  })
})

describe('snapValue 拖动吸附', () => {
  it('距候选 ≤ SNAP_DIST(8) 吸上（两侧对称）', () => {
    expect(snapValue(108, [100])).toBe(100)
    expect(snapValue(92, [100])).toBe(100)
  })

  it('距候选 9：不吸（原值返回）', () => {
    expect(snapValue(109, [100])).toBe(109)
  })

  it('多候选取最近；无候选原值', () => {
    expect(snapValue(105, [100, 103, 90])).toBe(103)
    expect(snapValue(100, [])).toBe(100)
  })

  it('等距时先出现的候选获胜（保序语义，与原实现一致）', () => {
    expect(snapValue(104, [100, 108])).toBe(100)
  })
})

describe('edgeCandidates 对齐候选线', () => {
  it('三值：左缘 / 右缘 / 右缘贴齐（目标右缘 − 拖动便签宽）', () => {
    // 手算对照：xs = [100, 300, 300-300=0]；ys = [50, 170, 170-320=-150]
    expect(edgeCandidates(rect(100, 50, 200, 120), { width: 300, height: 320 }))
      .toEqual({ xs: [100, 300, 0], ys: [50, 170, -150] })
  })
})

describe('clampIntoScrollArea 负坐标裁剪', () => {
  it('非负坐标：原引用返回（零拷贝）', () => {
    const n = { x: 10, y: 0, id: 'a' }
    expect(clampIntoScrollArea(n)).toBe(n)
  })

  it('负坐标裁到 ≥ 0，其余字段保留', () => {
    expect(clampIntoScrollArea({ x: -20, y: 50, id: 'a' })).toEqual({ x: 0, y: 50, id: 'a' })
    expect(clampIntoScrollArea({ x: -20, y: -5, id: 'b' })).toEqual({ x: 0, y: 0, id: 'b' })
  })
})
