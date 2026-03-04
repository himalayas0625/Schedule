const { Tray, Menu, app, nativeImage } = require('electron')
const path = require('path')

let tray = null

function createTray(win, store) {
  // 使用 logo.png 作为托盘图标（打包后在 extraResources，开发时在根目录）
  let iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'logo.png')
    : path.join(__dirname, '../../logo.png')
  let icon
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) throw new Error('empty')
  } catch {
    // 创建一个 16x16 的简单图标作为回退
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('屏幕日程')

  function buildMenu() {
    const isVisible = win.isVisible()
    const isPinned = store.get('settings.alwaysOnTop') ?? true
    const autoLaunch = app.isPackaged
      ? app.getLoginItemSettings().openAtLogin
      : (store.get('settings.launchAtLogin') ?? false)

    const menu = Menu.buildFromTemplate([
      {
        label: isVisible ? '隐藏' : '显示',
        click: () => {
          if (win.isVisible()) win.hide()
          else { win.show(); win.focus() }
        }
      },
      { type: 'separator' },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: isPinned,
        click: (item) => {
          win.setAlwaysOnTop(item.checked)
          store.set('settings.alwaysOnTop', item.checked)
        }
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoLaunch,
        click: (item) => {
          store.set('settings.launchAtLogin', item.checked)
          if (app.isPackaged) {
            app.setLoginItemSettings({ openAtLogin: item.checked })
          }
        }
      },
      { type: 'separator' },
      {
        label: '我的名言',
        click: () => {
          win.show()
          win.webContents.send('quotes:edit')
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          win.forceQuit = true
          app.exit(0)
        }
      }
    ])

    tray.setContextMenu(menu)
  }

  // 左键单击切换显示/隐藏
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
    buildMenu()
  })

  tray.on('right-click', () => buildMenu())

  buildMenu()
  return tray
}

module.exports = { createTray }
