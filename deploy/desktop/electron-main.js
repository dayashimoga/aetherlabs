'use strict';

/**
 * KubeLabs Electron Main Process Entry Point
 * Spawns the zero-dependency in-process KubeLabs HTTP server on an ephemeral port
 * and opens a native Chromium BrowserWindow.
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { createKubeLabsApp } = require('../src/server');

let mainWindow = null;
let serverInstance = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'KubeLabs — Kubernetes & Cloud-Native Lab Platform',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const kubeApp = createKubeLabsApp({
    rootDir: path.join(__dirname, '..'),
    dbFilePath: path.join(app.getPath('userData'), 'kubelabs.sqlite')
  });

  serverInstance = kubeApp.server.listen(0, '127.0.0.1', () => {
    const address = serverInstance.address();
    createWindow(address.port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverInstance) serverInstance.close();
    app.quit();
  }
});

