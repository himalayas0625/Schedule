// ── 天气挂件（通过主进程 IPC 获取，规避渲染进程 CSP/CORS 限制）────────────────

const CACHE_KEY = 'screen-schedule-weather'
const CACHE_TTL = 3_600_000  // 1 小时

// WMO 天气代码 → emoji
const WMO_EMOJI = {
  0:  '☀️',  1:  '🌤️',  2:  '⛅',  3:  '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',  77: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

function wmoEmoji(code) {
  return WMO_EMOJI[code] ?? '🌤️'
}

// ── 通过 IPC 调用主进程（主进程无 CORS / CSP 限制）────────────────────────────
async function locate() {
  const r = await window.electronAPI.weatherLocate()
  if (!r.ok) throw new Error(r.error)
  return r
}

async function getWeather(lat, lon) {
  const r = await window.electronAPI.weatherForecast(lat, lon)
  if (!r.ok) throw new Error(r.error)
  return r
}

// ── 本地缓存读写（零闪烁） ──────────────────────────────────────────────────
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) }
  catch { return null }
}

function saveCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }))
  } catch {}
}

// ── DOM 更新 ─────────────────────────────────────────────────────────────────
function applyDOM(city, emoji, temp) {
  const cityEl = document.querySelector('.weather-city')
  const iconEl = document.querySelector('.weather-icon')
  const tempEl = document.querySelector('.weather-temp')
  if (cityEl) cityEl.textContent = city.replace(/市$/, '')
  if (iconEl) iconEl.textContent = emoji
  if (tempEl) tempEl.textContent = temp !== '' ? `${temp}°C` : ''
}

// ── 核心更新流程 ─────────────────────────────────────────────────────────────
async function doUpdate() {
  try {
    const loc = await locate()
    const { temp, code } = await getWeather(loc.lat, loc.lon)
    const payload = { city: loc.city, emoji: wmoEmoji(code), temp }
    applyDOM(payload.city, payload.emoji, payload.temp)
    saveCache(payload)
  } catch (e) {
    console.warn('[weather]', e.message)
    // 失败时保留已显示的缓存，不重置 DOM
  }
}

// ── 导出模块 ─────────────────────────────────────────────────────────────────
let _timer = null

export const WeatherWidget = {
  init() {
    // 零闪烁：先同步渲染缓存
    const cached = loadCache()
    if (cached) {
      applyDOM(cached.city, cached.emoji, cached.temp)
      const age = Date.now() - (cached.ts ?? 0)
      if (age < CACHE_TTL) {
        this._schedule(CACHE_TTL - age)
        return
      }
    }
    // 无缓存或已过期：异步拉取
    doUpdate()
    this._schedule(CACHE_TTL)
  },

  _schedule(delay) {
    clearTimeout(_timer)
    _timer = setTimeout(() => {
      doUpdate()
      this._schedule(CACHE_TTL)
    }, Math.max(delay, 60_000))
  },
}
