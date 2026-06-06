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
  // Biométrico (InsightFace vía sidecar) — sin exponer HTTP ni procesos
  biometric: {
    health: () => ipcRenderer.invoke('biometric-health'),
    extract: (image) => ipcRenderer.invoke('biometric-extract', { image }),
    compare: (image1, image2) => ipcRenderer.invoke('biometric-compare', { image1, image2 }),
    search: (image, topK) => ipcRenderer.invoke('biometric-search', { image, topK }),
    watchlistList: () => ipcRenderer.invoke('biometric-wl-list'),
    watchlistAdd: (payload) => ipcRenderer.invoke('biometric-wl-add', payload),
    watchlistRemove: (id) => ipcRenderer.invoke('biometric-wl-remove', { id }),
  },
  isElectron: true,
  platform: process.platform
})