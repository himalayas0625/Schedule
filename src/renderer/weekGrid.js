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

// 动态获取今天的日期字符串，避免程序长时间运行后日期不更新
function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

let currentRedLineEl = null
let redLineTimer = null
let _dragState = null   // { date, timeSlot, index, text }

// ── 辅助：读取 slot 的 items 数组（兼容旧格式 { text }）────────────────────────
function getSlotItems(eventsData, dateStr, timeSlot) {
  const raw = eventsData?.[dateStr]?.[timeSlot]
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return [raw] // 旧格式 { text } 兼容
}

// ── 辅助：移除 block，重编剩余 block 的 data-index，更新 cell class ──────────
function _removeBlock(block, cell) {
  block.remove()
  const remaining = cell.querySelectorAll('.event-block')
  if (remaining.length === 0) {
    cell.classList.remove('has-event', 'multi-event')
  } else {
    cell.classList.remove('multi-event')
    remaining.forEach((b, i) => { b.dataset.index = i })
  }
}

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
    hint.textContent = 'Enter 保存 · Alt+Enter 换行 · Esc 取消'
    this._editor.appendChild(hint)

    this._textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.cancel(); e.preventDefault() }
      // Alt+Enter 换行（手动插入换行符）
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault()
        const textarea = this._textarea
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const value = textarea.value
        textarea.value = value.substring(0, start) + '\n' + value.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + 1
        return
      }
      // Enter 保存（不含修饰键）
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { this.commit(); e.preventDefault() }
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
          !e.target.classList.contains('grid-cell') &&
          !e.target.classList.contains('event-block')) {
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
      const isToday = dateStr === getTodayStr()
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
        if (isHour && rowIndex > 0) cell.classList.add('on-hour')
        cell.dataset.date = dateStr
        cell.dataset.time = timeSlot
        cell.style.gridColumn = String(colIndex + 2)
        cell.style.gridRow = String(gridRow)
        if (dateStr === selectedDate) cell.classList.add('selected-col')

        // 读取该 slot 的事件列表
        const items = getSlotItems(eventsData, dateStr, timeSlot)
        if (items.length > 0) {
          cell.classList.add('has-event')
          if (items.length >= 2) cell.classList.add('multi-event')
          items.forEach((item, idx) => {
            cell.appendChild(_makeEventBlock(item.text, idx, cell, dateStr, timeSlot, callbacks))
          })
        }

        // 点击空 cell → 新建事件
        cell.addEventListener('click', () => {
          if (cell.querySelector('.event-block')) return // 由 block 处理
          FloatingEditor.open(
            cell, '',
            (newText) => {
              if (newText) {
                const block = _makeEventBlock(newText, 0, cell, dateStr, timeSlot, callbacks)
                cell.appendChild(block)
                cell.classList.add('has-event')
                callbacks.onEventChange(dateStr, timeSlot, newText)
              }
            }
          )
        })

        // 所有格子都是放置目标
        cell.addEventListener('dragover', (e) => {
          if (!_dragState) return
          if (cell.querySelectorAll('.event-block').length >= 2) return // 最多 2 个
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
          const { date: srcDate, timeSlot: srcSlot, index: srcIdx, text } = _dragState
          _dragState = null
          if (srcDate === dateStr && srcSlot === timeSlot) return

          const existingBlocks = cell.querySelectorAll('.event-block')
          if (existingBlocks.length >= 2) return // 拒绝第三个

          // 清除来源格中被拖动的 block
          const srcCell = document.querySelector(
            `.grid-cell[data-date="${srcDate}"][data-time="${srcSlot}"]`
          )
          if (srcCell) {
            const srcBlocks = srcCell.querySelectorAll('.event-block')
            if (srcBlocks[srcIdx]) {
              _removeBlock(srcBlocks[srcIdx], srcCell)
            }
          }

          // 添加到目标格
          const newIdx = existingBlocks.length // 0 或 1
          const block = _makeEventBlock(text, newIdx, cell, dateStr, timeSlot, callbacks)
          cell.appendChild(block)
          cell.classList.add('has-event')
          if (newIdx === 1) cell.classList.add('multi-event')

          // 数据持久化
          callbacks.onEventItemClear(srcDate, srcSlot, srcIdx)
          if (newIdx === 0) {
            callbacks.onEventChange(dateStr, timeSlot, text)
          } else {
            callbacks.onEventAdd(dateStr, timeSlot, text)
          }
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

// ── 创建事件 block ─────────────────────────────────────────────────────────────
function _makeEventBlock(text, idx, cell, dateStr, timeSlot, callbacks) {
  const block = document.createElement('div')
  block.className = 'event-block'
  block.textContent = text
  block.title = text
  block.draggable = true
  block.dataset.index = idx

  // 点击 block → 编辑该事件
  block.addEventListener('click', (e) => {
    e.stopPropagation()
    FloatingEditor.open(
      cell,
      block.textContent.trim(),
      (newText) => {
        const currentIdx = parseInt(block.dataset.index)
        if (newText) {
          block.textContent = newText
          block.title = newText
          callbacks.onEventItemChange(dateStr, timeSlot, currentIdx, newText)
        } else {
          _removeBlock(block, cell)
          callbacks.onEventItemClear(dateStr, timeSlot, currentIdx)
        }
      },
      () => {
        // 垃圾桶删除
        const currentIdx = parseInt(block.dataset.index)
        _removeBlock(block, cell)
        callbacks.onEventItemClear(dateStr, timeSlot, currentIdx)
      }
    )
  })

  // 拖拽开始
  block.addEventListener('dragstart', (e) => {
    _dragState = {
      date: dateStr,
      timeSlot,
      index: parseInt(block.dataset.index),
      text: block.textContent.trim()
    }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', _dragState.text)
    e.stopPropagation()
    setTimeout(() => block.classList.add('dragging'), 0)
  })

  block.addEventListener('dragend', () => {
    block.classList.remove('dragging')
    _dragState = null
  })

  return block
}
