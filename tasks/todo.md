# 事件时长可拖拽扩展 — 开发记录

> 分支：`feat/event-duration`
> 计划：`docs/superpowers/plans/2026-06-29-event-duration-resize.md`
> 设计：`docs/superpowers/specs/2026-06-29-event-duration-resize-design.md`
> 日期：2026-06-29

## 任务清单

- [x] Task 1：碰撞判定纯函数 `canPlace` / `slotIndex`（`src/renderer/collision.js` + `test/collision.test.js`，10 测试）
- [x] Task 2：DataManager 支持 `duration` + `setEventDuration`（4 新测试）
- [x] Task 3：block 定位纯函数 `computeBlockStyle`（4 测试）
- [x] Task 4：渲染重构 — event-block 升为 `#grid-body` grid 子元素、grid-row span 跨行
- [x] Task 5：CSS 主题（暗/亮、! / @、三色）从 `.grid-cell` 迁移到 `.event-block`
- [x] Task 6：resize 手柄（pointer events，每 30 分钟一档，实时 canPlace 校验）
- [x] Task 7：拖拽搬运带 duration + canPlace 校验（**合并进 Task 4 提交**，见 Review）

## Review（实施记录）

### 验证状态
- `npm test`：**36 passed**（collision 10 / blockLayout 4 / dataManager 7 / dateUtils 4 / license 11）。
- `npm run lint`：仅 7 个 **预先存在** 的 error（`src/main/main.js` 空 catch、`src/renderer/notesPanel.js` 未用常量、`update-token.js` 格式），均非本次改动引入；本次新增/修改文件零 lint error。
- **GUI 验证（`npm start`）待用户执行**——渲染/交互无单测覆盖，需手动验收（见下方清单）。

### 对计划的偏离（均已记录在提交信息）
1. **Task 2 测试夹具修正**：计划用 `2026-W26` 存放 `2026-06-29` 事件，但该日期在周日起始下属于 `2026-W27`，`load()` 的孤立事件修复逻辑会把数据迁走导致 `setEventItem`/`setEventDuration` 测试失败。已将 4 个新测试的 week key 统一改为正确的 `2026-W27`。
2. **Task 4 + Task 7 合并提交**：Task 4 把 block 从 cell 内提到 `#grid-body` 直接子元素，使 cell 内所有 `querySelector('.event-block')` / `appendChild` / `length>=2` 限流失效——不存在"只做 Task 4 仍可运行"的中间态。为保证每个提交可运行，把 Task 7 的 cell-click / dragover / drop 重写合进 Task 4。
3. **抽出 `_relayoutSlot`**：drop 第二个并排短事件时，原目标 block 仍满宽、新 block 半宽会错位（旧版靠 `.multi-event` flex 自动处理，grid 版需显式重排）。新增 `_relayoutSlot` 供 `_removeBlock` 与 drop 共用。
4. **保留新建事件防抖原地更新**：计划简化的 click 处理器丢了"已建 block 则原地更新"的守卫，连续防抖提交会堆叠重复 block。已用 `body.querySelector([data-date][data-time])` 保留该守卫。
5. **`endResize()` 去参**：计划的 `endResize(e)` 有未用形参 `e`，违反 `no-unused-vars`，改为无参。

### 已知限制（非阻塞）
- **级联变化**：迁移后亮色主题下分类（important/personal，特异度 0,3,0）高于颜色类型（bg-*，0,2,0），`!` / `@` 前缀视觉会盖过颜色圆点（原版因 `:has` 同特异度由颜色类型胜出）。语义上更合理，但属行为变化，请 GUI 验收时确认。
- **快照时效**：drag/resize 的 `canPlace` 用渲染快照 `_activeEventsByDate`；同一渲染周期内连续多次拖拽到同一目标槽，快照不反映乐观 DOM 更新（与原版用 DOM 计数的细微差异）。单次拖拽正常。

## GUI 验收清单（请用 `npm start` 核对）
- [ ] 新建事件默认 30 分钟；普通事件块位置/配色接近原版。
- [ ] 悬停事件块底部出现小横条；按住向下拖 → 每 40px（30 分钟）变高一档；松手持久化（切周再切回时长保持）。
- [ ] 长事件跨行显示连续、配色正确（暗/亮主题、`!` 红、`@` 个人色、三色圆点）。
- [ ] 碰撞：拖到下方有事件的槽自动卡住不越过；同槽 2 个并排短事件都无法下扩；最晚到 23:30 不越界。
- [ ] 拖拽搬运：长事件时长跟随；冲突槽拒绝；可作第 2 个短事件并入空一半的槽。
- [ ] 点击事件 → 浮动编辑框正常弹出/保存/删除；编辑文本不丢时长。
- [ ] 试用期只读模式（`window.__ReadOnly === true`）下 resize 手柄无反应。
- [ ] 老数据（无 duration）打开后显示 30 分钟，不报错。
- [ ] 日视图（单列）事件块定位正常；月视图事件条不受影响。
