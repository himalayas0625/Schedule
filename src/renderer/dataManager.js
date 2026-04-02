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
  async setEvent(weekKey, dateStr, timeSlot, text, colorType = 0) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    if (items.length === 0) {
      this._data.weeks[weekKey].events[dateStr][timeSlot] = [{ text, colorType }];
    } else {
      items[0] = { text, colorType };
      this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
    }
    return await this._persistWeek(weekKey, previousWeekData);
  }

  // 更新指定 index 处的事件
  async setEventItem(weekKey, dateStr, timeSlot, text, index, colorType = 0) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    items[index] = { text, colorType };
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
    return await this._persistWeek(weekKey, previousWeekData);
  }

  // 追加一个新事件到当前 slot
  async addEvent(weekKey, dateStr, timeSlot, text, colorType = 0) {
    const previousWeekData = this._cloneWeekData(this._data.weeks[weekKey]);
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    const items = this._getItems(weekKey, dateStr, timeSlot);
    items.push({ text, colorType });
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items;
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
}
