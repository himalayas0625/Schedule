import { getTodayStr } from './dateUtils.js';

// 预生成 48 个时间槽字符串
const TIMES = (() => {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

const CELL_HEIGHT = 40; // px，必须与 CSS --cell-height 一致
const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

let currentRedLineEl = null;
let redLineTimer = null;
let _dragState = null;   // { date, timeSlot, index, text }

// ── 辅助：读取 slot 的 items 数组（兼容旧格式 { text }）────────────────────────
function getSlotItems(eventsData, dateStr, timeSlot) {
  const raw = eventsData?.[dateStr]?.[timeSlot];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw]; // 旧格式 { text } 兼容
}

// ── 辅助：移除 block，重编剩余 block 的 data-index，更新 cell class ──────────
function _removeBlock(block, cell) {
  block.remove();
  const remaining = cell.querySelectorAll('.event-block');
  if (remaining.length === 0) {
    cell.classList.remove('has-event', 'multi-event');
  } else {
    cell.classList.remove('multi-event');
    remaining.forEach((b, i) => { b.dataset.index = i; });
  }
}

// ── 浮动编辑框（无感自动保存）────────────────────────────────────────────────
const FloatingEditor = {
  _editor: null,
  _textarea: null,
  _onCommit: null,
  _onDelete: null,
  _currentCell: null,
  _currentColorType: 0,
  _colorDots: [],
  _debounceTimer: null,
  _saveIndicator: null,
  _savedTimeout: null,
  _lastSavedText: '',
  _lastSavedColorType: 0,

  init() {
    this._editor = document.getElementById('floating-editor');
    this._textarea = document.getElementById('floating-textarea');

    // 保存状态指示器（右上角，垃圾桶左侧）
    this._saveIndicator = document.createElement('span');
    this._saveIndicator.className = 'save-indicator';
    this._editor.appendChild(this._saveIndicator);

    // 右上角垃圾桶
    const trashBtn = document.createElement('button');
    trashBtn.className = 'editor-trash';
    trashBtn.title = '删除此日程';
    trashBtn.innerHTML = '🗑';
    trashBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._forceSave(); // 删除前先保存
      this._onDelete && this._onDelete();
      this.close();
    });
    this._editor.appendChild(trashBtn);

    // 颜色选择器
    const colorRow = document.createElement('div');
    colorRow.className = 'editor-color-row';

    // 颜色圆点组（靠左）
    const dotsGroup = document.createElement('div');
    dotsGroup.className = 'editor-dots-group';
    const colorConfigs = [
      { type: 0, color: '#6E8EA1', title: '蓝色' },
      { type: 1, color: '#BC7E79', title: '红色' },
      { type: 2, color: '#8A9A73', title: '绿色' }
    ];
    colorConfigs.forEach(({ type, color, title }) => {
      const dot = document.createElement('button');
      dot.className = 'color-dot';
      dot.title = title;
      dot.dataset.colorType = type;
      dot.style.setProperty('--dot-color', color);
      dot.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._currentColorType = type;
        this._updateDots();
        this._scheduleSave(); // 颜色变更也触发保存
      });
      dotsGroup.appendChild(dot);
      this._colorDots.push(dot);
    });
    colorRow.appendChild(dotsGroup);

    // 保存按钮（靠右）
    const saveBtn = document.createElement('button');
    saveBtn.className = 'editor-save-btn';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._forceSave();
      this.close();
    });
    colorRow.appendChild(saveBtn);

    this._editor.appendChild(colorRow);

    // 键盘事件
    this._textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._cancelAndClose();
        e.preventDefault();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Enter → 保存并关闭
        e.preventDefault();
        this._forceSave();
        this.close();
      }
      // Shift+Enter → 原生换行，不拦截
    });

    // 右键菜单
    this._textarea.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      window.electronAPI.showEditorContextMenu();
    });

    // 主进程触发删除
    window.electronAPI.onEditorDeleteTrigger(() => {
      if (this._editor.style.display === 'none') return;
      this._forceSave();
      this._onDelete && this._onDelete();
      this.close();
    });

    // 输入事件 → 防抖保存
    this._textarea.addEventListener('input', () => {
      this._scheduleSave();
    });

    // 失焦 → 强制保存
    this._textarea.addEventListener('blur', () => {
      // 延迟一点执行，避免与点击外部关闭冲突
      setTimeout(() => {
        if (this._editor.style.display !== 'none') {
          this._forceSave();
        }
      }, 50);
    });

    // 点击编辑框外部 → 关闭
    document.addEventListener('mousedown', (e) => {
      if (this._editor.style.display !== 'none' &&
          !this._editor.contains(e.target) &&
          !e.target.classList.contains('grid-cell') &&
          !e.target.classList.contains('event-block')) {
        this.close();
      }
    });
  },

  _updateDots() {
    this._colorDots.forEach(dot => {
      dot.classList.toggle('active', parseInt(dot.dataset.colorType) === this._currentColorType);
    });
  },

  // 显示保存状态
  _showSaving() {
    if (!this._saveIndicator) return;
    clearTimeout(this._savedTimeout);
    this._saveIndicator.textContent = '...';
    this._saveIndicator.className = 'save-indicator saving';
  },

  _showSaved() {
    if (!this._saveIndicator) return;
    this._saveIndicator.textContent = '✓';
    this._saveIndicator.className = 'save-indicator saved';
    this._savedTimeout = setTimeout(() => {
      this._saveIndicator.className = 'save-indicator';
    }, 2000);
  },

  // 调度防抖保存
  _scheduleSave() {
    clearTimeout(this._debounceTimer);
    this._showSaving();
    this._debounceTimer = setTimeout(() => {
      this._doSave();
    }, 800);
  },

  // 执行保存（仅当内容有变化时）
  _doSave() {
    const text = this._textarea.value.trim();
    // 仅当内容或颜色有变化时才保存
    if (text !== this._lastSavedText || this._currentColorType !== this._lastSavedColorType) {
      if (this._onCommit) {
        this._onCommit(text, this._currentColorType);
      }
      this._lastSavedText = text;
      this._lastSavedColorType = this._currentColorType;
    }
    this._showSaved();
  },

  // 强制保存（失焦/关闭前）
  _forceSave() {
    clearTimeout(this._debounceTimer);
    this._doSave();
  },

  open(cell, currentText, currentColorType, onCommit, onDelete) {
    // 切换到新 block 前，先保存当前编辑中的内容（避免丢失）
    this._forceSave();

    this._onCommit = onCommit;
    this._onDelete = onDelete || null;
    this._currentCell = cell;
    this._currentColorType = currentColorType ?? 0;
    this._lastSavedText = currentText.trim();
    this._lastSavedColorType = this._currentColorType;
    this._updateDots();

    // 定位：尝试在格子下方，边界检测
    const rect = cell.getBoundingClientRect();
    const editorW = 220;
    const editorH = 100;
    let left = rect.left;
    let top = rect.bottom + 2;

    if (left + editorW > window.innerWidth - 8) {
      left = window.innerWidth - editorW - 8;
    }
    if (top + editorH > window.innerHeight - 8) {
      top = rect.top - editorH - 2;
    }

    this._editor.style.left = `${left}px`;
    this._editor.style.top = `${top}px`;
    this._editor.style.display = 'block';
    this._textarea.value = currentText;
    this._textarea.focus();
    this._textarea.select();

    // 重置状态指示器
    if (this._saveIndicator) {
      this._saveIndicator.className = 'save-indicator';
      this._saveIndicator.textContent = '';
    }
  },

  // 取消并关闭（不保存）
  _cancelAndClose() {
    clearTimeout(this._debounceTimer);
    clearTimeout(this._savedTimeout);
    this.close();
  },

  close() {
    // 关闭前强制保存未完成的防抖任务
    this._forceSave();
    this._editor.style.display = 'none';
    this._textarea.value = '';
    this._onCommit = null;
    this._onDelete = null;
    this._currentCell = null;
    this._currentColorType = 0;
    this._lastSavedText = '';
    this._lastSavedColorType = 0;
    clearTimeout(this._debounceTimer);
    clearTimeout(this._savedTimeout);
  }
};

// ── 红线 ──────────────────────────────────────────────────────────────────────
function updateRedLine() {
  if (!currentRedLineEl) return;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = (minutes / 30) * CELL_HEIGHT;
  currentRedLineEl.style.top = `${top}px`;
}

function startRedLineTimer() {
  clearInterval(redLineTimer);
  updateRedLine();
  redLineTimer = setInterval(updateRedLine, 60_000);
}

// ── 主渲染函数 ────────────────────────────────────────────────────────────────
export const WeekGrid = {
  init() {
    FloatingEditor.init();
  },

  render(weekDates, eventsData, selectedDate, callbacks) {
    this._renderHeader(weekDates, selectedDate, callbacks);
    this._renderBody(weekDates, eventsData, selectedDate, callbacks);
  },

  _renderHeader(weekDates, selectedDate, callbacks) {
    const header = document.getElementById('grid-header');
    header.innerHTML = '';

    // 左上角时间槽空白
    const gutter = document.createElement('div');
    gutter.className = 'time-gutter-header';
    gutter.textContent = '';
    header.appendChild(gutter);

    weekDates.forEach(dateStr => {
      const date = new Date(dateStr + 'T12:00:00');
      const isToday = dateStr === getTodayStr();
      const isSelected = dateStr === selectedDate;

      const col = document.createElement('div');
      col.className = 'col-header';
      if (isToday) col.classList.add('today');
      if (isSelected) col.classList.add('selected');
      col.dataset.date = dateStr;

      const dayName = document.createElement('span');
      dayName.className = 'day-name';
      dayName.textContent = DAY_NAMES[date.getDay()];

      const dayNum = document.createElement('span');
      dayNum.className = 'day-num';
      dayNum.textContent = date.getDate();

      const todayLabel = document.createElement('span');
      todayLabel.className = 'today-label';
      todayLabel.textContent = isToday ? '今日' : '';

      col.appendChild(dayName);
      col.appendChild(dayNum);
      col.appendChild(todayLabel);
      col.addEventListener('click', () => callbacks.onSelectDate(dateStr));
      header.appendChild(col);
    });
  },

  _renderBody(weekDates, eventsData, selectedDate, callbacks) {
    const body = document.getElementById('grid-body');
    body.innerHTML = '';

    // 红线（position:absolute，不参与 grid 布局）
    const redLine = document.createElement('div');
    redLine.className = 'current-time-line';
    body.appendChild(redLine);
    currentRedLineEl = redLine;

    TIMES.forEach((timeSlot, rowIndex) => {
      const isHour = timeSlot.endsWith(':00');
      const gridRow = rowIndex + 1;   // CSS Grid 行号从 1 开始

      // 时间标签：仅整点渲染，跨越本行与下一行（span 2）
      if (isHour) {
        const label = document.createElement('div');
        label.className = 'time-label';
        label.textContent = timeSlot;
        label.style.gridColumn = '1';
        label.style.gridRow = `${gridRow} / span 2`;
        body.appendChild(label);
      }

      // 7 个事件单元格
      weekDates.forEach((dateStr, colIndex) => {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        if (isHour && rowIndex > 0) cell.classList.add('on-hour');
        cell.dataset.date = dateStr;
        cell.dataset.time = timeSlot;
        cell.style.gridColumn = String(colIndex + 2);
        cell.style.gridRow = String(gridRow);
        if (dateStr === selectedDate) cell.classList.add('selected-col');

        // 读取该 slot 的事件列表
        const items = getSlotItems(eventsData, dateStr, timeSlot);
        if (items.length > 0) {
          cell.classList.add('has-event');
          if (items.length >= 2) cell.classList.add('multi-event');
          items.forEach((item, idx) => {
            cell.appendChild(_makeEventBlock(item, idx, cell, dateStr, timeSlot, callbacks));
          });
        }

        // 点击空 cell → 新建事件
        cell.addEventListener('click', () => {
          if (cell.querySelector('.event-block')) return; // 由 block 处理
          FloatingEditor.open(
            cell, '', 0,
            (newText, newColorType) => {
              if (newText) {
                const existing = cell.querySelector('.event-block');
                if (existing) {
                  // 防抖已创建过 block，直接更新避免重复追加
                  existing.querySelector('.event-text').textContent = newText.split('\n')[0];
                  existing.title = newText;
                  existing.dataset.fullText = newText;
                  _applyCategoryClass(existing, newText);
                  _applyColorClass(existing, newColorType);
                } else {
                  const block = _makeEventBlock({ text: newText, colorType: newColorType }, 0, cell, dateStr, timeSlot, callbacks);
                  cell.appendChild(block);
                  cell.classList.add('has-event');
                }
                callbacks.onEventChange(dateStr, timeSlot, newText, newColorType);
              }
            }
          );
        });

        // 所有格子都是放置目标
        cell.addEventListener('dragover', (e) => {
          if (!_dragState) return;
          if (cell.querySelectorAll('.event-block').length >= 2) return; // 最多 2 个
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          cell.classList.add('drag-over');
        });
        cell.addEventListener('dragleave', () => {
          cell.classList.remove('drag-over');
        });
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          if (!_dragState) return;
          const { date: srcDate, timeSlot: srcSlot, index: srcIdx, blockRef, text, colorType = 0 } = _dragState;
          _dragState = null;
          if (srcDate === dateStr && srcSlot === timeSlot) return;

          const existingBlocks = cell.querySelectorAll('.event-block');
          if (existingBlocks.length >= 2) return; // 拒绝第三个

          // 清除来源格中被拖动的 block（用引用直接定位，避免 index 竞态失效）
          if (blockRef && blockRef.parentNode) {
            _removeBlock(blockRef, blockRef.parentNode);
          }

          // 添加到目标格
          const newIdx = existingBlocks.length; // 0 或 1
          const block = _makeEventBlock({ text, colorType }, newIdx, cell, dateStr, timeSlot, callbacks);
          cell.appendChild(block);
          cell.classList.add('has-event');
          if (newIdx === 1) cell.classList.add('multi-event');

          // 数据持久化
          callbacks.onEventItemClear(srcDate, srcSlot, srcIdx);
          if (newIdx === 0) {
            callbacks.onEventChange(dateStr, timeSlot, text, colorType);
          } else {
            callbacks.onEventAdd(dateStr, timeSlot, text, colorType);
          }
        });

        body.appendChild(cell);
      });
    });

    startRedLineTimer();
  },

  // 自动滚动到红线居中
  scrollToCurrentTime() {
    const body = document.getElementById('grid-body');
    if (!body || !currentRedLineEl) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const lineTop = (minutes / 30) * CELL_HEIGHT;
    body.scrollTop = lineTop - body.clientHeight / 2 + CELL_HEIGHT;
  },

  // ── 月视图渲染入口 ────────────────────────────────────
  renderMonth(calendarDates, eventsMap, year, month, selectedDate, startOfWeek, callbacks) {
    clearInterval(redLineTimer);
    currentRedLineEl = null;
    this._renderMonthHeader(startOfWeek);
    this._renderMonthBody(calendarDates, eventsMap, year, month, selectedDate, callbacks);
  },

  _renderMonthHeader(startOfWeek = 0) {
    const header = document.getElementById('grid-header');
    header.innerHTML = '';
    const ALL_DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    for (let i = 0; i < 7; i++) {
      const col = document.createElement('div');
      col.className = 'col-header month-col-header';
      col.textContent = ALL_DAYS[(startOfWeek + i) % 7];
      header.appendChild(col);
    }
  },

  _renderMonthBody(calendarDates, eventsMap, year, month, selectedDate, callbacks) {
    const body = document.getElementById('grid-body');
    body.innerHTML = '';
    const today = getTodayStr();

    calendarDates.forEach(dateStr => {
      const d = new Date(dateStr + 'T12:00:00');
      const isCurrentMonth = d.getFullYear() === year && (d.getMonth() + 1) === month;
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;

      const cell = document.createElement('div');
      cell.className = 'month-day-cell';
      if (!isCurrentMonth) cell.classList.add('other-month');
      if (isToday) cell.classList.add('today');
      if (isSelected) cell.classList.add('selected');

      // 日期数字
      const dayNum = document.createElement('div');
      dayNum.className = 'month-day-num';
      dayNum.textContent = d.getDate();
      cell.appendChild(dayNum);

      // 事件小条（最多显示 3 条）
      const dayEvents = eventsMap[dateStr] ?? {};
      const slots = Object.keys(dayEvents).sort();
      let chipCount = 0;
      let totalCount = 0;

      for (const slot of slots) {
        const raw = dayEvents[slot];
        const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        totalCount += items.length;
        for (const item of items) {
          if (chipCount >= 3) continue;
          const text = typeof item === 'string' ? item : (item.text || '');
          if (!text) { totalCount--; continue; }
          const colorType = typeof item === 'object' ? (item.colorType ?? 0) : 0;
          const chip = document.createElement('div');
          chip.className = 'month-event-chip';
          chip.textContent = text;
          chip.title = `${slot} ${text}`;
          _applyColorClass(chip, colorType);
          cell.appendChild(chip);
          chipCount++;
        }
      }

      if (totalCount > 3) {
        const more = document.createElement('div');
        more.className = 'month-more';
        more.textContent = `+${totalCount - 3} 项`;
        cell.appendChild(more);
      }

      cell.addEventListener('click', () => callbacks.onSelectDate(dateStr));
      body.appendChild(cell);
    });
  },

  // 更新选中列（不重建整个 DOM）
  updateSelectedCol(oldDate, newDate) {
    document.querySelectorAll('.grid-cell.selected-col').forEach(el => {
      el.classList.remove('selected-col');
    });
    document.querySelectorAll(`.grid-cell[data-date="${newDate}"]`).forEach(el => {
      el.classList.add('selected-col');
    });
    document.querySelectorAll('.col-header').forEach(el => {
      el.classList.toggle('selected', el.dataset.date === newDate);
    });
  }
};

// ── 根据 colorType 应用颜色类 ────────────────────────────────────────────────
function _applyColorClass(el, colorType) {
  el.classList.remove('bg-blue', 'bg-red', 'bg-green');
  if (colorType === 1) el.classList.add('bg-red');
  else if (colorType === 2) el.classList.add('bg-green');
  else el.classList.add('bg-blue');
}

// ── 根据前缀自动分类（!重要  @个人）────────────────────────────────────────────
function _applyCategoryClass(el, text) {
  el.classList.remove('event-important', 'event-personal');
  if (text.startsWith('!') || text.startsWith('！')) {
    el.classList.add('event-important');
  } else if (text.startsWith('@')) {
    el.classList.add('event-personal');
  }
}

// ── 创建事件 block ─────────────────────────────────────────────────────────────
function _makeEventBlock(item, idx, cell, dateStr, timeSlot, callbacks) {
  const text = typeof item === 'string' ? item : (item.text || '');
  const colorType = typeof item === 'object' ? (item.colorType ?? 0) : 0;

  const block = document.createElement('div');
  block.className = 'event-block';
  block.title = text;
  block.draggable = true;
  block.dataset.index = idx;
  block.dataset.colorType = colorType;
  block.dataset.fullText = text;
  _applyCategoryClass(block, text);
  _applyColorClass(block, colorType);

  // 用 span 包裹文本，使 text-overflow: ellipsis 在 flex 容器内正确截断
  // 仅显示第一行，多行内容通过编辑框查看
  const textSpan = document.createElement('span');
  textSpan.className = 'event-text';
  textSpan.textContent = text.split('\n')[0];
  block.appendChild(textSpan);

  // 点击 block → 编辑该事件
  block.addEventListener('click', (e) => {
    e.stopPropagation();
    FloatingEditor.open(
      cell,
      block.dataset.fullText,
      parseInt(block.dataset.colorType) || 0,
      (newText, newColorType) => {
        const currentIdx = parseInt(block.dataset.index);
        if (newText) {
          block.querySelector('.event-text').textContent = newText.split('\n')[0];
          block.title = newText;
          block.dataset.fullText = newText;
          block.dataset.colorType = newColorType;
          _applyCategoryClass(block, newText);
          _applyColorClass(block, newColorType);
          callbacks.onEventItemChange(dateStr, timeSlot, currentIdx, newText, newColorType);
        } else {
          _removeBlock(block, cell);
          callbacks.onEventItemClear(dateStr, timeSlot, currentIdx);
        }
      },
      () => {
        // 垃圾桶删除
        const currentIdx = parseInt(block.dataset.index);
        _removeBlock(block, cell);
        callbacks.onEventItemClear(dateStr, timeSlot, currentIdx);
      }
    );
  });

  // 拖拽开始
  block.addEventListener('dragstart', (e) => {
    _dragState = {
      date: dateStr,
      timeSlot,
      index: parseInt(block.dataset.index),
      blockRef: block,                       // 直接持有元素引用，避免 index 竞态失效
      text: block.dataset.fullText,
      colorType: parseInt(block.dataset.colorType) || 0
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragState.text);
    e.stopPropagation();
    setTimeout(() => block.classList.add('dragging'), 0);
  });

  block.addEventListener('dragend', () => {
    block.classList.remove('dragging');
    _dragState = null;
  });

  return block;
}
