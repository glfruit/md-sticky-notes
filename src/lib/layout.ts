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
const COLLAPSED_H = 28

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
