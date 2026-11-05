/** 整理布局纯函数层：一屏收纳的尺寸/位置计算，不 import React、不碰 DOM。
 *  供 App 的 tidyNotes 消费：产出的补丁批量写回便签。 */

/** 菜单栏高度（App MENU_H 同值；maximize 的 innerHeight−60 即 28+上下边距 16×2） */
const MENU_BAR_H = 28
/** 网格边距 / 间距 / 首行纵坐标（原 tidyNotes 现值） */
const MARGIN = 16
const GAP = 12
const TOP = 16
/** 等比缩小的宽度下限：触限仍放不下一屏则回退续排（grill #5 Q1） */
const MIN_SCALED_W = 180
/** 缩小步长（从 1.0 往下扫） */
const SCALE_STEP = 0.05

export interface TidyNoteInput {
  id: string
  width: number
  height: number
  collapsed: boolean
  z: number
}

export interface TidyPatch {
  id: string
  x: number
  y: number
  width?: number
  height?: number
}

/** 折叠便签的行高（标题栏高度，StickyNote 标题栏 h-7 + 边框） */
export const COLLAPSED_H = 28

/** flowLayout 的一行结果：生效位置/宽高 + 尺寸是否相对源数据变化 */
interface PlacedNote {
  id: string
  x: number
  y: number
  w: number
  h: number
  widthChanged: boolean
  heightChanged: boolean
}

/** 流式网格：一行放不下换行。返回每张便签的位置与生效宽高及尺寸是否变化。 */
function flowLayout(notes: TidyNoteInput[], scale: number, viewportWidth: number): PlacedNote[] {
  const maxW = viewportWidth - MARGIN * 2
  let x = MARGIN
  let y = TOP
  let rowH = 0
  const placed: PlacedNote[] = []
  for (const n of notes) {
    // 折叠便签宽不参与缩放，仅保留超宽收缩
    const w = n.collapsed ? Math.min(n.width, maxW) : Math.min(Math.round(n.width * scale), maxW)
    const scaledH = Math.round(n.height * scale)
    // 折叠便签行高恒为标题栏高，不缩放、不写回尺寸
    const h = n.collapsed ? COLLAPSED_H : scaledH
    if (x > MARGIN && x + w > viewportWidth - MARGIN) {
      x = MARGIN
      y += rowH + GAP
      rowH = 0
    }
    placed.push({
      id: n.id,
      x,
      y,
      w,
      h,
      widthChanged: w !== n.width,
      heightChanged: !n.collapsed && scaledH !== n.height,
    })
    x += w + GAP
    rowH = Math.max(rowH, h)
  }
  return placed
}

/** 网格总高（首行顶到最后一行底） */
function gridHeight(placed: { y: number; h: number }[]): number {
  let bottom = TOP
  for (const p of placed) bottom = Math.max(bottom, p.y + p.h)
  return bottom - TOP
}

/**
 * 一屏收纳布局（#5）：z 序流式网格。原尺寸放得下就原尺寸；放不下时全部
 * 展开便签等比缩小（宽高同比例、步长 0.05 递减）直到网格总高 ≤ 可用高度；
 * 宽度触 180px 下限仍放不下则回退原尺寸续排（可滚动，现状行为）。
 * 折叠便签不参与缩放（行高恒为标题栏高）；超宽便签收缩到视口内。
 * 返回位置补丁；尺寸仅在变化时附带 width/height。
 */
export function tidyLayout(
  notes: TidyNoteInput[],
  viewport: { width: number; height: number },
): TidyPatch[] {
  const sorted = [...notes].sort((a, b) => a.z - b.z)
  const usableH = viewport.height - MENU_BAR_H - TOP - MARGIN

  // 等比缩小搜索：宽度下限约束的最小比例（最窄便签决定）。
  // 找到能放下的最大比例就用它；触下限仍放不下则回退原尺寸续排（现状行为）
  const expanded = sorted.filter((n) => !n.collapsed)
  const minScale =
    expanded.length > 0
      ? Math.max(...expanded.map((n) => MIN_SCALED_W / n.width))
      : 1
  let placed = flowLayout(sorted, 1, viewport.width)
  if (gridHeight(placed) > usableH) {
    let s = 1
    let fit: typeof placed | null = null
    while (s > minScale) {
      s = Math.max(minScale, Math.round((s - SCALE_STEP) * 100) / 100)
      const candidate = flowLayout(sorted, s, viewport.width)
      if (gridHeight(candidate) <= usableH) {
        fit = candidate
        break
      }
    }
    placed = fit ?? flowLayout(sorted, 1, viewport.width)
  }

  return placed.map((p) => {
    const patch: TidyPatch = { id: p.id, x: p.x, y: p.y }
    if (p.widthChanged) patch.width = p.w
    if (p.heightChanged) patch.height = p.h
    return patch
  })
}

/** 占位矩形（AABB） */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 宽高尺寸 */
export interface Size {
  width: number
  height: number
}

/** 置顶便签的占位矩形（#8）：展开 = 完整矩形，折叠 = 标题栏条带。
 *  「折叠取条带高」的映射知识收敛在此，调用方不再各自分支。 */
export function pinnedRects(
  notes: (Pick<Rect, 'x' | 'y' | 'width' | 'height'> & { collapsed: boolean; pinned?: boolean })[],
): Rect[] {
  return notes
    .filter((n) => n.pinned)
    .map((n) => ({ x: n.x, y: n.y, width: n.width, height: n.collapsed ? COLLAPSED_H : n.height }))
}

/** 出生级联偏移带：原 addNote 公式同值（60 起步、36 步进、x 循环 320 / y 循环 240） */
const SPAWN_X0 = 60
const SPAWN_Y0 = 16
const SPAWN_STEP = 36
const SPAWN_X_RANGE = 320
const SPAWN_Y_RANGE = 240
/** x 序列 80 步一循环、y 序列 20 步一循环，扫满 80 步即穷尽全部候选位置 */
const SPAWN_SCAN_LIMIT = 80

function cascadePos(k: number): { x: number; y: number } {
  return {
    x: SPAWN_X0 + ((k * SPAWN_STEP) % SPAWN_X_RANGE),
    y: SPAWN_Y0 + ((k * SPAWN_STEP) % SPAWN_Y_RANGE),
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** 新便签出生定位（#8/#10）：置顶层恒高于普通层，出生撞上置顶便签会被盖死无法拖动。
 *  三层策略：① 无占位（无置顶便签）→ 级联首项（现状行为）；② 级联偏移带内顺延，
 *  取首个与全部占位矩形（置顶便签展开矩形/折叠条带）不相交且完整在视口内（扣除
 *  菜单栏高）的位置；③ 带被置顶盖满 → 全可见视口 36px 网格找空位，整屏盖满才回退
 *  级联首项。 */
export function findSpawnSpot(opts: {
  /** 需避让的占位矩形集合 */
  occupied: Rect[]
  /** 新便签尺寸 */
  size: Size
  /** 窗口视口（innerWidth/innerHeight，菜单栏高在函数内扣除，与 tidyLayout 同口径） */
  viewport: Size
  /** 级联序列起始序号（现有便签数） */
  start: number
}): { x: number; y: number } {
  const preferred = cascadePos(opts.start)
  if (opts.occupied.length === 0) return preferred
  const maxBottom = opts.viewport.height - MENU_BAR_H
  // 候选带恒出正坐标，x/y ≥ 0 检查为契约完整性兜底（防带常量调小后漏判）
  const contained = (r: Rect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.width <= opts.viewport.width && r.y + r.height <= maxBottom
  const hitsOccupied = (r: Rect) => opts.occupied.some((o) => intersects(r, o))
  for (let k = opts.start; k < opts.start + SPAWN_SCAN_LIMIT; k++) {
    const p = cascadePos(k)
    const rect: Rect = { x: p.x, y: p.y, width: opts.size.width, height: opts.size.height }
    if (!contained(rect) || hitsOccupied(rect)) continue
    return p
  }
  // 带扫满升级（#10）：置顶便签稍大即可盖满候选带，回退等于必然重叠——
  // 改为全可见视口 36px（SPAWN_STEP）网格自上而下、行内自左向右找首个空位
  // （容纳性由循环边界保证）；整屏被置顶盖满才回退级联首项
  for (let y = TOP; y + opts.size.height <= maxBottom; y += SPAWN_STEP) {
    for (let x = MARGIN; x + opts.size.width <= opts.viewport.width; x += SPAWN_STEP) {
      const rect: Rect = { x, y, width: opts.size.width, height: opts.size.height }
      if (!hitsOccupied(rect)) return { x, y }
    }
  }
  return preferred
}
