import { WeekGrid } from './weekGrid.js';
import { NotesPanel, RightPanel } from './notesPanel.js';
import { DataManager } from './dataManager.js';
import { WeatherWidget } from './weatherWidget.js';

// ── 工具函数 ──────────────────────────────────────────────────────────────────

// 将 Date 格式化为本地日期字符串（避免 toISOString 的 UTC 偏移问题）
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 获取 ISO 周字符串 "YYYY-Www"
function getISOWeekKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = d.getFullYear();
  const week1 = new Date(year, 0, 4);
  const weekNum = 1 + Math.round(
    ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// 获取某周（含偏移）的 7 个 ISO 日期字符串（周一起始）
function getWeekDates(offset = 0, startOfWeek = 1) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const diff = (day - startOfWeek + 7) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diff + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateStr(d);
  });
}

// 格式化周范围标签
function formatWeekLabel(weekDates) {
  const fmt = (s) => {
    const d = new Date(s + 'T12:00:00');
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const first = new Date(weekDates[0] + 'T12:00:00');
  const last = new Date(weekDates[6] + 'T12:00:00');
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getFullYear()}年${fmt(weekDates[0])} – ${last.getFullYear()}年${fmt(weekDates[6])}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}, ${first.getFullYear()}`;
  }
  return `${first.getMonth() + 1}月${first.getDate()}–${last.getDate()}日 ${first.getFullYear()}`;
}

// 格式化日标签（日视图标题栏）
function formatDayLabel(dateStr) {
  const DAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${DAY[d.getDay()]}`;
}

// 获取月视图日历网格（6×7 = 42 天，startOfWeek 对齐周一/周日）
function getMonthCalendarDates(year, month, startOfWeek = 1) {
  const firstDay = new Date(year, month - 1, 1);
  const daysBack = (firstDay.getDay() - startOfWeek + 7) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - daysBack);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return toLocalDateStr(d);
  });
}

// ── 农历日期计算（2024-2027 年，含闰月）────────────────────────────────────────
function getLunarDate(dateStr) {
  const DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
    '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
    '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  // m=春节月(1-indexed), d=春节日, days=各农历月天数, names=对应月名（含闰月）
  const DB = {
    2024: { m:2, d:10, days:[30,29,30,29,30,29,30,29,30,29,30,30,29], names:['正月','二月','三月','四月','闰四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] },
    2025: { m:1, d:29, days:[30,29,30,29,30,29,29,30,29,30,29,30,29], names:['正月','二月','三月','四月','五月','六月','闰六月','七月','八月','九月','十月','冬月','腊月'] },
    2026: { m:2, d:17, days:[30,29,30,30,29,30,29,30,29,30,30,29],    names:['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] },
    2027: { m:2, d: 6, days:[30,29,30,29,30,29,30,30,29,30,29,30],    names:['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] }
  };
  const d = new Date(dateStr + 'T12:00:00');
  const year = d.getFullYear();
  let entry = DB[year];
  let cnyDate = entry ? new Date(year, entry.m - 1, entry.d) : null;
  if (!entry || d < cnyDate) {
    entry = DB[year - 1];
    if (!entry) return '';
    cnyDate = new Date(year - 1, entry.m - 1, entry.d);
  }
  let days = Math.floor((d - cnyDate) / 86400000);
  let m = 0;
  for (; m < entry.days.length; m++) {
    if (days < entry.days[m]) break;
    days -= entry.days[m];
  }
  if (m >= entry.names.length || days >= DAY_NAMES.length) return '';
  return `农历${entry.names[m]}${DAY_NAMES[days]}`;
}

// ── 日视图顶部信息胶囊更新 ────────────────────────────────────────────────────
const DAILY_QUOTES = [
  // 道家
  '损之又损，以至于无为',
  '知足者富，强行者有志',
  '为而不争，天下莫能与之争',
  '致虚极，守静笃',
  '无为而无不为',
  // 庄子
  '鱼相忘于江湖，人相忘于道术',
  '吾生也有涯，而知也无涯',
  '天地与我并生，万物与我为一',
  // 儒家
  '逝者如斯，不舍昼夜',
  '君子不器',
  '吾日三省吾身',
  '己所不欲，勿施于人',
  // 斯多葛
  '你所能控制的，唯有自己的判断',
  '不抵抗命运，而是接纳它',
  '最大的自由，是选择如何看待已发生之事',
  '什么都不想要，才能拥有一切',
  // 加缪
  '宇宙对你的漠然，正是你自由的证明',
  '荒谬不消除，就带着它活下去',
  '我反抗，故我存在',
  '重要的不是治愈，而是带着病痛活着',
  // 尼采
  '凡杀不死我的，使我更强大',
  '当你凝视深渊，深渊也在凝视你',
  '一个人知道自己为何而活，便能忍受任何生活',
  // 卡夫卡
  '不要写你想写的，写你无法不写的',
  '书是斧头，劈开我们心中冰封的海',
  '一切深刻的东西都喜欢戴上面具',
  // 里尔克
  '未曾哭过长夜的人，不足以语人生',
  '去爱一件事，便是接受它会消逝',
  '孤独是我唯一忠实的伴侣',
  // 博尔赫斯
  '不必跑得太快，路本来就在那里',
  '孤独的人有自己的神话',
  // 布莱克
  '把沙粒看成世界，把野花看成天堂',
  // 卢梭
  '人生而自由，却无往不在枷锁之中',
  // 沈从文
  '慢慢走，欣赏啊',
  // 禅意
  '留白处，才是真正的画',
  '走得太快，灵魂会跟不上',
  '清晨不忙，夜晚不慌，这就是好的一天',
  '空杯心态，才能装下新知',
  '呼吸是最短的冥想',
  // 效率与专注
  '把手头的事做完，便是哲学',
  '完成胜于完美',
  '做少，但做好',
  '一次只做一件事，做到极致',
  '深度专注，是这个时代最稀缺的能力',
  '日拱一卒，功不唐捐',
  // 时间与流逝
  '时间不是河流，是我们自己在流动',
  '你无法同时拥有年轻和对年轻的认知',
  '每一次出走，都是为了更好地归来',
  '凡值得做的事，都值得慢慢做'
];
const CN_DAYS = ['周日','周一','周二','周三','周四','周五','周六'];
const EN_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];


function updateDayHeaderPill(dateStr, customQuotes = []) {
  const pill = document.getElementById('day-header-pill');
  if (!pill) return;
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  const lunar = getLunarDate(dateStr);
  const yearMonth = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  const dayIndex = Math.floor(d.getTime() / 86400000);

  // 混合显示：用户名言 + 内置名言
  const allQuotes = [...customQuotes, ...DAILY_QUOTES];
  const quote = allQuotes[((dayIndex % allQuotes.length) + allQuotes.length) % allQuotes.length];

  pill.querySelector('.dhp-day-num').textContent = d.getDate();
  pill.querySelector('.dhp-weekday-cn').textContent = CN_DAYS[dow];
  pill.querySelector('.dhp-weekday-en').textContent = EN_DAYS[dow];
  pill.querySelector('.dhp-date-lunar').textContent = [yearMonth, lunar].filter(Boolean).join(' · ');
  pill.querySelector('.dhp-secondary').textContent = quote;
}

// ── 应用初始化 ────────────────────────────────────────────────────────────────
async function init() {
  const dm = new DataManager();
  await dm.load();

  const today = toLocalDateStr(new Date());
  let currentOffset = 0;                     // 0 = 本周
  let selectedDate = today;                  // 当前选中列
  let currentView = 'week';                 // 'week' | 'day' | 'month'
  let monthOffset = 0;                      // 0 = 本月，-1 = 上月，+1 = 下月

  WeekGrid.init();
  WeatherWidget.init();   // 启动即缓存渲染，异步刷新，1h 静默更新

  // ── 渲染函数 ────────────────────────────────────────
  function render() {
    // ── 月视图单独分支（早返回）──────────────────────
    if (currentView === 'month') {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const year = target.getFullYear();
      const month = target.getMonth() + 1;
      const startOfWeek = dm.settings.startOfWeek ?? 1;
      const calendarDates = getMonthCalendarDates(year, month, startOfWeek);

      // 聚合当月日历格内所有日期的事件
      const eventsMap = {};
      calendarDates.forEach(dateStr => {
        const wk = getISOWeekKey(new Date(dateStr + 'T12:00:00'));
        eventsMap[dateStr] = dm.getWeekData(wk).events?.[dateStr] ?? {};
      });

      const grid = document.getElementById('schedule-grid');
      grid.classList.remove('day-view');
      grid.classList.add('month-view');
      document.getElementById('btn-week-label').textContent = `${year}年${month}月`;

      WeekGrid.renderMonth(calendarDates, eventsMap, year, month, selectedDate, startOfWeek, {
        onSelectDate(dateStr) {
          selectedDate = dateStr;
          currentView = 'day';
          document.querySelectorAll('.pill-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === 'day');
          });
          render();
        }
      });

      const notesKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'));
      NotesPanel.render(dm.getNotes(notesKey, selectedDate), selectedDate, {
        onChange(date, idx, val) { dm.setNote(notesKey, date, idx, val); }
      });
      const dataKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'));
      RightPanel.render(dm.getWeekNotes(dataKey), `${year}年${month}月`, {
        onChange(idx, val) { dm.setWeekNote(dataKey, idx, val); }
      });
      return;
    }

    // ── 周 / 日视图 ──────────────────────────────────
    const weekDates = getWeekDates(currentOffset, dm.settings.startOfWeek ?? 0);
    const weekKey = getISOWeekKey(new Date(weekDates[0] + 'T12:00:00'));

    if (currentOffset === 0 && !weekDates.includes(selectedDate)) {
      selectedDate = today;
    }

    // 日视图时用 selectedDate 所在周的数据键
    const dataWeekKey = currentView === 'day'
      ? getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
      : weekKey;
    const weekData = dm.getWeekData(dataWeekKey);

    // 日视图只传单日，周视图传全周
    const displayDates = currentView === 'day' ? [selectedDate] : weekDates;

    // 切换视图 CSS 类
    document.getElementById('schedule-grid').classList.remove('month-view');
    document.getElementById('schedule-grid').classList.toggle('day-view', currentView === 'day');

    // 更新标题栏标签
    document.getElementById('btn-week-label').textContent = currentView === 'day'
      ? formatDayLabel(selectedDate)
      : formatWeekLabel(weekDates);

    // 渲染网格
    WeekGrid.render(displayDates, weekData.events, selectedDate, {
      onSelectDate(dateStr) {
        const prevDate = selectedDate;
        selectedDate = dateStr;
        if (currentView === 'week') WeekGrid.updateSelectedCol(prevDate, dateStr);
        const notesKey = getISOWeekKey(new Date(dateStr + 'T12:00:00'));
        NotesPanel.render(dm.getNotes(notesKey, dateStr), dateStr, {
          onChange(date, idx, val) {
            dm.setNote(notesKey, date, idx, val);
          }
        });
      },
      onEventChange(dateStr, timeSlot, text, colorType = 0) {
        dm.setEvent(dataWeekKey, dateStr, timeSlot, text, colorType);
      },
      onEventClear(dateStr, timeSlot) {
        dm.clearEvent(dataWeekKey, dateStr, timeSlot);
      },
      onEventAdd(dateStr, timeSlot, text, colorType = 0) {
        dm.addEvent(dataWeekKey, dateStr, timeSlot, text, colorType);
      },
      onEventItemChange(dateStr, timeSlot, index, text, colorType = 0) {
        dm.setEventItem(dataWeekKey, dateStr, timeSlot, text, index, colorType);
      },
      onEventItemClear(dateStr, timeSlot, index) {
        dm.clearEventItem(dataWeekKey, dateStr, timeSlot, index);
      }
    });

    // 日视图：更新顶部信息胶囊
    if (currentView === 'day') {
      updateDayHeaderPill(selectedDate, dm.settings.customQuotes || []);
    }

    // 渲染笔记面板
    const notesWeekKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'));
    NotesPanel.render(dm.getNotes(notesWeekKey, selectedDate), selectedDate, {
      onChange(date, idx, val) {
        dm.setNote(notesWeekKey, date, idx, val);
      }
    });

    // 渲染右侧"本周重点"面板
    RightPanel.render(dm.getWeekNotes(dataWeekKey), formatWeekLabel(weekDates), {
      onChange(idx, val) {
        dm.setWeekNote(dataWeekKey, idx, val);
      }
    });

    // 自动滚动到当前时间
    WeekGrid.scrollToCurrentTime();
  }

  render();

  // ── 左侧边栏宽度拖拽 ─────────────────────────────────
  const notesPanel = document.getElementById('notes-panel');
  const resizer    = document.getElementById('sidebar-resizer');
  const MIN_WIDTH  = 180;
  const MAX_WIDTH  = 400;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    resizer.classList.add('dragging');

    const onMouseMove = (e) => {
      const containerLeft = notesPanel.parentElement.getBoundingClientRect().left;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - containerLeft));
      notesPanel.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      resizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // ── 右侧边栏宽度拖拽 ─────────────────────────────────
  const rightPanel   = document.getElementById('right-panel');
  const rightResizer = document.getElementById('right-resizer');

  rightResizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    rightResizer.classList.add('dragging');

    const onMouseMove = (e) => {
      const containerRight = rightPanel.parentElement.getBoundingClientRect().right;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, containerRight - e.clientX));
      rightPanel.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      rightResizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // ── 周导航 ──────────────────────────────────────────
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    if (currentView === 'day') {
      const d = new Date(selectedDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      selectedDate = toLocalDateStr(d);
    } else if (currentView === 'month') {
      monthOffset--;
    } else {
      currentOffset--;
    }
    render();
  });
  document.getElementById('btn-next-week').addEventListener('click', () => {
    if (currentView === 'day') {
      const d = new Date(selectedDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      selectedDate = toLocalDateStr(d);
    } else if (currentView === 'month') {
      monthOffset++;
    } else {
      currentOffset++;
    }
    render();
  });
  document.getElementById('btn-week-label').addEventListener('click', () => {
    currentOffset = 0;
    monthOffset = 0;
    selectedDate = today;
    render();
  });

  // ── 窗口控制按钮 ─────────────────────────────────────
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimize();
  });

  const maxBtn = document.getElementById('btn-maximize');
  maxBtn.addEventListener('click', () => {
    window.electronAPI.maximize();
  });
  // 同步按钮图标：最大化时显示"还原"符号，否则显示"最大化"符号
  window.electronAPI.onMaximizeChange((isMaximized) => {
    maxBtn.textContent = isMaximized ? '❐' : '□';
    maxBtn.title = isMaximized ? '还原' : '最大化';
  });

  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.minimize(); // 关闭到托盘 = 隐藏
  });

  // ── 主题 ──────────────────────────────────────────────
  function applyTheme(themeSetting, systemDark) {
    let theme;
    if (themeSetting === 'system') {
      theme = systemDark ? 'dark' : 'light';
    } else {
      theme = themeSetting;
    }
    document.documentElement.setAttribute('data-theme', theme);
  }

  // 初始主题
  const themeSetting = dm.settings.theme || 'system';
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(themeSetting, prefersDark);

  // 主进程推送主题变化
  window.electronAPI.onThemeChange((theme) => {
    applyTheme(dm.settings.theme || 'system', theme === 'dark');
  });

  // ── 窗口显示时自动聚焦到红线 ────────────────────────────
  window.electronAPI.onWindowShow(() => {
    WeekGrid.scrollToCurrentTime();
  });

  // ── 日/周视图切换胶囊 ────────────────────────────────
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === currentView) return;
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = view;
      render();
    });
  });

  // ── 名言编辑模态框 ──────────────────────────────────────
  const quotesModal = document.createElement('div');
  quotesModal.id = 'quotes-modal';
  quotesModal.innerHTML = `
    <div class="quotes-modal-content">
      <div class="quotes-modal-header">
        <span>编辑我的名言</span>
        <button class="quotes-modal-close">&times;</button>
      </div>
      <div class="quotes-modal-body">
        <textarea id="quotes-textarea" placeholder="每行输入一条名言&#10;例如：&#10;人生如逆旅，我亦是行人&#10;行到水穷处，坐看云起时"></textarea>
        <div class="quotes-modal-hint">每行一条，保存后与内置名言混合显示</div>
      </div>
      <div class="quotes-modal-footer">
        <button id="quotes-cancel" class="quotes-btn-secondary">取消</button>
        <button id="quotes-save" class="quotes-btn-primary">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(quotesModal);

  const quotesTextarea = quotesModal.querySelector('#quotes-textarea');
  const quotesCloseBtn = quotesModal.querySelector('.quotes-modal-close');
  const quotesCancelBtn = quotesModal.querySelector('#quotes-cancel');
  const quotesSaveBtn = quotesModal.querySelector('#quotes-save');

  function openQuotesModal() {
    const customQuotes = dm.settings.customQuotes || [];
    quotesTextarea.value = customQuotes.join('\n');
    quotesModal.classList.add('visible');
    quotesTextarea.focus();
  }

  function closeQuotesModal() {
    quotesModal.classList.remove('visible');
  }

  function saveQuotes() {
    const text = quotesTextarea.value.trim();
    const quotes = text ? text.split('\n').map(q => q.trim()).filter(Boolean) : [];
    dm.saveSetting('customQuotes', quotes);
    closeQuotesModal();
    // 如果在日视图，刷新名言显示
    if (currentView === 'day') {
      updateDayHeaderPill(selectedDate, quotes);
    }
  }

  quotesCloseBtn.addEventListener('click', closeQuotesModal);
  quotesCancelBtn.addEventListener('click', closeQuotesModal);
  quotesSaveBtn.addEventListener('click', saveQuotes);

  quotesModal.addEventListener('click', (e) => {
    if (e.target === quotesModal) closeQuotesModal();
  });

  quotesTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeQuotesModal();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      saveQuotes();
    }
  });

  // 监听托盘菜单触发
  window.electronAPI.onQuotesEdit(openQuotesModal);
}

init().catch(console.error);
