const Store = require('electron-store')

const schema = {
  weeks: {
    type: 'object',
    default: {}
  },
  settings: {
    type: 'object',
    default: {
      alwaysOnTop: true,
      opacity: 0.95,
      startOfWeek: 1,
      theme: 'system',
      backgroundBlur: true,
      shortcut: 'Alt+Space',
      launchAtLogin: false
    }
  }
}

const store = new Store({ schema, name: 'schedule-data' })
module.exports = store
