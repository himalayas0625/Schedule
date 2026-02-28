const { app, ipcMain, globalShortcut, Menu, dialog } = require('electron')
const { createWindow, getMainWindow } = require('./windowManager')
const { createTray } = require('./tray')
const store = require('./store')
const { autoUpdater } = require('electron-updater')

// ── 自动更新（仅生产环境） ────────────────────────────────────
function setupAutoUpdater() {
  // 开发环境跳过，避免干扰调试
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true          // 静默下载，下载完再提示
  autoUpdater.autoInstallOnAppQuit = false // 由用户决定何时安装

  autoUpdater.on('update-available', () => {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'info',
      title: '发现新版本',
      message: '有新版本可用，正在后台下载，下载完成后会提示您安装。',
      buttons: ['好的']
    })
  })

  autoUpdater.on('update-downloaded', () => {
    const win = getMainWindow()
    dialog.showMessageBox(win, {
      type: 'question',
      title: '更新就绪',
      message: '新版本已下载完成，立即重启并安装？',
      buttons: ['立即安装', '稍后']
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] 更新检查失败:', err.message)
  })

  // 启动后延迟 10s 检查，避免与主窗口初始化竞争
  setTimeout(() => autoUpdater.checkForUpdates(), 10_000)
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
  const win = createWindow(store)
  createTray(win, store)
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
