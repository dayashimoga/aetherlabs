#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '3.0.0';

console.log('================================================================================');
console.log(` KUBELABS CROSS-PLATFORM APPLICATION PACKAGER (v${version})`);
console.log('================================================================================');

// Ensure clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

/**
 * Pure Node.js zero-dependency standard PKZIP builder
 * Compatible with Windows Explorer, macOS Archive Utility, Linux unzip, and 7-Zip.
 */
function createPureZip(outputPath, fileEntries) {
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  for (const entry of fileEntries) {
    const filenameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const uncompressedData = entry.data;
    const crc = zlib.crc32(uncompressedData);
    const deflatedData = zlib.deflateRawSync(uncompressedData);

    // Local file header (30 bytes)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4);          // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6);       // flags: UTF-8 filename
    localHeader.writeUInt16LE(8, 8);           // compression method: Deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(deflatedData.length, 18);
    localHeader.writeUInt32LE(uncompressedData.length, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);          // extra field length

    localChunks.push(localHeader, filenameBuf, deflatedData);

    // Central directory header (46 bytes)
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);    // PK\x01\x02
    cdHeader.writeUInt16LE(20, 4);             // version made by
    cdHeader.writeUInt16LE(20, 6);             // version needed
    cdHeader.writeUInt16LE(0x0800, 8);          // flags: UTF-8
    cdHeader.writeUInt16LE(8, 10);             // compression: Deflate
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(deflatedData.length, 20);
    cdHeader.writeUInt32LE(uncompressedData.length, 24);
    cdHeader.writeUInt16LE(filenameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);             // extra field length
    cdHeader.writeUInt16LE(0, 32);             // comment length
    cdHeader.writeUInt16LE(0, 34);             // disk number start
    cdHeader.writeUInt16LE(0, 36);             // internal attrs
    cdHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs (POSIX regular file)
    cdHeader.writeUInt32LE(offset, 42);        // local header offset

    cdChunks.push(cdHeader, filenameBuf);

    offset += localHeader.length + filenameBuf.length + deflatedData.length;
  }

  const cdBuffer = Buffer.concat(cdChunks);
  const cdOffset = offset;
  const cdSize = cdBuffer.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // PK\x05\x06
  eocd.writeUInt16LE(0, 4);                    // disk number
  eocd.writeUInt16LE(0, 6);                    // start disk
  eocd.writeUInt16LE(fileEntries.length, 8);   // entries on this disk
  eocd.writeUInt16LE(fileEntries.length, 10);  // total entries
  eocd.writeUInt32LE(cdSize, 12);              // size of central dir
  eocd.writeUInt32LE(cdOffset, 16);            // offset of central dir
  eocd.writeUInt16LE(0, 20);                   // comment length

  const fullZip = Buffer.concat([...localChunks, cdBuffer, eocd]);
  fs.writeFileSync(outputPath, fullZip);
  const sizeMB = (fullZip.length / 1024 / 1024).toFixed(2);
  console.log(`  ✔ Successfully created PKZIP ${path.basename(outputPath)} (${sizeMB} MB, ${fileEntries.length} files)`);
}

/**
 * Recursively collect files from filesystem into { name, data } records
 */
function collectFilesFromList(fileList, baseDir = rootDir) {
  const entries = [];

  function addDir(dirPath, relativePrefix) {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dirPath, item.name);
      const rel = path.join(relativePrefix, item.name);
      if (item.isDirectory()) {
        addDir(full, rel);
      } else if (item.isFile()) {
        entries.push({ name: rel.replace(/\\/g, '/'), data: fs.readFileSync(full) });
      }
    }
  }

  for (const item of fileList) {
    const full = path.join(baseDir, item);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      addDir(full, item);
    } else if (stat.isFile()) {
      entries.push({ name: item.replace(/\\/g, '/'), data: fs.readFileSync(full) });
    }
  }

  return entries;
}

/**
 * Copy file tree to an unpacked directory (for GitHub Actions direct artifact download)
 */
function copyFileTree(fileList, targetDir, baseDir = rootDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const item of fileList) {
    const src = path.join(baseDir, item);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(targetDir, item);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

// -----------------------------------------------------------------------------
// Define File Sets for Each Target App
// -----------------------------------------------------------------------------

const windowsAppFiles = [
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

const linuxAppFiles = [
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

const helmK8sFiles = [
  'deploy',
  'Dockerfile',
  'docker-compose.yml',
  'README.md'
];

// -----------------------------------------------------------------------------
// 1. Build Standalone PKZIP Archives (100% Native, Valid ZIP Format)
// -----------------------------------------------------------------------------
console.log('\n[1/4] Building Native PKZIP Packages (Windows & Web/PWA)...');

// Windows PKZIP
const winEntries = collectFilesFromList(windowsAppFiles);
createPureZip(path.join(distDir, `kubelabs-v${version}-windows-x64.zip`), winEntries);

// Web/PWA PKZIP
const pwaEntries = [];
function collectPwaDir(dirPath, relPrefix = '') {
  for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, item.name);
    const rel = relPrefix ? `${relPrefix}/${item.name}` : item.name;
    if (item.isDirectory()) collectPwaDir(full, rel);
    else if (item.isFile()) pwaEntries.push({ name: rel, data: fs.readFileSync(full) });
  }
}
collectPwaDir(path.join(rootDir, 'public'));
createPureZip(path.join(distDir, `kubelabs-v${version}-web-pwa.zip`), pwaEntries);

// -----------------------------------------------------------------------------
// 2. Build Tarball Archives (Linux, macOS, Helm & Universal)
// -----------------------------------------------------------------------------
console.log('\n[2/4] Building POSIX Gzip Tarballs (Linux, macOS, Helm & Universal)...');

function createTarGz(archiveName, files) {
  const targetPath = path.join(distDir, archiveName);
  try {
    execSync(`tar -czf "${targetPath}" ${files.join(' ')}`, { cwd: rootDir, stdio: 'ignore' });
    const sizeMB = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(2);
    console.log(`  ✔ Successfully created ${archiveName} (${sizeMB} MB)`);
  } catch (err) {
    console.error(`  ✘ Tar failed for ${archiveName}: ${err.message}`);
  }
}

createTarGz(`kubelabs-v${version}-linux-x64.tar.gz`, linuxAppFiles);
createTarGz(`kubelabs-v${version}-darwin-x64.tar.gz`, linuxAppFiles);
createTarGz(`kubelabs-v${version}-web-pwa.tar.gz`, ['public']);
createTarGz(`kubelabs-v${version}-helm-k8s.tar.gz`, helmK8sFiles);
createTarGz(`kubelabs-v${version}-universal.tar.gz`, universalFiles);

// -----------------------------------------------------------------------------
// 3. Stage Unpacked Application Directories (for GitHub Actions Direct Download)
// -----------------------------------------------------------------------------
console.log('\n[3/4] Staging Unpacked Application Directories for CI Artifacts...');

const appsDir = path.join(distDir, 'apps');
copyFileTree(windowsAppFiles, path.join(appsDir, 'windows'));
copyFileTree(linuxAppFiles, path.join(appsDir, 'linux'));
copyFileTree(linuxAppFiles, path.join(appsDir, 'macos'));
copyFileTree(['public'], path.join(appsDir, 'web-pwa'));
copyFileTree(helmK8sFiles, path.join(appsDir, 'helm-k8s'));

console.log(`  ✔ Staged ready-to-run apps in dist/apps/ (windows, linux, macos, web-pwa, helm-k8s)`);

// -----------------------------------------------------------------------------
// 4. Compute SHA-256 Checksum Manifest
// -----------------------------------------------------------------------------
console.log('\n[4/4] Computing SHA-256 Checksums for Release Archives...');

const archives = fs.readdirSync(distDir).filter((f) => f.endsWith('.zip') || f.endsWith('.tar.gz'));
const checksumLines = [];

for (const archive of archives.sort()) {
  const filePath = path.join(distDir, archive);
  const data = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  checksumLines.push(`${hash}  ${archive}`);
  console.log(`  ${hash}  ${archive}`);
}

const checksumPath = path.join(distDir, 'SHA256SUMS.txt');
fs.writeFileSync(checksumPath, checksumLines.join('\n') + '\n', 'utf8');
console.log(`\nChecksum manifest written to dist/SHA256SUMS.txt`);
console.log(`Total release packages ready: ${archives.length}`);
console.log('================================================================================');
