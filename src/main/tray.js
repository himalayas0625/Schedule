const { Tray, Menu, app, nativeImage } = require('electron')
const path = require('path')

let tray = null

function createTray(win, store) {
  // 使用内置图标或默认图标
  let iconPath = path.join(__dirname, '../../assets/icon.ico')
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
    const autoLaunch = store.get('settings.launchAtLogin') ?? false

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
          app.setLoginItemSettings({ openAtLogin: item.checked })
          store.set('settings.launchAtLogin', item.checked)
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
