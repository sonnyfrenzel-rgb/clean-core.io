const { contextBridge } = require('electron');

// Expose safe, selected API to the renderer if needed in the future
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: '1.0.0'
});
