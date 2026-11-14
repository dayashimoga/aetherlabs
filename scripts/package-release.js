#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '3.0.0';

console.log('================================================================================');
console.log(` KUBELABS CROSS-PLATFORM APPLICATION PACKAGER (v${version})`);
console.log('================================================================================');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function createArchive(archiveName, files, cwd = rootDir) {
  const targetPath = path.join(distDir, archiveName);
  const fileList = Array.isArray(files) ? files.join(' ') : files;
  console.log(`Packaging ${archiveName}...`);
  try {
    if (archiveName.endsWith('.zip')) {
      try {
        execSync(`tar -acf "${targetPath}" ${fileList}`, { cwd, stdio: 'ignore' });
      } catch {
        // Fallback if host tar cannot build zip
        const fallbackTar = archiveName.replace(/\.zip$/, '.tar.gz');
        const fallbackPath = path.join(distDir, fallbackTar);
        execSync(`tar -czf "${fallbackPath}" ${fileList}`, { cwd, stdio: 'ignore' });
        console.log(`  ✔ Created fallback ${fallbackTar} (${(fs.statSync(fallbackPath).size / 1024 / 1024).toFixed(2)} MB)`);
        return fallbackTar;
      }
    } else {
      execSync(`tar -czf "${targetPath}" ${fileList}`, { cwd, stdio: 'ignore' });
    }
    const sizeMB = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(2);
    console.log(`  ✔ Successfully created ${archiveName} (${sizeMB} MB)`);
    return archiveName;
  } catch (err) {
    console.error(`  ✘ Packaging failed for ${archiveName}: ${err.message}`);
    return null;
  }
}

// 1. Universal Standalone Distribution Bundle
const universalFiles = [
  'package.json',
  'README.md',
  'Dockerfile',
  'docker-compose.yml',
  'capacitor.config.json',
  'kubelabs.cmd',
  'kubelabs.sh',
  'docs',
  'agents',
  'schemas',
  'plugins',
  'src',
  'public',
  'scripts',
  'deploy'
];
createArchive(`kubelabs-v${version}-universal.tar.gz`, universalFiles);

// 2. Web & PWA Standalone Distribution (Ready to host on any web server/CDN)
createArchive(`kubelabs-v${version}-web-pwa.zip`, ['.'], path.join(rootDir, 'public'));
createArchive(`kubelabs-v${version}-web-pwa.tar.gz`, ['.'], path.join(rootDir, 'public'));

// 3. Windows Portable App Package (Double-click kubelabs.cmd)
const windowsFiles = [
  'kubelabs.cmd',
  'package.json',
  'README.md',
  'src',
  'public',
  'schemas',
  'plugins',
  'scripts/open-browser.js',
  'scripts/self-audit.js',
  'scripts/verify-subphases.js'
];
createArchive(`kubelabs-v${version}-windows-x64.zip`, windowsFiles);

// 4. Linux Portable App Package (Run ./kubelabs.sh)
const linuxFiles = [
  'kubelabs.sh',
  'package.json',
  'README.md',
  'src',
  'public',
  'schemas',
  'plugins',
  'scripts/open-browser.js',
  'scripts/self-audit.js',
  'scripts/verify-subphases.js'
];
createArchive(`kubelabs-v${version}-linux-x64.tar.gz`, linuxFiles);

// 5. macOS Portable App Package (Run ./kubelabs.sh)
const macosFiles = [
  'kubelabs.sh',
  'package.json',
  'README.md',
  'src',
  'public',
  'schemas',
  'plugins',
  'scripts/open-browser.js',
  'scripts/self-audit.js',
  'scripts/verify-subphases.js'
];
createArchive(`kubelabs-v${version}-darwin-x64.tar.gz`, macosFiles);

// 6. Kubernetes & Helm Deployment Package
createArchive(`kubelabs-v${version}-helm-k8s.tar.gz`, ['deploy', 'Dockerfile', 'docker-compose.yml']);

// 7. Desktop Tauri & Electron Wrapper Package
createArchive(`kubelabs-v${version}-desktop-tauri.tar.gz`, ['desktop'], path.join(rootDir, 'deploy'));

// 8. Compute SHA-256 Checksums for all artifacts in dist/
console.log('\nComputing SHA-256 checksums for all release artifacts...');
const allArchives = fs.readdirSync(distDir).filter((f) => f.endsWith('.tar.gz') || f.endsWith('.zip'));
const checksumLines = [];

for (const archive of allArchives.sort()) {
  const filePath = path.join(distDir, archive);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  checksumLines.push(`${hash}  ${archive}`);
  console.log(`  ${hash}  ${archive}`);
}

const checksumPath = path.join(distDir, 'SHA256SUMS.txt');
fs.writeFileSync(checksumPath, checksumLines.join('\n') + '\n', 'utf8');
console.log(`\nChecksum manifest written to dist/SHA256SUMS.txt`);
console.log(`Total release packages ready: ${allArchives.length}`);
console.log('================================================================================');
