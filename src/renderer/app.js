import { WeekGrid } from './weekGrid.js'
import { NotesPanel, RightPanel } from './notesPanel.js'
import { DataManager } from './dataManager.js'

// ── 工具函数 ──────────────────────────────────────────────────────────────────

// 将 Date 格式化为本地日期字符串（避免 toISOString 的 UTC 偏移问题）
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 获取 ISO 周字符串 "YYYY-Www"
function getISOWeekKey(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const year = d.getFullYear()
  const week1 = new Date(year, 0, 4)
  const weekNum = 1 + Math.round(
    ((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  )
  return `${year}-W${String(weekNum).padStart(2, '0')}`
}

// 获取某周（含偏移）的 7 个 ISO 日期字符串（周一起始）
function getWeekDates(offset = 0, startOfWeek = 1) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = today.getDay()
  const diff = (day - startOfWeek + 7) % 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - diff + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return toLocalDateStr(d)
  })
}

// 格式化周范围标签
function formatWeekLabel(weekDates) {
  const fmt = (s) => {
    const d = new Date(s + 'T12:00:00')
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }
  const first = new Date(weekDates[0] + 'T12:00:00')
  const last = new Date(weekDates[6] + 'T12:00:00')
  if (first.getFullYear() !== last.getFullYear()) {
    return `${first.getFullYear()}年${fmt(weekDates[0])} – ${last.getFullYear()}年${fmt(weekDates[6])}`
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${fmt(weekDates[0])} – ${fmt(weekDates[6])}, ${first.getFullYear()}`
  }
  return `${first.getMonth() + 1}月${first.getDate()}–${last.getDate()}日 ${first.getFullYear()}`
}

// 格式化日标签（日视图标题栏）
function formatDayLabel(dateStr) {
  const DAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${DAY[d.getDay()]}`
}

// 获取月视图日历网格（6×7 = 42 天，startOfWeek 对齐周一/周日）
function getMonthCalendarDates(year, month, startOfWeek = 1) {
  const firstDay = new Date(year, month - 1, 1)
  const daysBack = (firstDay.getDay() - startOfWeek + 7) % 7
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - daysBack)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    return toLocalDateStr(d)
  })
}

// ── 农历日期计算（2024-2027 年，含闰月）────────────────────────────────────────
function getLunarDate(dateStr) {
  const DAY_NAMES = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
                     '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
                     '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十']
  // m=春节月(1-indexed), d=春节日, days=各农历月天数, names=对应月名（含闰月）
  const DB = {
    2024: { m:2, d:10, days:[30,29,30,29,30,29,30,29,30,29,30,30,29], names:['正月','二月','三月','四月','闰四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] },
    2025: { m:1, d:29, days:[30,29,30,29,30,29,29,30,29,30,29,30,29], names:['正月','二月','三月','四月','五月','六月','闰六月','七月','八月','九月','十月','冬月','腊月'] },
    2026: { m:2, d:17, days:[30,29,30,30,29,30,29,30,29,30,30,29],    names:['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] },
    2027: { m:2, d: 6, days:[30,29,30,29,30,29,30,30,29,30,29,30],    names:['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'] },
  }
  const d = new Date(dateStr + 'T12:00:00')
  const year = d.getFullYear()
  let entry = DB[year]
  let cnyDate = entry ? new Date(year, entry.m - 1, entry.d) : null
  if (!entry || d < cnyDate) {
    entry = DB[year - 1]
    if (!entry) return ''
    cnyDate = new Date(year - 1, entry.m - 1, entry.d)
  }
  let days = Math.floor((d - cnyDate) / 86400000)
  let m = 0
  for (; m < entry.days.length; m++) {
    if (days < entry.days[m]) break
    days -= entry.days[m]
  }
  if (m >= entry.names.length || days >= DAY_NAMES.length) return ''
  return `农历${entry.names[m]}${DAY_NAMES[days]}`
}

// ── 日视图顶部信息胶囊更新 ────────────────────────────────────────────────────
const DAILY_QUOTES = [
  '专注是最高级的休息', '每一天都是新的开始', '行动是治愈恐惧的良药',
  '简单生活，深度思考', '做好当下，未来自来', '慢即是快，少即是多',
  '规律产生力量', '成长始于不舒适', '把时间花在值得的事上', '清醒比努力更重要',
]
const CN_DAYS = ['周日','周一','周二','周三','周四','周五','周六']
const EN_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

function updateDayHeaderPill(dateStr, notesData) {
  const pill = document.getElementById('day-header-pill')
  if (!pill) return
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const lunar = getLunarDate(dateStr)
  const yearMonth = `${d.getFullYear()}年${d.getMonth() + 1}月`
  const dayIndex = Math.floor(d.getTime() / 86400000)
  const quote = `"${DAILY_QUOTES[((dayIndex % DAILY_QUOTES.length) + DAILY_QUOTES.length) % DAILY_QUOTES.length]}"`
  const secondary = [yearMonth, lunar, quote].filter(Boolean).join(' · ')

  const completed = (notesData ?? []).filter(n => n && n.trim()).length
  const mood = completed >= 2 ? '😊' : completed >= 1 ? '🙂' : '😐'
  const pct = Math.round(completed / 3 * 100)

  pill.querySelector('.dhp-day-num').textContent = d.getDate()
  pill.querySelector('.dhp-weekday-cn').textContent = CN_DAYS[dow]
  pill.querySelector('.dhp-weekday-en').textContent = EN_DAYS[dow]
  pill.querySelector('.dhp-secondary').textContent = secondary
  pill.querySelector('.dhp-completion').textContent = `${mood} 已完成 ${completed}/3`
  pill.querySelector('.dhp-progress-fill').style.width = `${pct}%`
}

// ── 应用初始化 ────────────────────────────────────────────────────────────────
async function init() {
  const dm = new DataManager()
  await dm.load()

  const today = toLocalDateStr(new Date())
  let currentOffset = 0                     // 0 = 本周
  let selectedDate = today                  // 当前选中列
  let currentView = 'week'                 // 'week' | 'day' | 'month'
  let monthOffset = 0                      // 0 = 本月，-1 = 上月，+1 = 下月

  WeekGrid.init()

  // ── 渲染函数 ────────────────────────────────────────
  function render() {
    // ── 月视图单独分支（早返回）──────────────────────
    if (currentView === 'month') {
      const now = new Date()
      const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
      const year = target.getFullYear()
      const month = target.getMonth() + 1
      const startOfWeek = dm.settings.startOfWeek ?? 1
      const calendarDates = getMonthCalendarDates(year, month, startOfWeek)

      // 聚合当月日历格内所有日期的事件
      const eventsMap = {}
      calendarDates.forEach(dateStr => {
        const wk = getISOWeekKey(new Date(dateStr + 'T12:00:00'))
        eventsMap[dateStr] = dm.getWeekData(wk).events?.[dateStr] ?? {}
      })

      const grid = document.getElementById('schedule-grid')
      grid.classList.remove('day-view')
      grid.classList.add('month-view')
      document.getElementById('btn-week-label').textContent = `${year}年${month}月`

      WeekGrid.renderMonth(calendarDates, eventsMap, year, month, selectedDate, startOfWeek, {
        onSelectDate(dateStr) {
          selectedDate = dateStr
          currentView = 'day'
          document.querySelectorAll('.pill-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === 'day')
          })
          render()
        }
      })

      const notesKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
      NotesPanel.render(dm.getNotes(notesKey, selectedDate), selectedDate, {
        onChange(date, idx, val) { dm.setNote(notesKey, date, idx, val) }
      })
      const dataKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
      RightPanel.render(dm.getWeekNotes(dataKey), `${year}年${month}月`, {
        onChange(idx, val) { dm.setWeekNote(dataKey, idx, val) }
      })
      return
    }

    // ── 周 / 日视图 ──────────────────────────────────
    const weekDates = getWeekDates(currentOffset, dm.settings.startOfWeek ?? 0)
    const weekKey = getISOWeekKey(new Date(weekDates[0] + 'T12:00:00'))

    if (currentOffset === 0 && !weekDates.includes(selectedDate)) {
      selectedDate = today
    }

    // 日视图时用 selectedDate 所在周的数据键
    const dataWeekKey = currentView === 'day'
      ? getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
      : weekKey
    const weekData = dm.getWeekData(dataWeekKey)

    // 日视图只传单日，周视图传全周
    const displayDates = currentView === 'day' ? [selectedDate] : weekDates

    // 切换视图 CSS 类
    document.getElementById('schedule-grid').classList.remove('month-view')
    document.getElementById('schedule-grid').classList.toggle('day-view', currentView === 'day')

    // 更新标题栏标签
    document.getElementById('btn-week-label').textContent = currentView === 'day'
      ? formatDayLabel(selectedDate)
      : formatWeekLabel(weekDates)

    // 渲染网格
    WeekGrid.render(displayDates, weekData.events, selectedDate, {
      onSelectDate(dateStr) {
        const prevDate = selectedDate
        selectedDate = dateStr
        if (currentView === 'week') WeekGrid.updateSelectedCol(prevDate, dateStr)
        const notesKey = getISOWeekKey(new Date(dateStr + 'T12:00:00'))
        NotesPanel.render(dm.getNotes(notesKey, dateStr), dateStr, {
          onChange(date, idx, val) {
            dm.setNote(notesKey, date, idx, val)
          }
        })
      },
      onEventChange(dateStr, timeSlot, text, colorType = 0) {
        dm.setEvent(dataWeekKey, dateStr, timeSlot, text, colorType)
      },
      onEventClear(dateStr, timeSlot) {
        dm.clearEvent(dataWeekKey, dateStr, timeSlot)
      },
      onEventAdd(dateStr, timeSlot, text, colorType = 0) {
        dm.addEvent(dataWeekKey, dateStr, timeSlot, text, colorType)
      },
      onEventItemChange(dateStr, timeSlot, index, text, colorType = 0) {
        dm.setEventItem(dataWeekKey, dateStr, timeSlot, text, index, colorType)
      },
      onEventItemClear(dateStr, timeSlot, index) {
        dm.clearEventItem(dataWeekKey, dateStr, timeSlot, index)
      }
    })

    // 日视图：更新顶部信息胶囊
    if (currentView === 'day') {
      updateDayHeaderPill(selectedDate, dm.getNotes(dataWeekKey, selectedDate))
    }

    // 渲染笔记面板
    const notesWeekKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
    NotesPanel.render(dm.getNotes(notesWeekKey, selectedDate), selectedDate, {
      onChange(date, idx, val) {
        dm.setNote(notesWeekKey, date, idx, val)
      }
    })

    // 渲染右侧"本周重点"面板
    RightPanel.render(dm.getWeekNotes(dataWeekKey), formatWeekLabel(weekDates), {
      onChange(idx, val) {
        dm.setWeekNote(dataWeekKey, idx, val)
      }
    })

    // 自动滚动到当前时间
    WeekGrid.scrollToCurrentTime()
  }

  render()

  // ── 左侧边栏宽度拖拽 ─────────────────────────────────
  const notesPanel = document.getElementById('notes-panel')
  const resizer    = document.getElementById('sidebar-resizer')
  const MIN_WIDTH  = 180
  const MAX_WIDTH  = 400

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault()
    resizer.classList.add('dragging')

    const onMouseMove = (e) => {
      const containerLeft = notesPanel.parentElement.getBoundingClientRect().left
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX - containerLeft))
      notesPanel.style.width = `${newWidth}px`
    }

    const onMouseUp = () => {
      resizer.classList.remove('dragging')
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  // ── 右侧边栏宽度拖拽 ─────────────────────────────────
  const rightPanel   = document.getElementById('right-panel')
  const rightResizer = document.getElementById('right-resizer')

  rightResizer.addEventListener('mousedown', (e) => {
    e.preventDefault()
    rightResizer.classList.add('dragging')

    const onMouseMove = (e) => {
      const containerRight = rightPanel.parentElement.getBoundingClientRect().right
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, containerRight - e.clientX))
      rightPanel.style.width = `${newWidth}px`
    }

    const onMouseUp = () => {
      rightResizer.classList.remove('dragging')
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })

  // ── 周导航 ──────────────────────────────────────────
  document.getElementById('btn-prev-week').addEventListener('click', () => {
    if (currentView === 'day') {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      selectedDate = toLocalDateStr(d)
    } else if (currentView === 'month') {
      monthOffset--
    } else {
      currentOffset--
    }
    render()
  })
  document.getElementById('btn-next-week').addEventListener('click', () => {
    if (currentView === 'day') {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      selectedDate = toLocalDateStr(d)
    } else if (currentView === 'month') {
      monthOffset++
    } else {
      currentOffset++
    }
    render()
  })
  document.getElementById('btn-week-label').addEventListener('click', () => {
    currentOffset = 0
    monthOffset = 0
    selectedDate = today
    render()
  })

  // ── 窗口控制按钮 ─────────────────────────────────────
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI.minimize()
  })

  const maxBtn = document.getElementById('btn-maximize')
  maxBtn.addEventListener('click', () => {
    window.electronAPI.maximize()
  })
  // 同步按钮图标：最大化时显示"还原"符号，否则显示"最大化"符号
  window.electronAPI.onMaximizeChange((isMaximized) => {
    maxBtn.textContent = isMaximized ? '❐' : '□'
    maxBtn.title = isMaximized ? '还原' : '最大化'
  })

  document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI.minimize() // 关闭到托盘 = 隐藏
  })

// ── 主题 ──────────────────────────────────────────────
  function applyTheme(themeSetting, systemDark) {
    let theme
    if (themeSetting === 'system') {
      theme = systemDark ? 'dark' : 'light'
    } else {
      theme = themeSetting
    }
    document.documentElement.setAttribute('data-theme', theme)
  }

  // 初始主题
  const themeSetting = dm.settings.theme || 'system'
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(themeSetting, prefersDark)

  // 主进程推送主题变化
  window.electronAPI.onThemeChange((theme) => {
    applyTheme(dm.settings.theme || 'system', theme === 'dark')
  })

  // ── 窗口显示时自动聚焦到红线 ────────────────────────────
  window.electronAPI.onWindowShow(() => {
    WeekGrid.scrollToCurrentTime()
  })

  // ── 日/周视图切换胶囊 ────────────────────────────────
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view
      if (view === currentView) return
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentView = view
      render()
    })
  })
}

init().catch(console.error)
