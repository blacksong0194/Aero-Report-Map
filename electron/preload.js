const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onNavigate: cb => ipcRenderer.on('navigate', (_, page) => cb(page)),
  removeNavigate: () => ipcRenderer.removeAllListeners('navigate'),
  callAnthropic: (payload) => ipcRenderer.invoke('anthropic-request', payload),
  lmStudio: (payload) => ipcRenderer.invoke('lm-studio-request', payload),
  showSaveDialog: opts => ipcRenderer.invoke('show-save-dialog', opts),
  showOpenDialog: opts => ipcRenderer.invoke('show-open-dialog', opts),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  // Store cifrado en disco
  storeLoadAll: () => ipcRenderer.invoke('store-load-all'),
  storeSave: (key, value) => ipcRenderer.invoke('store-save', { key, value }),
  storeBackup: (passphrase) => ipcRenderer.invoke('store-backup', { passphrase }),
  storeRestore: (passphrase) => ipcRenderer.invoke('store-restore', { passphrase }),
  exportPDF: (html, defaultName) => ipcRenderer.invoke('export-pdf', { html, defaultName }),
  aiRequest: (payload) => ipcRenderer.invoke('ai-request', payload),
  isElectron: true,
  platform: process.platform
})