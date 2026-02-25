// 渲染侧唯一数据中心，所有状态读写经过此处
export class DataManager {
  constructor() {
    this._data = { weeks: {}, settings: {} }
  }

  async load() {
    this._data = await window.electronAPI.getAll()
    if (!this._data.weeks) this._data.weeks = {}
    if (!this._data.settings) this._data.settings = {}
  }

  get settings() {
    return this._data.settings
  }

  // 获取某周的数据（不存在则返回空结构）
  getWeekData(weekKey) {
    if (!this._data.weeks[weekKey]) {
      return { notes: {}, events: {} }
    }
    return this._data.weeks[weekKey]
  }

  // ── 事件 ──────────────────────────────────────────
  setEvent(weekKey, dateStr, timeSlot, text) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {}
    }
    this._data.weeks[weekKey].events[dateStr][timeSlot] = { text }
    this._persist(`weeks.${weekKey}.events.${dateStr}`)
  }

  clearEvent(weekKey, dateStr, timeSlot) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr]
    if (day?.[timeSlot]) {
      delete day[timeSlot]
      this._persist(`weeks.${weekKey}.events.${dateStr}`)
    }
  }

  // ── 笔记 ──────────────────────────────────────────
  setNote(weekKey, dateStr, index, value) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].notes[dateStr]) {
      this._data.weeks[weekKey].notes[dateStr] = ['', '', '']
    }
    this._data.weeks[weekKey].notes[dateStr][index] = value
    this._persist(`weeks.${weekKey}.notes.${dateStr}`)
  }

  getNotes(weekKey, dateStr) {
    return this._data.weeks[weekKey]?.notes?.[dateStr] ?? ['', '', '']
  }

  // ── 设置 ──────────────────────────────────────────
  saveSetting(key, value) {
    this._data.settings[key] = value
    window.electronAPI.set(`settings.${key}`, value)
  }

  // ── 私有方法 ──────────────────────────────────────
  _ensureWeek(weekKey) {
    if (!this._data.weeks[weekKey]) {
      this._data.weeks[weekKey] = { notes: {}, events: {} }
    }
    if (!this._data.weeks[weekKey].notes) this._data.weeks[weekKey].notes = {}
    if (!this._data.weeks[weekKey].events) this._data.weeks[weekKey].events = {}
  }

  async _persist(key) {
    // 按点号路径取出对应子数据
    const value = key.split('.').reduce((obj, k) => obj?.[k], this._data)
    await window.electronAPI.set(key, value)
  }
}
