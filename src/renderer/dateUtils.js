export function toLocalDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTodayStr() {
  return toLocalDateStr(new Date());
}

export function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`);
}

export function getISOWeekKey(date) {
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

export function getWeekStartDate(dateLike, startOfWeek = 0) {
  const date = typeof dateLike === 'string' ? parseLocalDate(dateLike) : new Date(dateLike);
  date.setHours(0, 0, 0, 0);
  const diff = (date.getDay() - startOfWeek + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

export function getWeekDates(offset = 0, startOfWeek = 0, baseDate = new Date()) {
  const weekStart = getWeekStartDate(baseDate, startOfWeek);
  weekStart.setDate(weekStart.getDate() + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return toLocalDateStr(date);
  });
}

export function getOffsetForDate(dateStr, todayStr = getTodayStr(), startOfWeek = 0) {
  const dateWeekStart = getWeekStartDate(dateStr, startOfWeek);
  const todayWeekStart = getWeekStartDate(todayStr, startOfWeek);
  return Math.round((dateWeekStart - todayWeekStart) / 86400000 / 7);
}

export function getMonthCalendarDates(year, month, startOfWeek = 0) {
  const firstDay = new Date(year, month - 1, 1);
  const gridStart = getWeekStartDate(firstDay, startOfWeek);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return toLocalDateStr(date);
  });
}

export function getWeekStorageKey(dateLike, startOfWeek = 0) {
  const weekStart = getWeekStartDate(dateLike, startOfWeek);
  const weekYear = weekStart.getFullYear();
  const firstWeekStart = getWeekStartDate(new Date(weekYear, 0, 1), startOfWeek);
  const weekNum = Math.floor((weekStart - firstWeekStart) / 86400000 / 7) + 1;
  return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
}

export function getLegacyWeekStorageKey(dateLike, startOfWeek = 0) {
  return getISOWeekKey(getWeekStartDate(dateLike, startOfWeek));
}
