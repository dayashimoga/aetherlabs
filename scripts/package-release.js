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
console.log(` KUBELABS UNIVERSAL RELEASE PACKAGER (v${version})`);
console.log('================================================================================');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const archiveName = `kubelabs-v${version}-universal.tar.gz`;
const archivePath = path.join(distDir, archiveName);

console.log(`[1/3] Packaging distribution: ${archiveName}...`);

const filesToInclude = [
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

try {
  // Use platform tar if available
  execSync(`tar -czf "${archivePath}" ${filesToInclude.join(' ')}`, { cwd: rootDir, stdio: 'inherit' });
  console.log(`  ✔ Successfully created ${archivePath} (${(fs.statSync(archivePath).size / 1024 / 1024).toFixed(2)} MB)`);
} catch (err) {
  console.error(`  ✘ Tar command failed: ${err.message}`);
  process.exit(1);
}

console.log('[2/3] Computing SHA-256 checksum...');
const fileData = fs.readFileSync(archivePath);
const hash = crypto.createHash('sha256').update(fileData).digest('hex');
const checksumPath = path.join(distDir, 'SHA256SUMS.txt');
fs.writeFileSync(checksumPath, `${hash}  ${archiveName}\n`, 'utf8');
console.log(`  ✔ SHA-256: ${hash}`);

console.log('[3/3] Release package ready in dist/');
console.log('================================================================================');
