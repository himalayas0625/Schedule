const DAY_NAMES_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 动态获取今天的日期字符串，避免程序长时间运行后日期不更新
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// ── 通用渲染函数（左侧和右侧面板共用）────────────────────────────────────────
function renderTo(panelEl, { items, title, sub, isHighlight, placeholders, onChange, logo }) {
  panelEl.innerHTML = '';

  // ── 应用 Logo（仅左侧面板使用）────────────────────
  if (logo) {
    const logoEl = document.createElement('div');
    logoEl.className = 'sidebar-logo';
    logoEl.textContent = logo;
    panelEl.appendChild(logoEl);
  }

  // ── 日期/标题头部 ──────────────────────────────────
  const header = document.createElement('div');
  header.className = 'notes-date-header' + (isHighlight ? ' notes-today' : '');

  const titleEl = document.createElement('div');
  titleEl.className = 'notes-date-title';
  titleEl.textContent = title;

  const subEl = document.createElement('div');
  subEl.className = 'notes-date-sub';
  subEl.textContent = sub;

  header.appendChild(titleEl);
  header.appendChild(subEl);
  panelEl.appendChild(header);

  // ── 标签 ──────────────────────────────────────────
  const label = document.createElement('div');
  label.className = 'notes-label';
  label.textContent = 'Top 3';
  panelEl.appendChild(label);

  // ── 三条输入 ──────────────────────────────────────
  const list = document.createElement('div');
  list.className = 'notes-list';

  const data = items ?? ['', '', ''];

  data.forEach((text, index) => {
    const item = document.createElement('div');
    item.className = 'note-item';

    const num = document.createElement('span');
    num.className = 'note-num';
    num.textContent = index + 1;

    const input = document.createElement('textarea');
    input.className = 'note-input';
    input.value = text;
    input.placeholder = placeholders?.[index] ?? ['最重要的事', '第二件事', '第三件事'][index];
    input.maxLength = 200;
    input.rows = 1;

    // 自动调整高度
    function autoResize() {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    }
    setTimeout(autoResize, 0);

    // 监听面板宽度变化，重新计算高度
    const resizeObserver = new ResizeObserver(() => autoResize());
    resizeObserver.observe(panelEl);

    // 防抖保存 + 自动调整高度
    let saveTimer = null;
    input.addEventListener('input', () => {
      autoResize();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        onChange(index, input.value.trim());
      }, 500);
    });

    // Enter 跳到下一条，Alt+Enter 换行
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.altKey) {
        const inputs = list.querySelectorAll('.note-input');
        const next = inputs[index + 1];
        if (next) { next.focus(); next.select(); }
        e.preventDefault();
      }
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = input.value.slice(0, start) + '\n' + input.value.slice(end);
        input.selectionStart = input.selectionEnd = start + 1;
        autoResize();
        input.dispatchEvent(new Event('input'));
      }
    });

    item.appendChild(num);
    item.appendChild(input);
    list.appendChild(item);
  });

  panelEl.appendChild(list);

  // ── 底部提示 ──────────────────────────────────────
  const footer = document.createElement('div');
  footer.className = 'notes-footer';
  footer.textContent = '点击日期列切换';
  panelEl.appendChild(footer);
}

// ── 左侧日记面板（按日） ───────────────────────────────────────────────────────
export const NotesPanel = {
  render(notesData, selectedDate, callbacks) {
    const panel = document.getElementById('right-panel');
    const date = new Date(selectedDate + 'T12:00:00');
    const isToday = selectedDate === getTodayStr();
    const dayName = DAY_NAMES_FULL[date.getDay()];
    const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;

    renderTo(panel, {
      items: notesData,
      title: `${monthDay} ${dayName}`,
      sub: isToday ? '今日重点' : '当日重点',
      isHighlight: isToday,
      placeholders: ['第一件事', '第二件事', '第三件事'],
      onChange(index, val) {
        callbacks.onChange(selectedDate, index, val);
      }
    });
  }
};

// ── 右侧周重点面板（按周） ─────────────────────────────────────────────────────
export const RightPanel = {
  render(weekNotesData, weekLabel, callbacks) {
    const panel = document.getElementById('notes-panel');

    renderTo(panel, {
      items: weekNotesData,
      title: weekLabel,
      sub: '本周重点',
      isHighlight: false,
      placeholders: ['第一件事', '第二件事', '第三件事'],
      onChange(index, val) {
        callbacks.onChange(index, val);
      }
    });
  }
};
