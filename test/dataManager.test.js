import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataManager } from '../src/renderer/dataManager.js';

const mockElectronAPI = {
  getAll: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn()
};

describe('DataManager', () => {
  let dm;

  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI.set.mockResolvedValue(true);
    mockElectronAPI.delete.mockResolvedValue(true);
    global.window = {
      electronAPI: mockElectronAPI,
      alert: vi.fn()
    };
    dm = new DataManager();
  });

  it('loads persisted data', async () => {
    const mockData = {
      weeks: { '2024-W01': { notes: {}, events: {} } },
      settings: { theme: 'dark' }
    };
    mockElectronAPI.getAll.mockResolvedValue(mockData);

    await dm.load();

    expect(dm.settings).toEqual({ theme: 'dark' });
    expect(dm.getWeekData('2024-W01')).toEqual({ notes: {}, events: {} });
  });

  it('migrates legacy Sunday-start week keys on access', async () => {
    mockElectronAPI.getAll.mockResolvedValue({
      weeks: {
        '2026-W13': {
          notes: { '2026-03-30': ['Task 1', '', ''] },
          events: {
            '2026-03-30': {
              '09:00': [{ text: 'Meeting', colorType: 0 }]
            }
          },
          weekNotes: ['Focus', '', '']
        }
      },
      settings: { startOfWeek: 0 }
    });

    await dm.load();

    const resolvedKey = dm.getWeekKeyForDate('2026-03-30', 0);

    expect(resolvedKey).toBe('2026-W14');
    expect(dm.getWeekData(resolvedKey).notes['2026-03-30'][0]).toBe('Task 1');
    expect(dm.getWeekData(resolvedKey).events['2026-03-30']['09:00'][0].text).toBe('Meeting');

    await Promise.resolve();

    expect(mockElectronAPI.set).toHaveBeenCalledWith(
      'weeks.2026-W14',
      expect.objectContaining({
        weekNotes: ['Focus', '', '']
      })
    );
    expect(mockElectronAPI.delete).toHaveBeenCalledWith('weeks.2026-W13');
  });

  it('rolls back week edits when persistence is rejected', async () => {
    mockElectronAPI.getAll.mockResolvedValue({ weeks: {}, settings: {} });
    mockElectronAPI.set.mockResolvedValue(false);

    await dm.load();

    const saved = await dm.setNote('2026-W14', '2026-03-30', 0, 'First task');

    expect(saved).toBe(false);
    expect(dm.getNotes('2026-W14', '2026-03-30')).toEqual(['', '', '']);
    expect(window.alert).toHaveBeenCalled();
  });

  it('persists duration when creating a new event', async () => {
    mockElectronAPI.getAll.mockResolvedValue({ weeks: {}, settings: {} });
    await dm.load();

    await dm.setEvent('2026-W27', '2026-06-29', '09:00', 'Meeting', 0, 2);

    expect(dm.getWeekData('2026-W27').events['2026-06-29']['09:00'][0])
      .toEqual({ text: 'Meeting', colorType: 0, duration: 2 });
  });

  it('defaults duration to 1 when adding without specifying', async () => {
    mockElectronAPI.getAll.mockResolvedValue({ weeks: {}, settings: {} });
    await dm.load();

    await dm.addEvent('2026-W27', '2026-06-29', '09:00', 'Quick');

    expect(dm.getWeekData('2026-W27').events['2026-06-29']['09:00'][0].duration).toBe(1);
  });

  it('preserves duration when editing text via setEventItem', async () => {
    mockElectronAPI.getAll.mockResolvedValue({
      weeks: { '2026-W27': { events: { '2026-06-29': { '09:00': [{ text: 'Old', colorType: 0, duration: 3 }] } } } },
      settings: {}
    });
    await dm.load();

    await dm.setEventItem('2026-W27', '2026-06-29', '09:00', 'New', 0, 1);

    const item = dm.getWeekData('2026-W27').events['2026-06-29']['09:00'][0];
    expect(item.text).toBe('New');
    expect(item.duration).toBe(3);
  });

  it('setEventDuration changes only the duration field', async () => {
    mockElectronAPI.getAll.mockResolvedValue({
      weeks: { '2026-W27': { events: { '2026-06-29': { '09:00': [{ text: 'Meeting', colorType: 1, duration: 1 }] } } } },
      settings: {}
    });
    await dm.load();

    const ok = await dm.setEventDuration('2026-W27', '2026-06-29', '09:00', 0, 4);

    expect(ok).toBe(true);
    expect(dm.getWeekData('2026-W27').events['2026-06-29']['09:00'][0])
      .toEqual({ text: 'Meeting', colorType: 1, duration: 4 });
  });
});
