// ── 天气挂件（通过主进程 IPC 获取，规避渲染进程 CSP/CORS 限制）────────────────

const CACHE_KEY = 'screen-schedule-weather';
const CACHE_TTL = 3_600_000;  // 1 小时
const MAX_RETRY = 3;
// 指数退避基础延迟（毫秒）: 10s, 20s, 40s
const BASE_RETRY_DELAYS = [10_000, 20_000, 40_000];
const JITTER_RATIO = 0.2;  // ±20% 抖动

// ── 状态机定义 ─────────────────────────────────────────────────────────────────
const STATE = { IDLE: 0, LOADING: 1, SUCCESS: 2, ERROR: 3 };

let _state = STATE.IDLE;
let _retryCount = 0;
let _updateTimer = null;   // 定时刷新
let _retryTimer = null;    // 失败重试
let _epoch = 0;            // 请求代次（用于解决竞态）

// WMO 天气代码 → emoji
const WMO_EMOJI = {
  0:  '☀️',  1:  '🌤️',  2:  '⛅',  3:  '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',  77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
};

function wmoEmoji(code) {
  return WMO_EMOJI[code] ?? '🌤️';
}

// ── 通过 IPC 调用主进程 ────────────────────────────────────────────────────────
async function locate() {
  const r = await window.electronAPI.weatherLocate();
  if (!r.ok) throw new Error(r.error);
  return r;
}

async function getWeather(lat, lon) {
  const r = await window.electronAPI.weatherForecast(lat, lon);
  if (!r.ok) throw new Error(r.error);
  return r;
}

// ── 本地缓存读写（零闪烁） ──────────────────────────────────────────────────
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); }
  catch { return null; }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
  } catch { /* localStorage quota exceeded or unavailable */ }
}

// ── 计算带抖动的重试延迟 ──────────────────────────────────────────────────────
function getRetryDelay(retryCount) {
  const baseDelay = BASE_RETRY_DELAYS[Math.min(retryCount, BASE_RETRY_DELAYS.length - 1)];
  const jitter = baseDelay * JITTER_RATIO * (Math.random() * 2 - 1);  // ±20%
  return Math.round(baseDelay + jitter);
}

// ── DOM 更新 ─────────────────────────────────────────────────────────────────
function applyDOM(city, emoji, temp, stateClass) {
  const cityEl = document.querySelector('.weather-city');
  const iconEl = document.querySelector('.weather-icon');
  const tempEl = document.querySelector('.weather-temp');

  if (cityEl) {
    // 先清空所有状态类
    cityEl.classList.remove('weather-loading', 'weather-error');
    // 再添加目标类
    if (stateClass) cityEl.classList.add(stateClass);

    if (stateClass === 'weather-loading') {
      cityEl.textContent = '定位中...';
      cityEl.style.cursor = '';
      cityEl.title = '';
    } else if (stateClass === 'weather-error') {
      cityEl.textContent = '';
      cityEl.style.cursor = 'pointer';
      cityEl.title = '点击重试';
    } else {
      cityEl.textContent = city.replace(/市$/, '');
      cityEl.style.cursor = '';
      cityEl.title = '';
    }
  }
  if (iconEl) {
    iconEl.textContent = stateClass === 'weather-error' ? '⚠️' : emoji;
  }
  if (tempEl) {
    tempEl.textContent = stateClass ? '' : (temp !== '' ? `${temp}°C` : '');
  }
}

// ── 统一清理定时器 ────────────────────────────────────────────────────────────
function clearAllTimers() {
  clearTimeout(_updateTimer);
  clearTimeout(_retryTimer);
  _updateTimer = null;
  _retryTimer = null;
}

// ── 状态转换 ───────────────────────────────────────────────────────────────────
function setState(newState, payload = null) {
  _state = newState;

  switch (newState) {
    case STATE.LOADING:
      applyDOM('', '', '', 'weather-loading');
      break;

    case STATE.SUCCESS:
      _retryCount = 0;  // 成功后清零
      applyDOM(payload.city, payload.emoji, payload.temp, null);
      scheduleNextUpdate();
      break;

    case STATE.ERROR:
      applyDOM('', '', '', 'weather-error');
      if (_retryCount < MAX_RETRY) {
        const delay = getRetryDelay(_retryCount);
        _retryCount++;
        _retryTimer = setTimeout(() => doUpdate(), delay);
      }
      break;
  }
}

// ── 手动重试（点击触发）───────────────────────────────────────────────────────
function manualRetry() {
  clearAllTimers();
  _retryCount = 0;  // 手动重试时重置
  _epoch++;         // 使旧请求失效
  setState(STATE.LOADING);
  doUpdate();
}

// ── 核心更新流程（带竞态防护）─────────────────────────────────────────────────
async function doUpdate() {
  const currentEpoch = ++_epoch;  // 本次请求的代次

  try {
    const loc = await locate();
    // 竞态检查：如果代次已变更，丢弃本次结果
    if (currentEpoch !== _epoch) return;

    const { temp, code } = await getWeather(loc.lat, loc.lon);
    // 再次检查
    if (currentEpoch !== _epoch) return;

    const payload = { city: loc.city, emoji: wmoEmoji(code), temp };
    saveCache(payload);
    setState(STATE.SUCCESS, payload);
  } catch (e) {
    console.warn('[weather]', e.message);
    // 竞态检查
    if (currentEpoch !== _epoch) return;
    setState(STATE.ERROR);
  }
}

// ── 定时刷新 ───────────────────────────────────────────────────────────────────
function scheduleNextUpdate() {
  clearTimeout(_updateTimer);
  _updateTimer = setTimeout(() => {
    _epoch++;  // 使旧请求失效
    setState(STATE.LOADING);
    doUpdate();
  }, CACHE_TTL);
}

// ── 点击重试事件绑定（稳定 handler，只绑定一次）───────────────────────────────
let _clickHandlerBound = false;

function bindClickRetry() {
  if (_clickHandlerBound) return;
  _clickHandlerBound = true;

  document.addEventListener('click', (e) => {
    // 仅在 ERROR 状态且点击 .weather-city 时响应
    if (_state !== STATE.ERROR) return;
    const cityEl = document.querySelector('.weather-city');
    if (cityEl && (e.target === cityEl || cityEl.contains(e.target))) {
      e.stopPropagation();
      manualRetry();
    }
  });
}

// ── 销毁（组件卸载时调用）──────────────────────────────────────────────────────
function destroy() {
  clearAllTimers();
  _epoch++;  // 使进行中的请求失效
  _state = STATE.IDLE;
  _retryCount = 0;
  // 注意：_clickHandlerBound 不重置，document 上的监听器保留
  // 因为是稳定 handler，通过 _state 判断是否响应
}

// ── 导出模块 ───────────────────────────────────────────────────────────────────
export const WeatherWidget = {
  init() {
    // 先清理，避免多次 init 泄漏
    destroy();

    // 绑定点击重试（只绑定一次）
    bindClickRetry();

    // 零闪烁：先同步渲染缓存
    const cached = loadCache();
    if (cached && cached.city !== undefined) {
      applyDOM(cached.city, cached.emoji || '', cached.temp ?? '', null);
      _state = STATE.SUCCESS;
      _retryCount = 0;

      const age = Date.now() - (cached.ts ?? 0);
      if (age < CACHE_TTL) {
        scheduleNextUpdateDelay(CACHE_TTL - age);
        return;
      }
    }

    // 无缓存或已过期：异步拉取
    setState(STATE.LOADING);
    doUpdate();
  },

  // 手动触发刷新（供外部调用）
  refresh() {
    manualRetry();
  },

  // 销毁
  destroy
};

function scheduleNextUpdateDelay(delay) {
  clearTimeout(_updateTimer);
  _updateTimer = setTimeout(() => {
    _epoch++;
    setState(STATE.LOADING);
    doUpdate();
  }, Math.max(delay, 60_000));
}
