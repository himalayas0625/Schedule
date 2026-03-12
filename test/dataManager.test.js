import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * DataManager 类模拟测试
 * 由于 DataManager 依赖 electronAPI，我们模拟它进行测试
 */

// 模拟 electronAPI
const mockElectronAPI = {
  getAll: vi.fn(),
  get: vi.fn(),
  set: vi.fn()
};

// 注入到全局
global.window = {
  electronAPI: mockElectronAPI
};

// 简化的 DataManager 实现（从源码提取）
class DataManager {
  constructor() {
    this._data = { weeks: {}, settings: {} };
  }

  async load() {
    this._data = await window.electronAPI.getAll();
    if (!this._data.weeks) this._data.weeks = {};
    if (!this._data.settings) this._data.settings = {};
  }

  get settings() {
    return this._data.settings;
  }

  getWeekData(weekKey) {
    if (!this._data.weeks[weekKey]) {
      return { notes: {}, events: {} };
    }
    return this._data.weeks[weekKey];
  }

  _ensureWeek(weekKey) {
    if (!this._data.weeks[weekKey]) {
      this._data.weeks[weekKey] = { notes: {}, events: {} };
    }
    if (!this._data.weeks[weekKey].notes) this._data.weeks[weekKey].notes = {};
    if (!this._data.weeks[weekKey].events) this._data.weeks[weekKey].events = {};
  }

  async setEvent(weekKey, dateStr, timeSlot, text, colorType = 0) {
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].events[dateStr]) {
      this._data.weeks[weekKey].events[dateStr] = {};
    }
    this._data.weeks[weekKey].events[dateStr][timeSlot] = [{ text, colorType }];
    await window.electronAPI.set(`weeks.${weekKey}`, this._data.weeks[weekKey]);
  }

  getNotes(weekKey, dateStr) {
    return this._data.weeks[weekKey]?.notes?.[dateStr] ?? ['', '', ''];
  }

  async setNote(weekKey, dateStr, index, value) {
    this._ensureWeek(weekKey);
    if (!this._data.weeks[weekKey].notes[dateStr]) {
      this._data.weeks[weekKey].notes[dateStr] = ['', '', ''];
    }
    this._data.weeks[weekKey].notes[dateStr][index] = value;
    await window.electronAPI.set(`weeks.${weekKey}`, this._data.weeks[weekKey]);
  }
}

describe('DataManager', () => {
  let dm;

  beforeEach(() => {
    vi.clearAllMocks();
    dm = new DataManager();
  });

  describe('load', () => {
    it('should load data from electronAPI', async () => {
      const mockData = {
        weeks: { '2024-W01': { notes: {}, events: {} } },
        settings: { theme: 'dark' }
      };
      mockElectronAPI.getAll.mockResolvedValue(mockData);

      await dm.load();

      expect(dm._data).toEqual(mockData);
    });

    it('should initialize empty structure if data is missing', async () => {
      mockElectronAPI.getAll.mockResolvedValue({});

      await dm.load();

      expect(dm._data.weeks).toEqual({});
      expect(dm._data.settings).toEqual({});
    });
  });

  describe('getWeekData', () => {
    it('should return existing week data', () => {
      dm._data.weeks['2024-W01'] = { notes: { '2024-01-01': ['a'] }, events: {} };

      const result = dm.getWeekData('2024-W01');

      expect(result).toEqual({ notes: { '2024-01-01': ['a'] }, events: {} });
    });

    it('should return empty structure for non-existent week', () => {
      const result = dm.getWeekData('2024-W99');

      expect(result).toEqual({ notes: {}, events: {} });
    });
  });

  describe('setEvent', () => {
    it('should create event in empty week', async () => {
      await dm.setEvent('2024-W01', '2024-01-01', '09:00', 'Meeting', 0);

      expect(dm._data.weeks['2024-W01'].events['2024-01-01']['09:00'])
        .toEqual([{ text: 'Meeting', colorType: 0 }]);
      expect(mockElectronAPI.set).toHaveBeenCalled();
    });
  });

  describe('getNotes', () => {
    it('should return existing notes', () => {
      dm._data.weeks['2024-W01'] = {
        notes: { '2024-01-01': ['Task 1', 'Task 2', 'Task 3'] }
      };

      const result = dm.getNotes('2024-W01', '2024-01-01');

      expect(result).toEqual(['Task 1', 'Task 2', 'Task 3']);
    });

    it('should return empty array for non-existent notes', () => {
      const result = dm.getNotes('2024-W01', '2024-01-01');

      expect(result).toEqual(['', '', '']);
    });
  });

  describe('setNote', () => {
    it('should update note at index', async () => {
      dm._data.weeks['2024-W01'] = { notes: {}, events: {} };

      await dm.setNote('2024-W01', '2024-01-01', 0, 'First task');

      expect(dm._data.weeks['2024-W01'].notes['2024-01-01'][0]).toBe('First task');
      expect(mockElectronAPI.set).toHaveBeenCalled();
    });
  });
});
