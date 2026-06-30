import { getLegacyWeekStorageKey, getWeekStorageKey } from './dateUtils.js';

// 渲染侧唯一数据中心，所有状态读写经过此处
export class DataManager {
  constructor() {
    this._data = { weeks: {}, settings: {} };
    this._pendingWeekMigrations = new Set();
    this._lastSaveFailureAt = 0;
  }

  async load() {
    this._data = await window.electronAPI.getAll();
    if (!this._data.weeks) this._data.weeks = {};
    if (!this._data.settings) this._data.settings = {};
    if (!this._data.months) this._data.months = {};
    await this._repairOrphanedWeekEvents(this._data.settings.startOfWeek ?? 0);
  }

  get settings() {
    return this._data.settings;
  }

  getWeekKeyForDate(dateStr, startOfWeek = 0) {
    return this._resolveWeekKey(dateStr, startOfWeek);
  }

  // 获取某周的数据（不存在则返回空结构）
  getWeekData(weekKey) {
    if (!this._data.weeks[weekKey]) {
      return { notes: {}, events: {} };
    }
    return this._data.weeks[weekKey];
  }

  // ── 事件（多事件数组格式）─────────────────────────────
  // 私有：统一读取为数组，兼容旧格式 { text }
  _getItems(weekKey, dateStr, timeSlot) {
    const raw = this._data.weeks[weekKey]?.events?.[dateStr]?.[timeSlot];
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    return [raw]; // 旧格式 { text } 兼容
  }

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

  // 清除整个 slot 的所有事件
  async clearEvent(weekKey, dateStr, timeSlot) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr];
    if (day?.[timeSlot] !== undefined) {
      const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
      delete day[timeSlot];
      return await this._persistWeek(weekKey, previousWeekData);
    }
    return true;
  }

  // 清除 slot 中指定 index 的事件；若清空则删除整个 slot key
  async clearEventItem(weekKey, dateStr, timeSlot, index) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr];
    if (!day?.[timeSlot]) return;
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    const items = this._getItems(weekKey, dateStr, timeSlot);
    items.splice(index, 1);
    if (items.length === 0) {
      delete day[timeSlot];
    } else {
      day[timeSlot] = items;
    }
    return await this._persistWeek(weekKey, previousWeekData);
  }

  // ── 本周重点（右侧面板，按周存储）────────────────────
  getWeekNotes(weekKey) {
    return this._data.weeks[weekKey]?.weekNotes ?? ['', '', ''];
  }

  async setWeekNote(weekKey, index, value) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].weekNotes) {
      this._data.weeks[weekKey].weekNotes = ['', '', ''];
    }
    this._data.weeks[weekKey].weekNotes[index] = value;
    return await this._persistWeek(weekKey, previousWeekData);
  }

  // ── 本月重点（右侧面板，按月存储）────────────────────
  getMonthNotes(monthKey) {
    return this._data.months?.[monthKey] ?? ['', '', ''];
  }

  async setMonthNote(monthKey, index, value) {
    if (!this._data.months) this._data.months = {};
    const prev = this._data.months[monthKey] ? [...this._data.months[monthKey]] : null;
    if (!this._data.months[monthKey]) {
      this._data.months[monthKey] = ['', '', ''];
    }
    this._data.months[monthKey][index] = value;
    try {
      const saved = await window.electronAPI.set(`months.${monthKey}`, this._data.months[monthKey]);
      if (saved === false) {
        if (prev) this._data.months[monthKey] = prev;
        else delete this._data.months[monthKey];
        this._notifySaveFailure('本月重点保存失败，未写入磁盘。');
        return false;
      }
      return true;
    } catch {
      if (prev) this._data.months[monthKey] = prev;
      else delete this._data.months[monthKey];
      this._notifySaveFailure('本月重点保存失败，未写入磁盘。');
      return false;
    }
  }

  // ── 笔记 ──────────────────────────────────────────
  async setNote(weekKey, dateStr, index, value) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].notes[dateStr]) {
      this._data.weeks[weekKey].notes[dateStr] = ['', '', ''];
    }
    this._data.weeks[weekKey].notes[dateStr][index] = value;
    return await this._persistWeek(weekKey, previousWeekData);
  }

  getNotes(weekKey, dateStr) {
    return this._data.weeks[weekKey]?.notes?.[dateStr] ?? ['', '', ''];
  }

  // ── 设置 ──────────────────────────────────────────
  async saveSetting(key, value) {
    const previousValue = this._data.settings[key];
    this._data.settings[key] = value;
    try {
      const saved = await window.electronAPI.set(`settings.${key}`, value);
      if (saved === false) {
        if (previousValue === undefined) delete this._data.settings[key];
        else this._data.settings[key] = previousValue;
        this._notifySaveFailure('设置保存失败，未写入磁盘。');
        return false;
      }
      return true;
    } catch {
      if (previousValue === undefined) delete this._data.settings[key];
      else this._data.settings[key] = previousValue;
      this._notifySaveFailure('设置保存失败，未写入磁盘。');
      return false;
    }
  }

  // ── 私有方法 ──────────────────────────────────────
  _ensureWeek(weekKey) {
    if (!this._data.weeks[weekKey]) {
      this._data.weeks[weekKey] = { notes: {}, events: {} };
    }
    if (!this._data.weeks[weekKey].notes) this._data.weeks[weekKey].notes = {};
    if (!this._data.weeks[weekKey].events) this._data.weeks[weekKey].events = {};
  }

  _cloneWeekData(weekData) {
    return weekData ? JSON.parse(JSON.stringify(weekData)) : null;
  }

  _mergeWeekData(primaryWeek = {}, legacyWeek = {}) {
    const mergedEvents = { ...(legacyWeek.events || {}) };
    Object.entries(primaryWeek.events || {}).forEach(([dateStr, slots]) => {
      mergedEvents[dateStr] = { ...(legacyWeek.events?.[dateStr] || {}), ...slots };
    });

    const mergedNotes = { ...(legacyWeek.notes || {}), ...(primaryWeek.notes || {}) };
    const primaryWeekNotes = primaryWeek.weekNotes || [];
    const usePrimaryWeekNotes = primaryWeekNotes.some(Boolean);

    return {
      notes: mergedNotes,
      events: mergedEvents,
      weekNotes: usePrimaryWeekNotes ? primaryWeekNotes : (legacyWeek.weekNotes || ['', '', ''])
    };
  }

  _resolveWeekKey(dateStr, startOfWeek = 0) {
    const primaryKey = getWeekStorageKey(dateStr, startOfWeek);
    const legacyKey = getLegacyWeekStorageKey(dateStr, startOfWeek);

    if (primaryKey === legacyKey) return primaryKey;

    const primaryWeek = this._data.weeks[primaryKey];
    const legacyWeek = this._data.weeks[legacyKey];
    if (!legacyWeek) return primaryKey;

    // 验证 legacyKey 中的数据确实属于当前周，防止错误合并相邻周的合法数据
    // （legacyKey 字符串与某个自定义周 key 相同时会引发冲突）
    const legacyDates = [
      ...Object.keys(legacyWeek.events || {}),
      ...Object.keys(legacyWeek.notes || {})
    ];
    if (legacyDates.length > 0 &&
        !legacyDates.some(d => getWeekStorageKey(d, startOfWeek) === primaryKey)) {
      return primaryKey;
    }

    this._data.weeks[primaryKey] = primaryWeek
      ? this._mergeWeekData(primaryWeek, legacyWeek)
      : legacyWeek;
    delete this._data.weeks[legacyKey];
    this._syncWeekKeyMigration(primaryKey, legacyKey);
    return primaryKey;
  }

  _syncWeekKeyMigration(primaryKey, legacyKey) {
    const migrationId = `${legacyKey}->${primaryKey}`;
    if (this._pendingWeekMigrations.has(migrationId)) return;

    this._pendingWeekMigrations.add(migrationId);
    Promise.all([
      window.electronAPI.set(`weeks.${primaryKey}`, this._data.weeks[primaryKey]),
      window.electronAPI.delete(`weeks.${legacyKey}`)
    ]).catch((error) => {
      console.error('[data] Week key migration failed:', error);
    }).finally(() => {
      this._pendingWeekMigrations.delete(migrationId);
    });
  }

  _notifySaveFailure(message) {
    const now = Date.now();
    if (now - this._lastSaveFailureAt < 1500) return;
    this._lastSaveFailureAt = now;
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message);
    }
  }

  async _persistWeek(weekKey, previousWeekData) {
    try {
      const weekData = this._data.weeks[weekKey];
      const saved = await window.electronAPI.set(`weeks.${weekKey}`, weekData);
      if (saved === false) {
        if (previousWeekData) this._data.weeks[weekKey] = previousWeekData;
        else delete this._data.weeks[weekKey];
        this._notifySaveFailure('保存失败：本周数据过大，未写入磁盘。请删减部分日程或笔记后重试。');
        return false;
      }
      return true;
    } catch {
      if (previousWeekData) this._data.weeks[weekKey] = previousWeekData;
      else delete this._data.weeks[weekKey];
      this._notifySaveFailure('保存失败：本周数据未写入磁盘。请稍后重试。');
      return false;
    }
  }

  // 修复历史版本 bug 导致的孤立事件：事件存储在错误 week key 下，迁移到正确位置
  async _repairOrphanedWeekEvents(startOfWeek = 0) {
    const keysToSet = new Map();    // weekKey -> weekData（需持久化）
    const keysToDelete = new Set(); // 已清空的孤立 week

    for (const storedKey of Object.keys(this._data.weeks)) {
      const weekData = this._data.weeks[storedKey];
      if (!weekData) continue;

      const orphanedEvents = {}; // { targetKey: { dateStr: slotsObj } }
      const orphanedNotes  = {}; // { targetKey: { dateStr: notesArr } }
      const residualEventDates = new Set();
      const residualNoteDates  = new Set();

      for (const dateStr of Object.keys(weekData.events || {})) {
        const correctKey = getWeekStorageKey(dateStr, startOfWeek);
        if (correctKey === storedKey) {
          residualEventDates.add(dateStr);
        } else {
          if (!orphanedEvents[correctKey]) orphanedEvents[correctKey] = {};
          orphanedEvents[correctKey][dateStr] = weekData.events[dateStr];
        }
      }

      for (const dateStr of Object.keys(weekData.notes || {})) {
        const correctKey = getWeekStorageKey(dateStr, startOfWeek);
        if (correctKey === storedKey) {
          residualNoteDates.add(dateStr);
        } else {
          if (!orphanedNotes[correctKey]) orphanedNotes[correctKey] = {};
          orphanedNotes[correctKey][dateStr] = weekData.notes[dateStr];
        }
      }

      const hasOrphans = Object.keys(orphanedEvents).length > 0 ||
                         Object.keys(orphanedNotes).length > 0;
      if (!hasOrphans) continue;

      // weekNotes 跟随 event 数量最多的目标 week
      const eventCountByTarget = {};
      for (const [k, v] of Object.entries(orphanedEvents))
        eventCountByTarget[k] = Object.keys(v).length;
      const weekNotesTarget = Object.keys(eventCountByTarget).length > 0
        ? Object.entries(eventCountByTarget).sort((a, b) => b[1] - a[1])[0][0]
        : null;

      const sourceWeekNotes = weekData.weekNotes || ['', '', ''];
      const sourceHasWeekNotes = sourceWeekNotes.some(s => s && s.trim());

      // 合并孤立数据到各目标 week（目标优先：已有 slot 不覆盖）
      const allTargetKeys = new Set([
        ...Object.keys(orphanedEvents),
        ...Object.keys(orphanedNotes)
      ]);

      for (const targetKey of allTargetKeys) {
        this._ensureWeek(targetKey);
        const target = this._data.weeks[targetKey];

        for (const [dateStr, slots] of Object.entries(orphanedEvents[targetKey] || {})) {
          if (!target.events[dateStr]) target.events[dateStr] = {};
          for (const [slot, items] of Object.entries(slots)) {
            if (!target.events[dateStr][slot]) target.events[dateStr][slot] = items;
          }
        }

        for (const [dateStr, notesArr] of Object.entries(orphanedNotes[targetKey] || {})) {
          if (!target.notes[dateStr]) target.notes[dateStr] = notesArr;
        }

        if (targetKey === weekNotesTarget && sourceHasWeekNotes) {
          const targetHasWeekNotes = (target.weekNotes || []).some(s => s && s.trim());
          if (!targetHasWeekNotes) target.weekNotes = sourceWeekNotes;
        }

        keysToSet.set(targetKey, target);
      }

      // 清理源 week 中已迁移的 dateStr
      for (const dateStr of Object.keys(weekData.events || {})) {
        if (!residualEventDates.has(dateStr)) delete weekData.events[dateStr];
      }
      for (const dateStr of Object.keys(weekData.notes || {})) {
        if (!residualNoteDates.has(dateStr)) delete weekData.notes[dateStr];
      }

      const sourceEmpty = Object.keys(weekData.events || {}).length === 0 &&
                          Object.keys(weekData.notes  || {}).length === 0;

      if (sourceEmpty) {
        keysToDelete.add(storedKey);
      } else {
        if (weekNotesTarget) weekData.weekNotes = ['', '', ''];
        keysToSet.set(storedKey, weekData);
      }
    }

    if (keysToSet.size === 0 && keysToDelete.size === 0) return;

    console.log(`[data] repairOrphanedWeekEvents: 更新 ${keysToSet.size} 个 week，删除 ${keysToDelete.size} 个孤立 week`);

    for (const k of keysToDelete) delete this._data.weeks[k];

    try {
      await Promise.all([
        ...[...keysToSet.entries()].map(([k, v]) => window.electronAPI.set(`weeks.${k}`, v)),
        ...[...keysToDelete].map(k => window.electronAPI.delete(`weeks.${k}`))
      ]);
    } catch (err) {
      console.error('[data] repairOrphanedWeekEvents 持久化失败:', err);
    }
  }
}
