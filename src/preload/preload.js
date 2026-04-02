const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 数据存储
  getAll: () => ipcRenderer.invoke('store:getAll'),
  get: (key) => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  delete: (key) => ipcRenderer.invoke('store:delete', key),

  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  show: () => ipcRenderer.send('window:show'),
  close: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('window:maximizeChanged', (_e, isMaximized) => callback(isMaximized));
  },
  setAlwaysOnTop: (val) => ipcRenderer.send('window:setAlwaysOnTop', val),
  setOpacity: (val) => ipcRenderer.send('window:setOpacity', val),

  // 快捷键
  updateShortcut: (key) => ipcRenderer.send('window:updateShortcut', key),

  // 编辑器右键菜单
  showEditorContextMenu: () => ipcRenderer.send('show-editor-context-menu'),
  onEditorDeleteTrigger: (callback) => {
    ipcRenderer.on('trigger-event-delete', () => callback());
  },

  // 事件监听（主进程推送）
  onThemeChange: (callback) => {
    ipcRenderer.on('theme:changed', (_e, theme) => callback(theme));
  },
  onWindowShow: (callback) => {
    ipcRenderer.on('window:shown', () => callback());
  },

  // 天气（由主进程发起 HTTP，绕过渲染进程 CSP/CORS 限制）
  weatherLocate:   ()          => ipcRenderer.invoke('weather:locate'),
  weatherForecast: (lat, lon)  => ipcRenderer.invoke('weather:forecast', lat, lon),

  // 名言编辑
  onQuotesEdit: (callback) => {
    ipcRenderer.on('quotes:edit', () => callback());
  }
});
