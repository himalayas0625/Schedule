// 事件块在 #grid-body 内的 grid 定位几何（纯函数）
// 返回值供 weekGrid.js 设为 block.style.gridRow / width / justifySelf。
// 行号体系：rowIndex 为 0..47 的起始槽行号，CSS Grid 行号从 1 开始。
export function computeBlockStyle(rowIndex, duration, index, total) {
  const sideBySide = total >= 2;
  return {
    gridRow: `${rowIndex + 1} / span ${duration}`,
    widthPct: sideBySide ? 50 : 100,
    justifySelf: sideBySide ? (index === 1 ? 'end' : 'start') : 'stretch'
  };
}
