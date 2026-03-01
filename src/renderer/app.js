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

// ── 应用初始化 ────────────────────────────────────────────────────────────────
async function init() {
  const dm = new DataManager()
  await dm.load()

  const today = toLocalDateStr(new Date())
  let currentOffset = 0                     // 0 = 本周
  let selectedDate = today                  // 当前选中列

  WeekGrid.init()

  // ── 渲染函数 ────────────────────────────────────────
  function render() {
    const weekDates = getWeekDates(currentOffset, dm.settings.startOfWeek ?? 0)
    const weekKey = getISOWeekKey(new Date(weekDates[0] + 'T12:00:00'))
    const weekData = dm.getWeekData(weekKey)

    // 若选中日期不在本周视图内，保持不变（允许跨周浏览时笔记仍显示已选日期）
    // 若是跳回本周，重置到今天
    if (currentOffset === 0 && !weekDates.includes(selectedDate)) {
      selectedDate = today
    }

    // 更新周范围标签
    document.getElementById('btn-week-label').textContent = formatWeekLabel(weekDates)

    // 渲染网格
    WeekGrid.render(weekDates, weekData.events, selectedDate, {
      onSelectDate(dateStr) {
        const prevDate = selectedDate
        selectedDate = dateStr
        WeekGrid.updateSelectedCol(prevDate, dateStr)
        NotesPanel.render(dm.getNotes(weekKey, dateStr), dateStr, {
          onChange(date, idx, val) {
            dm.setNote(weekKey, date, idx, val)
          }
        })
      },
      onEventChange(dateStr, timeSlot, text, colorType = 0) {
        dm.setEvent(weekKey, dateStr, timeSlot, text, colorType)
      },
      onEventClear(dateStr, timeSlot) {
        dm.clearEvent(weekKey, dateStr, timeSlot)
      },
      onEventAdd(dateStr, timeSlot, text, colorType = 0) {
        dm.addEvent(weekKey, dateStr, timeSlot, text, colorType)
      },
      onEventItemChange(dateStr, timeSlot, index, text, colorType = 0) {
        dm.setEventItem(weekKey, dateStr, timeSlot, text, index, colorType)
      },
      onEventItemClear(dateStr, timeSlot, index) {
        dm.clearEventItem(weekKey, dateStr, timeSlot, index)
      }
    })

    // 渲染笔记面板
    // 需要找到当前选中日期对应的周 key（可能与当前视图不同）
    const notesWeekKey = getISOWeekKey(new Date(selectedDate + 'T12:00:00'))
    NotesPanel.render(dm.getNotes(notesWeekKey, selectedDate), selectedDate, {
      onChange(date, idx, val) {
        dm.setNote(notesWeekKey, date, idx, val)
      }
    })

    // 渲染右侧"本周重点"面板
    RightPanel.render(dm.getWeekNotes(weekKey), formatWeekLabel(weekDates), {
      onChange(idx, val) {
        dm.setWeekNote(weekKey, idx, val)
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
    currentOffset--
    render()
  })
  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentOffset++
    render()
  })
  document.getElementById('btn-week-label').addEventListener('click', () => {
    currentOffset = 0
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
}

init().catch(console.error)
