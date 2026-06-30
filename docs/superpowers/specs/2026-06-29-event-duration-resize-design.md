# 事件时长可拖拽扩展 — 设计文档

> 日期：2026-06-29
> 状态：待用户审阅
> 关联模块：`weekGrid.js` / `dataManager.js` / `styles/grid.css` / `app.js`

---

## 1. 背景与目标

当前事件**没有时长概念**：数据为 `weeks[weekKey].events[date][startSlot] = [{ text, colorType }]`，一个事件严格绑定一个 30 分钟时间槽，事件块在网格里只占 1 行（40px），从不跨行。全仓库搜索 `duration / endTime` 零命中。

**目标**：每个事件可通过拖动底部手柄，把时长从默认的 30 分钟扩展到 1 小时或更长，事件块在网格中相应变高（跨多个半小时槽）。

---

## 2. 核心决策（已与用户确认）

| 维度 | 决策 |
|------|------|
| **时段占用** | 短并排 / 长独占：30 分钟短事件保留同槽双事件并排；拉长到 ≥1 小时的事件独占其时段 |
| **拖动手势** | 事件块底部 resize 手柄，pointer events 实现，每 30 分钟一档 |
| **时长边界** | 当天内，最晚到 23:30（槽 47），不跨午夜 |
| **数据模型** | 单点存储 + `duration` 字段（默认 1 = 30 分钟），老数据惰性兼容 |

---

## 3. 数据模型

### 3.1 事件对象

```js
// 从
{ text, colorType }
// 扩展为
{ text, colorType, duration }
```

- `duration`：半小时数，**默认 1**（=30 分钟）。`duration=2` → 1 小时，`duration=4` → 2 小时。
- 存储位置不变：`weeks[weekKey].events[date][startSlot]`，仍以**起始槽**为 key，单点存储。
- `store.js` 的 schema 对事件字段本就无约束（`type:'object'`），无需改 schema。

### 3.2 槽位与越界

- 48 个槽，索引 `0..47`（`'00:00'..'23:30'`），生成处仍是 `weekGrid.js:4-11`。
- 事件占据区间 `[startSlot, startSlot + duration - 1]`。
- 越界约束：`startSlot + duration ≤ 48`（即最晚 23:30 开始的事件至多 30 分钟）。

### 3.3 老数据兼容

- **惰性兼容，不写迁移脚本**：读取时若无 `duration` 字段视为 1（与 `colorType` 缺省为 0 同理，统一在 `_getItems` / 读取处用 `e.duration ?? 1`）。
- 任何编辑、移动、resize 触发的写回都会显式带上 `duration`，从而渐进式把字段补全到存量数据。

---

## 4. 碰撞规则（短并排 / 长独占的可判定定义）

### 4.1 规则

1. `duration = 1` 的**短事件**：同一 `startSlot` 最多并排 2 个（保留现有能力）。
2. `duration ≥ 2` 的**长事件**：其区间内每个槽必须为空，独占整段。
3. 通用规则：任意两事件区间不得重叠；**唯一允许的重叠**是「同一 `startSlot` 上两个 `duration=1` 短事件」。
4. 新建 / 移动 / 改时长前统一过 `canPlace(eventsForDate, startSlot, duration, self)` 校验，冲突即拒绝。

### 4.2 判定算法（纯函数，单测核心）

```js
// self: { slot, idx } 标识正在操作的事件自身，校验时排除，避免与自身冲突
function canPlace(eventsForDate, startSlot, duration, self) {
  const end = startSlot + duration - 1;
  if (end > 47) return false;                       // 越界

  const overlapping = [];
  for (const slot of Object.keys(eventsForDate)) {
    const items = eventsForDate[slot];
    items.forEach((e, idx) => {
      if (self && Number(slot) === self.slot && idx === self.idx) return;
      const eDur = e.duration ?? 1;
      const eEnd = Number(slot) + eDur - 1;
      if (Number(slot) <= end && startSlot <= eEnd) {
        overlapping.push({ slot: Number(slot), idx, eDur });
      }
    });
  }
  if (overlapping.length === 0) return true;

  // 唯一例外：目标是短事件，且所有重叠者都是同槽短事件，且同槽已有 < 2 个
  if (duration === 1) {
    const allSameSlotShort = overlapping.every(o => o.slot === startSlot && o.eDur === 1);
    if (allSameSlotShort && overlapping.length < 2) return true;
  }
  return false;
}
```

### 4.3 关键边界（对应单测用例）

- 空区域放置任意 `duration` → `true`。
- `startSlot + duration > 48` → `false`。
- 与长事件区间重叠 → `false`。
- 短事件落入长事件区间 → `false`；长事件压到已有短事件的槽 → `false`。
- 同槽短事件：第 2 个 → `true`；第 3 个 → `false`。
- 移动 / 改时长时排除自身 → 原位置不与自己冲突 → `true`。
- **并排短事件不能拉长**：该槽已 2 个短事件时，向下拉会撞到旁边短事件 → 卡在 `duration=1`；只有该槽仅 1 个事件时才允许向下拉长。

---

## 5. 渲染路线：absolute 事件层（推荐方案）

> 审阅时可改为"混合路线"（短事件完全不动、仅长事件 absolute 覆盖）。本文档默认采用推荐方案，理由见下。

### 5.1 结构

- **cell 结构保留**：继续承担背景、时间标签、点击新建、拖放落点——现有点击/拖拽逻辑大部分不动。
- **event-block 改为 `position:absolute`**，相对 `#grid-body` 定位（给 `#grid-body` 加 `position:relative`）：
  - `top = startRow × 40px`
  - `height = duration × 40px`（跨多行的实现）
  - 短事件并排：同 `startSlot` 的 index 0 → 左半（`left:0; width:50%`），index 1 → 右半（`left:50%; width:50%`）
  - 长事件（`duration≥2`）：满宽独占
- z-index 层级：cell 背景 < event-block < 红线 / 浮动编辑框。

### 5.2 为何不用 `grid-row span`

两个短事件放进同一 grid cell 会重叠，要手动错开宽度，别扭且易错。`absolute` 让"并排瓜分宽度 + 跨行高度"统一在一套坐标里，短/长事件共用同一渲染路径，无两套逻辑的技术债。依据：`#grid-body` 内已有 absolute 元素（红线 `CurrentTimeLayer`，`grid.css:387`），证明可行。

### 5.3 代价

渲染主循环中等改动：block 从"cell 子元素"变为"`#grid-body` 的 absolute 子元素"，定位由 `top/height/left/width` 计算。cell 仍创建，但不再作为 block 的父容器。

---

## 6. Resize 手柄交互

### 6.1 手柄

- 每个 event-block 底部加 `.resize-handle` 子元素（小横条），hover 时光标变 `ns-resize`。
- **短事件（`duration=1`）也带手柄**——"从半小时拉到 1 小时"正是核心诉求。
- 只读模式（试用期到期 `window.__readOnly === true`）下手柄禁用（与 `FloatingEditor.open` 拦截一致）。

### 6.2 手势（pointer events，非 HTML5 DnD）

- `pointerdown` 在 `.resize-handle` → 进入 resize 模式，记录起始 `duration` 与起始 Y。
- `pointermove` →
  - `next = clamp(round(deltaY / 40) + startDuration, 1, 48 - startSlot)`
  - 实时 `canPlace(..., next, self)` 校验：
    - 通过 → 预览（block `height` 即时变化）
    - 不通过 → 卡在当前最大可行 `duration`（不回弹到 1，避免抖动）
- `pointerup` → 提交：调用 `setEventDuration(...)` 持久化（乐观更新 + 回滚，复用现有机制）。
- 全程仅改 `duration`，**不动 `startSlot`**（仅向下扩展）。

### 6.3 边界行为

- 拉到 `startSlot + duration = 48`（最晚 23:30）为止。
- 并排短事件拉长：该槽已 2 个事件时，`canPlace` 立即拒绝下扩 → 停在 `duration=1`（符合 §4.3）。

---

## 7. 创建 / 移动 / 编辑的影响

### 7.1 创建

- 点击空白 cell 新建：默认 `duration=1`，`setEvent` 带 `duration=1`。
- 长事件不提供额外创建入口——**先建 30 分钟短事件，再用 resize 手柄拉长**（与底部手柄交互一致，零额外 UI）。

### 7.2 移动（现有 HTML5 拖拽搬运）

- `_dragState` 增加 `duration` 字段。
- `drop` 时改用 `canPlace(新date, 新startSlot, duration, self)` 校验（替代现有 `weekGrid.js:433 / :450` 的硬编码 `length >= 2`）。
- 冲突 → 拒绝 drop，block 留在原位（可加轻微视觉提示）。
- 持久化带上 `duration`。

### 7.3 编辑（FloatingEditor）

- 浮动编辑框仍只管文本 / 颜色，**不管时长**（时长由 resize 手柄管）。
- 保存时读取事件现有 `duration` 并原样带回，避免编辑文本时丢失时长字段。
- 只读模式下编辑与 resize 同时禁用。

---

## 8. 错误处理

| 场景 | 处理 |
|------|------|
| 持久化失败 | 复用现有：乐观更新 + 内存回滚 + `window.alert`（1.5s 去重） |
| resize / move 碰撞 | 实时 `canPlace` 检测，冲突时停留 / 回弹，不持久化 |
| 越界 | 下扩到 `startSlot + duration = 48` 为止 |
| 只读模式 | resize 手柄 disabled，编辑拦截不变 |

---

## 9. 测试策略（TDD）

**优先且重点：`canPlace` 纯函数**（不依赖 DOM，TDD 友好），覆盖 §4.3 全部边界。

**`DataManager` 时长读写**：
- `setEvent` / `setEventItem` / `addEvent` 带 `duration` 正确落盘。
- 读取无 `duration` 的老数据视为 1。
- 新增 `setEventDuration` 仅改 `duration`、不动其他字段。

**DOM 交互**（resize 手柄 pointer 流程、并排宽度）较难单测，靠手动验证 + 后续 QA。

测试文件：新增 `test/collision.test.js`；扩展 `test/dataManager.test.js`。

---

## 10. 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/renderer/weekGrid.js` | 渲染改 absolute 定位；新增 `canPlace`；resize 手柄 + pointer 流程；`_dragState` 带 `duration`；drop 改用 `canPlace` |
| `src/renderer/dataManager.js` | `setEvent` / `setEventItem` / `addEvent` 加 `duration` 形参；新增 `setEventDuration`；读取处 `e.duration ?? 1` |
| `src/renderer/styles/grid.css` | event-block absolute 定位、并排宽度、`.resize-handle` 样式、`#grid-body` 加 `position:relative` |
| `src/renderer/app.js` | callback 绑定微调（若 `setEventDuration` 需要接通） |
| `src/main/store.js` | 无需改 schema（可选：注释说明 `duration` 字段语义） |
| `test/collision.test.js` | 新增，覆盖 `canPlace` |
| `test/dataManager.test.js` | 扩展 `duration` 读写用例 |

---

## 11. 非目标（YAGNI，本期不做）

- **向上扩展**（拖手柄改 `startSlot`、提前开始时间）——未来增强。
- **跨午夜事件**——本期最晚 23:30。
- **长事件并排**（两列各自向下延伸的长条）——与"长独占"语义冲突，不做。
- **最大时长上限设置项**——本期以"当天内最晚 23:30"为天然上限，不额外加配置。
- **重写为按天事件数组**——破坏性过大，本期用 `duration` 字段最小改动。
