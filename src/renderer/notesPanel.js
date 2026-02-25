const DAY_NAMES_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const TODAY_STR = new Date().toISOString().split('T')[0]

export const NotesPanel = {
  render(notesData, selectedDate, callbacks) {
    const panel = document.getElementById('notes-panel')
    panel.innerHTML = ''

    const date = new Date(selectedDate + 'T12:00:00')
    const isToday = selectedDate === TODAY_STR
    const dayName = DAY_NAMES_FULL[date.getDay()]
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`

    // ── 日期标题 ──────────────────────────────────────
    const header = document.createElement('div')
    header.className = 'notes-date-header' + (isToday ? ' notes-today' : '')

    const title = document.createElement('div')
    title.className = 'notes-date-title'
    title.textContent = `${monthDay} ${dayName}`

    const sub = document.createElement('div')
    sub.className = 'notes-date-sub'
    sub.textContent = isToday ? '今天的重点' : '当日重点'

    header.appendChild(title)
    header.appendChild(sub)
    panel.appendChild(header)

    // ── 标签 ──────────────────────────────────────────
    const label = document.createElement('div')
    label.className = 'notes-label'
    label.textContent = 'Top 3'
    panel.appendChild(label)

    // ── 三件事输入 ────────────────────────────────────
    const list = document.createElement('div')
    list.className = 'notes-list'

    const dayNotes = notesData ?? ['', '', '']

    dayNotes.forEach((text, index) => {
      const item = document.createElement('div')
      item.className = 'note-item'

      const num = document.createElement('span')
      num.className = 'note-num'
      num.textContent = index + 1

      const input = document.createElement('textarea')
      input.className = 'note-input'
      input.value = text
      input.placeholder = ['最重要的事', '第二件事', '第三件事'][index]
      input.maxLength = 200
      input.rows = 1

      // 自动调整高度
      function autoResize() {
        input.style.height = 'auto'
        input.style.height = input.scrollHeight + 'px'
      }
      // 初始高度
      setTimeout(autoResize, 0)

      // 监听侧边栏宽度变化，重新计算高度
      const resizeObserver = new ResizeObserver(() => {
        autoResize()
      })
      resizeObserver.observe(panel)

      // 防抖保存 + 自动调整高度
      let saveTimer = null
      input.addEventListener('input', () => {
        autoResize()
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          callbacks.onChange(selectedDate, index, input.value.trim())
        }, 500)
      })

      // Enter 跳到下一条，Alt+Enter 换行
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.altKey) {
          const inputs = list.querySelectorAll('.note-input')
          const next = inputs[index + 1]
          if (next) { next.focus(); next.select() }
          e.preventDefault()
        }
        // Alt+Enter：插入换行，交由浏览器默认行为处理后触发 autoResize
        if (e.key === 'Enter' && e.altKey) {
          e.preventDefault()
          const start = input.selectionStart
          const end = input.selectionEnd
          input.value = input.value.slice(0, start) + '\n' + input.value.slice(end)
          input.selectionStart = input.selectionEnd = start + 1
          autoResize()
          input.dispatchEvent(new Event('input'))
        }
      })

      item.appendChild(num)
      item.appendChild(input)
      list.appendChild(item)
    })

    panel.appendChild(list)

    // ── 底部提示 ──────────────────────────────────────
    const footer = document.createElement('div')
    footer.className = 'notes-footer'
    footer.textContent = '点击日期列切换'
    panel.appendChild(footer)
  }
}
