# 事件时长可拖拽扩展 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个事件可通过拖动底部手柄，把时长从 30 分钟扩展到 1 小时或更长，事件块在网格中跨多个半小时槽显示。

**Architecture:** 事件对象新增 `duration`（半小时数，默认 1），仍以起始槽单点存储。碰撞规则抽成纯函数 `canPlace`（短并排 / 长独占）。渲染上把 `event-block` 从「cell 子元素」升为「`#grid-body` 的直接 grid 子元素」，用 `grid-row: span N` 跨多行、`grid-column` 对齐天列、`justify-self + width` 处理并排。底部 resize 手柄用 pointer events，实时调 `canPlace` 校验后提交 `setEventDuration`。

**Tech Stack:** Electron 29、Vanilla JS (ESM)、vitest 4、CSS Grid。

**对设计 §5 的修订：** 渲染路线由 `position:absolute` 改为 `grid-row span`。理由：`#grid-body` 已是 `display:grid; grid-template-rows: repeat(48, var(--cell-height))`，`grid-column`（对齐天列）与 `grid-row: span N`（跨多槽）都是原生能力，免去 absolute 的坐标计算；resize 仅改 span 值。短并排用 `width:50% + justify-self:start/end` 实现。

## Global Constraints

- `duration` 单位 = 半小时，默认 1（30 分钟）。合法范围：`1..(48 - startSlotIndex)`。
- 48 槽，索引 `0..47`（`'00:00'..'23:30'`）；越界约束 `startSlotIndex + duration ≤ 48`。
- 短事件（`duration=1`）同起始槽最多并排 2 个；长事件（`duration≥2`）独占其区间。
- `CELL_HEIGHT = 40px`，必须与 CSS `--cell-height` 一致。
- 仅向下扩展（只改 `duration`，不动起始槽）；最晚到 23:30。
- 老数据惰性兼容：读取时 `duration ?? 1`，**不写迁移脚本**。
- 只读模式（`window.__readOnly === true`）禁用 resize，与 `FloatingEditor` 拦截一致。
- 代码风格：ESM、2 空格缩进、单引号、分号、`eqeqeq`、`prefer-const`、`no-var`（见 `eslint.config.mjs`）。
- 测试：`npm test`（= `vitest run`）；渲染/交互任务用 `npm start` 手动验证。

---

## File Structure

| 文件 | 职责 | 任务 |
|------|------|------|
| `src/renderer/collision.js`（新建） | `slotIndex(label)` 与 `canPlace(...)` 纯函数：碰撞 / 占用判定 | Task 1 |
| `src/renderer/blockLayout.js`（新建） | `computeBlockStyle(...)` 纯函数：block 的 grid 定位与并排几何 | Task 3 |
| `src/renderer/dataManager.js`（改） | `setEvent/setEventItem/addEvent` 加 `duration`；新增 `setEventDuration` | Task 2 |
| `src/renderer/weekGrid.js`（改） | block 升为 grid 子元素、跨行、resize 手柄、拖拽带 duration | Task 4/6/7 |
| `src/renderer/styles/grid.css`（改） | `.event-block` 卡片样式（从 `.grid-cell.has-event` 迁移）+ `.resize-handle` | Task 4/5/6 |
| `src/renderer/app.js`（改） | 新增 `onEventDurationChange` callback | Task 6 |
| `test/collision.test.js`（新建） | `canPlace` / `slotIndex` 单测 | Task 1 |
| `test/blockLayout.test.js`（新建） | `computeBlockStyle` 单测 | Task 3 |
| `test/dataManager.test.js`（改） | `duration` 读写单测 | Task 2 |

---

## Task 1: 碰撞判定纯函数 `canPlace`

**Files:**
- Create: `src/renderer/collision.js`
- Test: `test/collision.test.js`

**Interfaces:**
- Produces: `slotIndex(label: 'HH:MM') → number (0..47)`；`canPlace(eventsForDate, startSlot:'HH:MM', duration:number, self?:{slot:'HH:MM', idx:number}) → boolean`。`eventsForDate` 形如 `{ '09:00': [{text,colorType,duration?}, ...] }`。

- [ ] **Step 1: 写失败测试**

Create `test/collision.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { canPlace, slotIndex } from '../src/renderer/collision.js';

describe('slotIndex', () => {
  it('converts HH:MM label to 0..47 slot index', () => {
    expect(slotIndex('00:00')).toBe(0);
    expect(slotIndex('00:30')).toBe(1);
    expect(slotIndex('09:00')).toBe(18);
    expect(slotIndex('23:30')).toBe(47);
  });
});

describe('canPlace', () => {
  it('allows placing in an empty day', () => {
    expect(canPlace({}, '09:00', 1)).toBe(true);
    expect(canPlace({}, '09:00', 4)).toBe(true);
  });

  it('rejects overflow beyond 23:30', () => {
    expect(canPlace({}, '23:30', 1)).toBe(true);
    expect(canPlace({}, '23:30', 2)).toBe(false);
    expect(canPlace({}, '23:00', 2)).toBe(true);
    expect(canPlace({}, '23:00', 3)).toBe(false);
  });

  it('allows a second short event in the same slot', () => {
    const day = { '09:00': [{ text: 'a', colorType: 0 }] };
    expect(canPlace(day, '09:00', 1)).toBe(true);
  });

  it('rejects a third short event in the same slot', () => {
    const day = { '09:00': [{ text: 'a' }, { text: 'b' }] };
    expect(canPlace(day, '09:00', 1)).toBe(false);
  });

  it('rejects a short event landing inside a long event span', () => {
    const day = { '09:00': [{ text: 'a', duration: 2 }] }; // 占 09:00, 09:30
    expect(canPlace(day, '09:30', 1)).toBe(false);
    expect(canPlace(day, '10:00', 1)).toBe(true);
  });

  it('rejects a long event overlapping an existing short event', () => {
    const day = { '09:30': [{ text: 'a' }] };
    expect(canPlace(day, '09:00', 2)).toBe(false);
  });

  it('rejects overlap between two long events', () => {
    const day = { '09:00': [{ text: 'a', duration: 3 }] }; // 占 09:00,09:30,10:00
    expect(canPlace(day, '10:30', 1)).toBe(true);
    expect(canPlace(day, '10:00', 2)).toBe(false);
  });

  it('excludes self when resizing/moving the same event', () => {
    const day = { '09:00': [{ text: 'a', duration: 1 }] };
    expect(canPlace(day, '09:00', 3, { slot: '09:00', idx: 0 })).toBe(true);
  });

  it('treats legacy events without duration as 30 minutes', () => {
    const day = { '09:00': [{ text: 'a' }] };
    expect(canPlace(day, '09:30', 1)).toBe(true);
    expect(canPlace(day, '09:00', 2)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- collision`
Expected: FAIL — `Cannot find module '../src/renderer/collision.js'`

- [ ] **Step 3: 实现 `collision.js`**

Create `src/renderer/collision.js`:

```js
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- collision`
Expected: PASS（所有用例绿）

- [ ] **Step 5: 提交**

```bash
git add src/renderer/collision.js test/collision.test.js
git commit -m "feat: 新增事件碰撞判定纯函数 canPlace

为事件时长可扩展功能提供占用判定：短事件同槽最多2个、长事件
独占区间、越界与老数据兼容。含 slotIndex 与完整单测。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: DataManager 支持 duration

**Files:**
- Modify: `src/renderer/dataManager.js:45-85`（`setEvent` / `setEventItem` / `addEvent`）
- Modify: `src/renderer/dataManager.js`（新增 `setEventDuration`，插入到 `addEvent` 之后、`clearEvent` 之前，即原 `:87` 前）
- Test: `test/dataManager.test.js`（在 `describe('DataManager', ...)` 块内追加用例）

**Interfaces:**
- Produces: `setEvent/setEventItem/addEvent` 末位新增可选 `duration` 形参；新增 `setEventDuration(weekKey, dateStr, timeSlot, index, duration) → Promise<boolean>`。读取方需用 `item.duration ?? 1` 兼容老数据。

- [ ] **Step 1: 追加失败测试**

在 `test/dataManager.test.js` 的 `describe('DataManager', () => { ... })` 内、最后一个 `it(...)` 之后追加：

```js
  it('persists duration when creating a new event', async () => {
    mockElectronAPI.getAll.mockResolvedValue({ weeks: {}, settings: {} });
    await dm.load();

    await dm.setEvent('2026-W26', '2026-06-29', '09:00', 'Meeting', 0, 2);

    expect(dm.getWeekData('2026-W26').events['2026-06-29']['09:00'][0])
      .toEqual({ text: 'Meeting', colorType: 0, duration: 2 });
  });

  it('defaults duration to 1 when adding without specifying', async () => {
    mockElectronAPI.getAll.mockResolvedValue({ weeks: {}, settings: {} });
    await dm.load();

    await dm.addEvent('2026-W26', '2026-06-29', '09:00', 'Quick');

    expect(dm.getWeekData('2026-W26').events['2026-06-29']['09:00'][0].duration).toBe(1);
  });

  it('preserves duration when editing text via setEventItem', async () => {
    mockElectronAPI.getAll.mockResolvedValue({
      weeks: { '2026-W26': { events: { '2026-06-29': { '09:00': [{ text: 'Old', colorType: 0, duration: 3 }] } } } },
      settings: {}
    });
    await dm.load();

    await dm.setEventItem('2026-W26', '2026-06-29', '09:00', 'New', 0, 1);

    const item = dm.getWeekData('2026-W26').events['2026-06-29']['09:00'][0];
    expect(item.text).toBe('New');
    expect(item.duration).toBe(3);
  });

  it('setEventDuration changes only the duration field', async () => {
    mockElectronAPI.getAll.mockResolvedValue({
      weeks: { '2026-W26': { events: { '2026-06-29': { '09:00': [{ text: 'Meeting', colorType: 1, duration: 1 }] } } } },
      settings: {}
    });
    await dm.load();

    const ok = await dm.setEventDuration('2026-W26', '2026-06-29', '09:00', 0, 4);

    expect(ok).toBe(true);
    expect(dm.getWeekData('2026-W26').events['2026-06-29']['09:00'][0])
      .toEqual({ text: 'Meeting', colorType: 1, duration: 4 });
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- dataManager`
Expected: FAIL（`duration` 字段相关断言不通过）

- [ ] **Step 3: 改 `setEvent`（`dataManager.js:45-59`）**

把原 `setEvent` 整体替换为：

```js
  // 设置 index 0 处的事件（新建或覆盖首个）
  async setEvent(weekKey, dateStr, timeSlot, text, colorType = 0, duration) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    const finalDuration = duration ?? items[0]?.duration ?? 1;
    if (items.length === 0) {
      this._data.weeks[weekKey].events[dateStr][timeSlot] = [{ text, colorType, duration: finalDuration }];
    } else {
      items[0] = { text, colorType, duration: finalDuration };
      this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
    }
    return await this._persistWeek(weekKey, previousWeekData);
  }
```

- [ ] **Step 4: 改 `setEventItem`（`dataManager.js:62-72`）**

把原 `setEventItem` 整体替换为：

```js
  // 更新指定 index 处的事件（不传 duration 时保留原时长）
  async setEventItem(weekKey, dateStr, timeSlot, text, index, colorType = 0, duration) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    const finalDuration = duration ?? items[index]?.duration ?? 1;
    items[index] = { text, colorType, duration: finalDuration };
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
    return await this._persistWeek(weekKey, previousWeekData);
  }
```

- [ ] **Step 5: 改 `addEvent`（`dataManager.js:75-85`）**

把原 `addEvent` 整体替换为：

```js
  // 追加一个新事件到当前 slot（新事件默认 30 分钟）
  async addEvent(weekKey, dateStr, timeSlot, text, colorType = 0, duration = 1) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    items.push({ text, colorType, duration });
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
    return await this._persistWeek(weekKey, previousWeekData);
  }
```

- [ ] **Step 6: 新增 `setEventDuration`**

在 `addEvent` 方法之后（原 `:87` `// 清除整个 slot` 注释前）插入：

```js
  // 仅修改指定事件的时长（半小时数），不改文本 / 颜色 / 起始槽
  // 调用方（resize 手柄）需先用 canPlace 校验不冲突后再调用
  async setEventDuration(weekKey, dateStr, timeSlot, index, duration) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr];
    if (!day?.[timeSlot]) return true;
    const items = this._getItems(weekKey, dateStr, timeSlot);
    if (!items[index]) return true;
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    items[index] = { ...items[index], duration };
    day[timeSlot] = items;
    return await this._persistWeek(weekKey, previousWeekData);
  }

```

- [ ] **Step 7: 运行测试，确认通过**

Run: `npm test -- dataManager`
Expected: PASS（新旧用例全绿）

- [ ] **Step 8: 提交**

```bash
git add src/renderer/dataManager.js test/dataManager.test.js
git commit -m "feat: DataManager 支持 duration 字段与 setEventDuration

setEvent/setEventItem/addEvent 末位新增 duration 形参，编辑文本时
保留原时长；新增 setEventDuration 专用于 resize 改时长。老数据
缺 duration 视为 1。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: block 定位纯函数 `computeBlockStyle`

**Files:**
- Create: `src/renderer/blockLayout.js`
- Test: `test/blockLayout.test.js`

**Interfaces:**
- Produces: `computeBlockStyle(rowIndex, duration, index, total) → { gridRow, widthPct, justifySelf }`。`rowIndex` 为起始槽行号（0..47，即 `slotIndex` 或 `TIMES.indexOf`）；`index`/`total` 为该起始槽内并排事件的序号与总数。

- [ ] **Step 1: 写失败测试**

Create `test/blockLayout.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeBlockStyle } from '../src/renderer/blockLayout.js';

describe('computeBlockStyle', () => {
  it('positions a single short event full width', () => {
    expect(computeBlockStyle(18, 1, 0, 1)).toEqual({
      gridRow: '19 / span 1', widthPct: 100, justifySelf: 'stretch'
    });
  });

  it('spans multiple rows for a long event', () => {
    expect(computeBlockStyle(18, 2, 0, 1).gridRow).toBe('19 / span 2');
    expect(computeBlockStyle(0, 4, 0, 1).gridRow).toBe('1 / span 4');
  });

  it('splits two side-by-side short events into halves', () => {
    expect(computeBlockStyle(18, 1, 0, 2)).toEqual({
      gridRow: '19 / span 1', widthPct: 50, justifySelf: 'start'
    });
    expect(computeBlockStyle(18, 1, 1, 2).justifySelf).toBe('end');
  });

  it('keeps a long exclusive event full width', () => {
    expect(computeBlockStyle(18, 3, 0, 1).widthPct).toBe(100);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npm test -- blockLayout`
Expected: FAIL — `Cannot find module '../src/renderer/blockLayout.js'`

- [ ] **Step 3: 实现 `blockLayout.js`**

Create `src/renderer/blockLayout.js`:

```js
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
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm test -- blockLayout`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/blockLayout.js test/blockLayout.test.js
git commit -m "feat: 新增 block grid 定位纯函数 computeBlockStyle

计算事件块的 grid-row span、并排宽度与 justify-self，供渲染层
统一处理短事件并排与长事件跨行。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 渲染结构重构 — block 升为 grid 子元素、跨行

> 本任务把 `event-block` 从 cell 内提出、改为 `#grid-body` 的直接 grid 子元素并跨行。**仅做结构 + 让 block 可见的最小样式**；主题/颜色分类的完整样式迁移放到 Task 5。完成后：长事件在网格里能跨多行可见、点击/拖拽/编辑不破。

**Files:**
- Modify: `src/renderer/weekGrid.js:18`（`_dragState` 注释）、`:29-38`（`_removeBlock`）、`:394-402`（渲染挂载）、`:603-677`（`_makeEventBlock`）、`:225`（`FloatingEditor.open` 第一参数语义）
- Modify: `src/renderer/styles/grid.css`（新增 `.event-block` 基础可见样式）

**Interfaces:**
- Consumes: `computeBlockStyle`（Task 3）
- Produces: `event-block` 为 `#grid-body` 直接子元素；block 带 `dataset.date/time/duration/index`；`_removeBlock(block)` 重排同槽剩余 block。

- [ ] **Step 1: 新增 import 与归组辅助**

`weekGrid.js:1` 起，在现有 import 之后新增：

```js
import { computeBlockStyle } from './blockLayout.js';
```

把 `weekGrid.js:18` 的 `_dragState` 注释改为（本任务不动其结构，仅同步注释，duration 在 Task 7 加）：

```js
let _dragState = null;   // { date, timeSlot, index, blockRef, text, colorType }（Task 7 起含 duration）
```

- [ ] **Step 2: 重写 `_removeBlock`（`weekGrid.js:29-38`）**

block 不再在 cell 内，改为按 `data-date/data-time` 归组。整体替换为：

```js
// ── 辅助：移除 block，重排同槽剩余 block 的 index 与宽度 ──────────────────────
function _removeBlock(block) {
  const body = document.getElementById('grid-body');
  const dateStr = block.dataset.date;
  const timeSlot = block.dataset.time;
  block.remove();
  if (!body || !dateStr || !timeSlot) return;
  const siblings = Array.from(body.querySelectorAll(
    `.event-block[data-date="${dateStr}"][data-time="${timeSlot}"]`
  ));
  const rowIndex = TIMES.indexOf(timeSlot);
  siblings.forEach((b, i) => {
    const dur = parseInt(b.dataset.duration) || 1;
    b.dataset.index = i;
    const s = computeBlockStyle(rowIndex, dur, i, siblings.length);
    b.style.gridRow = s.gridRow;
    b.style.width = s.widthPct === 100 ? '100%' : '50%';
    b.style.justifySelf = s.justifySelf;
  });
}
```

- [ ] **Step 3: 改渲染挂载点（`weekGrid.js:394-402`）**

把：

```js
        // 读取该 slot 的事件列表
        const items = getSlotItems(eventsData, dateStr, timeSlot);
        if (items.length > 0) {
          cell.classList.add('has-event');
          if (items.length >= 2) cell.classList.add('multi-event');
          items.forEach((item, idx) => {
            cell.appendChild(_makeEventBlock(item, idx, cell, dateStr, timeSlot, callbacks));
          });
        }
```

替换为（block 不再加 `has-event/multi-event` 到 cell，改挂到 body）：

```js
        // 读取该 slot 的事件列表
        const items = getSlotItems(eventsData, dateStr, timeSlot);
        // block 作为 #grid-body 直接子元素挂载（grid-row span 跨行），见 _makeEventBlock
        items.forEach((item, idx) => {
          body.appendChild(_makeEventBlock(item, idx, items.length, rowIndex, colIndex, dateStr, timeSlot, callbacks));
        });
```

- [ ] **Step 4: 重写 `_makeEventBlock`（`weekGrid.js:603-677`）**

整体替换为（注意：resize 手柄在 Task 6 加，本任务先不加；`FloatingEditor.open` 第一参数改为 `block` 以便跨行 block 的编辑框正确定位）：

```js
// ── 创建事件 block（#grid-body 的直接 grid 子元素）──────────────────────────────
function _makeEventBlock(item, idx, total, rowIndex, colIndex, dateStr, timeSlot, callbacks) {
  const text = typeof item === 'string' ? item : (item.text || '');
  const colorType = typeof item === 'object' ? (item.colorType ?? 0) : 0;
  const duration = typeof item === 'object' ? (item.duration ?? 1) : 1;

  const block = document.createElement('div');
  block.className = 'event-block';
  block.title = text;
  block.draggable = true;
  block.dataset.date = dateStr;
  block.dataset.time = timeSlot;
  block.dataset.index = idx;
  block.dataset.colorType = colorType;
  block.dataset.fullText = text;
  block.dataset.duration = duration;
  _applyCategoryClass(block, text);
  _applyColorClass(block, colorType);

  // grid 定位：跨行 + 对齐天列 + 并排瓜分宽度
  const layout = computeBlockStyle(rowIndex, duration, idx, total);
  block.style.gridRow = layout.gridRow;
  block.style.gridColumn = String(colIndex + 2);
  block.style.width = layout.widthPct === 100 ? '100%' : '50%';
  block.style.justifySelf = layout.justifySelf;

  // 文本（仅显示第一行，多行通过编辑框查看）
  const textSpan = document.createElement('span');
  textSpan.className = 'event-text';
  textSpan.textContent = text.split('\n')[0];
  block.appendChild(textSpan);

  // 点击 block → 编辑该事件
  block.addEventListener('click', (e) => {
    e.stopPropagation();
    FloatingEditor.open(
      block,
      block.dataset.fullText,
      parseInt(block.dataset.colorType) || 0,
      (newText, newColorType) => {
        const currentIdx = parseInt(block.dataset.index);
        if (newText) {
          block.querySelector('.event-text').textContent = newText.split('\n')[0];
          block.title = newText;
          block.dataset.fullText = newText;
          block.dataset.colorType = newColorType;
          _applyCategoryClass(block, newText);
          _applyColorClass(block, newColorType);
          callbacks.onEventItemChange(dateStr, timeSlot, currentIdx, newText, newColorType);
        } else {
          _removeBlock(block);
          callbacks.onEventItemClear(dateStr, timeSlot, currentIdx);
        }
      },
      () => {
        const currentIdx = parseInt(block.dataset.index);
        _removeBlock(block);
        callbacks.onEventItemClear(dateStr, timeSlot, currentIdx);
      }
    );
  });

  // 拖拽开始
  block.addEventListener('dragstart', (e) => {
    _dragState = {
      date: dateStr,
      timeSlot,
      index: parseInt(block.dataset.index),
      blockRef: block,
      text: block.dataset.fullText,
      colorType: parseInt(block.dataset.colorType) || 0,
      duration: parseInt(block.dataset.duration) || 1
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragState.text);
    e.stopPropagation();
    setTimeout(() => block.classList.add('dragging'), 0);
  });

  block.addEventListener('dragend', () => {
    block.classList.remove('dragging');
    _dragState = null;
  });

  return block;
}
```

> 说明：`FloatingEditor.open` 第一参数改用 `block`（事件块自身），跨行长事件的编辑框定位更准确；空白格新建仍传 `cell`（见 Task 7）。

- [ ] **Step 5: 同步 `FloatingEditor.open` 形参语义（`weekGrid.js:225`）**

`FloatingEditor.open` 第一参数原是 cell，现也可能是 block。把签名与注释改为通用锚点（实现体不变，`getBoundingClientRect` 对两者都成立）：

```js
  open(anchorEl, currentText, currentColorType, onCommit, onDelete) {
```

并把方法内 `this._currentCell = cell;`（`:235`）改为 `this._currentCell = anchorEl;`，`:242` 的 `const rect = cell.getBoundingClientRect();` 改为 `const rect = anchorEl.getBoundingClientRect();`。

- [ ] **Step 6: 新增 `.event-block` 基础可见样式（`grid.css`）**

在 `grid.css` 的 `/* ── 事件块（单格内的独立内容单元）*/` 段（约 `:317`）之前新增。本任务只给「能看见、能跨行、能并排」的最小样式：

```css
/* ── 事件块（#grid-body 的直接 grid 子元素，可跨多行）─────────────── */
.event-block {
  position: relative;
  z-index: 2;                       /* 浮在 .grid-cell 背景之上 */
  margin: 2px 3px;
  padding: 2px 8px;
  box-sizing: border-box;
  border-radius: 10px;
  background: var(--bg-event);
  color: var(--accent);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  cursor: pointer;
  align-self: stretch;
}
```

- [ ] **Step 7: 手动验证**

Run: `npm start`
Expected:
- 普通事件块仍显示在原位置（视觉接近原样即可，颜色细节 Task 5 再修）。
- 在 `%APPDATA%\screen-schedule\schedule-data.json` 手动构造一个 `duration: 3` 的事件（或临时在 `_makeEventBlock` 把某 block 的 `duration` 改 3 测试），刷新后该块跨 3 行（120px 高）。
- 两个同槽短事件左右各占一半。
- 点击事件 → 浮动编辑框正常弹出、保存生效；删除（🗑）生效。
- 拖拽事件到别的空槽 → 正常搬运。

- [ ] **Step 8: lint + 提交**

```bash
npm run lint
git add src/renderer/weekGrid.js src/renderer/styles/grid.css
git commit -m "refactor: event-block 升为 grid 子元素支持跨行

block 从 cell 内提出为 #grid-body 直接子元素，用 grid-row span
跨多行、grid-column 对齐天列、justify-self 处理并排。_removeBlock
改为按 data-date/data-time 归组重排。FloatingEditor.open 改用
事件块自身定位编辑框。基础可见样式先行，主题样式见下个提交。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: CSS 主题迁移 — 卡片样式从 cell 迁到 block

> Task 4 后 block 只有最小样式，主题色（暗/亮）、`!`/`@` 前缀、`colorType` 三色的视觉与原版不一致。本任务把原 `.grid-cell.has-event` 系列规则迁移到 `.event-block`，使新结构下视觉与改造前一致（长事件更佳）。
>
> 注意：Task 4 在 `grid.css` 插入了新规则，下方行号已偏移；操作时**以 CSS 选择器与注释为准**定位，不要机械依赖行号。

**Files:**
- Modify: `src/renderer/styles/grid.css`（`:219-384` 原 cell 事件样式段、`:515-583` 颜色类型段）

**Interfaces:**
- 无新接口；纯样式收敛。

- [ ] **Step 1: 改写「事件块」段（`grid.css:317-384`）**

把 `:317` 注释到 `:384`（`.event-block.dragging`）整段替换为：

```css
/* ── 事件块（#grid-body 直接 grid 子元素，可跨多行）────────────────── */
/* 基础结构样式见 Task 4；此处补充主题 / 分类 / 颜色类型 */

.event-block .event-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  align-self: center;
}

/* 暗色：重要任务（!前缀） */
[data-theme="dark"] .event-block.event-important,
:root .event-block.event-important {
  background: var(--event-bg-important);
  color: var(--event-text-important);
}
/* 暗色：个人生活（@前缀） */
[data-theme="dark"] .event-block.event-personal,
:root .event-block.event-personal {
  background: var(--event-bg-personal);
  color: var(--event-text-personal);
}

/* 亮色：普通日程（浅蓝底 + 靛蓝字 + 左标识线） */
[data-theme="light"] .event-block {
  background: var(--bg-event);
  color: var(--event-text);
  border-left: 3px solid var(--event-border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
}
[data-theme="light"] .event-block.event-important {
  background: var(--event-bg-important);
  color: var(--event-text-important);
  border-left: 3px solid var(--event-text-important);
}
[data-theme="light"] .event-block.event-personal {
  background: var(--event-bg-personal);
  color: var(--event-text-personal);
  border-left: 3px solid var(--event-text-personal);
}

.event-block.dragging { opacity: 0.35; }
```

- [ ] **Step 2: 改写「颜色类型」段（`grid.css:515-583`）**

把 `:515` `/* ── 颜色类型 ... */` 注释到 `:583`（暗色并列 block green 规则末）整段替换为以 `.event-block` 为主体的规则：

```css
/* ── 颜色类型（colorType: 0→blue, 1→red, 2→green）── 以 .event-block 为主体 ── */

/* 亮色 */
[data-theme="light"] .event-block.bg-blue  { background: var(--event-type-blue-bg);  color: var(--event-type-blue-text);  border-left: none; }
[data-theme="light"] .event-block.bg-red   { background: var(--event-type-red-bg);   color: var(--event-type-red-text);   border-left: none; }
[data-theme="light"] .event-block.bg-green { background: var(--event-type-green-bg); color: var(--event-type-green-text); border-left: none; }

/* 暗色 */
[data-theme="dark"] .event-block.bg-blue,
:root .event-block.bg-blue  { background: #6E8EA1; color: #ffffff; }
[data-theme="dark"] .event-block.bg-red,
:root .event-block.bg-red   { background: #BC7E79; color: #ffffff; }
[data-theme="dark"] .event-block.bg-green,
:root .event-block.bg-green { background: #8A9A73; color: #ffffff; }
```

- [ ] **Step 3: 移除 cell 残留事件样式（`grid.css:219-242`、`:244-271`、`:273-315`、`:300-315`）**

删除已不再生效、且与新结构冲突的旧规则（这些选择器以 `.grid-cell.has-event` / `.grid-cell.multi-event` 为主体，block 脱离 cell 后不再匹配；保留 `.grid-cell` 自身背景/边框/悬停规则）：
- 删 `:219-230` `.grid-cell.has-event { ... }`
- 删 `:240-242` `.grid-cell.has-event.selected-col` 与 `:313-315` 的亮色同名规则
- 删 `:244-271` 暗色 `.grid-cell.has-event:has(.event-important/personal)` 与 `.grid-cell.multi-event .event-block.event-*`
- 删 `:276-298` 亮色 `.grid-cell.has-event` 及其 `:has(.event-important/personal)`
- 删 `:300-315` 亮色 `.grid-cell.multi-event` 及 `.grid-cell.has-event.selected-col`
- 删 `:330-352` `.grid-cell.multi-event` 及 `.grid-cell.multi-event .event-block`
- 删 `:363-380` 亮色 `.grid-cell.multi-event .event-block.*`

> 保留：`:194-217` 的 `.grid-cell` 基础规则、`:232-238` 的 `.grid-cell.dragging/drag-over`、`:320`（已被 Task 4 新规则取代的可一并删除，若 Task 4 的基础块已在 `.event-block` 则此处无残留）。

- [ ] **Step 4: 手动验证**

Run: `npm start`
Expected:
- 暗色 / 亮色主题切换，事件块配色与改造前基本一致。
- `!` 前缀事件 → 红色系；`@` 前缀 → 紫/个人色；三种 colorType 圆点切换后块颜色跟随。
- 长事件跨行时颜色/圆角连续，无断裂。
- cell 空白格的网格线、悬停高亮、selected-col 仍正常。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/styles/grid.css
git commit -m "style: 事件卡片样式从 grid-cell 迁移到 event-block

主题(暗/亮)、!/@前缀分类、colorType三色全部以 .event-block 为
选择器主体，移除 cell 残留事件样式，确保跨行长事件视觉连续。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: resize 手柄（pointer events）

**Files:**
- Modify: `src/renderer/weekGrid.js`（`_makeEventBlock` 加手柄 DOM + pointer 流程）
- Modify: `src/renderer/styles/grid.css`（`.resize-handle` 样式）
- Modify: `src/renderer/app.js:356-371`（新增 `onEventDurationChange` callback）

**Interfaces:**
- Consumes: `canPlace`（Task 1）、`setEventDuration`（Task 2）、`TIMES`/`CELL_HEIGHT`
- Produces: `callbacks.onEventDurationChange(dateStr, timeSlot, index, duration)`。

- [ ] **Step 1: 新增 `onEventDurationChange` callback（`app.js`）**

在 `app.js` 的 `WeekGrid.render(displayDates, ..., { ... })` callbacks 对象内（`:365-370` `onEventItemChange/onEventItemClear` 旁）新增：

```js
      onEventDurationChange(dateStr, timeSlot, index, duration) {
        dm.setEventDuration(dataWeekKey, dateStr, timeSlot, index, duration);
      },
```

- [ ] **Step 2: 在 `_makeEventBlock` 顶部 import 区新增**

`weekGrid.js:1` 起 import 段新增：

```js
import { canPlace } from './collision.js';
```

- [ ] **Step 3: 在 `_makeEventBlock` 内加 resize 手柄 DOM**

在 `weekGrid.js` 的 `_makeEventBlock` 中，`block.appendChild(textSpan);` 之后插入：

```js
  // resize 手柄（底部，pointer events 拖动改时长）
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  block.appendChild(resizeHandle);
  _initResize(block, resizeHandle, dateStr, timeSlot, callbacks);
```

- [ ] **Step 4: 新增 `_initResize` 函数**

在 `weekGrid.js` 的 `_makeEventBlock` 函数定义之前（或 `_applyColorClass` 之前）新增模块级函数：

```js
// ── resize 手柄：pointer events 改变事件时长（仅向下扩展）──────────────────────
function _initResize(block, handle, dateStr, timeSlot, callbacks) {
  let dragging = false;
  let startDuration = 1;
  let maxDuration = 1;     // 本次拖动能达到的最大 duration（受碰撞 / 越界约束）
  let pointerId = null;
  let startY = 0;

  // 预先算出本次从 startDuration 起向下、不碰撞的最大 duration
  function computeMaxDuration(baseDuration) {
    const rowIndex = TIMES.indexOf(timeSlot);
    const hardMax = 48 - rowIndex;                 // 越界上限
    for (let d = baseDuration; d <= hardMax; d++) {
      const ok = canPlace(
        _eventsForActiveDate(dateStr),
        timeSlot, d,
        { slot: timeSlot, idx: parseInt(block.dataset.index) }
      );
      if (!ok) return d - 1 < baseDuration ? baseDuration : d - 1;
    }
    return hardMax;
  }

  handle.addEventListener('pointerdown', (e) => {
    if (window.__readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    pointerId = e.pointerId;
    startY = e.clientY;
    startDuration = parseInt(block.dataset.duration) || 1;
    maxDuration = computeMaxDuration(startDuration);
    handle.setPointerCapture(pointerId);
    block.classList.add('resizing');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const deltaRows = Math.round((e.clientY - startY) / CELL_HEIGHT);
    let next = startDuration + deltaRows;
    if (next < 1) next = 1;
    if (next > maxDuration) next = maxDuration;
    if (next === parseInt(block.dataset.duration)) return;
    block.dataset.duration = next;
    const rowIndex = TIMES.indexOf(timeSlot);
    const layout = computeBlockStyle(rowIndex, next, parseInt(block.dataset.index), _siblingCount(block));
    block.style.gridRow = layout.gridRow;
  });

  function endResize(e) {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(pointerId); } catch { /* 已释放 */ }
    block.classList.remove('resizing');
    const finalDuration = parseInt(block.dataset.duration) || 1;
    if (finalDuration !== startDuration) {
      callbacks.onEventDurationChange(dateStr, timeSlot, parseInt(block.dataset.index), finalDuration);
    }
  }
  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
}

// 取活跃渲染中的某日事件数据（供 canPlace 实时校验）
function _eventsForActiveDate(dateStr) {
  return _activeEventsByDate?.[dateStr] ?? {};
}

// 同槽兄弟 block 数量（用于并排 total）
function _siblingCount(block) {
  const body = document.getElementById('grid-body');
  if (!body) return 1;
  return body.querySelectorAll(
    `.event-block[data-date="${block.dataset.date}"][data-time="${block.dataset.time}"]`
  ).length;
}
```

- [ ] **Step 5: 让渲染期把当日事件数据缓存供 resize 校验**

`weekGrid.js` 顶部模块级（`_dragState` 旁，约 `:18`）新增：

```js
let _activeEventsByDate = null;   // 当前渲染中的 eventsData，供 resize 实时碰撞校验
```

在 `_renderBody`（`weekGrid.js:359`）函数体开头 `body.innerHTML = '';` 之后新增一行：

```js
    _activeEventsByDate = eventsData ?? {};
```

- [ ] **Step 6: 新增 `.resize-handle` 与 `.resizing` 样式（`grid.css`）**

在 `.event-block.dragging` 规则之后追加：

```css
/* ── resize 手柄（事件块底部）────────────────────────────────────── */
.event-block .resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  cursor: ns-resize;
}
.event-block .resize-handle::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 1px;
  transform: translateX(-50%);
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0;
  transition: opacity 0.15s;
}
.event-block:hover .resize-handle::after,
.event-block.resizing .resize-handle::after { opacity: 0.5; }
.event-block.resizing {
  z-index: 5;
  box-shadow: 0 0 0 2px var(--accent);
}
```

- [ ] **Step 7: 手动验证**

Run: `npm start`
Expected:
- 悬停事件块底部出现小横条；按住向下拖 → 块每 40px（30 分钟）变高一档。
- 拖到下方有其他事件的槽时，自动卡在不冲突的最大时长，不越过。
- 拖到 23:30 为止，不越界。
- 松手后刷新（切周再切回）时长保持。
- 试用期只读模式（`window.__readOnly=true`）下拖手柄无反应。
- 该槽已有 2 个并排短事件时，拖任一个都卡在 30 分钟（无法下扩，符合规则）。

- [ ] **Step 8: lint + 提交**

```bash
npm run lint
git add src/renderer/weekGrid.js src/renderer/styles/grid.css src/renderer/app.js
git commit -m "feat: 事件块底部 resize 手柄，拖动改变时长

pointer events 实现，每 30 分钟一档，实时 canPlace 校验碰撞、
不越界、并排短事件不可下扩。只读模式禁用。新增
onEventDurationChange → dm.setEventDuration 持久化。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 拖拽移动带 duration + canPlace 校验

> 现有拖拽（搬运到别的日期/槽）只搬 30 分钟、且用硬编码 `length>=2` 限流。本任务让搬运带上 duration，并用 `canPlace` 替代硬编码。

**Files:**
- Modify: `src/renderer/weekGrid.js:404-428`（cell click 新建判断）、`:431-471`（dragover / drop）

**Interfaces:**
- Consumes: `canPlace`（Task 1，Task 6 已 import）、`_dragState.duration`（Task 4 已存）

- [ ] **Step 1: cell click 新建判断改为数据驱动（`weekGrid.js:405-406`）**

block 不再在 cell 内，`cell.querySelector('.event-block')` 已失效。把：

```js
        cell.addEventListener('click', () => {
          if (cell.querySelector('.event-block')) return; // 由 block 处理
```

改为：

```js
        cell.addEventListener('click', () => {
          if (getSlotItems(eventsData, dateStr, timeSlot).length > 0) return; // 已有事件，由 block 处理
```

并把该 click 回调内 `:411` 的 `const existing = cell.querySelector('.event-block');` 与 `:412-418` 的 existing 分支整体删除（block 已不在 cell 内，新建分支直接走 `_makeEventBlock` + `body.appendChild`）。替换 `:407-428` 的回调体为：

```js
          FloatingEditor.open(
            cell, '', 0,
            (newText, newColorType) => {
              if (newText) {
                const block = _makeEventBlock(
                  { text: newText, colorType: newColorType }, 0, 1,
                  rowIndex, colIndex, dateStr, timeSlot, callbacks
                );
                body.appendChild(block);
                callbacks.onEventChange(dateStr, timeSlot, newText, newColorType);
              }
            }
          );
```

- [ ] **Step 2: dragover 改用 canPlace（`weekGrid.js:431-437`）**

把：

```js
        cell.addEventListener('dragover', (e) => {
          if (!_dragState) return;
          if (cell.querySelectorAll('.event-block').length >= 2) return; // 最多 2 个
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          cell.classList.add('drag-over');
        });
```

替换为：

```js
        cell.addEventListener('dragover', (e) => {
          if (!_dragState) return;
          const { duration } = _dragState;
          const ok = canPlace(eventsData[dateStr] ?? {}, timeSlot, duration, {
            slot: _dragState.timeSlot, idx: _dragState.index
          });
          if (!ok) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          cell.classList.add('drag-over');
        });
```

> 说明：源与目标同槽时 `canPlace` 因 `self` 排除会返回 true，但 drop 步骤会在「同位」时直接 return（见 Step 3），不会重复写入。

- [ ] **Step 3: drop 带 duration + canPlace 复核（`weekGrid.js:441-471`）**

把整个 `drop` 回调替换为：

```js
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          if (!_dragState) return;
          const {
            date: srcDate, timeSlot: srcSlot, index: srcIdx,
            blockRef, text, colorType = 0, duration = 1
          } = _dragState;
          _dragState = null;
          if (srcDate === dateStr && srcSlot === timeSlot) return;

          // 复核：目标位置容纳 duration 长度不冲突
          if (!canPlace(eventsData[dateStr] ?? {}, timeSlot, duration, { slot: srcSlot, idx: srcIdx })) return;

          // 清除来源 block
          if (blockRef) _removeBlock(blockRef);

          // 在目标位置新建 block（duration 跟随）
          const newIdx = getSlotItems(eventsData, dateStr, timeSlot).length; // 目标槽现有事件数
          const block = _makeEventBlock(
            { text, colorType, duration }, newIdx, newIdx + 1,
            rowIndex, colIndex, dateStr, timeSlot, callbacks
          );
          body.appendChild(block);

          // 持久化：先清源、再写目标（按目标现有数量决定 setEvent / addEvent）
          callbacks.onEventItemClear(srcDate, srcSlot, srcIdx);
          if (newIdx === 0) {
            callbacks.onEventChange(dateStr, timeSlot, text, colorType, duration);
          } else {
            callbacks.onEventAdd(dateStr, timeSlot, text, colorType, duration);
          }
        });
```

> 注：`onEventChange`/`onEventAdd` 的 `duration` 形参在 Task 2 已加到 `setEvent`/`addEvent`；`app.js` 的 callback `onEventChange(dateStr, timeSlot, text, colorType=0)` 与 `onEventAdd(...)` 当前不透传 duration，需在 Step 4 补传。

- [ ] **Step 4: 让 `app.js` 的 drop 路径透传 duration（`app.js:356-364`）**

把：

```js
      onEventChange(dateStr, timeSlot, text, colorType = 0) {
        dm.setEvent(dataWeekKey, dateStr, timeSlot, text, colorType);
      },
      onEventClear(dateStr, timeSlot) {
        dm.clearEvent(dataWeekKey, dateStr, timeSlot);
      },
      onEventAdd(dateStr, timeSlot, text, colorType = 0) {
        dm.addEvent(dataWeekKey, dateStr, timeSlot, text, colorType);
      },
```

改为：

```js
      onEventChange(dateStr, timeSlot, text, colorType = 0, duration) {
        dm.setEvent(dataWeekKey, dateStr, timeSlot, text, colorType, duration);
      },
      onEventClear(dateStr, timeSlot) {
        dm.clearEvent(dataWeekKey, dateStr, timeSlot);
      },
      onEventAdd(dateStr, timeSlot, text, colorType = 0, duration) {
        dm.addEvent(dataWeekKey, dateStr, timeSlot, text, colorType, duration);
      },
```

- [ ] **Step 5: 手动验证**

Run: `npm start`
Expected:
- 拖一个长事件（duration≥2）到别处 → 时长跟随，新位置不与其他事件冲突才接受。
- 拖到已被占据的槽（无论短长）→ 被 `canPlace` 拒绝，块留在原位。
- 拖到只剩一个短事件的槽（可并排）→ 作为第 2 个短事件并入。
- 普通短事件搬运行为与改造前一致。
- 切周/切日再回来，所有 duration 正确恢复。

- [ ] **Step 6: lint + 全量测试 + 提交**

```bash
npm run lint
npm test
git add src/renderer/weekGrid.js src/renderer/app.js
git commit -m "feat: 拖拽搬运带 duration 并用 canPlace 校验

drop 时携带原 duration、用 canPlace 替代硬编码 length>=2 限流，
冲突即拒绝；cell click 新建判断改为数据驱动。onEventChange/
onEventAdd 透传 duration 到 DataManager。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 验收清单（全部任务完成后）

- [ ] `npm test` 全绿（collision / blockLayout / dataManager）。
- [ ] `npm run lint` 无 error。
- [ ] `npm start`：新建事件 → 默认 30 分钟；拖底部手柄向下 → 每 30 分钟一档变长；松手持久化。
- [ ] 长事件跨行显示连续、配色正确（暗/亮主题、`!`/`@`、三色）。
- [ ] 碰撞：长事件独占时段；短事件同槽最多 2 个；并排短事件不可下扩；不越界（≤23:30）。
- [ ] 拖拽搬运时长跟随 + 冲突拒绝。
- [ ] 只读模式（试用期到期）resize 无效。
- [ ] 老数据（无 duration）打开后显示为 30 分钟，不报错。
