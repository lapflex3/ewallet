const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktopInfo', {
  platform: process.platform
});
