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

  // ── 事件（多事件数组格式）─────────────────────────────
  // 私有：统一读取为数组，兼容旧格式 { text }
  _getItems(weekKey, dateStr, timeSlot) {
    const raw = this._data.weeks[weekKey]?.events?.[dateStr]?.[timeSlot]
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    return [raw] // 旧格式 { text } 兼容
  }

  // 设置 index 0 处的事件（新建或覆盖首个）
  async setEvent(weekKey, dateStr, timeSlot, text, colorType = 0) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {}
    }
    const items = this._getItems(weekKey, dateStr, timeSlot)
    if (items.length === 0) {
      this._data.weeks[weekKey].events[dateStr][timeSlot] = [{ text, colorType }]
    } else {
      items[0] = { text, colorType }
      this._data.weeks[weekKey].events[dateStr][timeSlot] = items
    }
    await this._persistWeek(weekKey)
  }

  // 更新指定 index 处的事件
  async setEventItem(weekKey, dateStr, timeSlot, text, index, colorType = 0) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {}
    }
    const items = this._getItems(weekKey, dateStr, timeSlot)
    items[index] = { text, colorType }
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items
    await this._persistWeek(weekKey)
  }

  // 追加一个新事件到当前 slot
  async addEvent(weekKey, dateStr, timeSlot, text, colorType = 0) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {}
    }
    const items = this._getItems(weekKey, dateStr, timeSlot)
    items.push({ text, colorType })
    this._data.weeks[weekKey].events[dateStr][timeSlot] = items
    await this._persistWeek(weekKey)
  }

  // 清除整个 slot 的所有事件
  async clearEvent(weekKey, dateStr, timeSlot) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr]
    if (day?.[timeSlot] !== undefined) {
      delete day[timeSlot]
      await this._persistWeek(weekKey)
    }
  }

  // 清除 slot 中指定 index 的事件；若清空则删除整个 slot key
  async clearEventItem(weekKey, dateStr, timeSlot, index) {
    const day = this._data.weeks[weekKey]?.events?.[dateStr]
    if (!day?.[timeSlot]) return
    const items = this._getItems(weekKey, dateStr, timeSlot)
    items.splice(index, 1)
    if (items.length === 0) {
      delete day[timeSlot]
    } else {
      day[timeSlot] = items
    }
    await this._persistWeek(weekKey)
  }

  // ── 本周重点（右侧面板，按周存储）────────────────────
  getWeekNotes(weekKey) {
    return this._data.weeks[weekKey]?.weekNotes ?? ['', '', '']
  }

  async setWeekNote(weekKey, index, value) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].weekNotes) {
      this._data.weeks[weekKey].weekNotes = ['', '', '']
    }
    this._data.weeks[weekKey].weekNotes[index] = value
    await this._persistWeek(weekKey)
  }

  // ── 笔记 ──────────────────────────────────────────
  async setNote(weekKey, dateStr, index, value) {
    this._ensureWeek(weekKey)
    if (!this._data.weeks[weekKey].notes[dateStr]) {
      this._data.weeks[weekKey].notes[dateStr] = ['', '', '']
    }
    this._data.weeks[weekKey].notes[dateStr][index] = value
    await this._persistWeek(weekKey)
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

  async _persistWeek(weekKey) {
    // 直接存储整个周的数据，确保数据完整性
    const weekData = this._data.weeks[weekKey]
    await window.electronAPI.set(`weeks.${weekKey}`, weekData)
  }
}
