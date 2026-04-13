const { Tray, Menu, app, nativeImage, dialog, shell } = require('electron');
const path = require('path');

let tray = null;

function createTray(win, store, checkForUpdates) {
  // 使用 icon.ico 作为托盘图标（Windows 托盘要求 16×16/32×32，.ico 内置多尺寸）
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../../assets/icon.ico');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    // 创建一个 16x16 的简单图标作为回退
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(`屏幕日程 v${app.getVersion()}`);

  function buildMenu() {
    const isVisible = win.isVisible();
    const isPinned = store.get('settings.alwaysOnTop') ?? true;
    const autoLaunch = app.isPackaged
      ? app.getLoginItemSettings().openAtLogin
      : (store.get('settings.launchAtLogin') ?? false);

    const menu = Menu.buildFromTemplate([
      {
        label: isVisible ? '隐藏' : '显示',
        click: () => {
          if (win.isVisible()) win.hide();
          else { win.show(); win.focus(); }
        }
      },
      { type: 'separator' },
      {
        label: '始终置顶',
        type: 'checkbox',
        checked: isPinned,
        click: (item) => {
          win.setAlwaysOnTop(item.checked);
          store.set('settings.alwaysOnTop', item.checked);
        }
      },
      {
        label: '开机自启',
        type: 'checkbox',
        checked: autoLaunch,
        click: (item) => {
          store.set('settings.launchAtLogin', item.checked);
          if (app.isPackaged) {
            app.setLoginItemSettings({ openAtLogin: item.checked });
          }
        }
      },
      { type: 'separator' },
      {
        label: '我的名言',
        click: () => {
          win.show();
          win.webContents.send('quotes:edit');
        }
      },
      { type: 'separator' },
      {
        label: `版本 ${app.getVersion()}`,
        enabled: false  // 灰色不可点击
      },
      {
        label: '检查更新...',
        click: () => {
          checkForUpdates && checkForUpdates();
        }
      },
      {
        label: '开源声明',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: '开源声明',
            message: '本软件基于以下开源项目构建',
            detail: [
              'Electron  —  MIT License',
              'Copyright © 2013–present GitHub Inc.',
              'https://github.com/electron/electron',
              '',
              'electron-store  —  MIT License',
              'Copyright © Sindre Sorhus',
              'https://github.com/sindresorhus/electron-store',
              '',
              'electron-updater  —  MIT License',
              'Copyright © electron-builder contributors',
              'https://github.com/electron-userland/electron-builder',
            ].join('\n'),
            buttons: ['关闭', '查看 Electron 许可证'],
            defaultId: 0
          }).then(({ response }) => {
            if (response === 1) {
              shell.openExternal('https://github.com/electron/electron/blob/main/LICENSE');
            }
          });
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          win.forceQuit = true;
          app.exit(0);
        }
      }
    ]);

    tray.setContextMenu(menu);
  }

  // 左键单击切换显示/隐藏
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
    buildMenu();
  });

  tray.on('right-click', () => buildMenu());

  buildMenu();
  return tray;
}

module.exports = { createTray };
