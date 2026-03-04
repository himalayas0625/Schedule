const { app, ipcMain, globalShortcut, Menu, dialog } = require('electron')
const { createWindow, getMainWindow } = require('./windowManager')
const { createTray } = require('./tray')
const store = require('./store')
const { autoUpdater } = require('electron-updater')
const https = require('https')
const http  = require('http')

// ── 主进程 HTTP 工具（无 CORS / CSP 限制）────────────────────────────────────
function httpGet(url) {
  const lib = url.startsWith('https:') ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let raw = ''
      res.on('data', d => { raw += d })
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ── 天气 IPC ─────────────────────────────────────────────────────────────────

// 定位：先 ipapi.co（HTTPS），失败再 ip-api.com（HTTP，国内可达）
ipcMain.handle('weather:locate', async () => {
  try {
    const d = await httpGet('https://ipapi.co/json/')
    if (d.latitude && !d.error) {
      return { ok: true, city: d.city || '', lat: d.latitude, lon: d.longitude }
    }
  } catch {}
  try {
    const d = await httpGet('http://ip-api.com/json/?lang=zh-CN&fields=status,city,lat,lon')
    if (d.status === 'success') {
      return { ok: true, city: d.city || '', lat: d.lat, lon: d.lon }
    }
  } catch {}
  return { ok: false, error: 'location failed' }
})

// 天气：Open-Meteo（全球免费，自动时区）
ipcMain.handle('weather:forecast', async (_e, lat, lon) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`
    const d = await httpGet(url)
    return { ok: true, temp: Math.round(d.current.temperature_2m), code: d.current.weather_code }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── 自动更新（仅生产环境） ────────────────────────────────────
let lastCheckTime = 0
const CHECK_INTERVAL = 60 * 60 * 1000 // 1小时检查一次

function setupAutoUpdater() {
  // 开发环境跳过，避免干扰调试
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true          // 静默下载，下载完再提示
  autoUpdater.autoInstallOnAppQuit = false // 由用户决定何时安装

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info.version}，正在后台下载，下载完成后会提示您安装。`,
      buttons: ['好的']
    })
  })

  // 下载进度
  autoUpdater.on('download-progress', (progressObj) => {
    const win = getMainWindow()
    if (win) {
      win.webContents.send('update:progress', {
        percent: Math.round(progressObj.percent),
        transferred: Math.round(progressObj.transferred / 1024 / 1024 * 100) / 100,
        total: Math.round(progressObj.total / 1024 / 1024 * 100) / 100
      })
    }
    // 同时在控制台输出进度
    console.log(`[updater] 下载进度: ${Math.round(progressObj.percent)}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'question',
      title: '更新就绪',
      message: `新版本 ${info.version} 已下载完成，立即重启并安装？`,
      buttons: ['立即安装', '稍后']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 当前已是最新版本')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] 更新检查失败:', err.message)
  })

  // 启动后延迟 10s 检查，避免与主窗口初始化竞争
  setTimeout(() => {
    autoUpdater.checkForUpdates()
    lastCheckTime = Date.now()
  }, 10_000)
}

// 手动检查更新（供托盘菜单调用）
async function checkForUpdates() {
  if (!app.isPackaged) {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'info',
      title: '检查更新',
      message: '开发环境不支持更新检查。\n请使用打包后的版本。',
      buttons: ['好的']
    })
    return { available: false, message: '开发环境' }
  }

  // 防止频繁检查
  const now = Date.now()
  if (now - lastCheckTime < 60_000) {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'info',
      title: '检查更新',
      message: '刚刚已经检查过了，请稍后再试。',
      buttons: ['好的']
    })
    return { available: false, message: '请求过于频繁' }
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    lastCheckTime = now

    if (!result || !result.updateInfo) {
      throw new Error('无法获取更新信息')
    }

    const { updateInfo } = result
    const currentVersion = app.getVersion()

    // 如果没有更新
    if (updateInfo.version === currentVersion) {
      const win = getMainWindow()
      dialog.showMessageBox(win, {
        type: 'info',
        title: '检查更新',
        message: `当前已是最新版本 ${currentVersion}`,
        buttons: ['好的']
      })
      return { available: false, currentVersion }
    }

    return { available: true, currentVersion, latestVersion: updateInfo.version }
  } catch (err) {
    console.error('[updater] 手动检查失败:', err.message)
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'error',
      title: '检查更新失败',
      message: `检查更新时发生错误：\n${err.message}`,
      buttons: ['好的']
    })
    return { available: false, error: err.message }
  }
}

// 防止多实例
if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  const win = getMainWindow()
  if (win) { win.show(); win.focus() }
})

// IPC - 数据存储
ipcMain.handle('store:getAll', () => store.store)
ipcMain.handle('store:get', (_e, key) => store.get(key))
ipcMain.handle('store:set', (_e, key, value) => { store.set(key, value); return true })

// 全局快捷键注册
function registerShortcut(win) {
  const shortcut = store.get('settings.shortcut') || 'Alt+Space'
  globalShortcut.unregisterAll()
  try {
    globalShortcut.register(shortcut, () => {
      if (win.isVisible()) {
        win.hide()
      } else {
        // 先设置透明度为0，等窗口合成完成后再恢复，避免闪烁
        const savedOpacity = store.get('settings.opacity') ?? 0.95
        win.setOpacity(0)
        win.show()
        win.focus()
        setTimeout(() => {
          win.setOpacity(savedOpacity)
        }, 100)
      }
    })
  } catch (e) {
    console.warn('快捷键注册失败:', shortcut, e.message)
  }
}

// IPC - 编辑器右键菜单
ipcMain.on('show-editor-context-menu', (e) => {
  const win = getMainWindow()
  const menu = Menu.buildFromTemplate([
    { role: 'cut',   label: '剪切' },
    { role: 'copy',  label: '复制' },
    { role: 'paste', label: '粘贴' },
    { type: 'separator' },
    {
      label: '🗑 删除日程',
      click() { win && win.webContents.send('trigger-event-delete') }
    }
  ])
  menu.popup({ window: win })
})

// IPC - 运行时修改快捷键
ipcMain.on('window:updateShortcut', (_e, newShortcut) => {
  store.set('settings.shortcut', newShortcut)
  const win = getMainWindow()
  if (win) registerShortcut(win)
})

app.whenReady().then(() => {
  // 同步开机自启设置到系统（仅打包后生效，开发模式跳过）
  if (app.isPackaged) {
    const launchAtLogin = store.get('settings.launchAtLogin') ?? false
    app.setLoginItemSettings({ openAtLogin: launchAtLogin })
  }

  const win = createWindow(store)
  createTray(win, store, checkForUpdates)
  registerShortcut(win)
  setupAutoUpdater()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// macOS: 点击 Dock 图标重新显示
app.on('activate', () => {
  const win = getMainWindow()
  if (win) { win.show(); win.focus() }
})
