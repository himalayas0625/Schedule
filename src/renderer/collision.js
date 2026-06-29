// 事件碰撞 / 占用判定（纯函数，不依赖 DOM）
// 事件数据格式：eventsForDate['HH:MM'] = [{ text, colorType, duration? }, ...]
// duration 缺省视为 1（30 分钟），兼容老数据。

// 'HH:MM' → 0..47 的槽索引
export function slotIndex(label) {
  const [h, m] = label.split(':').map(Number);
  return h * 2 + (m >= 30 ? 1 : 0);
}

// 判断在 startSlot 放置 duration（半小时数）长度的事件是否合法。
// self = { slot:'HH:MM', idx } 时排除该事件自身（用于移动 / 改时长场景）。
export function canPlace(eventsForDate, startSlot, duration, self = null) {
  const start = slotIndex(startSlot);
  const end = start + duration - 1;
  if (end > 47) return false; // 越界（最晚 23:30）

  const selfIdx = self ? slotIndex(self.slot) : -1;
  const overlapping = [];

  for (const slotLabel of Object.keys(eventsForDate)) {
    const slot = slotIndex(slotLabel);
    const items = eventsForDate[slotLabel];
    if (!Array.isArray(items)) continue;
    items.forEach((e, idx) => {
      if (self && slot === selfIdx && idx === self.idx) return;
      const eDur = (typeof e === 'object' && e) ? (e.duration ?? 1) : 1;
      const eEnd = slot + eDur - 1;
      if (slot <= end && start <= eEnd) {
        overlapping.push({ slot, eDur });
      }
    });
  }

  if (overlapping.length === 0) return true;

  // 唯一例外：目标是短事件，且所有重叠者都是同槽短事件，且同槽已有 < 2 个
  if (duration === 1) {
    const allSameSlotShort = overlapping.every(o => o.slot === start && o.eDur === 1);
    if (allSameSlotShort && overlapping.length < 2) return true;
  }
  return false;
}
