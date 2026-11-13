#!/usr/bin/env node
'use strict';

const { spawn, exec } = require('node:child_process');
const http = require('node:http');

const port = Number(process.env.PORT || 4100);
const url = `http://127.0.0.1:${port}`;

function openBrowser(targetUrl) {
  const plat = process.platform;
  if (plat === 'win32') {
    exec(`start "" "${targetUrl}"`);
  } else if (plat === 'darwin') {
    exec(`open "${targetUrl}"`);
  } else {
    exec(`xdg-open "${targetUrl}"`);
  }
}

// Check if server is already running
const req = http.get(`${url}/api/health`, (res) => {
  if (res.statusCode === 200) {
    console.log(`[KubeLabs] Server is already running at ${url}. Opening browser...`);
    openBrowser(url);
  }
});

req.on('error', () => {
  console.log(`[KubeLabs] Starting local server at ${url}...`);
  const serverProc = spawn(process.execPath, ['src/server.js'], {
    stdio: 'inherit',
    detached: false
  });

  setTimeout(() => {
    openBrowser(url);
  }, 1000);
});
