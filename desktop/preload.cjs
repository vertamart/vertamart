const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('vertaDesktop', {
  platform: process.platform,
  version: process.versions.electron,
})
