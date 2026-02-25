// 预生成 48 个时间槽字符串
const TIMES = (() => {
  const slots = []
  for (let h = 0; h < 24; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
})()

const CELL_HEIGHT = 40 // px，必须与 CSS --cell-height 一致
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const TODAY_STR = new Date().toISOString().split('T')[0]

let currentRedLineEl = null
let redLineTimer = null
let _dragState = null   // { date, timeSlot, text }

// ── 浮动编辑框 ────────────────────────────────────────────────────────────────
const FloatingEditor = {
  _editor: null,
  _textarea: null,
  _onCommit: null,
  _onDelete: null,
  _currentCell: null,

  init() {
    this._editor = document.getElementById('floating-editor')
    this._textarea = document.getElementById('floating-textarea')

    // 右上角垃圾桶
    const trashBtn = document.createElement('button')
    trashBtn.className = 'editor-trash'
    trashBtn.title = '删除此日程'
    trashBtn.innerHTML = '🗑'
    trashBtn.addEventListener('mousedown', (e) => {
      e.preventDefault() // 阻止触发外部 mousedown 提交
      this._onDelete && this._onDelete()
      this.close()
    })
    this._editor.appendChild(trashBtn)

    // 底部提示
    const hint = document.createElement('div')
    hint.className = 'editor-hint'
    hint.textContent = 'Enter 保存 · Esc 取消'
    this._editor.appendChild(hint)

    this._textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.cancel(); e.preventDefault() }
      if (e.key === 'Enter' && !e.shiftKey) { this.commit(); e.preventDefault() }
    })

    // 右键菜单
    this._textarea.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      window.electronAPI.showEditorContextMenu()
    })

    // 主进程触发删除
    window.electronAPI.onEditorDeleteTrigger(() => {
      if (this._editor.style.display === 'none') return
      this._onDelete && this._onDelete()
      this.close()
    })

    // 点击编辑框外部 → 提交
    document.addEventListener('mousedown', (e) => {
      if (this._editor.style.display !== 'none' &&
          !this._editor.contains(e.target) &&
          !e.target.classList.contains('grid-cell')) {
        this.commit()
      }
    })
  },

  open(cell, currentText, onCommit, onDelete) {
    this._onCommit = onCommit
    this._onDelete = onDelete || null
    this._currentCell = cell

    // 定位：尝试在格子下方，边界检测
    const rect = cell.getBoundingClientRect()
    const editorW = 220
    const editorH = 100
    let left = rect.left
    let top = rect.bottom + 2

    if (left + editorW > window.innerWidth - 8) {
      left = window.innerWidth - editorW - 8
    }
    if (top + editorH > window.innerHeight - 8) {
      top = rect.top - editorH - 2
    }

    this._editor.style.left = `${left}px`
    this._editor.style.top = `${top}px`
    this._editor.style.display = 'block'
    this._textarea.value = currentText
    this._textarea.focus()
    this._textarea.select()
  },

  commit() {
    if (this._editor.style.display === 'none') return
    const text = this._textarea.value.trim()
    if (this._onCommit) this._onCommit(text)
    this.close()
  },

  cancel() {
    this.close()
  },

  close() {
    this._editor.style.display = 'none'
    this._textarea.value = ''
    this._onCommit = null
    this._onDelete = null
    this._currentCell = null
  }
}

// ── 红线 ──────────────────────────────────────────────────────────────────────
function updateRedLine() {
  if (!currentRedLineEl) return
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const top = (minutes / 30) * CELL_HEIGHT
  currentRedLineEl.style.top = `${top}px`
}

function startRedLineTimer() {
  clearInterval(redLineTimer)
  updateRedLine()
  redLineTimer = setInterval(updateRedLine, 60_000)
}

// ── 主渲染函数 ────────────────────────────────────────────────────────────────
export const WeekGrid = {
  init() {
    FloatingEditor.init()
  },

  render(weekDates, eventsData, selectedDate, callbacks) {
    this._renderHeader(weekDates, selectedDate, callbacks)
    this._renderBody(weekDates, eventsData, selectedDate, callbacks)
  },

  _renderHeader(weekDates, selectedDate, callbacks) {
    const header = document.getElementById('grid-header')
    header.innerHTML = ''

    // 左上角时间槽空白
    const gutter = document.createElement('div')
    gutter.className = 'time-gutter-header'
    gutter.textContent = 'GMT+8'
    header.appendChild(gutter)

    weekDates.forEach(dateStr => {
      const date = new Date(dateStr + 'T12:00:00')
      const isToday = dateStr === TODAY_STR
      const isSelected = dateStr === selectedDate

      const col = document.createElement('div')
      col.className = 'col-header'
      if (isToday) col.classList.add('today')
      if (isSelected) col.classList.add('selected')
      col.dataset.date = dateStr

      const dayName = document.createElement('span')
      dayName.className = 'day-name'
      dayName.textContent = DAY_NAMES[date.getDay()]

      const dayNum = document.createElement('span')
      dayNum.className = 'day-num'
      dayNum.textContent = date.getDate()

      col.appendChild(dayName)
      col.appendChild(dayNum)
      col.addEventListener('click', () => callbacks.onSelectDate(dateStr))
      header.appendChild(col)
    })
  },

  _renderBody(weekDates, eventsData, selectedDate, callbacks) {
    const body = document.getElementById('grid-body')
    body.innerHTML = ''

    // 红线（position:absolute，不参与 grid 布局）
    const redLine = document.createElement('div')
    redLine.className = 'current-time-line'
    body.appendChild(redLine)
    currentRedLineEl = redLine

    TIMES.forEach((timeSlot, rowIndex) => {
      const isHour = timeSlot.endsWith(':00')
      const gridRow = rowIndex + 1   // CSS Grid 行号从 1 开始

      // 时间标签：仅整点渲染，跨越本行与下一行（span 2）
      if (isHour) {
        const label = document.createElement('div')
        label.className = 'time-label'
        label.textContent = timeSlot
        label.style.gridColumn = '1'
        label.style.gridRow = `${gridRow} / span 2`
        body.appendChild(label)
      }

      // 7 个事件单元格
      weekDates.forEach((dateStr, colIndex) => {
        const cell = document.createElement('div')
        cell.className = 'grid-cell'
        // 整点行（非第一行）加深上边框，作为小时分隔线
        if (isHour && rowIndex > 0) cell.classList.add('on-hour')
        cell.dataset.date = dateStr
        cell.dataset.time = timeSlot
        cell.style.gridColumn = String(colIndex + 2)
        cell.style.gridRow = String(gridRow)
        if (dateStr === selectedDate) cell.classList.add('selected-col')

        const eventText = eventsData?.[dateStr]?.[timeSlot]?.text || ''
        if (eventText) {
          cell.textContent = eventText
          cell.classList.add('has-event')
          cell.title = eventText
          cell.draggable = true
        }

        cell.addEventListener('click', () => {
          FloatingEditor.open(
            cell,
            cell.textContent.trim(),
            (newText) => {
              if (newText) {
                cell.textContent = newText
                cell.title = newText
                cell.classList.add('has-event')
                cell.draggable = true
                callbacks.onEventChange(dateStr, timeSlot, newText)
              } else {
                cell.textContent = ''
                cell.title = ''
                cell.classList.remove('has-event')
                cell.draggable = false
                callbacks.onEventClear(dateStr, timeSlot)
              }
            },
            () => {
              // 垃圾桶：直接删除
              cell.textContent = ''
              cell.title = ''
              cell.classList.remove('has-event')
              cell.draggable = false
              callbacks.onEventClear(dateStr, timeSlot)
            }
          )
        })

        // ── 拖拽监听器（无条件绑定，draggable 属性动态控制是否可拖）──
        cell.addEventListener('dragstart', (e) => {
          if (!cell.draggable) return
          _dragState = { date: dateStr, timeSlot, text: cell.textContent.trim() }
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', _dragState.text) // Chromium 必须调用
          setTimeout(() => cell.classList.add('dragging'), 0)
        })
        cell.addEventListener('dragend', () => {
          cell.classList.remove('dragging')
          _dragState = null
        })

        // 所有格子都是放置目标
        cell.addEventListener('dragover', (e) => {
          if (!_dragState) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          cell.classList.add('drag-over')
        })
        cell.addEventListener('dragleave', () => {
          cell.classList.remove('drag-over')
        })
        cell.addEventListener('drop', (e) => {
          e.preventDefault()
          cell.classList.remove('drag-over')
          if (!_dragState) return
          const { date: srcDate, timeSlot: srcSlot, text } = _dragState
          _dragState = null
          if (srcDate === dateStr && srcSlot === timeSlot) return

          // DOM：清除来源格
          const srcCell = document.querySelector(
            `.grid-cell[data-date="${srcDate}"][data-time="${srcSlot}"]`
          )
          if (srcCell) {
            srcCell.textContent = ''
            srcCell.title = ''
            srcCell.classList.remove('has-event', 'dragging')
            srcCell.draggable = false
          }

          // DOM：更新目标格
          cell.textContent = text
          cell.title = text
          cell.classList.add('has-event')
          cell.draggable = true

          // 数据持久化
          callbacks.onEventClear(srcDate, srcSlot)
          callbacks.onEventChange(dateStr, timeSlot, text)
        })

        body.appendChild(cell)
      })
    })

    startRedLineTimer()
  },

  // 自动滚动到红线居中
  scrollToCurrentTime() {
    const body = document.getElementById('grid-body')
    if (!body || !currentRedLineEl) return
    const now = new Date()
    const minutes = now.getHours() * 60 + now.getMinutes()
    const lineTop = (minutes / 30) * CELL_HEIGHT
    body.scrollTop = lineTop - body.clientHeight / 2 + CELL_HEIGHT
  },

  // 更新选中列（不重建整个 DOM）
  updateSelectedCol(oldDate, newDate) {
    document.querySelectorAll('.grid-cell.selected-col').forEach(el => {
      el.classList.remove('selected-col')
    })
    document.querySelectorAll(`.grid-cell[data-date="${newDate}"]`).forEach(el => {
      el.classList.add('selected-col')
    })
    document.querySelectorAll('.col-header').forEach(el => {
      el.classList.toggle('selected', el.dataset.date === newDate)
    })
  }
}
